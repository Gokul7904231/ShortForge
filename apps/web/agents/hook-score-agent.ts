import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";
import { RETENTION_METRICS } from "../prompts/retention-metrics";

export type HookScoreAgentInput = {
  hook: string;
  provider?: LLMProvider;
  treasuryContext?: TreasuryModelExecutionContext;
};

export type HookScoreAgentOutput = {
  score: number;
  reason: string;
};

export async function hookScoreAgent(
  input: HookScoreAgentInput
): Promise<HookScoreAgentOutput> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";

  const llm = providerFactory(provider, { apiKey: undefined, treasuryContext: input.treasuryContext });

  const system =
    "You are a YouTube Shorts retention coach. Output ONLY valid JSON. No markdown.";

  const prompt = `Score this hook for Shorts retention using a strict psychology framework.

${RETENTION_METRICS}

Hook:
${input.hook}

You MUST evaluate these metrics (do not just describe the hook):
- curiosityGap: 0-10
- emotionalTension: 0-10
- pacingStrength: 0-10
- transformationStrength: 0-10
- interruptionStrength: 0-10

Then output final combined score 0-10 using the rule:
combinedScore = round((curiosityGap*0.25 + emotionalTension*0.2 + pacingStrength*0.2 + transformationStrength*0.2 + interruptionStrength*0.15))

Rules:
- "score" must be a number between 0 and 10.
- "reason" must be 1-2 short sentences and must explicitly mention the weakest metric.
- Return ONLY JSON:
{
  "score": number,
  "reason": string
}
- accept threshold for strong hooks is score >= 7.
`;

  const raw = await llm.generateText({
    prompt,
    system,
    temperature: 0.2,
    maxTokens: 250,
  });

  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;
  const parsed = JSON.parse(jsonText) as HookScoreAgentOutput;

  if (
    !parsed ||
    typeof parsed.score !== "number" ||
    typeof parsed.reason !== "string"
  ) {
    throw new Error("hookScoreAgent failed to produce valid JSON.");
  }

  const score = Math.max(0, Math.min(10, Math.round(parsed.score)));
  return { score, reason: parsed.reason.trim() };
}

