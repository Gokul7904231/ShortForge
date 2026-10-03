import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";
import { HIGH_RETENTION_RULES } from "../prompts/retention-rules";

export type ThumbnailAgentInput = {
  topic: string;
  script: string;
  provider?: LLMProvider;
  treasuryContext?: TreasuryModelExecutionContext;
};

export type ThumbnailAgentOutput = {
  thumbnailPrompt: string;
  headlineText: string;
};

export async function thumbnailAgent(
  input: ThumbnailAgentInput
): Promise<ThumbnailAgentOutput> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";

  const llm = providerFactory(provider, { apiKey: undefined, treasuryContext: input.treasuryContext });

  const system =
    "You are a YouTube thumbnail designer optimizing for Shorts CTR and retention. Output ONLY valid JSON. No markdown.";

  const prompt = `
${HIGH_RETENTION_RULES}

Task: Create a thumbnail prompt + headline.

Topic:
${input.topic}

Script (use for the single best transformation/mistake moment):
${input.script}

Rules (must follow):
- Return ONLY JSON with shape:
{
  "thumbnailPrompt": string,
  "headlineText": string
}
- thumbnailPrompt must be high-contrast, emotional, and built around a single moment:
  * mistake reveal or insecurity trigger
  * transformation or consequence
  * shocked/reaction expression (clear face)
- thumbnailPrompt must include: split-screen or before/after suggestion, strong lighting, bold framing, and 1 camera phrase (e.g., "close-up push-in")
- headlineText must be <= 6 words (prefer 3-5) and include curiosity framing:
  Examples: "You’re doing THIS wrong" / "Most people get it backwards" / "Stop doing this" / "The real reason".
- Avoid generic phrases.
- Avoid misleading clickbait that doesn't match the script moment.
`;

  const raw = await llm.generateText({
    prompt,
    system,
    temperature: 0.75,
    maxTokens: 300,
  });

  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;
  const parsed = JSON.parse(jsonText) as ThumbnailAgentOutput;

  if (
    !parsed ||
    typeof parsed.thumbnailPrompt !== "string" ||
    typeof parsed.headlineText !== "string"
  ) {
    throw new Error("thumbnailAgent failed to produce valid JSON.");
  }

  return {
    thumbnailPrompt: parsed.thumbnailPrompt.trim(),
    headlineText: parsed.headlineText.trim(),
  };
}



