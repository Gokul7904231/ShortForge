/**
 * ShortForge Research Runtime — Authoritative Implementation
 * Executes bounded research, claim extraction, verification, cryptographic signing, and tamper detection.
 * Enforces JCS-v1 canonical serialization, SHA-256 content hashing, and HMAC-SHA256 integrity verification.
 */

import { ReachSubsystem } from "./ReachSubsystem";
import type {
  ResearchPassport,
  ResearchClaim,
  AnalystReport,
  EvidenceSource,
  ClaimType,
  VerificationStatus,
  PassportIntegrityMetadata,
} from "../contracts/ResearchPassportContracts";
import { randomUUID, createHash, createHmac } from "node:crypto";

export interface ResearchRequest {
  readonly missionId: string;
  readonly topic: string;
  readonly intent?: string;
  readonly methodology?: "QUICK" | "FULL" | "FACT_CHECK" | "TREND_SCAN" | "COMPETITOR_SCAN";
  readonly targetSourceCount?: number;
  readonly scheduleInstanceId?: string;
}

const DEFAULT_FACTORY_INTEGRITY_SECRET = process.env.FACTORY_INTEGRITY_SECRET || "factory_internal_integrity_key_default";

export class ResearchRuntime {
  private reach: ReachSubsystem;

  constructor(reach?: ReachSubsystem) {
    this.reach = reach || new ReachSubsystem();
  }

  /**
   * Deterministic JSON Canonicalization (JCS-v1 compliant)
   * Recursively sorts object keys and strips the integrity block.
   */
  static canonicalize(obj: any): string {
    if (obj === null || typeof obj !== "object") {
      return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
      return "[" + obj.map((item) => ResearchRuntime.canonicalize(item)).join(",") + "]";
    }
    const keys = Object.keys(obj)
      .filter((k) => k !== "integrity") // Exclude integrity block from canonical payload
      .sort();
    const keyValPairs = keys.map((k) => `${JSON.stringify(k)}:${ResearchRuntime.canonicalize(obj[k])}`);
    return "{" + keyValPairs.join(",") + "}";
  }

  /**
   * Cryptographically signs a ResearchPassport using canonical serialization and HMAC-SHA256.
   */
  static signPassport(passport: ResearchPassport, secret: string = DEFAULT_FACTORY_INTEGRITY_SECRET): ResearchPassport {
    const canonicalPayload = ResearchRuntime.canonicalize(passport);
    const contentHash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
    const integrityMac = createHmac("sha256", secret).update(contentHash, "utf8").digest("hex");

    const integrity: PassportIntegrityMetadata = {
      contentHash,
      integrityMac,
      algorithm: "HMAC-SHA256",
      keyId: "factory_secret_v1",
      canonicalizationVersion: "JCS-v1",
      signedAt: new Date().toISOString(),
    };

    return {
      ...passport,
      integrity,
    };
  }

  /**
   * Cryptographically verifies passport integrity:
   * Recalculates canonical SHA-256 hash and validates HMAC signature against tampering.
   */
  static verifyResearchPassport(
    passport: ResearchPassport,
    secret: string = DEFAULT_FACTORY_INTEGRITY_SECRET
  ): { valid: boolean; reason?: string } {
    if (!passport.integrity) {
      return { valid: false, reason: "Passport has no cryptographic integrity metadata" };
    }

    const { contentHash, integrityMac, canonicalizationVersion, algorithm } = passport.integrity;

    if (canonicalizationVersion !== "JCS-v1") {
      return { valid: false, reason: `Unsupported canonicalization version: ${canonicalizationVersion}` };
    }
    if (algorithm !== "HMAC-SHA256") {
      return { valid: false, reason: `Unsupported integrity algorithm: ${algorithm}` };
    }

    // 1. Recalculate content hash on canonical payload
    const canonicalPayload = ResearchRuntime.canonicalize(passport);
    const recalculatedHash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");

    if (recalculatedHash !== contentHash) {
      return {
        valid: false,
        reason: `Content hash mismatch (payload tampered): expected ${contentHash}, recalculated ${recalculatedHash}`,
      };
    }

    // 2. Validate HMAC signature
    const expectedMac = createHmac("sha256", secret).update(recalculatedHash, "utf8").digest("hex");
    if (expectedMac !== integrityMac) {
      return { valid: false, reason: "Integrity MAC mismatch (unauthorized signature or key mismatch)" };
    }

    return { valid: true };
  }

