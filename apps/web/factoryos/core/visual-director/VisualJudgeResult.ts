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

export interface BoundedRepairAction {
  type: "SUBSTITUTE_ASSET" | "REWRAP_TEXT" | "ADJUST_TIMING" | "RESELECT_COMPONENT";
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
}): VisualJudgeResult {
  const currentAttempt = params.currentAttempt || 1;
  const maxAttempts = 2;

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
          description: "Reduce font size by 15% and re-wrap text box",
          attemptIndex: currentAttempt + 1,
          maxAttempts,
          proposedParameters: { fontSizeScale: 0.85 },
        };
      } else {
        repairAction = {
          type: "ADJUST_TIMING",
          description: "Re-snap scene duration to decoded audio duration",
          attemptIndex: currentAttempt + 1,
          maxAttempts,
          proposedParameters: { snapAudioCeiling: true },
        };
      }
    }
  }

  return {
    id: params.id,
    storybeatId: params.storybeatId,
    evaluatedAt: new Date().toISOString(),
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

