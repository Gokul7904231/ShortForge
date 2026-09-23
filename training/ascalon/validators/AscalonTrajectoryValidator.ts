/**
 * Project Ascalon — Trajectory Validator
 *
 * Enforces non-negotiable quality and safety gates:
 * 1. Schema completeness
 * 2. Secret & credential scanning (rejects any leaked keys, tokens, or sessions)
 * 3. Simulation isolation (rejects simulated data mislabeled as real)
 * 4. Provenance & verification integrity (rejects unverified claims of success)
 * 5. Unknown tool/capability rejection
 */

export interface ValidationIssue {
  readonly code: string;
  readonly severity: "BLOCKING" | "WARNING";
  readonly message: string;
}

export interface ValidationReport {
  readonly valid: boolean;
  readonly issues: ValidationIssue[];
}

// Secret detection regular expressions
const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z-_]{30,}/,                     // Google API Key
  /sk-[a-zA-Z0-9_-]{20,}/,                     // OpenAI/OpenRouter Secret
  /gsk_[a-zA-Z0-9_-]{20,}/,                    // Groq API Key
  /nvapi-[a-zA-Z0-9_-]{20,}/,                  // NVIDIA NIM Key
  /ghp_[a-zA-Z0-9_-]{20,}/,                    // GitHub PAT
  /Bearer\s+[a-zA-Z0-9_\-\.]{20,}/i,           // Bearer Token
  /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}/, // JWT Token
  /-----BEGIN\s+PRIVATE\s+KEY-----/,           // Private RSA/EC Key
  /CLERK_SECRET_KEY/i,                         // Literal secret key assignment
];

const KNOWN_CAPABILITIES = [
  "cap_research_topic_ingest",
  "cap_script_synthesis",
  "cap_voice_generation",
  "cap_visual_asset_generate",
  "cap_timeline_mux",
  "cap_render_dispatch",
  "cap_compliance_verify",
  "cap_youtube_publish",
  "cap_slayer_revoke_lease",
  "cap_healer_retry_task",
];

export class AscalonTrajectoryValidator {
  public static validate(trajectory: Record<string, any>): ValidationReport {
    const issues: ValidationIssue[] = [];

    // 1. Secret Scanning
    const stringified = JSON.stringify(trajectory);
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(stringified)) {
        issues.push({
          code: "SECRET_LEAKAGE",
          severity: "BLOCKING",
          message: `Trajectory contains a credential matching pattern: ${pattern.toString()}`,
        });
      }
    }

    // 2. Schema Completeness
    const requiredTopLevel = [
      "trajectoryId",
      "schemaVersion",
      "hierarchyVersion",
      "episode",
      "environment",
      "observation",
      "decision",
      "authorization",
      "execution",
      "outcome",
      "provenance",
    ];

    for (const field of requiredTopLevel) {
      if (!(field in trajectory)) {
        issues.push({
          code: "MISSING_SCHEMA_FIELD",
          severity: "BLOCKING",
          message: `Trajectory missing mandatory top-level field: ${field}`,
        });
      }
    }

    // 3. Simulation & Synthetic Contamination Check
    const env = trajectory.environment?.environmentType;
    const isSynthetic = trajectory.provenance?.synthetic;
    const isSimulation = trajectory.provenance?.simulation;
    const labelSource = trajectory.provenance?.labelSource;

    if ((env === "SIMULATION" || isSynthetic || isSimulation) && labelSource === "VERIFIED_OUTCOME") {
      issues.push({
        code: "SIMULATION_CONTAMINATION",
        severity: "BLOCKING",
        message: "Simulation or synthetic trajectory cannot be labeled as VERIFIED_OUTCOME.",
      });
    }

    // 4. Verification Claim Integrity
    const outcomeStatus = trajectory.outcome?.status;
    const isVerified = trajectory.outcome?.verified;
    const hasEvidence = !!trajectory.outcome?.verificationEvidenceId;

    if (outcomeStatus === "SUCCESS" && !isVerified) {
      issues.push({
        code: "UNVERIFIED_SUCCESS_CLAIM",
        severity: "BLOCKING",
        message: "Outcome reports SUCCESS but verified is false (Claim <= Evidence violation).",
      });
    }

    if (isVerified && !hasEvidence) {
      issues.push({
        code: "MISSING_VERIFICATION_EVIDENCE",
        severity: "BLOCKING",
        message: "Outcome marked verified without verificationEvidenceId.",
      });
    }

    // 5. Tool / Capability Validation
    const toolCall = trajectory.execution?.tool;
    if (toolCall && !KNOWN_CAPABILITIES.includes(toolCall)) {
      issues.push({
        code: "HALLUCINATED_TOOL",
        severity: "BLOCKING",
        message: `Execution invokes unknown capability: ${toolCall}`,
      });
    }

    // 6. Guardian Authorization Integrity
    const authRequested = trajectory.authorization?.requested;
    const isAuthorized = trajectory.authorization?.authorized;
    const guardianDecision = trajectory.authorization?.guardianDecision;

    if (authRequested && isAuthorized && guardianDecision === "DENIED") {
      issues.push({
        code: "AUTHORIZATION_CONTRADICTION",
        severity: "BLOCKING",
        message: "Execution marked authorized despite Guardian DENIED decision.",
      });
    }

    return {
      valid: issues.filter((i) => i.severity === "BLOCKING").length === 0,
      issues,
    };
  }
}
