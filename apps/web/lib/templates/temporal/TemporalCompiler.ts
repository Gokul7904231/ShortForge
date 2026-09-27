import type { TemplateDefinition } from "../schemas/TemplateSchema";
import {
  TemporalContractSchema,
  TemporalIntent,
  TemporalPlanIR,
} from "./TemporalContracts";

const COMPILER_VERSION = "temporal-compiler-1.0.0";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function midpoint(range: [number, number]): number {
  return (range[0] + range[1]) / 2;
}

export class TemporalCompiler {
  static compileTemplate(
    templateDef: TemplateDefinition,
    requestedTargetDurationMs?: number,
    fps = templateDef.outputPolicy.fps || 30,
  ): TemporalPlanIR {
    const [minSeconds, maxSeconds] = templateDef.outputPolicy.targetDurationRange;
    const minMs = Math.round(minSeconds * 1000);
    const maxMs = Math.round(maxSeconds * 1000);
    const requestedMs = requestedTargetDurationMs ?? midpoint([minMs, maxMs]);
    const targetDurationMs = clamp(Math.round(requestedMs), minMs, maxMs);

    const configured = TemporalContractSchema.parse(templateDef.temporalPolicy ?? {});
    const contract = {
      ...configured,
      video: {
        ...configured.video,
        targetDurationMs,
        fpsRef: "FPS_" + fps,
      },
    };

    const steps = templateDef.storyStructure.filter((step) => !step.optional);
    const weights = steps.map((step) => Math.max(0.1, step.recommendedDurationSeconds || 1));
    const weightSum = weights.reduce((sum, value) => sum + value, 0) || 1;

    let cursorMs = 0;
    const beats = steps.map((step, index) => {
      const raw = targetDurationMs * (weights[index] / weightSum);
      const durationMs =
        index === steps.length - 1
          ? targetDurationMs - cursorMs
          : Math.max(1, Math.round(raw));

      const speechBudgetMs = Math.round(durationMs * 0.86);
      const pauseBudgetMs = Math.round(durationMs * 0.08);
      const transitionBudgetMs = Math.round(durationMs * 0.02);
      const visualOnlyBudgetMs = Math.max(
        0,
        durationMs - speechBudgetMs - pauseBudgetMs - transitionBudgetMs,
      );

      const beat = {
        beatId: "beat_" + (index + 1) + "_" + step.stepName.toLowerCase().replace(/\\s+/g, "_"),
        startMs: cursorMs,
        durationMs,
        speechBudgetMs,
        pauseBudgetMs,
        visualOnlyBudgetMs,
        transitionBudgetMs,
      };

      cursorMs += durationMs;
      return beat;
    });

    return {
      schemaVersion: "1.0.0",
      templateId: templateDef.identity.id,
      templateVersion: templateDef.identity.version,
      targetDurationMs,
      targetDurationFrames: Math.round((targetDurationMs / 1000) * fps),
      fps,
      frameTimebase: Math.round(1000 / fps) + "ms/frame",
      beats,
      contract: contract as any,
      provenance: {
        compilerVersion: COMPILER_VERSION,
        source: "TEMPLATE_DEFINITION",
      },
    };
  }

  static intentForAudioTarget(options: {
    targetDurationMs: number;
    timingMode?: "FLEXIBLE" | "BOUNDED" | "EXACT";
    toleranceMs?: number;
    alignmentGranularity?: "SENTENCE" | "WORD" | "CHARACTER" | "PHONEME";
    pausePolicy?: "NONE" | "CONTROLLED" | "GRAMMAR";
    maxResynthesisPasses?: number;
    allowRateCorrection?: boolean;
    allowTimeStretch?: boolean;
    maxStretchRatio?: number;
  }): TemporalIntent {
    return {
      targetDurationMs: Math.max(1, Math.round(options.targetDurationMs)),
      timingMode: options.timingMode ?? "EXACT",
      toleranceMs: options.toleranceMs ?? 40,
      alignmentGranularity: options.alignmentGranularity ?? "WORD",
      pausePolicy: options.pausePolicy ?? "CONTROLLED",
      correction: {
        maxResynthesisPasses: options.maxResynthesisPasses ?? 2,
        allowRateCorrection: options.allowRateCorrection ?? true,
        allowTimeStretch: options.allowTimeStretch ?? true,
        maxStretchRatio: options.maxStretchRatio ?? 1.10,
      },
    };
  }
}

export default TemporalCompiler;
