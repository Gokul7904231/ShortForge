import type {
  SlayerActionIntent,
  SlayerEvidenceClass,
  SlayerEvidenceQuorumPolicy,
  SlayerPrimeAction,
  SlayerPrimeEvidence,
} from "../../contracts/SlayerPrimeContracts";

const DEFAULT_POLICIES: Record<SlayerPrimeAction, SlayerEvidenceQuorumPolicy> = {
  OBSERVE: {
    action: "OBSERVE",
    requiredEvidenceClasses: ["TELEMETRY"],
    minIndependentClasses: 1,
    minTrustScore: 0.5,
    maxEvidenceAgeMs: 120000,
  },
  PROTECT: {
    action: "PROTECT",
    requiredEvidenceClasses: ["HEARTBEAT", "TELEMETRY"],
    minIndependentClasses: 2,
    minTrustScore: 0.7,
    maxEvidenceAgeMs: 60000,
  },
  CONTAIN: {
    action: "CONTAIN",
    requiredEvidenceClasses: ["HEARTBEAT", "RUNTIME_STATE"],
    minIndependentClasses: 2,
    minTrustScore: 0.75,
    maxEvidenceAgeMs: 60000,
  },
  FENCE: {
    action: "FENCE",
    requiredEvidenceClasses: ["LEASE", "RUNTIME_STATE"],
    minIndependentClasses: 2,
    minTrustScore: 0.8,
    maxEvidenceAgeMs: 60000,
  },
  REVOKE_LEASE: {
    action: "REVOKE_LEASE",
    requiredEvidenceClasses: ["LEASE", "HEARTBEAT"],
    minIndependentClasses: 2,
    minTrustScore: 0.8,
    maxEvidenceAgeMs: 60000,
  },
  ISOLATE: {
    action: "ISOLATE",
    requiredEvidenceClasses: ["KERNEL", "TELEMETRY"],
    minIndependentClasses: 2,
    minTrustScore: 0.85,
    maxEvidenceAgeMs: 30000,
  },
  TERMINATE: {
    action: "TERMINATE",
    requiredEvidenceClasses: ["KERNEL", "LEASE", "HEARTBEAT"],
    minIndependentClasses: 3,
    minTrustScore: 0.9,
    maxEvidenceAgeMs: 30000,
  },
  FLOOR_HALT: {
    action: "FLOOR_HALT",
    requiredEvidenceClasses: ["KERNEL", "TELEMETRY", "RUNTIME_STATE"],
    minIndependentClasses: 3,
    minTrustScore: 0.9,
    maxEvidenceAgeMs: 30000,
  },
  FACTORY_HALT: {
    action: "FACTORY_HALT",
    requiredEvidenceClasses: ["KERNEL", "TELEMETRY", "RUNTIME_STATE"],
    minIndependentClasses: 3,
    minTrustScore: 0.95,
    maxEvidenceAgeMs: 15000,
  },
};

export interface EvidenceQuorumResult {
  readonly eligible: boolean;
  readonly policy: SlayerEvidenceQuorumPolicy;
  readonly presentClasses: SlayerEvidenceClass[];
  readonly missingClasses: SlayerEvidenceClass[];
  readonly independentClasses: number;
  readonly effectiveTrustScore: number;
  readonly staleEvidenceIds: string[];
  readonly rationale: string;
}

export class SlayerEvidenceQuorum {
  getPolicy(action: SlayerPrimeAction): SlayerEvidenceQuorumPolicy {
    return DEFAULT_POLICIES[action];
  }

  evaluate(
    intent: SlayerActionIntent,
    evidence: SlayerPrimeEvidence[],
    now: string = new Date().toISOString()
  ): EvidenceQuorumResult {
    const policy = this.getPolicy(intent.action);
    const nowMs = new Date(now).getTime();

    const active = evidence.filter((item) => {
      if (item.trust === "UNTRUSTED" || item.trustScore < policy.minTrustScore) {
        return false;
      }

      const observedAge = nowMs - new Date(item.observedAt).getTime();
      const explicitlyExpired =
        item.expiresAt !== undefined &&
        new Date(item.expiresAt).getTime() <= nowMs;

      return !explicitlyExpired && observedAge >= 0 && observedAge <= policy.maxEvidenceAgeMs;
    });

    const presentSet = new Set<SlayerEvidenceClass>(
      active.map((item) => item.evidenceClass)
    );
    const presentClasses = Array.from(presentSet);
    const missingClasses = policy.requiredEvidenceClasses.filter(
      (item) => !presentSet.has(item)
    );

    const independentSources = new Set(
      active
        .filter((item) => policy.requiredEvidenceClasses.includes(item.evidenceClass))
        .map((item) => item.independenceKey || item.sourceId)
    );

    const trustScores = active
      .filter((item) => policy.requiredEvidenceClasses.includes(item.evidenceClass))
      .map((item) => item.trustScore);

    const effectiveTrustScore =
      trustScores.length > 0 ? Math.min(...trustScores) : 0;

    const eligible =
      missingClasses.length === 0 &&
      independentSources.size >= policy.minIndependentClasses &&
      effectiveTrustScore >= policy.minTrustScore;

    const staleEvidenceIds = evidence
      .filter((item) => !active.includes(item))
      .map((item) => item.evidenceId);

    return {
      eligible,
      policy,
      presentClasses,
      missingClasses,
      independentClasses: independentSources.size,
      effectiveTrustScore,
      staleEvidenceIds,
      rationale: eligible
        ? "Evidence quorum satisfied for " + intent.action + ": " + presentClasses.join(", ") + "."
        : "Evidence quorum not satisfied for " +
          intent.action +
          "; missing=" +
          (missingClasses.join(", ") || "none") +
          ", independent=" +
          independentSources.size +
          "/" +
          policy.minIndependentClasses +
          ", trust=" +
          effectiveTrustScore.toFixed(2) +
          ".",
    };
  }
}
