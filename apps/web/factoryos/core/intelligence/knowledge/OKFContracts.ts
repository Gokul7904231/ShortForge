/**
 * ShortForge / FactoryOS — OKF (Open Knowledge Format) Contracts
 * Strictly implements OKF v0.2 Specification Baseline + Explicit ShortForge (`sf_*`) Extension Profile.
 *
 * OKF v0.2 Standard Fields:
 * - type (required concept identifier)
 * - title, description, resource, tags
 * - status ("draft" | "stable" | "deprecated")
 * - stale_after
 * - sources (portable references)
 * - generated (process / timestamp)
 * - verified (array of verification records: { by, at, method? })
 *
 * ShortForge Extension Fields (sf_*):
 * - sf_id: unique slug identifier (backward-compatible with frontmatter.id)
 * - sf_lifecycle: "candidate" | "active" | "superseded" | "archived"
 * - sf_epistemic_state: "observed" | "sourced" | "inferred" | "hypothesized"
 * - sf_verification_state: "unverified" | "verified" | "disputed"
 * - sf_valid_from, sf_valid_until, sf_occurred_at
 * - sf_superseded_by
 * - sf_provenance: internal rich provenance metadata
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
  // --- OKF v0.2 Standard Fields ---
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

  // --- ShortForge Internal Extension Fields (sf_*) ---
  readonly id: string; // Identifier alias (convenience & backwards-compat)
  readonly sf_id?: string;
  readonly sf_lifecycle?: ShortForgeLifecycle;
  readonly sf_epistemic_state?: EpistemicState;
  readonly sf_verification_state?: VerificationStatus;
  readonly sf_valid_from?: string;
  readonly sf_valid_until?: string;
  readonly sf_occurred_at?: string;
  readonly sf_superseded_by?: string;
  readonly sf_provenance?: KnowledgeProvenance;

  // Backwards compatibility convenience properties
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

/**
 * Pure OKF v0.2 Conformance Report:
 * Checks type presence, standard status ("draft" | "stable" | "deprecated"),
 * reserved file naming, and valid sources/verified structures.
 * Per OKF spec, broken links are tolerated and NOT conformance failures.
 */
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

/**
 * ShortForge Knowledge Quality Report:
 * Checks internal link targets, duplicate IDs, stale claims, secret leaks,
 * missing domain tags, and required sf_* metadata.
 */
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
