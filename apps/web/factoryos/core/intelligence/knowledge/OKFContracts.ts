/**
 * ShortForge / FactoryOS — OKF Contracts + ShortForge extension profile.
 */

export type OKFStandardStatus = "draft" | "stable" | "deprecated";

export type KnowledgeContentType =
  | "decision"
  | "architecture"
  | "lesson"
  | "incident"
  | "experiment"
  | "fact"
  | "observation"
  | "reference"
  | "Concept"
  | "Decision"
  | "Pattern"
  | "FailureMode"
  | string;

export type EpistemicState = "observed" | "sourced" | "inferred" | "hypothesized";

export type ShortForgeLifecycle = "candidate" | "active" | "superseded" | "archived";

export type VerificationStatus = "unverified" | "verified" | "disputed";

export type MemoryQualityState =
  | "VALID"
  | "WARN"
  | "STALE"
  | "INCOMPLETE"
  | "CONTRADICTORY"
  | "UNVERIFIED"
  | "QUARANTINED";

export interface OKFVerificationRecord {
  readonly by: string;
  readonly at: string;
  readonly method?: string;
  readonly claim?: string;
}

export interface OKFGeneratedRecord {
  readonly by: string;
  readonly at: string;
  readonly tool?: string;
}

export interface OKFSourceReference {
  readonly id: string;
  readonly resource: string;
  readonly title?: string;
  readonly description?: string;
}

export type ProvenanceSourceType =
  | "FILE"
  | "GIT_COMMIT"
  | "RUNTIME_EVENT"
  | "DATABASE_CHANGE"
  | "USER_DECISION"
  | "AGENT_OBSERVATION"
  | "EXPERIMENT"
  | "GRAPH_SNAPSHOT"
  | "EXTERNAL_REFERENCE";

export interface KnowledgeProvenance {
  readonly source_type: ProvenanceSourceType;
  readonly source_id: string;
  readonly path?: string;
  readonly start_line?: number;
  readonly end_line?: number;
  readonly captured_at: string;
}

export interface OKFFrontmatter {
  readonly type: KnowledgeContentType;
  readonly title?: string;
  readonly description?: string;
  readonly resource?: string;
  readonly tags?: string[];
  readonly status?: OKFStandardStatus;
  readonly stale_after?: string;
  readonly sources?: OKFSourceReference[];
  readonly generated?: OKFGeneratedRecord;
  readonly verified?: OKFVerificationRecord[];

  readonly id: string;
  readonly sf_id?: string;
  readonly sf_lifecycle?: ShortForgeLifecycle;
  readonly sf_epistemic_state?: EpistemicState;
  readonly sf_verification_state?: VerificationStatus;
  readonly sf_valid_from?: string;
  readonly sf_valid_until?: string;
  readonly sf_occurred_at?: string;
  readonly sf_superseded_by?: string;
  readonly sf_provenance?: KnowledgeProvenance;

  readonly sf_quality_state?: MemoryQualityState;
  readonly sf_memory_quality_score?: number;
  readonly sf_source_hash?: string;
  readonly sf_source_kind?: string;
  readonly sf_source_collection?: string;
  readonly sf_source_document_id?: string;
  readonly sf_memory_record_key?: string;
  readonly sf_conflict_group?: string;
  readonly sf_promoted_from?: string;
  readonly sf_promoted_at?: string;
  readonly sf_evidence_reference?: string;
  readonly sf_training_eligible?: boolean;
  readonly training_eligible?: boolean;
  readonly evidence_refs?: string[];
  readonly sf_validity_reason?: string;

  readonly epistemic_state?: EpistemicState;
  readonly verification?: VerificationStatus;
  readonly created_at?: string;
  readonly updated_at?: string;
  readonly valid_from?: string;
  readonly valid_until?: string;
  readonly occurred_at?: string;
  readonly superseded_by?: string;
  readonly provenance?: KnowledgeProvenance;

  readonly [key: string]: unknown;
}

export interface KnowledgeDocument {
  readonly frontmatter: OKFFrontmatter;
  readonly content: string;
  readonly filePath: string;
}

export interface KnowledgeFilter {
  readonly type?: KnowledgeContentType;
  readonly status?: OKFStandardStatus | ShortForgeLifecycle;
  readonly sf_lifecycle?: ShortForgeLifecycle;
  readonly tags?: string[];
  readonly epistemic_state?: EpistemicState;
  readonly sf_epistemic_state?: EpistemicState;
  readonly verification?: VerificationStatus;
  readonly sf_verification_state?: VerificationStatus;
}

export interface OKFConformanceReport {
  readonly compliant: boolean;
  readonly totalDocuments: number;
  readonly parseErrors?: string[];
  readonly missingTypeErrors: string[];
  readonly invalidStatusErrors: string[];
  readonly malformedSourceErrors: string[];
  readonly malformedVerificationErrors: string[];
  readonly errors: string[];
}

export interface ShortForgeQualityReport {
  readonly passing: boolean;
  readonly totalDocuments: number;
  readonly documentsByType: Record<string, number>;
  readonly duplicateIds: string[];
  readonly parseErrors?: string[];
  readonly secretLeakErrors: string[];
  readonly brokenInternalLinks: string[];
  readonly missingProvenanceWarnings: string[];
  readonly staleDocumentWarnings: string[];
  readonly errors: string[];
  readonly warnings: string[];
}

export interface KnowledgeValidationReport {
  readonly valid: boolean;
  readonly totalDocuments: number;
  readonly documentsByType: Record<string, number>;
  readonly duplicateIds: string[];
  readonly parseErrors?: string[];
  readonly secretLeakErrors: string[];
  readonly missingRequiredFieldErrors: string[];
  readonly errors: string[];
  readonly okfConformance?: OKFConformanceReport;
  readonly sfQuality?: ShortForgeQualityReport;
}
