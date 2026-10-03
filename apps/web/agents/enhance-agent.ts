import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";
import { defaultCharacterProfile } from "../lib/character-profile";
import { HIGH_RETENTION_RULES } from "../prompts/retention-rules";
import { RETENTION_SCENE_RULES } from "../prompts/retention-scene-rules";

export type EnhanceAgentInput = {
  draft: string;
  provider?: LLMProvider;
  treasuryContext?: TreasuryModelExecutionContext;
};

export async function enhanceAgent(input: EnhanceAgentInput): Promise<string> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";
  const llm = providerFactory(provider, { apiKey: undefined, treasuryContext: input.treasuryContext });

  const system =
    "You are a YouTube Shorts retention editor. Output ONLY JSON that matches the provided schema. No markdown.";

  const character = defaultCharacterProfile;

  const prompt = `
${HIGH_RETENTION_RULES}
${RETENTION_SCENE_RULES}

You are enhancing a short video draft to maximize first-3-seconds retention.

Character consistency (must follow across ALL scenes):
- Same character name: ${character.name}
- Same age: ${character.age}
- Same appearance: ${character.appearance}
- Same style: ${character.style}
- Never change the person (no random astronaut/student replacement).
- Keep outfit/features consistent across scenes.

Core editing goals:
1) Compress pacing (remove filler, tighten transitions).
2) Increase emotional escalation every scene.
3) Strengthen interruptionStrength in the first scene.
4) Upgrade transformation payoff (visible consequence or before/after).
5) Make wording more scroll-native (short punchy lines).
6) Produce a hook that would score >= 7 using retention psychology.

Return JSON only with this exact shape:
{
  "hook": string,
  "script": string,
  "title": string,
  "hashtags": string[],
  "scenes": [
    {
      "id": string,
      "text": string,
      "imagePrompt": string
    }
  ]
}

The input draft may be plain text or scene text lines. You MUST convert it into a coherent Shorts script, plus per-scene prompts.

Draft script:
${input.draft}
`;

  return llm.generateText({
    prompt,
    system,
    temperature: 0.6,
    maxTokens: 850,
  });
}

