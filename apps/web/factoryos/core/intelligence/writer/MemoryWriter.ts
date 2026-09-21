/**
 * ShortForge / FactoryOS — MemoryWriter Implementation
 * Enforces controlled writing into durable OKF knowledge vault.
 * Protects repository memory from noise, unverified claims, and credential leakage.
 */

import { KnowledgeDocument, OKFFrontmatter } from "../knowledge/OKFContracts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore";
import {
  CandidateMemoryProposal,
  IMemoryWriter,
  MemoryWritePolicyResult,
} from "./MemoryWriterContracts";

export class MemoryWriter implements IMemoryWriter {
  private knowledgeStore: KnowledgeStore;

  private static NOISE_PATTERNS = [
    /\[DEBUG\]/i,
    /stdout:/i,
    /stderr:/i,
    /tool_call:/i,
    /traceback \(most recent call last\)/i,
    /exit code 0/i,
    /temporary log/i,
  ];

  // Expanded secret sanitization patterns
  private static SECRET_PATTERNS = [
    /bearer\s+[a-zA-Z0-9_\-\.]{20,}/gi,
    /AIzaSy[a-zA-Z0-9_\-]{20,40}/g, // Google API key
    /gsk_[a-zA-Z0-9]{30,60}/g, // Groq API key
    /clerk_[a-zA-Z0-9_\-]{20,50}/gi, // Clerk token
    /(?:ghp|github_pat|gho|ghu|ghs|ghr)_[a-zA-Z0-9_]{20,}/g, // GitHub PATs
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, // JWTs
    /AKIA[0-9A-Z]{16}/g, // AWS key
    /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC )?PRIVATE KEY-----/g, // PEM block
    /INTERNAL_API_SECRET_KEY\s*=\s*[^\s]+/gi,
    /password\s*[:=]\s*["'][^"']+["']/gi,
  ];

  constructor(knowledgeStore: KnowledgeStore) {
    this.knowledgeStore = knowledgeStore;
  }

  public evaluatePolicy(proposal: CandidateMemoryProposal): MemoryWritePolicyResult {
    // 1. Content completeness check
    if (!proposal.title || proposal.title.trim().length < 5) {
      return {
        accepted: false,
        reason: "Title is too short or empty.",
        category: "REJECTED_NOISE",
      };
    }

    if (!proposal.content || proposal.content.trim().length < 20) {
      return {
        accepted: false,
        reason: "Content is too brief or empty.",
        category: "REJECTED_NOISE",
      };
    }

    // 2. Reject debugging and tool noise
    for (const rx of MemoryWriter.NOISE_PATTERNS) {
      if (rx.test(proposal.content)) {
        return {
          accepted: false,
          reason: `Content contains transient debugging/tool noise pattern: ${rx.source}`,
          category: "REJECTED_NOISE",
        };
      }
    }

    // 3. Evaluate eligibility by verification and epistemic status:
    // Security tagging or decision type alone does NOT bypass verification.
    if (proposal.isDisputed) {
      return {
        accepted: false,
        reason: "Disputed proposal is blocked from promotion into durable knowledge.",
        category: "REJECTED_DISPUTED",
      };
    }

    if (!proposal.isVerified) {
      return {
        accepted: false,
        reason: `Unverified ${proposal.type} observation requires explicit verification before promotion into durable memory.`,
        category: "REQUIRES_VERIFICATION",
      };
    }

    if (proposal.verificationEvidence) {
      const { VerificationTruthValidator } = require("../../verification/VerificationStatusModel");
      const check = VerificationTruthValidator.validateClaim(proposal.verificationEvidence);
      if (!check.valid) {
        return {
          accepted: false,
          reason: `Verification evidence rejected: ${check.reason}`,
          category: "REQUIRES_VERIFICATION",
        };
      }
    }

    return {
      accepted: true,
      reason: `Explicitly verified ${proposal.type} accepted for durable memory.`,
      category: "AUTO_ACCEPT",
    };
  }

  public async proposeAndCommit(proposal: CandidateMemoryProposal): Promise<KnowledgeDocument> {
    const policyResult = this.evaluatePolicy(proposal);
    if (!policyResult.accepted) {
      throw new Error(`Memory commit rejected by policy: ${policyResult.reason} (${policyResult.category})`);
    }

    // 1. Sanitize content and title (redact secrets)
    const sanitizedTitle = this.sanitizeSecrets(proposal.title);
    const sanitizedContent = this.sanitizeSecrets(proposal.content);

    // 2. Deduplication check
    const existing = this.knowledgeStore.search(sanitizedTitle, { limit: 3 });
    for (const doc of existing) {
      if ((doc.frontmatter.title || "").toLowerCase() === sanitizedTitle.toLowerCase()) {
        throw new Error(`Duplicate knowledge document already exists with ID '${doc.frontmatter.id}'.`);
      }
    }

    // 3. Construct ID from title
    const cleanId = sanitizedTitle
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const now = new Date().toISOString();
    const frontmatter: OKFFrontmatter = {
      id: cleanId,
      sf_id: cleanId,
      type: proposal.type,
      title: sanitizedTitle,
      status: "stable",
      sf_lifecycle: "active",
      sf_epistemic_state: proposal.isVerified ? "sourced" : "observed",
      sf_verification_state: proposal.isVerified ? "verified" : "unverified",
      epistemic_state: proposal.isVerified ? "sourced" : "observed",
      verification: proposal.isVerified ? "verified" : "unverified",
      created_at: now,
      updated_at: now,
      tags: proposal.tags || [],
      sf_provenance: proposal.provenance,
      provenance: proposal.provenance,
    };

    return this.knowledgeStore.create({
      frontmatter,
      content: sanitizedContent,
      subDir: `${proposal.type}s`,
    });
  }

  public sanitizeSecrets(text: string): string {
    let sanitized = text;

    // Structure-preserving DB URI redaction
    sanitized = sanitized.replace(
      /((?:postgres|postgresql|mongodb|mysql):\/\/[^:]+:)[^@]+(@[^\s"']+)/gi,
      "$1[REDACTED_SECRET]$2"
    );

    for (const rx of MemoryWriter.SECRET_PATTERNS) {
      sanitized = sanitized.replace(rx, "[REDACTED_SECRET]");
    }
    return sanitized;
  }
}
