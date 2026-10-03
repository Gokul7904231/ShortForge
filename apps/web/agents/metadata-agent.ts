import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";

export type MetadataAgentInput = {
  topic: string;
  script: string;
  provider?: LLMProvider;
  treasuryContext?: TreasuryModelExecutionContext;
};

export type MetadataAgentOutput = {
  title: string;
  description: string;
  hashtags: string[];
};

function clampTitle(title: string) {
  const trimmed = title.trim();
  if (trimmed.length <= 60) return trimmed;
  return trimmed.slice(0, 60).replace(/\s+\S*$/, "").trim();
}

export async function metadataAgent(input: MetadataAgentInput): Promise<MetadataAgentOutput> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";

  const llm = providerFactory(provider, { apiKey: undefined, treasuryContext: input.treasuryContext });

  const system =
    "You are a YouTube Shorts SEO expert. Output ONLY valid JSON. No markdown.";

  const prompt = `Create YouTube metadata for a Shorts video.

Input:
Topic: ${input.topic}

Script:
${input.script}

Rules:
- Return ONLY JSON with shape:
{
  "title": string,
  "description": string,
  "hashtags": string[]
}
- Title must be <= 60 characters.
- Description must be SEO optimized for Shorts (first line should hook).
- Hashtags must be 5–10 items.
- Hashtags must create curiosity and match the theme.
- Avoid generic tags like #success.
`;

  const raw = await llm.generateText({
    prompt,
    system,
    temperature: 0.7,
    maxTokens: 400,
  });

  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;

  const parsed = JSON.parse(jsonText) as MetadataAgentOutput;

  if (
    !parsed ||
    typeof parsed.title !== "string" ||
    typeof parsed.description !== "string" ||
    !Array.isArray(parsed.hashtags)
  ) {
    throw new Error("metadataAgent failed to produce valid JSON.");
  }

  const hashtags = parsed.hashtags
    .filter((h) => typeof h === "string")
    .map((h) => h.replace(/^#/, "").trim())
    .filter(Boolean);

  return {
    title: clampTitle(parsed.title),
    description: parsed.description.trim(),
    hashtags: hashtags.slice(0, 10).slice(0, Math.max(5, hashtags.length)),
  };
}

