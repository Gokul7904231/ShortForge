/**
 * FactoryOS Engine Contracts
 * 
 * Defines the canonical engine lifecycle, visibility, categories,
 * configuration schemas, and job snapshot structures.
 */

import type {
  EngineConfigurationSchema,
  EngineContractProfile,
} from "./EngineConfigurationContracts";

export type EngineStatus =
  | "DRAFT"
  | "VALIDATING"
  | "ACTIVE"
  | "DISABLED"
  | "ARCHIVED"
  | "INVALID";

export type EngineVisibility = "SYSTEM" | "USER";

export type EngineCategory =
  | "QUIZ"
  | "EXPLAINER"
  | "STORY"
  | "MOTIVATION"
  | "EDUCATION"
  | "OTHER";

export interface EngineDefinition {
  engineId: string;
  name: string;
  description?: string;
  status: EngineStatus;
  visibility: EngineVisibility;
  ownerId?: string;
  category: EngineCategory;
  isDefault?: boolean;

  generationConfig: {
    provider?: string;
    model?: string;
    renderProfile?: string;
    workflow?: string;
  };

  defaults: {
    difficulty?: string;
    tone?: string;
    audience?: string;
    voice?: string;
    ratio?: string;
    thumbnailStyle?: string;
    retentionPolicy?: string;
  };

  capabilities: {
    supportsDraftReview: boolean;
    supportsQuestionEditing?: boolean;
    supportsMultipleTopics?: boolean;
    supportsGeoMode?: boolean;
  };

  validation: {
    schemaVersion: string;
    validatedAt?: string;
    validationErrors?: string[];
  };

  /** Creator-facing configuration declared by the Content Engine. */
  configuration: EngineConfigurationSchema;

  /** Engine-specific production contract profile. */
  contracts: EngineContractProfile;

  manifestVersion: string;
  configVersion: number;

  createdAt: string;
  updatedAt: string;
}

export interface QuizTopicAllocation {
  topicId: string;
  name: string;
  questionBudget: number;
}

export interface QuizQuestionMetadata {
  questionId: string;
  revision: number;
  topicId?: string;
  topicName?: string;
  verificationStatus: "SUPPORTED" | "PENDING" | "REJECTED" | "UNVERIFIED";
}

export interface EngineJobSnapshot {
  jobId: string;
  engineId: string;
  manifestVersion: string;
  engineConfigVersion: number;
  engineStatusAtCreation: EngineStatus;
  /** Immutable identifier of the compiled ProductionSpec used for the job. */
  productionSpecId: string;
  /** Immutable SHA-256-like compilation fingerprint of the ProductionSpec. */
  productionSpecHash: string;
  effectiveConfig: {
    difficulty?: string;
    audience?: string;
    tone?: string;
    voice?: string;
    thumbnailStyle?: string;
    ratio?: string;
    renderProfile?: string;
    provider?: string;
    durationSeconds?: number;
    retentionHours?: number;
    platforms?: string[];
  };
  quizContext?: {
    quizMode: "geo" | "custom_single" | "custom_multiple";
    countryCode?: string;
    topics?: QuizTopicAllocation[];
    totalQuestions?: number;
    allocationStrategy?: "EQUAL";
  };
}
