import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";

export type SceneQualityAgentInput = {
  scene: { text: string; imagePrompt: string } | string;
  provider?: LLMProvider;
  treasuryContext?: TreasuryModelExecutionContext;
};

export type SceneQualityAgentOutput = {
  score: number;
  reason: string;
};

export async function sceneQualityAgent(input: SceneQualityAgentInput): Promise<SceneQualityAgentOutput> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";

  const llm = providerFactory(provider, { apiKey: undefined, treasuryContext: input.treasuryContext });

  const system =
    "You are a cinematic AI director evaluating YouTube Shorts scene quality. Output ONLY valid JSON. No markdown.";

  const sceneText =
    typeof input.scene === "string"
      ? input.scene
      : `Scene text: ${input.scene.text}\nImage prompt: ${input.scene.imagePrompt}`;

  const prompt = `Score this scene from 0–10.

Scene:
${sceneText}

Evaluate:
- motion / action cues
- camera movement (push-in, tracking, pan, orbit)
- visual richness (lighting, setting detail)
- story continuation with the rest of the video

Hard reject:
- "person standing in room"

Hard accept example:
- "young entrepreneur walking through office while camera slowly pushes in, cinematic tracking shot"

Rules:
- Return ONLY JSON:
{
  "score": number,
  "reason": string
}
- score must be between 0 and 10.
`;

  const raw = await llm.generateText({
    prompt,
    system,
    temperature: 0.2,
    maxTokens: 250,
  });

  const match = raw.match(/\{[\s\S]*\}/);
  const jsonText = match ? match[0] : raw;
  const parsed = JSON.parse(jsonText) as SceneQualityAgentOutput;

  if (!parsed || typeof parsed.score !== "number" || typeof parsed.reason !== "string") {
    throw new Error("sceneQualityAgent failed to produce valid JSON.");
  }

  const score = Math.max(0, Math.min(10, Math.round(parsed.score)));
  return { score, reason: parsed.reason.trim() };
}

