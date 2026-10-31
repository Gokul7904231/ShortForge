/**
 * ShortForge Centralized Duration Contract & Word Budgeting Engine
 * 
 * HARD CONTRACT SPECIFICATION:
 * - A requested 60-second video must never silently become a 94-second video.
 * - Enforces strict configurable provisional tolerance of ±5% on physical video duration:
 *     60s  -> [57.0s, 63.0s]
 *     180s -> [171.0s, 189.0s]
 * - Provides reverse-engineered word budgeting from speaking rate (~2.3 - 2.5 words/second)
 * - Independent FFprobe physical measurement is authoritative; renderer metadata cannot override it.
 */

export interface DurationPolicy {
  readonly policyVersion: string;
  readonly defaultTolerancePercent: number;
}

export const CANONICAL_DURATION_POLICY: DurationPolicy = {
  policyVersion: "2026.1-p0",
  defaultTolerancePercent: 5.0, // ±5%
};

export interface DurationContract {
  readonly targetDurationSeconds: number;
  readonly toleranceSeconds: number;
  readonly tolerancePercent: number;
  readonly minDurationSeconds: number;
  readonly maxDurationSeconds: number;
  readonly plannedDurationSeconds: number;
  narrationDurationSeconds?: number;
  physicalDurationSeconds?: number;
  readonly durationPolicyVersion: string;
  passed?: boolean;
  failureReason?: string;
}

export interface BeatBudget {
  readonly beatId: string;
  readonly targetSeconds: number;
  readonly minSeconds: number;
  readonly maxSeconds: number;
  readonly maxWords: number;
}

export class DurationEngine {
  public static readonly DEFAULT_WORDS_PER_SECOND = 2.3; // Standard documentary pacing

  /**
   * Creates an authoritative DurationContract for a given target duration.
   */
  public static createContract(
    targetDurationSeconds: number,
    options?: {
      tolerancePercent?: number;
      plannedDurationSeconds?: number;
    }
  ): DurationContract {
    const target = Math.max(5.0, targetDurationSeconds);
    const tolerancePct = options?.tolerancePercent ?? CANONICAL_DURATION_POLICY.defaultTolerancePercent;
    const toleranceSec = Number(((target * tolerancePct) / 100).toFixed(2));
    const minSec = Number((target - toleranceSec).toFixed(2));
    const maxSec = Number((target + toleranceSec).toFixed(2));
    const planned = options?.plannedDurationSeconds ?? target;

    return {
      targetDurationSeconds: target,
      toleranceSeconds: toleranceSec,
      tolerancePercent: tolerancePct,
      minDurationSeconds: minSec,
      maxDurationSeconds: maxSec,
      plannedDurationSeconds: planned,
      durationPolicyVersion: CANONICAL_DURATION_POLICY.policyVersion,
    };
  }

  /**
   * Evaluates the duration contract against physical measurements.
   * FFprobe physical duration is authoritative.
   */
  public static evaluateContract(
    contract: DurationContract,
    physicalDurationSeconds?: number,
    rendererReportedSeconds?: number
  ): DurationContract {
    if (physicalDurationSeconds === undefined || isNaN(physicalDurationSeconds)) {
      return {
        ...contract,
        passed: false,
        failureReason: "MISSING_PHYSICAL_DURATION: Independent FFprobe physical duration measurement is required.",
      };
    }

    const physical = Number(physicalDurationSeconds.toFixed(3));
    const isWithinBounds = physical >= contract.minDurationSeconds && physical <= contract.maxDurationSeconds;

    if (!isWithinBounds) {
      const reason = physical < contract.minDurationSeconds
        ? `DURATION_UNDERFLOW: Physical duration ${physical.toFixed(2)}s is below minimum allowed ${contract.minDurationSeconds}s (target ${contract.targetDurationSeconds}s ± ${contract.tolerancePercent}%).`
        : `DURATION_OVERFLOW: Physical duration ${physical.toFixed(2)}s exceeds maximum allowed ${contract.maxDurationSeconds}s (target ${contract.targetDurationSeconds}s ± ${contract.tolerancePercent}%).`;

      return {
        ...contract,
        physicalDurationSeconds: physical,
        passed: false,
        failureReason: reason,
      };
    }

    return {
      ...contract,
      physicalDurationSeconds: physical,
      passed: true,
    };
  }

  /**
   * Calculates the maximum safe word budget for a duration.
   * Allocates ~85% of time to speech, leaving 15% breathing room for pauses and scene transitions.
   */
  public static calculateWordBudget(
    durationSeconds: number,
    wordsPerSecond: number = DurationEngine.DEFAULT_WORDS_PER_SECOND
  ): number {
    const speechTimeSeconds = Math.max(1.0, durationSeconds * 0.85);
    return Math.max(4, Math.floor(speechTimeSeconds * wordsPerSecond));
  }

  /**
   * Allocates exact duration and word budgets across beats.
   * Ensures the sum of beat durations matches total target seconds.
   */
  public static allocateBeatBudgets(
    targetTotalSeconds: number,
    beats: { beatId: string; weight?: number }[]
  ): BeatBudget[] {
    if (beats.length === 0) return [];

    const totalWeight = beats.reduce((sum, b) => sum + (b.weight ?? 1.0), 0);
    let accumulatedSeconds = 0;
    const results: BeatBudget[] = [];

    for (let i = 0; i < beats.length; i++) {
      const beat = beats[i];
      const weight = beat.weight ?? 1.0;
      let durSec: number;

      if (i === beats.length - 1) {
        // Last beat absorbs remainder to guarantee exact sum
        durSec = Number((targetTotalSeconds - accumulatedSeconds).toFixed(2));
      } else {
        durSec = Number(((weight / totalWeight) * targetTotalSeconds).toFixed(2));
        accumulatedSeconds += durSec;
      }

      durSec = Math.max(2.0, durSec);
      const maxWords = this.calculateWordBudget(durSec);
      const tolerance = Number((durSec * 0.1).toFixed(2));

      results.push({
        beatId: beat.beatId,
        targetSeconds: durSec,
        minSeconds: Number((durSec - tolerance).toFixed(2)),
        maxSeconds: Number((durSec + tolerance).toFixed(2)),
        maxWords,
      });
    }

    return results;
  }

  /**
   * Intelligently fits a narration string to stay within the allocated word budget.
   * Trims cleanly at sentence or clause boundaries rather than arbitrary hard cutting.
   */
  public static fitNarrationToBudget(narration: string, maxWords: number): string {
    const words = narration.trim().split(/\s+/);
    if (words.length <= maxWords) {
      return narration.trim();
    }

    const truncated = words.slice(0, maxWords).join(" ");
    // Find last sentence or clause break
    const lastPunctuation = Math.max(
      truncated.lastIndexOf("."),
      truncated.lastIndexOf(";"),
      truncated.lastIndexOf("!"),
      truncated.lastIndexOf("?")
    );

    if (lastPunctuation > truncated.length * 0.6) {
      return truncated.substring(0, lastPunctuation + 1);
    }

    // Otherwise clean clause ending
    return truncated + ".";
  }
}

