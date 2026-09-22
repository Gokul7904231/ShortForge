import { GeneratedQuizOutput } from "../adapters/QuizGeneratorAdapter";
import { QuizQualityReportData } from "../guardian/QuizQualityReport";

export type ProductionJobStatus =
  | "PLANNED"
  | "WAITING"
  | "GENERATING"
  | "VALIDATING"
  | "REPAIRING"
  | "RENDERING"
  | "OUTPUT_VALIDATION"
  | "DELIVERY_PENDING"
  | "UPLOADING"
  | "COMPLETED"
  | "PAUSED"
  | "RETRY_WAIT"
  | "BLOCKED"
  | "FAILED"
  | "CANCELLED";

export interface VideoArtifact {
  filePath: string;
  fileSizeBytes: number;
  durationSeconds: number;
  format: string;
  renderedAt: string;
}

export interface DeliveryArtifact {
  driveFileId?: string;
  driveFolderId?: string;
  uploadedAt?: string;
  deliveryMethod: "GOOGLE_DRIVE" | "LOCAL_OUTBOX";
  verified: boolean;
  storageUrl?: string;
  sha256?: string;
}

export interface ProductionJob {
  id: string; // e.g. "prod_2026-08-06_slot_01"
  scheduleId: string; // e.g. "sched_01"
  requestedDate: string; // YYYY-MM-DD
  plannedSlot: number; // 1..6
  topic: string;
  status: ProductionJobStatus;

  workflowRunId?: string;
  quizArtifact?: GeneratedQuizOutput;
  guardianReport?: QuizQualityReportData;
  videoArtifact?: VideoArtifact;
  deliveryArtifact?: DeliveryArtifact;

  attempts: number;
  maxAttempts: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  failureReason?: string;
  nextRetryAt?: string;
  idempotencyKey: string;
}
