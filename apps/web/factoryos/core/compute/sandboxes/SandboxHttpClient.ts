import type { SandboxCredentialBundle } from "./SandboxContracts";

export class SandboxHttpError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, code?: string) {
    super(code ? "SANDBOX_PROVIDER_HTTP_" + status + ":" + code : "SANDBOX_PROVIDER_HTTP_" + status);
    this.name = "SandboxHttpError";
    this.status = status;
    this.code = code;
  }
}

function requireApiKey(credentials?: SandboxCredentialBundle): string {
  const key = credentials?.PANDASTACK_API_KEY;
  if (!key) throw new Error("SANDBOX_CREDENTIAL_MISSING:PANDASTACK_API_KEY");
  return key;
}

function normalizedBaseUrl(value: string): string {
  return value.replace(/\/$/, "");
}

export class SandboxHttpClient {
  private readonly apiUrl: string;

  constructor(apiUrl = process.env.PANDASTACK_API || "https://api.pandastack.ai") {
    this.apiUrl = normalizedBaseUrl(apiUrl);
  }

  async requestJson<T>(
    path: string,
    credentials: SandboxCredentialBundle | undefined,
    init: RequestInit = {},
    timeoutMs = 30_000,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const key = requireApiKey(credentials);
      const headers = new Headers(init.headers);
      headers.set("Authorization", "Bearer " + key);
      if (init.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(this.apiUrl + path, {
        ...init,
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        let code: string | undefined;
        try {
          const body = (await response.json()) as Record<string, unknown>;
          if (typeof body.error === "string") code = body.error;
          else if (typeof body.code === "string") code = body.code;
        } catch {
          // Raw response bodies are never copied into application exceptions.
        }
        throw new SandboxHttpError(response.status, code);
      }

      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof SandboxHttpError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new Error("SANDBOX_PROVIDER_TIMEOUT");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}