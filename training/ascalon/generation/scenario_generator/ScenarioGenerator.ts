/**
 * Project Ascalon — Scenario Generator
 *
 * Generates controlled, reproducible operational scenarios with explicit seeds.
 * All scenarios are strictly marked as environment: "SIMULATION" and synthetic: true.
 * NEVER mislabeled as real production experiences.
 */

export interface OperationalScenario {
  readonly scenarioId: string;
  readonly seed: number;
  readonly failureModeCode: string;
  readonly baseWorldState: Record<string, unknown>;
  readonly mutations: Array<{ target: string; change: string; value: unknown }>;
  readonly expectedInvariant: string;
  readonly expectedRemediationAction: string;
  readonly environment: "SIMULATION";
  readonly synthetic: true;
}

export class ScenarioGenerator {
  public static generateScenario(scenarioType: string, seed: number = 42): OperationalScenario {
    // Deterministic pseudo-random sequence from seed
    const pseudoRandom = (offset: number) => {
      const x = Math.sin(seed + offset) * 10000;
      return x - Math.floor(x);
    };

    switch (scenarioType) {
      case "WORKER_TIMEOUT":
        return {
          scenarioId: `scen_timeout_${seed}`,
          seed,
          failureModeCode: "ERR_WORKER_TIMEOUT",
          baseWorldState: {
            factoryStatus: "OPERATIONAL",
            activeFloor: "floor06_rendering",
            workerId: `worker_gpu_${Math.floor(pseudoRandom(1) * 100)}`,
            leaseDurationMs: 30000,
            elapsedMs: 45000,
          },
          mutations: [
            { target: "worker.heartbeat", change: "STALE", value: "expired_15s_ago" },
            { target: "floor06_rendering.status", change: "DEGRADED", value: "worker_unresponsive" },
          ],
          expectedInvariant: "Workers exceeding lease timeout must be terminated by Slayer.",
          expectedRemediationAction: "cap_slayer_revoke_lease",
          environment: "SIMULATION",
          synthetic: true,
        };

      case "CAS_INTEGRITY_MISMATCH":
        return {
          scenarioId: `scen_cas_${seed}`,
          seed,
          failureModeCode: "ERR_CAS_SHA256_MISMATCH",
          baseWorldState: {
            factoryStatus: "OPERATIONAL",
            activeFloor: "floor06_rendering",
            expectedSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            actualSha256: "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef",
          },
          mutations: [
            { target: "artifact.sha256", change: "CORRUPTED", value: "corrupted_payload" },
          ],
          expectedInvariant: "Artifacts with mismatched SHA-256 must be rejected and quarantined.",
          expectedRemediationAction: "cap_healer_retry_task",
          environment: "SIMULATION",
          synthetic: true,
        };

      case "STALE_FENCING_TOKEN":
        return {
          scenarioId: `scen_fence_${seed}`,
          seed,
          failureModeCode: "ERR_FENCING_TOKEN_STALE",
          baseWorldState: {
            factoryStatus: "OPERATIONAL",
            activeFloor: "floor06_rendering",
            activeFencingToken: 15,
            submittedFencingToken: 12,
          },
          mutations: [
            { target: "commit.fencingToken", change: "STALE", value: 12 },
          ],
          expectedInvariant: "Submissions with fencing token <= active token must be rejected.",
          expectedRemediationAction: "REJECT_COMMIT",
          environment: "SIMULATION",
          synthetic: true,
        };

      default:
        return {
          scenarioId: `scen_generic_${seed}`,
          seed,
          failureModeCode: "ERR_GENERIC_ANOMALY",
          baseWorldState: { factoryStatus: "OPERATIONAL" },
          mutations: [],
          expectedInvariant: "System invariants must hold.",
          expectedRemediationAction: "NO_ACTION",
          environment: "SIMULATION",
          synthetic: true,
        };
    }
  }
}
