import type { ExecutionTruthMode, MissionEvent } from "../contracts/execution.contract";
import type { PhysicalArtifactRecord, LineageEdge } from "../contracts/artifact.contract";
import type { DeliveryRecord } from "../contracts/delivery.contract";
import type { BrowserRunRecord } from "../contracts/browser.contract";
import type { Finding } from "./Finding";
import type { EvaluationReceipt } from "./Receipt";

export interface MultiDimensionalVerdict {
  readonly technicalExecution: "PASS" | "FAIL" | "PARTIAL";
  readonly artifactIntegrity: "PASS" | "FAIL" | "PARTIAL";
  readonly lineage: "PASS" | "FAIL" | "PARTIAL";
  readonly f7Verification: "PASS" | "FAIL" | "PARTIAL";
  readonly goal: "PASS" | "FAIL" | "UNKNOWN";
  readonly quality: "PASS" | "FAIL" | "UNKNOWN";
  readonly localDelivery: "PASS" | "FAIL" | "PARTIAL";
  readonly remoteDelivery: "PASS" | "FAIL" | "BLOCKED" | "NOT_ATTEMPTED";
  readonly recovery: "PASS" | "FAIL" | "DEGRADED";
  readonly overall: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED" | "UNKNOWN";
}

export interface MissionRun {
  readonly missionId: string;
  readonly runId: string;
  readonly goal: string;
  readonly codeVersion: string;
  readonly environment: {
    readonly platform: string;
    readonly nodeVersion: string;
    readonly ffmpegVersion?: string;
    readonly ffprobeVersion?: string;
  };
  readonly executionMode: ExecutionTruthMode;
  readonly startedAt: string;
  endedAt?: string;
  durationMs?: number;
  finalVerdict: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED" | "UNKNOWN";
  verdicts?: MultiDimensionalVerdict;

  readonly events: MissionEvent[];
  readonly artifacts: PhysicalArtifactRecord[];
  readonly lineage: LineageEdge[];
  readonly decisions: Array<{
    readonly decisionId: string;
    readonly selectedOption: string;
    readonly reasoning: string;
  }>;
  readonly findings: Finding[];
  readonly receipts: EvaluationReceipt[];
  verificationResult?: Record<string, unknown>;
  deliveryRecord?: DeliveryRecord;
  browserRecord?: BrowserRunRecord;
  limitations: string[];
  degradedCapabilities?: Array<{
    readonly capability: string;
    readonly primaryProvider: string;
    readonly fallbackUsed: string;
    readonly reason: string;
    readonly unprovenBehavior: string;
  }>;
}
