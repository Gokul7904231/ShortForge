/**
 * FactoryOS Frontier v3 — Overseer Cognitive Runtime Contracts
 * Defines strict contracts for the dedicated cognitive layer (OVERSEER_API).
 * Enhanced for Project Ascalon with explicit reasoning modes, provenance, and training eligibility.
 */

export type CognitiveIntent =
  | "GENERAL_CHAT"
  | "CURRENT_TREND"
  | "RESEARCH"
  | "FACTORY_TELEMETRY"
  | "PROJECT_LOOKUP"
  | "DOCUMENT_LOOKUP"
  | "VIDEO_CREATION"
  | "VIDEO_EDIT"
  | "VIDEO_STATUS"
  | "QUOTA"
  | "SYSTEM_STATUS"
  | "WORKER_STATUS"
  | "HELP"
  | "CLARIFICATION_REQUIRED"
  | "UNKNOWN";

export type CognitiveResponseMode =
  | "DIRECT_FACT"
  | "RESEARCH_SUMMARY"
  | "OPERATIONAL_STATUS"
  | "CREATIVE"
  | "TASK_PROGRESS"
  | "ERROR"
  | "CLARIFICATION";

export type SourceClass =
  | "FACTORY_TELEMETRY"
  | "AGENT_REACH"
  | "OKF_KNOWLEDGE"
  | "OFK_KNOWLEDGE"
  | "QUOTA_SERVICE"
  | "MISSION_DATABASE"
  | "PROVIDER_REGISTRY"
  | "GENERAL_KNOWLEDGE";

export type ReasoningMode = "REAL_MODEL" | "LOCAL_MODEL" | "TEST_HEURISTIC" | "DISABLED";

export interface ReasoningSource {
  readonly mode: ReasoningMode;
  readonly provider: string;
  readonly model: string;
  readonly trainingEligible: boolean;
  readonly fallbackApplied?: boolean;
  readonly fallbackReason?: string;
  readonly originalProvider?: string;
  readonly fallbackProvider?: string;
}

export interface OverseerCognitionConfig {
  endpoint?: string;
  model?: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface IntentClassification {
  intent: CognitiveIntent;
  confidence: number;
  entities: Record<string, any>;
  freshness: "today" | "recent" | "static" | "any";
  requiresLiveResearch: boolean;
  requiresEvidence: boolean;
  sourceClass: SourceClass;
  responseMode: CognitiveResponseMode;
  clarificationRequired: boolean;
  clarificationPrompt?: string;
}

export interface ExecutionPlan {
  goal: string;
  requiredCapabilities: string[];
  requiredEvidence: string[];
  answerShape: string;
  policyNotes?: string;
}

export interface AnswerContract {
  userQuestion: string;
  intent: CognitiveIntent;
  requiredFacts: string[];
  source: string;
  freshness?: string;
  evidenceRequired: boolean;
  maximumScope: "direct" | "research_summary" | "operational_status" | "detailed";
  responseStyle: "concise" | "concise_with_sources" | "step_by_step" | "conversational";
}

export interface ResponseReview {
  topicAdherent: boolean;
  factuallyGrounded: boolean;
  unsupportedClaims: string[];
  unnecessaryContent: string[];
  shouldRewrite: boolean;
  rewriteGuidance?: string;
}

export interface CognitiveRequest {
  operation: "CLASSIFY" | "PLAN" | "SYNTHESIZE" | "REVIEW";
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: Record<string, any>;
}

export interface CognitiveResponse<T = any> {
  success: boolean;
  data?: T;
  rawText?: string;
  latencyMs: number;
  provider: string;
  model: string;
  reasoningSource?: ReasoningSource;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  error?: string;
  errorCode?: string;
  diagnostics?: {
    chatRequestStarted: string;
    chatRequestId: string;
    modelCallStarted: string;
    modelCallCompleted: string;
    responseParsed: boolean;
  };
}
