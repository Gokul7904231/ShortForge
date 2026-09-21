/**
 * FactoryOS YouTube Monetization Guardian — Evidence Invalidation Tracker
 * Ensures that when a stage changes during repair, dependent downstream evidence is invalidated.
 * INVARIANT: No stale PASS is allowed to survive a material upstream revision.
 */

import { ProductionStage } from "../policy/YouTubePolicyIR";

export type RevisionStatus = "VALID" | "STALE" | "SUPERSEDED";

export interface EvidenceRevision {
  readonly revisionId: string;
  readonly stage: ProductionStage;
  readonly artifactHash: string;
  readonly status: RevisionStatus;
  readonly createdAt: string;
  readonly invalidatedAt?: string;
  readonly invalidationReason?: string;
}

export interface ArtifactRevision {
  readonly artifactId: string;
  readonly revisionNumber: number;
  readonly sha256: string;
  readonly stage: ProductionStage;
  readonly status: RevisionStatus;
  readonly createdAt: string;
}

export class EvidenceInvalidationTracker {
  private static readonly STAGE_DEPENDENCIES: Record<ProductionStage, readonly ProductionStage[]> = {
    F00: ["F01", "F02", "F03", "F04", "F05", "F06", "F07"],
    F01: ["F02", "F03", "F04", "F05", "F06", "F07"],
    F02: ["F03", "F04", "F05", "F06", "F07"],
    F03: ["F05", "F06", "F07"],
    F04: ["F05", "F06", "F07"],
    F05: ["F06", "F07"],
    F06: ["F07"],
    F07: [],
  };

  private evidenceRevisions: EvidenceRevision[] = [];
  private artifactRevisions: ArtifactRevision[] = [];

  /**
   * Registers a new evidence record.
   */
  public registerEvidence(stage: ProductionStage, artifactHash: string): EvidenceRevision {
    const rev: EvidenceRevision = {
      revisionId: `rev_ev_${stage}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      stage,
      artifactHash,
      status: "VALID",
      createdAt: new Date().toISOString(),
    };
    this.evidenceRevisions.push(rev);
    return rev;
  }

  /**
   * Registers an artifact revision.
   */
  public registerArtifact(artifactId: string, stage: ProductionStage, sha256: string): ArtifactRevision {
    const priorCount = this.artifactRevisions.filter((a) => a.artifactId === artifactId).length;
    const rev: ArtifactRevision = {
      artifactId,
      revisionNumber: priorCount + 1,
      sha256,
      stage,
      status: "VALID",
      createdAt: new Date().toISOString(),
    };
    this.artifactRevisions.push(rev);
    return rev;
  }

  /**
   * Invalidates evidence downstream from repaired stages.
   * Returns list of invalidated stages and revision IDs.
   */
  public invalidateDownstream(repairedStages: readonly ProductionStage[], reason: string): {
    readonly invalidatedStages: readonly ProductionStage[];
    readonly invalidatedRevisionIds: readonly string[];
  } {
    const affected = new Set<ProductionStage>();
    for (const stage of repairedStages) {
      affected.add(stage);
      const downstream = EvidenceInvalidationTracker.STAGE_DEPENDENCIES[stage] || [];
      for (const d of downstream) {
        affected.add(d);
      }
    }

    const now = new Date().toISOString();
    const invalidatedRevisionIds: string[] = [];

    // Invalidate evidence
    this.evidenceRevisions = this.evidenceRevisions.map((rev) => {
      if (affected.has(rev.stage) && rev.status === "VALID") {
        invalidatedRevisionIds.push(rev.revisionId);
        return {
          ...rev,
          status: "STALE",
          invalidatedAt: now,
          invalidationReason: reason,
        };
      }
      return rev;
    });

    // Invalidate artifacts
    this.artifactRevisions = this.artifactRevisions.map((art) => {
      if (affected.has(art.stage) && art.status === "VALID") {
        return {
          ...art,
          status: "STALE",
        };
      }
      return art;
    });

    return {
      invalidatedStages: Object.freeze(Array.from(affected)),
      invalidatedRevisionIds: Object.freeze(invalidatedRevisionIds),
    };
  }

  /**
   * Checks whether evidence for a stage is currently valid.
   */
  public isEvidenceValid(stage: ProductionStage, artifactHash: string): boolean {
    const matching = this.evidenceRevisions.filter(
      (r) => r.stage === stage && r.artifactHash === artifactHash
    );
    if (matching.length === 0) return false;
    return matching.some((r) => r.status === "VALID");
  }

  public getHistory(): {
    readonly evidenceRevisions: readonly EvidenceRevision[];
    readonly artifactRevisions: readonly ArtifactRevision[];
  } {
    return {
      evidenceRevisions: Object.freeze([...this.evidenceRevisions]),
      artifactRevisions: Object.freeze([...this.artifactRevisions]),
    };
  }
}
