import type { MissionRun, MultiDimensionalVerdict } from "../model/MissionRun";
import type { MissionGraphIR } from "../graphs/MissionGraph";
import type { EvidenceGraphIR } from "../graphs/EvidenceGraph";
import type { Finding } from "../model/Finding";
import type { EfficiencyMetrics } from "../oracles/EfficiencyOracle";
import type {
  StageExecutionStatus,
  DurationTruth,
  ResearchTruth,
  TruthLevel,
} from "../contracts/execution.contract";
import type { DeliveryState } from "../contracts/delivery.contract";

export interface StageExecutionAudit {
  readonly floorId: string;
  readonly status: "EXECUTED" | "BYPASSED" | "FAILED" | "UNKNOWN";
  readonly executionTruth: StageExecutionStatus;
  readonly truthLevel: TruthLevel;
  readonly durationMs: number;
  readonly durationTruth: DurationTruth;
  readonly researchTruth?: ResearchTruth;
  readonly artifactsProduced: string[];
  readonly artifactsConsumed: string[];
}

export interface ClaimAudit {
  readonly claim: string;
  readonly truthLevel: TruthLevel;
  readonly evidenceReferences: string[];
  readonly evaluator: string;
  readonly verdict: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED" | "UNKNOWN";
}

export interface BrowserReportSummary {
  readonly status: "PASS" | "FAIL" | "BLOCKED" | "PARTIAL" | "NOT_ATTEMPTED";
  readonly executionMode: "LIVE_BROWSER" | "BLOCKED_BROWSER" | "SIMULATED_BROWSER" | "MOCKED_BROWSER";
  readonly targetEndpoint: string;
  readonly targetUrl: string;
  readonly reason?: string;
  readonly consoleErrorsCount: number;
  readonly networkFailuresCount: number;
  readonly domElementsInspected: number;
  readonly screenshotsCaptured: number;
  readonly performanceMetricsCount: number;
  readonly evidenceReferences: string[];
}

export interface SituationCommsReportSummary {
  readonly status: "PASS" | "FAIL" | "PARTIAL";
  readonly created: boolean;
  readonly transmitted: boolean;
  readonly received: boolean;
  readonly graphPreserved: boolean;
  readonly evidencePreserved: boolean;
  readonly truthPreserved: boolean;
  readonly integrityVerified: boolean;
  readonly recordsCount: number;
  readonly liveProof?: {
    readonly messageId: string;
    readonly situationId: string;
    readonly sender: string;
    readonly receiver: string;
    readonly graphNodeIds: string[];
    readonly evidenceIds: string[];
    readonly timestamp: string;
  };
}

export interface MissionReport {
  readonly missionId: string;
  readonly runId: string;
  readonly finalVerdict: "PASS" | "FAIL" | "PARTIAL" | "BLOCKED" | "UNKNOWN";
  readonly verdicts?: MultiDimensionalVerdict;
  readonly executionMode: string;
  readonly environment: {
    readonly platform: string;
    readonly nodeVersion: string;
    readonly ffmpegAvailable: boolean;
    readonly ffprobeAvailable: boolean;
    readonly geminiConfigured: boolean;
    readonly gitCommit: string;
  };
  readonly startedAt: string;
  readonly endedAt: string;
  readonly totalDurationMs: number;

  readonly stageAudits: StageExecutionAudit[];
  readonly lineageVerification: {
    readonly valid: boolean;
    readonly edgesCount: number;
    readonly edges: Array<{
      readonly producer: string;
      readonly consumer: string;
      readonly kind: string;
      readonly hashMatched: boolean;
      readonly consumptionProven: boolean;
    }>;
  };
  readonly mediaHardGates: {
    readonly passed: boolean;
    readonly overallScore: number;
    readonly gates: Record<string, boolean>;
  };
  readonly deliveryStatus: {
    readonly local: {
      readonly status: DeliveryState;
      readonly delivered: boolean;
      readonly location?: string;
      readonly sha256?: string;
    };
    readonly remote: {
      readonly status: DeliveryState;
      readonly delivered: boolean;
      readonly destination?: string;
      readonly note?: string;
    };
    readonly delivered: boolean;
    readonly location?: string;
    readonly sha256?: string;
  };
  readonly efficiency: EfficiencyMetrics;
  readonly findings: Finding[];
  readonly claimAudits: ClaimAudit[];
  readonly browserEvidence?: BrowserReportSummary;
  readonly situationComms?: SituationCommsReportSummary;
  readonly limitations: string[];
  readonly degradedCapabilities?: Array<{
    readonly capability: string;
    readonly primaryProvider: string;
    readonly fallbackUsed: string;
    readonly reason: string;
    readonly unprovenBehavior: string;
  }>;
  readonly missionGraph: MissionGraphIR;
  readonly evidenceGraph: EvidenceGraphIR;
}

