/**
 * FactoryOS v3 — Schedule & Production Requirement Contracts
 * Establishes the Schedule as the single authoritative source of truth for all autonomous production runs.
 * Strictly prohibits hardcoded daily production quantities.
 */

export interface ScheduleTargetRequirements {
  readonly requestedCount: number;             // Dynamic target count derived from schedule (e.g. 1, 3, 10)
  readonly platform: "YOUTUBE_SHORTS" | "TIKTOK" | "INSTAGRAM_REELS" | "OMNICHANNEL";
  readonly targetNiche: string;               // e.g. "TECH_EXPLAINER", "AI_NEWS", "SCIENCE_HISTORY"
  readonly audienceAgeGroup?: "TEEN" | "YOUNG_ADULT" | "ADULT" | "ALL";
  readonly targetDurationSec: {
    readonly min: number;
    readonly max: number;
  };
  readonly freshnessWindowHours: number;      // e.g. 24, 48, 168 (7 days)
  readonly researchDepth: "RAPID" | "STANDARD" | "DEEP" | "EXHAUSTIVE";
  readonly safetyPolicy: string;              // Policy profile identifier
  readonly allowedProviders?: string[];       // Permitted compute / voice providers
  readonly budgetCapUsd?: number;
}

export interface Schedule {
  readonly scheduleId: string;
  readonly name: string;
  readonly cadence: "HOURLY" | "DAILY" | "WEEKLY" | "CUSTOM_CRON";
  readonly cronExpression?: string;
  readonly timezone: string;
  readonly targetRequirements: ScheduleTargetRequirements;
  readonly enabled: boolean;
  readonly version: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ScheduleInstance {
  readonly instanceId: string;
  readonly scheduleId: string;
  readonly scheduledFor: string;             // ISO-8601 timestamp
  readonly targetRequirements: ScheduleTargetRequirements;
  readonly missionId: string;
  readonly status: "PENDING" | "DISPATCHED" | "EXECUTING" | "COMPLETED" | "FAILED" | "SKIPPED";
  readonly idempotencyKey: string;
  readonly generatedAt: string;
}

export interface ResearchCandidate {
  readonly candidateId: string;
  readonly topic: string;
  readonly hookConcept: string;
  readonly relevanceScore: number;           // 0.0 to 1.0
  readonly noveltyScore: number;             // 0.0 to 1.0
  readonly saturationScore: number;          // 0.0 (fresh) to 1.0 (oversaturated)
  readonly sourceCount: number;
  readonly sourceUrls: string[];
  readonly passportId?: string;
  readonly feasibilityStatus: "FEASIBLE" | "HIGH_COMPLEXITY" | "INFEASIBLE";
  readonly safetyStatus: "APPROVED" | "FLAGGED" | "BLOCKED";
}

export interface DailyContentSlate {
  readonly slateId: string;
  readonly scheduleId: string;
  readonly instanceId: string;
  readonly missionId: string;
  readonly generatedAt: string;
  readonly requestedCount: number;
  readonly candidateCount: number;
  readonly selectedCandidates: ResearchCandidate[];
  readonly unmetCapacity: number;            // requestedCount - selectedCandidates.length
  readonly unmetReason?: string;
  readonly researchPassportIds: string[];
  readonly provenanceDigest: string;         // Cryptographic digest of research slate
}
