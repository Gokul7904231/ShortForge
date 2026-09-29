import type { EpistemicHypothesis, HypothesisStatus } from "./EpistemicContracts";
import { assertUnitInterval, validateHypothesis } from "./EpistemicContracts";

export interface HypothesisEvidenceUpdate {
  readonly hypothesisId: string;
  readonly status: Exclude<HypothesisStatus, "UNKNOWN">;
  readonly supportDelta?: number;
  readonly evidenceRefs?: readonly string[];
  readonly occurredAt?: string;
}

export class HypothesisManager {
  private hypotheses = new Map<string, EpistemicHypothesis>();

  public constructor(initial: readonly EpistemicHypothesis[] = []) {
    for (const hypothesis of initial) this.upsert(hypothesis);
  }

  public upsert(hypothesis: EpistemicHypothesis): void {
    validateHypothesis(hypothesis);
    this.hypotheses.set(hypothesis.hypothesisId, hypothesis);
  }

  public get(hypothesisId: string): EpistemicHypothesis | undefined {
    return this.hypotheses.get(hypothesisId);
  }

  public list(): EpistemicHypothesis[] {
    return Array.from(this.hypotheses.values()).sort(
      (a, b) => b.support - a.support || a.hypothesisId.localeCompare(b.hypothesisId),
    );
  }

  public active(): EpistemicHypothesis[] {
    return this.list().filter(
      (hypothesis) =>
        hypothesis.status !== "ELIMINATED" &&
        hypothesis.status !== "CONTRADICTED",
    );
  }

  public applyEvidenceUpdate(update: HypothesisEvidenceUpdate): EpistemicHypothesis {
    const current = this.hypotheses.get(update.hypothesisId);
    if (!current) {
      throw new Error(`[AER] Unknown hypothesis: ${update.hypothesisId}`);
    }

    const delta = update.supportDelta ?? 0;
    const support = Math.min(1, Math.max(0, current.support + delta));
    assertUnitInterval(support, "hypothesis.support");

    const next: EpistemicHypothesis = {
      ...current,
      support,
      status: update.status,
      evidenceRefs: Array.from(
        new Set([...current.evidenceRefs, ...(update.evidenceRefs ?? [])]),
      ),
      updatedAt: update.occurredAt ?? new Date().toISOString(),
    };

    this.hypotheses.set(next.hypothesisId, next);
    return next;
  }
}
