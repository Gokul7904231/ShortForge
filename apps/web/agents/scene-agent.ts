import { providerFactory } from "../ai/factory";
import { LLMProvider, TreasuryModelExecutionContext } from "../ai/provider";
import { defaultCharacterProfile } from "../lib/character-profile";
import { HIGH_RETENTION_RULES } from "../prompts/retention-rules";
import { RETENTION_SCENE_RULES } from "../prompts/retention-scene-rules";

export type SceneAgentInput = {
  scenePrompt: string;
};

export async function sceneAgent(_input: SceneAgentInput): Promise<{
  prompt: string;
  durationSeconds: number;
  resolution: { width: number; height: number };
}> {
  // Placeholder for future: scene planning => generator params.
  return {
    prompt: "scene stub prompt",
    durationSeconds: 6,
    resolution: { width: 256, height: 256 },
  };
}

export type RegenerateSceneInput = {
  sceneId: string;

  topic: string;
  style?: string;

  currentScene: string;
  previousScene?: string;
  nextScene?: string;

  currentImagePrompt: string;
  previousImagePrompt?: string;
  nextImagePrompt?: string;

  provider?: LLMProvider;
  treasuryContext?: TreasuryModelExecutionContext;
};

export async function regenerateSceneAgent(input: RegenerateSceneInput): Promise<{
  id: string;
  text: string;
  imagePrompt: string;

  parseMetrics: {
    directParseSuccess: boolean;
    regexFallbackUsed: boolean;
    retryCount: number;
    provider: LLMProvider;
  };
}> {
  const provider =
    input.provider ??
    (process.env.DEFAULT_LLM_PROVIDER as LLMProvider | undefined) ??
    "gemini";

  const llm = providerFactory(provider, { apiKey: undefined, treasuryContext: input.treasuryContext });

  const character = defaultCharacterProfile;

  const system =
    "You are an expert cinematic AI scene regeneration agent for YouTube Shorts.\n" +
    "Return ONLY valid JSON.\n" +
    "Do not include markdown.\n" +
    "Do not include code fences.\n" +
    "Do not include any text before or after the JSON.\n" +
    "The response must be directly parsable by JSON.parse().";

  const prompt = `
${HIGH_RETENTION_RULES}
${RETENTION_SCENE_RULES}

You are an expert cinematic AI scene regeneration agent for YouTube Shorts.

Character consistency (must follow):
- Same character name: ${character.name}
- Same age: ${character.age}
- Same appearance: ${character.appearance}
- Same style: ${character.style}
- Never change the person (no random astronaut/student replacement).
- Keep outfit/features consistent across regen.

Task:
Regenerate ONLY the selected scene.
Do NOT rewrite previous or next scenes.

Maintain story continuity.
Maintain emotional progression.
Maintain visual consistency.
Maintain topic alignment.

Context:
Topic:
${input.topic}

Style:
${input.style ?? "(not specified)"}

Previous Scene:
${input.previousScene ?? "(none)"}

Current Scene:
${input.currentScene}

Next Scene:
${input.nextScene ?? "(none)"}

Previous Image Prompt:
${input.previousImagePrompt ?? "(none)"}

Current Image Prompt:
${input.currentImagePrompt}

Next Image Prompt:
${input.nextImagePrompt ?? "(none)"}

Rules (must follow):
1. Preserve narrative flow.
2. Preserve emotional progression.
3. Preserve visual continuity.
4. Match surrounding scenes.
5. Avoid scene teleportation.
6. Avoid unrelated environments.
7. Avoid random characters.
8. Avoid static shots.
9. Create movement.
10. Use cinematic language.
11. Add camera movement (push-in / orbit / tracking / handheld).
12. Scene should visually feel connected.
13. Keep scene duration between 4–8 seconds.
14. Increase scroll-stopping energy: tighten text, strengthen curiosity or consequence.

Return ONLY JSON:
{
  "id": number,
  "text":"...",
  "imagePrompt":"..."
}
`;

  let attempts = 0;
  const maxAttempts = 2;
  let lastError: unknown;
  let raw = "";

  // Structured parse metrics
  let directParseSuccess = false;
  let regexFallbackUsed = false;

  while (attempts < maxAttempts) {
    try {
      raw = await llm.generateText({
        system,
        prompt,
        temperature: 0.75,
        maxTokens: 600,
      });

      // IMPORTANT: log raw output for debugging JSON.parse failures.
      console.log("[scene-agent] rawResponse:", raw);

      // Safer JSON extraction fallback BEFORE JSON.parse.
      const tryParseJson = (text: string): any => {
        try {
          return JSON.parse(text);
        } catch {
          return null;
        }
      };

      let parsedAny = tryParseJson(raw);

      if (parsedAny) {
        directParseSuccess = true;
      }

      if (!parsedAny) {
        const match = raw.match(/\{[\s\S]*\}/);
        if (!match) {
          throw new Error("SceneAgent failed to find JSON in model output");
        }
        regexFallbackUsed = true;
        parsedAny = tryParseJson(match[0]);
      }

      if (!parsedAny) {
        const snippet = raw.slice(0, 500);
        throw new Error(
          `SceneAgent failed to parse JSON. Raw snippet: ${snippet}`
        );
      }

      const parsed = parsedAny as {
        id: string | number;
        text: string;
        imagePrompt: string;
      };

      const normalized = {
        id: String(parsed.id),
        text: parsed.text,
        imagePrompt: parsed.imagePrompt,
      };

      if (
        !parsed ||
        (typeof parsed.id !== "string" && typeof parsed.id !== "number") ||
        typeof parsed.text !== "string" ||
        typeof parsed.imagePrompt !== "string"
      ) {
        throw new Error("SceneAgent failed to produce valid JSON.");
      }

      const retryCount = attempts; // 0 on first attempt, 1 on second, etc.
      const parseMetrics = {
        directParseSuccess,
        regexFallbackUsed,
        retryCount,
        provider,
      };

      return {
        ...normalized,
        parseMetrics,
      };
    } catch (err) {
      lastError = err;
      attempts++;
      if (attempts < maxAttempts) {
        console.log(`[scene-agent] Attempt ${attempts} failed. Retrying...`);
      }
    }
  }

  throw lastError;
}

