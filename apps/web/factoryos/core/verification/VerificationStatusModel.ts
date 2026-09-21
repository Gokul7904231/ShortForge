import { execSync } from "node:child_process";

export type VerificationLevel =
  | "NOT_VERIFIED"
  | "IMPLEMENTED"
  | "UNIT_VERIFIED"
  | "INTEGRATION_VERIFIED"
  | "E2E_VERIFIED"
  | "REAL_SMOKE_VERIFIED"
  | "PRODUCTION_VERIFIED";

export type ExecutionKind =
  | "SYNTHETIC_TEST"
  | "LOCAL_REAL"
  | "INTEGRATION"
  | "REAL_EXTERNAL_PROVIDER"
  | "LIVE_PRODUCTION";

export interface VerificationEvidence {
  readonly capability: string;
  readonly verificationLevel: VerificationLevel;
  readonly commit: string;
  readonly executionKind: ExecutionKind;
  readonly environment: {
    readonly os: string;
    readonly nodeVersion: string;
    readonly isSynthetic: boolean;
    readonly isLiveOperational: boolean;
  };
  readonly timestamp: string;
  readonly command: string;
  readonly testName: string;
  readonly runId: string;
  readonly inputReference: string;
  readonly outputReference?: string;
  readonly artifactHash?: string;
  readonly logs?: string[];
  readonly metrics?: Record<string, number | string | boolean>;
  readonly failureScenario?: string;
  readonly result: "PASS" | "FAIL" | "INCONCLUSIVE";
  readonly limitations: string[];
}

export class VerificationTruthValidator {
  /**
   * Enforces rule: Claim <= Evidence.
   * PRODUCTION_VERIFIED requires live operational execution, real non-synthetic environment,
   * known commit hash, and physical artifact/metric proof.
   */
  public static validateClaim(evidence: VerificationEvidence): { valid: boolean; reason?: string } {
    if (evidence.verificationLevel === "PRODUCTION_VERIFIED") {
      if (evidence.environment.isSynthetic || evidence.executionKind === "SYNTHETIC_TEST") {
        return {
          valid: false,
          reason: "PRODUCTION_VERIFIED cannot be granted under synthetic or mock environment.",
        };
      }
      if (!evidence.environment.isLiveOperational || (evidence.executionKind !== "LIVE_PRODUCTION" && evidence.executionKind !== "REAL_EXTERNAL_PROVIDER")) {
        return {
          valid: false,
          reason: "PRODUCTION_VERIFIED requires live operational or real external provider execution.",
        };
      }
      if (evidence.commit === "UNKNOWN" || !evidence.commit || evidence.commit.length < 7) {
        return {
          valid: false,
          reason: "PRODUCTION_VERIFIED requires an established, non-unknown git commit identity.",
        };
      }
      if (!evidence.artifactHash && !evidence.metrics) {
        return {
          valid: false,
          reason: "PRODUCTION_VERIFIED requires physical artifact hash or live operational metrics.",
        };
      }
    }

    if (evidence.verificationLevel === "REAL_SMOKE_VERIFIED") {
      if (evidence.environment.isSynthetic || evidence.executionKind === "SYNTHETIC_TEST") {
        return {
          valid: false,
          reason: "REAL_SMOKE_VERIFIED cannot be granted under synthetic or mock environment.",
        };
      }
    }

    if (evidence.result === "FAIL" && evidence.verificationLevel !== "NOT_VERIFIED") {
      return {
        valid: false,
        reason: "Failed evidence cannot grant verified status level above NOT_VERIFIED.",
      };
    }

    return { valid: true };
  }

  public static resolveCommit(): string {
    if (process.env.GIT_COMMIT && process.env.GIT_COMMIT !== "UNKNOWN") {
      return process.env.GIT_COMMIT;
    }
    try {
      const gitOut = execSync("git rev-parse HEAD", { encoding: "utf8", timeout: 2000 }).trim();
      if (gitOut && gitOut.length >= 7) {
        return gitOut;
      }
    } catch {
      // Git unavailable
    }
    return "UNKNOWN";
  }
}

export function recordVerificationEvidence(params: {
  capability: string;
  verificationLevel: VerificationLevel;
  executionKind?: ExecutionKind;
  command: string;
  testName: string;
  runId: string;
  inputReference: string;
  outputReference?: string;
  artifactHash?: string;
  logs?: string[];
  metrics?: Record<string, number | string | boolean>;
  failureScenario?: string;
  result: "PASS" | "FAIL" | "INCONCLUSIVE";
  limitations?: string[];
}): VerificationEvidence {
  const isTestHarness = Boolean(process.env.VITEST || process.env.NODE_ENV === "test");
  const kind: ExecutionKind = params.executionKind || (isTestHarness ? "SYNTHETIC_TEST" : "LOCAL_REAL");
  const isSynthetic = kind === "SYNTHETIC_TEST";
  const isLiveOperational = (kind === "REAL_EXTERNAL_PROVIDER" || kind === "LIVE_PRODUCTION") && !isTestHarness;
  const commit = VerificationTruthValidator.resolveCommit();

  const evidence: VerificationEvidence = {
    capability: params.capability,
    verificationLevel: params.verificationLevel,
    commit,
    executionKind: kind,
    environment: {
      os: process.platform,
      nodeVersion: process.version,
      isSynthetic,
      isLiveOperational,
    },
    timestamp: new Date().toISOString(),
    command: params.command,
    testName: params.testName,
    runId: params.runId,
    inputReference: params.inputReference,
    outputReference: params.outputReference,
    artifactHash: params.artifactHash,
    logs: params.logs,
    metrics: params.metrics,
    failureScenario: params.failureScenario,
    result: params.result,
    limitations: params.limitations || [],
  };

  const validation = VerificationTruthValidator.validateClaim(evidence);
  if (!validation.valid) {
    throw new Error(`[VerificationTruthModel] Invalid verification claim: ${validation.reason}`);
  }

  return evidence;
}


