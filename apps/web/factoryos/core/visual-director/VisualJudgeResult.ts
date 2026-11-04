/**
 * VisualJudgeResult — Scene-Level Quality & Bounded Repair Contract
 * 
 * Captures automated post-render inspection results for rendered frames/scenes.
 * Detects text clipping, WCAG contrast violations, audio-visual alignment errors,
 * and safe-area incursions. Enforces bounded repair with a hard ceiling of 2 attempts.
 */

export interface VisualCheckItem {
  passed: boolean;
  score?: number;
  details?: string;
}

export interface ContrastCheckItem extends VisualCheckItem {
  measuredRatio: number;
  minimumRequired: number; // e.g. 7.0 for WCAG AAA, 4.5 for WCAG AA
}

export interface AudioVisualAlignmentCheck extends VisualCheckItem {
  driftMs: number;
  toleranceMs: number;
}

export type BoundedRepairType =
  | "SUBSTITUTE_ASSET"
  | "REWRAP_TEXT"
  | "ADJUST_TIMING"
  | "RESELECT_COMPONENT"
  | "ADJUST_CONTRAST"
  | "REPOSITION_SAFE_AREA";

export interface BoundedRepairAction {
  type: BoundedRepairType;
  description: string;
  attemptIndex: number;
  maxAttempts: number; // Locked ceiling: 2
  proposedParameters: Record<string, any>;
}

export interface VisualJudgeResult {
  id: string;
  storybeatId: string;
  evaluatedAt: string;
  overallStatus: "PASS" | "WARNING" | "FAIL";
  checks: {
    textClipping: VisualCheckItem;
    contrast: ContrastCheckItem;
    alignment: AudioVisualAlignmentCheck;
    safeArea: VisualCheckItem;
    entityRelevance: VisualCheckItem;
  };
  repairAction?: BoundedRepairAction;
}

export function evaluateVisualJudge(params: {
  id: string;
  storybeatId: string;
  textClippingPassed: boolean;
  contrastRatio: number;
  alignmentDriftMs: number;
  safeAreaPassed: boolean;
  entityRelevanceScore: number;
  currentAttempt?: number;
  evaluatedAt?: string;
}): VisualJudgeResult {
  const currentAttempt = params.currentAttempt ?? 1;
  const maxAttempts = 2;

  if (!Number.isInteger(currentAttempt) || currentAttempt < 1) {
    throw new Error(`[VisualJudge] Invalid currentAttempt: ${currentAttempt}. Must be an integer >= 1.`);
  }

  const textClipping: VisualCheckItem = {
    passed: params.textClippingPassed,
    details: params.textClippingPassed ? "Text wrapped within content boundary" : "Text exceeds container width",
  };

  const contrast: ContrastCheckItem = {
    passed: params.contrastRatio >= 4.5,
    measuredRatio: params.contrastRatio,
    minimumRequired: 4.5,
    details: params.contrastRatio >= 7.0 ? "WCAG AAA compliant" : params.contrastRatio >= 4.5 ? "WCAG AA compliant" : "Contrast failure",
  };

  const alignment: AudioVisualAlignmentCheck = {
    passed: Math.abs(params.alignmentDriftMs) <= 33, // within 1 frame (33.3ms)
    driftMs: params.alignmentDriftMs,
    toleranceMs: 33,
    details: Math.abs(params.alignmentDriftMs) <= 33 ? "Frame accurate" : `Drift ${params.alignmentDriftMs}ms exceeds frame tolerance`,
  };

  const safeArea: VisualCheckItem = {
    passed: params.safeAreaPassed,
    details: params.safeAreaPassed ? "Safe area respected" : "Content in platform UI hazard zone",
  };

  const entityRelevance: VisualCheckItem = {
    passed: params.entityRelevanceScore >= 0.65,
    score: params.entityRelevanceScore,
    details: params.entityRelevanceScore >= 0.65 ? "Entity verified" : "Visual asset does not match narrative subject",
  };

  const allPassed =
    textClipping.passed &&
    contrast.passed &&
    alignment.passed &&
    safeArea.passed &&
    entityRelevance.passed;

  let overallStatus: VisualJudgeResult["overallStatus"] = "PASS";
  let repairAction: BoundedRepairAction | undefined;

  if (!allPassed) {
    overallStatus = "FAIL";
    // Only propose repair action if attempt budget has not been exhausted
    if (currentAttempt < maxAttempts) {
      if (!entityRelevance.passed) {
        repairAction = {
          type: "SUBSTITUTE_ASSET",
          description: "Select next-ranked candidate media asset matching focal entity",
          attemptIndex: currentAttempt + 1,
          maxAttempts,
          proposedParameters: { fallbackToNextRanked: true },
        };
      } else if (!textClipping.passed) {
        repairAction = {
          type: "REWRAP_TEXT",
          description: "Reduce font size by 15% and re-wrap text container",
          attemptIndex: currentAttempt + 1,
          maxAttempts,
          proposedParameters: { fontSizeScale: 0.85 },
        };
      } else if (!contrast.passed) {
        repairAction = {
          type: "ADJUST_CONTRAST",
          description: "Increase backdrop scrim opacity or adjust text color to achieve WCAG AAA contrast",
          attemptIndex: currentAttempt + 1,
          maxAttempts,
          proposedParameters: { scrimOpacityDelta: 0.25, targetRatio: 7.0 },
        };
      } else if (!safeArea.passed) {
        repairAction = {
          type: "REPOSITION_SAFE_AREA",
          description: "Pad and clamp visual container inside safe area bounds [80, 260, 860, 1280]",
          attemptIndex: currentAttempt + 1,
          maxAttempts,
          proposedParameters: { safePaddingInsetPx: 32 },
        };
      } else if (!alignment.passed) {
        repairAction = {
          type: "ADJUST_TIMING",
          description: "Re-snap scene duration frame ceiling to physical audio duration",
          attemptIndex: currentAttempt + 1,
          maxAttempts,
          proposedParameters: { snapAudioCeiling: true, driftMs: params.alignmentDriftMs },
        };
      }
    }
  }

  return {
    id: params.id,
    storybeatId: params.storybeatId,
    evaluatedAt: params.evaluatedAt ?? new Date().toISOString(),
    overallStatus,
    checks: {
      textClipping,
      contrast,
      alignment,
      safeArea,
      entityRelevance,
    },
    repairAction,
  };
}

