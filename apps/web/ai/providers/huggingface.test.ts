import { afterEach, describe, expect, it, vi } from "vitest";
import { AIProviderRegistry } from "../capability-registry";
import { HuggingFaceProviderPlugin, huggingFaceProvider } from "./huggingface";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("Hugging Face Inference Providers", () => {
  it("registers a real plugin instead of the legacy stub", () => {
    expect(AIProviderRegistry.getPlugin("huggingface")).toBe(
      huggingFaceProvider,
    );
  });

  it("executes OpenAI-compatible chat completions with HF bearer auth", async () => {
    const provider = new HuggingFaceProviderPlugin();
    provider.updateConfig({
      apiKey: "hf_test",
      baseUrl: "https://router.huggingface.co/v1",
    });

    const fetchMock = vi.fn(
      async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe(
          "https://router.huggingface.co/v1/chat/completions",
        );
        expect(
          new Headers(init?.headers).get("Authorization"),
        ).toBe("Bearer hf_test");

        const body = JSON.parse(String(init?.body));
        expect(body.model).toBe("openai/gpt-oss-120b:fastest");
        expect(body.stream).toBe(false);
        expect(body.messages).toEqual([
          { role: "system", content: "You are concise." },
          { role: "user", content: "Say OK." },
        ]);

        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "OK",
                },
              },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 2,
            },
          }),
          {
            status: 200,
            headers: {
              "x-ratelimit-limit": "100",
              "x-ratelimit-remaining": "99",
            },
          },
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await provider.execute("SCRIPT", {
      model: "openai/gpt-oss-120b:fastest",
      prompt: "Say OK.",
      system: "You are concise.",
    });

    expect(result).toBe("OK");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const usage = provider.getExecutionUsage("missing");
    expect(usage).toBeUndefined();
  });

  it("records exact provider usage for Treasury execution settlement", async () => {
    const provider = new HuggingFaceProviderPlugin();
    provider.updateConfig({ apiKey: "hf_test" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "hello" } }],
            usage: { prompt_tokens: 7, completion_tokens: 3 },
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await provider.execute("SCRIPT", {
      model: "openai/gpt-oss-20b:fastest",
      prompt: "hello",
      __treasuryExecutionId: "exec_hf_1",
      __treasuryManagedRetries: true,
    });

    expect(result).toBe("hello");
    expect(provider.getExecutionUsage("exec_hf_1")).toEqual({
      inputTokens: 7,
      outputTokens: 3,
    });
    expect(provider.getExecutionUsage("exec_hf_1")).toBeUndefined();
  });

  it("uses explicit provider selection suffixes without rewriting the model", async () => {
    const provider = new HuggingFaceProviderPlugin();
    provider.updateConfig({ apiKey: "hf_test" });

    const fetchMock = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).model).toBe(
        "Qwen/Qwen3-Coder-480B-A35B-Instruct:groq",
      );
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "done" } }],
          usage: { prompt_tokens: 5, completion_tokens: 1 },
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      provider.execute("SCRIPT", {
        model: "huggingface/Qwen/Qwen3-Coder-480B-A35B-Instruct:groq",
        prompt: "code",
      }),
    ).resolves.toBe("done");
  });

  it("maps HTTP errors to non-success execution instead of fabricating text", async () => {
    const provider = new HuggingFaceProviderPlugin();
    provider.updateConfig({ apiKey: "hf_test" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            error: { message: "provider unavailable" },
          }),
          { status: 503 },
        ),
      ),
    );

    await expect(
      provider.execute("SCRIPT", {
        model: "openai/gpt-oss-20b:fastest",
        prompt: "hello",
        __treasuryManagedRetries: true,
      }),
    ).rejects.toThrow(/Hugging Face API returned HTTP 503/);
  });

  it("fails closed when the credential is missing", async () => {
    const provider = new HuggingFaceProviderPlugin();
    await expect(
      provider.execute("SCRIPT", {
        model: "openai/gpt-oss-20b:fastest",
        prompt: "hello",
        __treasuryManagedRetries: true,
      }),
    ).rejects.toThrow(/HF_API_KEY/);
  });

  it("discovers current models through the HF /v1/models endpoint", async () => {
    const provider = new HuggingFaceProviderPlugin();
    provider.updateConfig({ apiKey: "hf_test" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        expect(String(url)).toBe(
          "https://router.huggingface.co/v1/models",
        );
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "openai/gpt-oss-120b",
                name: "OpenAI gpt-oss-120b",
                context_length: 131072,
                architecture: {
                  input_modalities: ["text"],
                  output_modalities: ["text"],
                },
                providers: [
                  {
                    provider: "groq",
                    status: "live",
                    context_length: 131072,
                    pricing: { input: 1, output: 2 },
                    supports_tools: true,
                    supports_structured_output: true,
                  },
                ],
              },
              {
                id: "some/vlm",
                name: "Example VLM",
                context_length: 4096,
                architecture: {
                  input_modalities: ["text", "image"],
                  output_modalities: ["text"],
                },
                providers: [{ provider: "baseten", status: "live" }],
              },
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const models = await provider.discoverModels();

    expect(models[0]).toMatchObject({
      id: "huggingface/openai/gpt-oss-120b",
      provider: "huggingface",
      capabilities: ["SCRIPT"],
      contextWindow: 131072,
      tags: ["huggingface", "provider:groq", "tools", "structured-output"],
    });
    expect(models[1].capabilities).toContain("VISION");
  });
});
