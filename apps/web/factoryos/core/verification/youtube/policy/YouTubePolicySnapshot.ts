/**
 * FactoryOS YouTube Monetization Guardian — Policy Snapshot Model
 * Immutable, reproducible snapshot of official YouTube policies.
 * Invariant: Never silently mutate an old policy snapshot.
 */

import * as crypto from "node:crypto";
import { PolicySourceDocument } from "./PolicySourceRegistry";
import { PolicyRuleDefinition, PolicyPackIR } from "./YouTubePolicyIR";

export type PolicyFreshnessState = "CURRENT" | "STALE" | "UNKNOWN";

export interface PolicySnapshot {
  readonly snapshotId: string;
  readonly policyPack: "youtube";
  readonly policyVersion: string;
  readonly retrievedAt: string;
  readonly effectiveAt: string;
  readonly expiresAt?: string;
  readonly policyState: PolicyFreshnessState;
  readonly sourceDocuments: readonly PolicySourceDocument[];
  readonly sourceHashes: readonly string[];
  readonly rules: readonly PolicyRuleDefinition[];
  readonly snapshotHashSha256: string;
}

export interface PolicyDiff {
  readonly priorVersion: string;
  readonly currentVersion: string;
  readonly addedRules: readonly PolicyRuleDefinition[];
  readonly removedRules: readonly PolicyRuleDefinition[];
  readonly modifiedRules: ReadonlyArray<{
    readonly ruleId: string;
    readonly prior: PolicyRuleDefinition;
    readonly current: PolicyRuleDefinition;
    readonly changes: readonly string[];
  }>;
}

export class YouTubePolicySnapshotManager {
  /**
   * Computes deterministic SHA-256 fingerprint for a policy snapshot.
   */
  public static computeSnapshotHash(
    policyVersion: string,
    effectiveAt: string,
    sourceHashes: readonly string[],
    rules: readonly PolicyRuleDefinition[]
  ): string {
    const canonicalPayload = {
      policyPack: "youtube",
      policyVersion,
      effectiveAt,
      sourceHashes: [...sourceHashes].sort(),
      ruleIds: rules.map((r) => ({
        ruleId: r.ruleId,
        gateId: r.gateId,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo || null,
        severity: r.severity,
        condition: r.condition,
      })),
    };
    return crypto.createHash("sha256").update(JSON.stringify(canonicalPayload)).digest("hex");
  }

  /**
   * Creates an immutable snapshot from rules and sources.
   */
  public static createSnapshot(params: {
    policyVersion: string;
    retrievedAt: string;
    effectiveAt: string;
    expiresAt?: string;
    policyState?: PolicyFreshnessState;
    sourceDocuments: readonly PolicySourceDocument[];
    rules: readonly PolicyRuleDefinition[];
  }): PolicySnapshot {
    const sourceHashes = params.sourceDocuments.map((s) => s.contentChecksumSha256);
    const snapshotHashSha256 = this.computeSnapshotHash(
      params.policyVersion,
      params.effectiveAt,
      sourceHashes,
      params.rules
    );

    const snapshotId = `yt_policy_snap_${params.policyVersion}_${snapshotHashSha256.substring(0, 12)}`;

    return {
      snapshotId,
      policyPack: "youtube",
      policyVersion: params.policyVersion,
      retrievedAt: params.retrievedAt,
      effectiveAt: params.effectiveAt,
      expiresAt: params.expiresAt,
      policyState: params.policyState ?? "CURRENT",
      sourceDocuments: Object.freeze([...params.sourceDocuments]),
      sourceHashes: Object.freeze([...sourceHashes]),
      rules: Object.freeze([...params.rules]),
      snapshotHashSha256,
    };
  }

  /**
   * Evaluates diff between two snapshots.
   */
  public static diffSnapshots(prior: PolicySnapshot, current: PolicySnapshot): PolicyDiff {
    const priorMap = new Map(prior.rules.map((r) => [r.ruleId, r]));
    const currentMap = new Map(current.rules.map((r) => [r.ruleId, r]));

    const addedRules: PolicyRuleDefinition[] = [];
    const removedRules: PolicyRuleDefinition[] = [];
    const modifiedRules: Array<{
      ruleId: string;
      prior: PolicyRuleDefinition;
      current: PolicyRuleDefinition;
      changes: string[];
    }> = [];

    for (const [id, cur] of currentMap.entries()) {
      if (!priorMap.has(id)) {
        addedRules.push(cur);
      } else {
        const old = priorMap.get(id)!;
        const changes: string[] = [];
        if (old.severity !== cur.severity) changes.push(`severity: ${old.severity} -> ${cur.severity}`);
        if (old.effectiveFrom !== cur.effectiveFrom) changes.push(`effectiveFrom: ${old.effectiveFrom} -> ${cur.effectiveFrom}`);
        if (old.effectiveTo !== cur.effectiveTo) changes.push(`effectiveTo: ${old.effectiveTo} -> ${cur.effectiveTo}`);
        if (JSON.stringify(old.condition) !== JSON.stringify(cur.condition)) {
          changes.push(`condition changed`);
        }
        if (changes.length > 0) {
          modifiedRules.push({ ruleId: id, prior: old, current: cur, changes });
        }
      }
    }

    for (const [id, old] of priorMap.entries()) {
      if (!currentMap.has(id)) {
        removedRules.push(old);
      }
    }

    return {
      priorVersion: prior.policyVersion,
      currentVersion: current.policyVersion,
      addedRules: Object.freeze(addedRules),
      removedRules: Object.freeze(removedRules),
      modifiedRules: Object.freeze(modifiedRules) as any,
    };
  }
}
