import type { TruthLevel } from "./execution.contract";

export type BrowserEvidenceKind =
  | "CONSOLE"
  | "NETWORK"
  | "DOM_STATE"
  | "SCREENSHOT"
  | "PERFORMANCE";

export type BrowserExecutionMode =
  | "LIVE_BROWSER"
  | "BLOCKED_BROWSER"
  | "SIMULATED_BROWSER"
  | "MOCKED_BROWSER";

export type BrowserEvaluationStatus =
  | "PASS"
  | "FAIL"
  | "BLOCKED"
  | "PARTIAL"
  | "NOT_ATTEMPTED";

export interface BrowserSourceIdentity {
  readonly tool: string; // e.g., "ChromeDevToolsClient"
  readonly browserSessionId?: string;
  readonly targetId?: string;
  readonly frameId?: string;
  readonly requestId?: string;
  readonly location?: string;
}

export interface ConsoleEvidenceMetadata {
  readonly level: "log" | "info" | "warning" | "error" | "debug";
  readonly text: string;
  readonly source?: string;
  readonly stackTrace?: string;
}

export interface NetworkEvidenceMetadata {
  readonly url: string;
  readonly method: string;
  readonly statusCode: number;
  readonly timingMs?: number;
  readonly requestId?: string;
  readonly failureReason?: string;
  readonly sanitizedHeaders?: Record<string, string>;
  readonly isFailure: boolean;
}

export interface DomStateEvidenceMetadata {
  readonly selector: string;
  readonly text?: string;
  readonly visible: boolean;
  readonly enabled?: boolean;
  readonly role?: string;
  readonly attributes?: Record<string, string>;
}

export interface ScreenshotEvidenceMetadata {
  readonly localPath: string;
  readonly mimeType: "image/png" | "image/webp" | "image/jpeg";
  readonly byteLength: number;
  readonly sha256?: string;
  readonly width?: number;
  readonly height?: number;
}

export interface PerformanceEvidenceMetadata {
  readonly metric: string;
  readonly value: number;
  readonly unit: "ms" | "bytes" | "fps" | "score";
  readonly threshold?: number;
  readonly thresholdExceeded?: boolean;
  readonly rawTraceRef?: string;
}

export type BrowserEvidenceMetadata =
  | ConsoleEvidenceMetadata
  | NetworkEvidenceMetadata
  | DomStateEvidenceMetadata
  | ScreenshotEvidenceMetadata
  | PerformanceEvidenceMetadata;

export interface BrowserEvidenceRecord {
  readonly id: string;
  readonly missionId: string;
  readonly runId: string;
  readonly kind: BrowserEvidenceKind;
  readonly truthLevel: TruthLevel;
  readonly timestamp: string;
  readonly page: string;
  readonly url: string;
  readonly actionContext?: string;
  readonly source: BrowserSourceIdentity;
  readonly payloadRef?: string;
  readonly metadata: BrowserEvidenceMetadata;
}

export interface BrowserRunRecord {
  readonly status: BrowserEvaluationStatus;
  readonly executionMode: BrowserExecutionMode;
  readonly targetEndpoint: string;
  readonly targetUrl: string;
  readonly reason?: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly records: BrowserEvidenceRecord[];
}