  /**
   * Executes bounded research lifecycle:
   * Intent -> Source Discovery -> Evidence Extraction -> Claim Formulation -> Passport Synthesis -> Signing -> Analyst Report
   */
  async executeResearch(request: ResearchRequest): Promise<AnalystReport> {
    const startedAt = new Date().toISOString();
    const methodology = request.methodology || "TREND_SCAN";
    const missionId = request.missionId;

    // 1. Source Discovery via Reach (capacity derived dynamically from schedule request)
    const maxSources = request.targetSourceCount ?? (methodology === "QUICK" ? 2 : 4);
    const sources = await this.reach.acquireSources({
      queryOrUrl: request.topic,
      type: "QUERY",
      maxSources,
      callerFloor: "floor00_analyst",
      intent: request.intent,
    });

    // 2. Claim Formulation & Integrity Classification
    const claims: ResearchClaim[] = this.formulateClaims(request.topic, sources);

    // 3. Research Passport Synthesis
    const passportId = `pass_${randomUUID().substring(0, 8)}`;
    const passportConfidence = claims.length > 0
      ? Number((claims.reduce((acc, c) => acc + c.confidence, 0) / claims.length).toFixed(2))
      : 0.3;

    const unsignedPassport: ResearchPassport = {
      passportId,
      missionId,
      question: `What are the dominant viral hooks, factual claims, and competitor patterns for "${request.topic}"?`,
      intent: request.intent || "Short-form video synthesis and narrative retention optimization",
      methodology,
      sources,
      claims,
      unresolvedIssues: claims
        .filter((c) => c.verificationStatus === "UNVERIFIED" || c.verificationStatus === "AMBIGUOUS" || c.verificationStatus === "CONTRADICTED")
        .map((c) => c.statement),
      confidence: passportConfidence,
      provenance: {
        reachProvider: "reach-http-browser",
        agentId: "worker_analyst_01",
        floorId: "floor00_analyst",
      },
      timestamps: {
        initiatedAt: startedAt,
        completedAt: new Date().toISOString(),
      },
      transformations: [
        "Reach source extraction",
        "Deterministic claim parsing",
        "Claim-level evidence cross-corroboration",
        "Verification status scoring",
      ],
    };

    // 4. Cryptographic Signing of Passport
    const passport = ResearchRuntime.signPassport(unsignedPassport);

    // 5. Synthesize Analyst Report with dynamic competitor signals
    const competitorSignals = sources
      .filter((s) => s.url.includes("youtube.com") || s.url.includes("tiktok.com") || s.url.includes("instagram.com"))
      .map((s) => ({
        competitor: s.publisher || s.title.slice(0, 30),
        format: "Short Video",
        viewVelocity: "Observed external index",
      }));

    const reportId = `rep_${randomUUID().substring(0, 8)}`;
    return {
      reportId,
      topic: request.topic,
      executiveSummary: `Intelligence synthesis for "${request.topic}": ${sources.length} sources examined, ${claims.length} claims extracted (${claims.filter(c => c.verificationStatus === "VERIFIED").length} verified, ${claims.filter(c => c.verificationStatus === "CONTRADICTED").length} contradicted). Measured passport confidence: ${passportConfidence}.`,
      keyFindings: [
        `Observed ${sources.length} external sources relevant to "${request.topic}".`,
        "Optimal short-form video pacing benefits from early hook alignment.",
      ],
      hookIntelligence: {
        recommendedHook: `Did you know the untold truth behind ${request.topic}?`,
        hookArchetype: "CURIOSITY_GAP",
        estimatedRetentionBoost: 0.18,
        competitiveRetentionCurve: [1.0, 0.88, 0.79, 0.74, 0.71, 0.68],
        fidelity: "HEURISTIC_ESTIMATE",
        provenanceNote: "Heuristic baseline recommendation. Not verified telemetry.",
      },
      competitorSignals,
      passport,
      generatedAt: new Date().toISOString(),
    };
  }

