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
import { runBoundedFeedbackLoop, type FloorClosedLoopReceipt } from "../governance/FloorClosedLoop";
import { randomUUID, createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { EngineResearchContract } from "../../../lib/core/EngineConfigurationContracts";
import type { ReachResearchMode } from "./ReachContracts";

export interface ResearchLoopOptions {
  readonly maxIterations?: number;
  readonly minVerifiedClaims?: number;
  readonly minConfidence?: number;
  readonly sourceGrowthPerIteration?: number;
}

export interface ResearchEvidenceFeedback {
  readonly iteration: number;
  readonly sourceCount: number;
  readonly totalClaims: number;
  readonly verifiedClaims: number;
  readonly unresolvedClaims: number;
  readonly passportConfidence: number;
  readonly passed: boolean;
}

export interface ResearchLoopReport {
  readonly analystReport: AnalystReport;
  readonly feedback: readonly ResearchEvidenceFeedback[];
  readonly receipt: FloorClosedLoopReceipt;
}

export interface ResearchRequest {
  readonly missionId: string;
  readonly topic: string;
  readonly intent?: string;
  readonly methodology?: "QUICK" | "FULL" | "FACT_CHECK" | "TREND_SCAN" | "COMPETITOR_SCAN";
  readonly targetSourceCount?: number;
  readonly scheduleInstanceId?: string;
  readonly audience?: string;
  readonly researchMode?: ReachResearchMode;
  /**
   * Immutable Content Engine-owned authorization for all external research.
   * Optional at the type level is intentionally forbidden: callers must bind
   * a Content Engine before constructing a production research request.
   */
  readonly researchContract: EngineResearchContract & {
    readonly engineId: string;
  };
}

const DEV_FACTORY_INTEGRITY_SECRET = "factory_internal_integrity_key_dev_only";
const MAX_RESEARCH_SOURCE_CAP = 20;

function getIntegritySecret(): string {
  if (process.env.FACTORY_INTEGRITY_SECRET) {
    return process.env.FACTORY_INTEGRITY_SECRET;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("FACTORY_INTEGRITY_SECRET is required in production.");
  }
  return DEV_FACTORY_INTEGRITY_SECRET;
}

export class ResearchRuntime {
  private reach: ReachSubsystem;

  constructor(reach?: ReachSubsystem) {
    this.reach = reach || new ReachSubsystem();
  }

  /**
   * Deterministic project canonicalization (JCS-v1).
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
  static signPassport(passport: ResearchPassport, secret?: string): ResearchPassport {
    const resolvedSecret = secret || getIntegritySecret();
    const canonicalPayload = ResearchRuntime.canonicalize(passport);
    const contentHash = createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
    const integrityMac = createHmac("sha256", resolvedSecret).update(contentHash, "utf8").digest("hex");

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
    secret?: string
  ): { valid: boolean; reason?: string } {
    if (!passport.integrity) {
      return { valid: false, reason: "Passport has no cryptographic integrity metadata" };
    }

    const { contentHash, integrityMac, canonicalizationVersion, algorithm } = passport.integrity;
    const resolvedSecret = secret || getIntegritySecret();

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
    const expectedMac = createHmac("sha256", resolvedSecret).update(recalculatedHash, "utf8").digest("hex");
    const expected = Buffer.from(expectedMac, "hex");
    const received = Buffer.from(integrityMac, "hex");
    if (
      expected.length !== received.length ||
      !timingSafeEqual(expected, received)
    ) {
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

    if (!request.topic || request.topic.trim() === "") {
      throw new Error("Floor 00 ResearchRuntime requires a non-empty topic.");
    }

    // 1. Source Discovery via Reach.
    // Reach is contract-gated: F00 cannot acquire external information unless
    // the selected Content Engine explicitly authorizes the query operation.
    const researchContract = request.researchContract;

    if (!researchContract) {
      throw new Error(
        "F00_RESEARCH_CONTRACT_REQUIRED: Floor 00 external research requires a bound Content Engine research contract.",
      );
    }

    if (!researchContract.required) {
      throw new Error(
        `F00_RESEARCH_NOT_AUTHORIZED: Content Engine "${researchContract.engineId}" does not authorize external research for this request.`,
      );
    }

    const queryKindByMethodology: Record<
      NonNullable<ResearchRequest["methodology"]>,
      string
    > = {
      QUICK: "TOPIC_SCAN",
      FULL: "TOPIC_SCAN",
      FACT_CHECK: "FACT_CHECK",
      TREND_SCAN: "TREND_SCAN",
      COMPETITOR_SCAN: "COMPETITOR_SCAN",
    };

    const queryKind = queryKindByMethodology[methodology];

    if (!queryKind) {
      throw new Error(
        `F00_RESEARCH_QUERY_KIND_UNMAPPED: methodology ${methodology} has no Content Engine query mapping.`,
      );
    }

    const requestedSourceCount =
      request.targetSourceCount ??
      researchContract.minSources ??
      (methodology === "QUICK" ? 2 : 4);

    const maxSources = Math.min(
      MAX_RESEARCH_SOURCE_CAP,
      Math.max(
        1,
        Math.floor(
          Number.isFinite(Number(requestedSourceCount))
            ? Number(requestedSourceCount)
            : 1,
        ),
      ),
    );

    const acquiredSources = await this.reach.acquireSources({
      engineId: researchContract.engineId,
      queryKind,
      topic: request.topic,
      parameters: {},
      researchContract,
      maxSources,
      callerFloor: "floor00_analyst",
      intent: request.intent,
      mode: request.researchMode,
    });

    // Reach may return an explicit UNAVAILABLE/UNREACHABLE source record so the
    // caller can diagnose the failure. Those records are not evidence.
    const sources = acquiredSources.filter(
      (source) =>
        source.sourceStatus !== "UNAVAILABLE" &&
        source.sourceStatus !== "UNREACHABLE"
    );

    // 2. Claim Formulation & Integrity Classification
    const claims: ResearchClaim[] = this.formulateClaims(request.topic, sources);

    // 3. Research Passport Synthesis
    const passportId = `pass_${randomUUID().substring(0, 8)}`;
    const evidenceClaims = claims.filter(
      (claim) =>
        claim.claimType !== "MODEL_CLAIM" &&
        claim.claimType !== "UNVERIFIED_ASSERTION"
    );
    const passportConfidence =
      evidenceClaims.length > 0
        ? Number(
            (
              evidenceClaims.reduce((acc, c) => acc + c.confidence, 0) /
              evidenceClaims.length
            ).toFixed(2)
          )
        : 0.0;

    const unsignedPassport: ResearchPassport = {
      passportId,
      missionId,
      question: `What are the dominant evidence-backed hooks, factual claims, and competitor patterns for "${request.topic}"?`,
      intent:
        request.intent ||
        "Short-form video research and evidence-backed narrative planning",

      methodology,
      sources,
      claims,
      unresolvedIssues: claims
        .filter((c) => c.verificationStatus === "UNVERIFIED" || c.verificationStatus === "AMBIGUOUS" || c.verificationStatus === "CONTRADICTED")
        .map((c) => c.statement),
      confidence: passportConfidence,
      provenance: {
        reachProvider: "reach-provider-fabric",
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
        "Conservative claim-level corroboration",
        "Verification status classification",
      ],
      researchContext: {
        engineId: request.researchContract?.engineId,
        audience: request.audience,
        dataRequirements: request.researchContract?.dataRequirements,
        minSources: request.researchContract?.minSources,
        citationRequired: request.researchContract?.citationRequired,
        freshness: request.researchContract?.freshness,
        agentReachProfile: request.researchContract?.agentReachProfile,
        researchMode: request.researchMode,
      },
    };

    // 4. Cryptographic Signing of Passport
    const passport = ResearchRuntime.signPassport(unsignedPassport, getIntegritySecret());

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
        `Heuristic only: early-hook alignment is a commonly used short-form pattern for "${request.topic}".`,
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

  /**
   * Bounded evidence/research feedback loop.
   *
   * The loop never grants execution authority. It only re-queries when the
   * current research result fails the caller's evidence-quality thresholds.
   */
  async executeResearchLoop(
    request: ResearchRequest,
    options: ResearchLoopOptions = {}
  ): Promise<ResearchLoopReport> {
    const startedAt = new Date().toISOString();
    const initialReport = await this.executeResearch(request);

    const minVerifiedClaims = Math.max(1, Math.floor(options.minVerifiedClaims ?? 1));
    const minConfidence = Math.max(0, Math.min(1, options.minConfidence ?? 0.7));
    const sourceGrowth = Math.max(1, Math.floor(options.sourceGrowthPerIteration ?? 4));

    type ResearchState = { request: ResearchRequest; report: AnalystReport };

    const result = await runBoundedFeedbackLoop<ResearchState, ResearchEvidenceFeedback>({
      initialOutput: { request, report: initialReport },
      maxIterations: options.maxIterations ?? 3,
      verify: async (state, iteration) => {
        const claims = state.report.passport.claims;
        const verifiedClaims = claims.filter((claim) => claim.verificationStatus === "VERIFIED").length;
        const unresolvedClaims = claims.filter(
          (claim) =>
            claim.verificationStatus === "UNVERIFIED" ||
            claim.verificationStatus === "AMBIGUOUS" ||
            claim.verificationStatus === "CONTRADICTED"
        ).length;
        return {
          iteration,
          sourceCount: state.report.passport.sources.length,
          totalClaims: claims.length,
          verifiedClaims,
          unresolvedClaims,
          passportConfidence: state.report.passport.confidence,
          passed: verifiedClaims >= minVerifiedClaims && state.report.passport.confidence >= minConfidence,
        };
      },
      isSatisfied: (feedback) => feedback.passed,
      fingerprint: (state) =>
        createHash("sha256")
          .update(
            JSON.stringify({
              topic: state.request.topic,
              sources: state.report.passport.sources.map((source) => source.url).sort(),
              verifiedClaims: state.report.passport.claims
                .filter((claim) => claim.verificationStatus === "VERIFIED")
                .map((claim) => claim.statement)
                .sort(),
              confidence: state.report.passport.confidence,
            })
          )
          .digest("hex"),
      revise: async (state, feedback) => {
        const nextTarget = Math.min(
          MAX_RESEARCH_SOURCE_CAP,
          Math.max(
            state.report.passport.sources.length + sourceGrowth,
            state.request.targetSourceCount ?? minVerifiedClaims + sourceGrowth
          )
        );

        if (nextTarget <= state.report.passport.sources.length) {
          return null;
        }

        const nextIntent = [
          state.request.intent || "",
          "Re-verify unresolved research claims using additional independent sources.",
          "Prior iteration: " +
            feedback.verifiedClaims +
            " verified claims, " +
            feedback.unresolvedClaims +
            " unresolved claims.",
        ]
          .filter(Boolean)
          .join(" ");

        const nextReport = await this.executeResearch({
          ...state.request,
          methodology: "FULL",
          targetSourceCount: nextTarget,
          intent: nextIntent,
        });

        return {
          request: {
            ...state.request,
            methodology: "FULL",
            targetSourceCount: nextTarget,
            intent: nextIntent,
          },
          report: nextReport,
        };
      },
    });

    const finalFeedback = result.history.map((entry) => entry.feedback);
    const finalFeedbackItem = finalFeedback[finalFeedback.length - 1];
    const completedAt = new Date().toISOString();

    const receipt: FloorClosedLoopReceipt = {
      floorId: "floor00_analyst",
      loopType: "BOUNDED_FEEDBACK",
      loopId: "f00-research-" + request.missionId + "-" + Date.now().toString(36),
      termination: result.termination,
      iterations: result.iterations,
      startedAt,
      completedAt,
      verified: Boolean(finalFeedbackItem?.passed),
      evidenceRefs: [
        ...result.output.report.passport.sources.map((source) => source.url),
        result.output.report.passport.passportId,
      ],
      failureReason:
        result.termination === "COMPLETED"
          ? undefined
          : "Evidence thresholds were not satisfied within the bounded research loop.",
    };

    return {
      analystReport: result.output.report,
      feedback: Object.freeze(finalFeedback),
      receipt,
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
    sources.forEach((src) => {
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
        const otherWords = new Set(
          `${other.title} ${other.snippet}`
            .toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length >= 4)
        );
        const sharedMeaningfulTokens = [...srcWords].filter((w) => otherWords.has(w)).length;
        return sharedMeaningfulTokens >= 2;
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
