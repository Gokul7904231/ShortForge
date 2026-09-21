import { IntelligentRouter } from "../../ai/intelligent-router";

export type ConsensusStrategy = "single" | "weighted" | "majority";

export interface JudgeScoreReport {
  hookScore: number;
  sceneScore: number;
  grammarScore: number;
}

export const AIJudgeConsensus = {
  /**
   * Evaluate a text/script segment using the configured judge models and strategy.
   */
  async evaluate(
    text: string,
    strategy: ConsensusStrategy = "majority",
    options?: {
      judges?: string[];
      weights?: number[]; // Match judges index
    }
  ): Promise<JudgeScoreReport> {
    const defaultJudges = [
      "google/gemini-1.5-flash",
    ];
    const judges = options?.judges ?? defaultJudges;
    const weights = options?.weights ?? [1.0];

    console.log(`[AIJudgeConsensus] Commencing evaluation using "${strategy}" strategy across ${judges.length} judges.`);

    const evaluationPrompt = `
      You are an expert video content critic. Evaluate the following video script.
      Assess the hook retention, visual scene flow, and grammatical quality.
      Output ONLY valid JSON matching this schema:
      {
        "hookScore": <number 1-10>,
        "sceneScore": <number 1-10>,
        "grammarScore": <number 1-10>
      }
      Script: "${text.slice(0, 1000)}"
    `;

    const tasks = judges.map(async (modelId) => {
      try {
        const result = await IntelligentRouter.routeExecute(
          { capability: "SCRIPT", subtask: "json" },
          {
            prompt: evaluationPrompt,
            model: modelId,
            temperature: 0.1,
            responseFormat: "json_object",
          }
        );
        const parsed = JSON.parse(typeof result === "string" ? result : JSON.stringify(result));
        const hook = Number(parsed.hookScore);
        const scene = Number(parsed.sceneScore);
        const grammar = Number(parsed.grammarScore);
        if (isNaN(hook) || isNaN(scene) || isNaN(grammar)) {
          throw new Error(`[AIJudgeConsensus] Invalid score payload received from judge ${modelId}`);
        }
        return {
          hookScore: hook,
          sceneScore: scene,
          grammarScore: grammar,
        };
      } catch (err: any) {
        console.error(`[AIJudgeConsensus] Judge ${modelId} failed: ${err.message}.`);
        throw err;
      }
    });

    const scores = await Promise.all(tasks);

    if (strategy === "single" || scores.length === 1) {
      return scores[0];
    }

    if (strategy === "weighted") {
      let totalWeight = 0;
      let hookSum = 0;
      let sceneSum = 0;
      let grammarSum = 0;

      for (let i = 0; i < scores.length; i++) {
        const weight = weights[i] ?? 1;
        totalWeight += weight;
        hookSum += scores[i].hookScore * weight;
        sceneSum += scores[i].sceneScore * weight;
        grammarSum += scores[i].grammarScore * weight;
      }

      return {
        hookScore: Number((hookSum / totalWeight).toFixed(1)),
        sceneScore: Number((sceneSum / totalWeight).toFixed(1)),
        grammarScore: Number((grammarSum / totalWeight).toFixed(1)),
      };
    }

    // Default: Majority vote (round to nearest whole numbers and take mode, or average as fallback)
    const avgHook = scores.reduce((sum, s) => sum + s.hookScore, 0) / scores.length;
    const avgScene = scores.reduce((sum, s) => sum + s.sceneScore, 0) / scores.length;
    const avgGrammar = scores.reduce((sum, s) => sum + s.grammarScore, 0) / scores.length;

    return {
      hookScore: Number(avgHook.toFixed(1)),
      sceneScore: Number(avgScene.toFixed(1)),
      grammarScore: Number(avgGrammar.toFixed(1)),
    };
  },
};