  private formulateClaims(topic: string, sources: EvidenceSource[]): ResearchClaim[] {
    const claims: ResearchClaim[] = [];
    const now = new Date().toISOString();

    if (sources.length === 0) {
      claims.push({
        claimId: `clm_${randomUUID().substring(0, 6)}`,
        statement: `Topic "${topic}" lacks external corroborated primary sources.`,
        claimType: "UNVERIFIED_ASSERTION",
        retrievedAt: now,
        extractionMethod: "SYNTHETIC_HEURISTIC",
        verificationMethod: "NONE",
        verificationStatus: "UNVERIFIED",
        confidence: 0.3,
        supportingSources: [],
        contradictingSources: [],
        contradictionDegree: 0.0,
        provenance: "research_runtime_internal",
      });
      return claims;
    }

    const contradictionRegex = /\b(myth|debunked|false|untrue|hoax|disputed|unproven|fake|rumor|contrary)\b/i;

    // Source-backed claims with claim-level evidence
    sources.forEach((src, idx) => {
      const isContradicted = contradictionRegex.test(src.snippet) || contradictionRegex.test(src.title);
      const srcWords = new Set(
        `${src.title} ${src.snippet}`
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter((w) => w.length >= 4)
      );
      const corroborating = sources.filter((other) => {
        if (other.id === src.id) return false;
        const otherWords = `${other.title} ${other.snippet}`
          .toLowerCase()
          .replace(/[^\w\s]/g, "")
          .split(/\s+/)
          .filter((w) => w.length >= 4);
        return otherWords.some((w) => srcWords.has(w));
      });

      let claimType: ClaimType = "SOURCE_CLAIM";
      let status: VerificationStatus = "UNVERIFIED";
      let conf = Number((src.reliabilityScore || 0.7).toFixed(2));
      let contradictionDegree = 0.0;
      let supportingSources: string[] = [src.url];
      let contradictingSources: string[] = [];

      if (isContradicted) {
        claimType = "CONTRADICTED_CLAIM";
        status = "CONTRADICTED";
        contradictionDegree = 0.85;
        conf = 0.35;
        contradictingSources = [src.url];
        supportingSources = [];
      } else if (corroborating.length > 0) {
        claimType = "VERIFIED_FACT";
        status = "VERIFIED";
        conf = Number(Math.min(0.98, (src.reliabilityScore || 0.8) + 0.1).toFixed(2));
        supportingSources = [src.url, ...corroborating.map((c) => c.url)];
      }

      claims.push({
        claimId: `clm_${randomUUID().substring(0, 6)}`,
        statement: `${src.title}: ${src.snippet.slice(0, 120)}...`,
        claimType,
        source: src,
        sourceReference: src.url,
        supportingSources,
        contradictingSources,
        contradictionDegree,
        retrievedAt: src.retrievedAt,
        extractionMethod: src.extractionMethod,
        verificationMethod: corroborating.length > 0 ? "CROSS_SOURCE_CORROBORATION" : "DIRECT_MATCH",
        verificationStatus: status,
        confidence: conf,
        provenance: `reach_${src.id}`,
      });
    });

    // Model inference claim
    claims.push({
      claimId: `clm_model_${randomUUID().substring(0, 6)}`,
      statement: `Inferred contextual hypothesis for "${topic}" generated by analyst cognitive engine.`,
      claimType: "MODEL_CLAIM",
      retrievedAt: now,
      extractionMethod: "MODEL_INFERENCE",
      verificationMethod: "NONE",
      verificationStatus: "UNVERIFIED",
      confidence: 0.55,
      supportingSources: [],
      contradictingSources: [],
      contradictionDegree: 0.0,
      provenance: "analyst_model_core",
    });

    return claims;
  }
}
