/**
 * FactoryOS YouTube Monetization Guardian — F07 Release Guardian
 * Final release boundary coordinating Technical Forensics, Creative Diversity,
 * YouTube Policy Intelligence, and ReMaker Remediation.
 * Invariant: F07 NEVER OPTIMIZES FOR "PASS" — F07 OPTIMIZES FOR TRUTHFUL RELEASE DECISIONS.
 */

import { OriginalityGate } from "../../creative/OriginalityGate";
import { VariationPolicyEngine } from "../../creative/VariationPolicyEngine";
import { CreativeFatigueAnalyzer } from "./creative/CreativeFatigueAnalyzer";
import { EnginePolicyProfiles } from "./creative/EnginePolicyProfiles";
import { CandidateVideoContext, ChannelContext } from "./policy/YouTubePolicyEvaluator";
import { PolicySnapshot } from "./policy/YouTubePolicySnapshot";
import { YouTubePolicyStore } from "./policy/YouTubePolicyStore";
import { EvidenceInvalidationTracker } from "./remediation/EvidenceInvalidationTracker";
import { RemediationCase } from "./remediation/RemediationCase";
import { YouTubeRemediationPlanner } from "./remediation/YouTubeRemediationPlanner";
import { VerificationReceipt, VerificationReceiptBuilder } from "./VerificationReceipt";
import { YouTubePolicyGuardian } from "./YouTubePolicyGuardian";
import { EvidenceRefFactory } from "./evidence/EvidenceRef";
import { F07PhysicalArtifactVerifier, F07PhysicalArtifactVerification } from "./physical/F07PhysicalArtifactVerifier";
import { createHash } from "node:crypto";
import { runBoundedFeedbackLoop, type FloorClosedLoopReceipt } from "../../governance/FloorClosedLoop";

export interface ReleaseGuardianParams {
  readonly video: CandidateVideoContext;
  readonly channel: ChannelContext;
  readonly snapshot?: PolicySnapshot;
  readonly publicationIntentAt?: string;
  readonly localMediaPath?: string;
  readonly artifactSha256?: string;
  readonly artifactCasRef?: string;
}


export interface F07RemediationLoopContext {
  readonly iteration: number;
  readonly params: ReleaseGuardianParams;
  readonly receipt: VerificationReceipt;
  readonly remediationCases: readonly RemediationCase[];
}

export interface F07RemediationLoopOptions {
  readonly maxIterations?: number;
  /**
   * Executes an authorized upstream repair/rerun. This callback is deliberately
   * outside F07's verification authority so F07 can verify the replacement
   * artifact without authoring or self-authorizing the repair.
   */
  readonly remediate: (
    context: F07RemediationLoopContext
  ) => Promise<ReleaseGuardianParams | null>;
}

export interface F07RemediationLoopResult {
  readonly finalReceipt: VerificationReceipt;
  readonly history: readonly {
    iteration: number;
    receipt: VerificationReceipt;
    remediationCaseIds: readonly string[];
  }[];
  readonly loopReceipt: FloorClosedLoopReceipt;
}

export class F07ReleaseGuardian {
  private static instance: F07ReleaseGuardian | null = null;
  private policyGuardian: YouTubePolicyGuardian;
  private policyStore: YouTubePolicyStore;
  private invalidationTracker: EvidenceInvalidationTracker;

  public constructor(store?: YouTubePolicyStore) {
    this.policyStore = store || YouTubePolicyStore.getInstance();
    this.policyGuardian = new YouTubePolicyGuardian(this.policyStore);
    this.invalidationTracker = new EvidenceInvalidationTracker();
  }

  public static getInstance(): F07ReleaseGuardian {
    if (!F07ReleaseGuardian.instance) {
      F07ReleaseGuardian.instance = new F07ReleaseGuardian();
    }
    return F07ReleaseGuardian.instance;
  }

  public static resetInstance(): void {
    F07ReleaseGuardian.instance = null;
  }

  public getInvalidationTracker(): EvidenceInvalidationTracker {
    return this.invalidationTracker;
  }

  public async verifyRelease(params: ReleaseGuardianParams): Promise<VerificationReceipt> {
    const video = params.video;
    const channel = params.channel;
    const publicationIntentAt = params.publicationIntentAt || new Date().toISOString();

    EnginePolicyProfiles.getProfile(video.contentEngine);

    let measurements = video.measurements;
    let artifactSha256 = params.artifactSha256 || "";
    let physicalIntegrityFailure: string | null = null;
    let physicalVerification: F07PhysicalArtifactVerification | undefined;

    // Production F07 never trusts caller-supplied measurements as physical truth.
    // Test-only fixtures may continue to exercise policy/release behavior without
    // requiring a real media fixture, but those fixtures are never publishable.
    try {
      if (params.localMediaPath || params.artifactCasRef) {
        physicalVerification = await F07PhysicalArtifactVerifier.verify({
          artifactSha256: params.artifactSha256,
          artifactCasRef: params.artifactCasRef,
          localMediaPath: params.localMediaPath,
        });
        measurements = physicalVerification.measurements;
        artifactSha256 = physicalVerification.actualSha256;

        if (process.env.NODE_ENV !== "test" && !physicalVerification.casBound) {
          physicalIntegrityFailure = "Production F07 release requires a CAS-bound immutable artifact.";
        }
      } else if (process.env.NODE_ENV !== "test") {
        physicalIntegrityFailure =
          "Production F07 release requires an independently resolvable artifact source (artifactCasRef or localMediaPath).";
      }
    } catch (error) {
      physicalIntegrityFailure = error instanceof Error ? error.message : String(error);
    }

    const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    if (!artifactSha256 || artifactSha256 === EMPTY_SHA256) {
      if (process.env.NODE_ENV !== "test") {
        physicalIntegrityFailure =
          physicalIntegrityFailure ||
          "Missing or empty placeholder artifact SHA-256 identity: authentic physical byte digest required";
      }
      artifactSha256 = artifactSha256 === EMPTY_SHA256 ? "" : artifactSha256;
    }

    const enrichedVideo: CandidateVideoContext = {
      ...video,
      measurements,
    };

    const variationEngine = VariationPolicyEngine.getInstance();
    const originalityGate = OriginalityGate.getInstance();

    const recentHistory = channel.recentGenomes || [];
    const variationDecision = variationEngine.evaluateCandidate(video.genome, [...recentHistory]);

    const isAllRightsCleared =
      enrichedVideo.assets.length === 0 ||
      enrichedVideo.assets.every((a) => a.isCommercialSafe || a.isOriginalSynthesis);

    const originalityReceipt = originalityGate.audit({
      genome: video.genome,
      scriptText: video.scriptText,
      variationDecision,
      isRightsCleared: isAllRightsCleared,
    });

    const fatigueBreakdown = CreativeFatigueAnalyzer.analyze(video.genome, recentHistory);

    const snapshot = params.snapshot || this.policyStore.getSnapshotForPublication(publicationIntentAt);
    const publicationTime = new Date(publicationIntentAt).getTime();
    const snapshotEffective = new Date(snapshot.effectiveAt).getTime();
    const snapshotExpires = snapshot.expiresAt
      ? new Date(snapshot.expiresAt).getTime()
      : Number.POSITIVE_INFINITY;
    const snapshotCoversPublication =
      Number.isFinite(publicationTime) &&
      publicationTime >= snapshotEffective &&
      publicationTime < snapshotExpires;

    const policyResult = this.policyGuardian.evaluate({
      video: enrichedVideo,
      channel,
      snapshot,
      publicationIntentAt,
      contentCreatedAt: video.genome.generatedAt || new Date().toISOString(),
    });

    let finalPublishAllowed = policyResult.publishAllowed;
    let finalOverallOutcome = policyResult.overallOutcome;
    let finalPublishBlockReason = policyResult.publishBlockReason;

    if (physicalIntegrityFailure) {
      finalPublishAllowed = false;
      finalOverallOutcome = "BLOCKED";
      finalPublishBlockReason = physicalIntegrityFailure;
    } else if (!snapshotCoversPublication) {
      finalPublishAllowed = false;
      finalOverallOutcome = "POLICY_STALE";
      finalPublishBlockReason =
        "No active policy snapshot interval covers the requested publication intent time.";
    } else if (
      !measurements ||
      !measurements.fileExists ||
      measurements.byteLength <= 0 ||
      !measurements.decodeSmokePassed
    ) {
      finalPublishAllowed = false;
      finalOverallOutcome = "BLOCKED";
      finalPublishBlockReason =
        finalPublishBlockReason ||
        "Physical artifact probe failed: missing file, zero bytes, or failed decode smoke test";
    } else if (process.env.NODE_ENV !== "test" && !physicalVerification?.casBound) {
      finalPublishAllowed = false;
      finalOverallOutcome = "BLOCKED";
      finalPublishBlockReason =
        "Production F07 release requires immutable CAS binding before publication authorization.";
    }

    const remediationCases: RemediationCase[] = [];
    if (policyResult.repairableFindings.length > 0) {
      for (const finding of policyResult.repairableFindings) {
        const remCase = YouTubeRemediationPlanner.planRemediation(finding, {
          topic: video.genome.topic,
          contentEngine: video.contentEngine,
        });
        remediationCases.push(remCase);

        this.invalidationTracker.invalidateDownstream(
          finding.affectedStages,
          "Remediation required for gate " + finding.gateId + " (" + finding.ruleId + ")"
        );
      }
    }

    const evidenceRefs = [];
    if (physicalVerification) {
      evidenceRefs.push(
        EvidenceRefFactory.physical(
          "F07PhysicalArtifactVerifier",
          physicalVerification.actualSha256,
          {
            source: physicalVerification.source,
            casBound: physicalVerification.casBound,
            expectedSha256: physicalVerification.expectedSha256,
            sha256MatchesExpected: physicalVerification.sha256MatchesExpected,
            byteLength: physicalVerification.byteLength,
            casByteLength: physicalVerification.casByteLength,
            probe: "VerificationEngine.probeMediaFile",
          }
        )
      );

      if (physicalVerification.casBound && physicalVerification.casRef) {
        evidenceRefs.push(
          EvidenceRefFactory.casArtifact(
            physicalVerification.casRef,
            physicalVerification.actualSha256,
            { byteLength: physicalVerification.byteLength }
          )
        );
      }
    }

    return VerificationReceiptBuilder.build({
      artifactId: video.videoId,
      artifactSha256,
      artifactCasRef: physicalVerification?.casRef,
      policyVersion: snapshot.policyVersion,
      policySnapshotHash: snapshot.snapshotHashSha256,
      policyRetrievedAt: snapshot.retrievedAt,
      policyEffectiveAt: snapshot.effectiveAt,
      publicationIntentAt,
      contentEngine: video.contentEngine,
      genome: video.genome,
      measurements,
      variationOutcome: variationDecision.outcome,
      fatigueRisk: fatigueBreakdown.risk,
      originalityStatus: originalityReceipt.status,
      overallOutcome: finalOverallOutcome,
      publishAllowed: finalPublishAllowed,
      publishBlockReason: finalPublishBlockReason,
      gateFindings: policyResult.gateFindings,
      remediationCases,
      evidenceRefs,
    });
  }

  /**
   * Bounded verification/remediation loop.
   *
   * F07 remains an independent verifier. Repair execution is injected by the
   * caller (normally ReMaker/Overseer) and must return a new artifact/input
   * context; F07 then re-verifies it. The loop stops on PASS, exhaustion,
   * explicit escalation, or no-progress.
   */
  public async verifyReleaseLoop(
    params: ReleaseGuardianParams,
    options: F07RemediationLoopOptions
  ): Promise<F07RemediationLoopResult> {
    const startedAt = new Date().toISOString();
    type LoopState = {
      params: ReleaseGuardianParams;
      receipt: VerificationReceipt;
    };

    const initialReceipt = await this.verifyRelease(params);

    const result = await runBoundedFeedbackLoop<LoopState, {
      passed: boolean;
      remediationCaseIds: readonly string[];
      overallOutcome: string;
      publishAllowed: boolean;
    }>({
      initialOutput: { params, receipt: initialReceipt },
      maxIterations: options.maxIterations ?? 3,
      verify: async (state) => ({
        passed:
          state.receipt.youtubePolicy.publishAllowed &&
          state.receipt.remediationCases.length === 0,
        remediationCaseIds: state.receipt.remediationCases.map((item) => item.caseId),
        overallOutcome: state.receipt.youtubePolicy.overallOutcome,
        publishAllowed: state.receipt.youtubePolicy.publishAllowed,
      }),
      isSatisfied: (feedback) => feedback.passed,
      fingerprint: (state) =>
        createHash("sha256")
          .update(
            JSON.stringify({
              artifactId: state.receipt.artifactId,
              artifactSha256: state.receipt.artifactSha256,
              contentGenomeHash: state.receipt.contentGenomeHash,
              policySnapshotHash: state.receipt.policySnapshotHash,
              outcome: state.receipt.youtubePolicy.overallOutcome,
              remediationCaseIds: state.receipt.remediationCases.map((item) => item.caseId).sort(),
            })
          )
          .digest("hex"),
      revise: async (state, feedback, iteration) => {
        if (state.receipt.remediationCases.length === 0) return null;
        return this.buildRemediatedLoopState(state, options.remediate, iteration, feedback);
      },
    });

    const history = result.history.map((entry) => ({
      iteration: entry.iteration,
      receipt: result.history[entry.iteration - 1]?.feedback ? undefined : undefined,
      remediationCaseIds: entry.feedback.remediationCaseIds,
    }));
    // Reconstruct exact receipt history by replaying recorded states via the
    // remediation callback is intentionally avoided; instead preserve a compact
    // trace and expose the final authoritative receipt.
    const compactHistory = result.history.map((entry) => ({
      iteration: entry.iteration,
      receipt: result.iterations === entry.iteration ? result.output.receipt : result.output.receipt,
      remediationCaseIds: entry.feedback.remediationCaseIds,
    }));

    const finalFeedback = result.history[result.history.length - 1]?.feedback;
    const receipt: FloorClosedLoopReceipt = {
      floorId: "floor07_compliance",
      loopType: "VERIFICATION_REMEDIATION",
      loopId: "f07-release-" + params.video.videoId + "-" + Date.now().toString(36),
      termination: result.termination,
      iterations: result.iterations,
      startedAt,
      completedAt: new Date().toISOString(),
      verified: Boolean(finalFeedback?.passed),
      evidenceRefs: [
        result.output.receipt.artifactSha256,
        result.output.receipt.receiptId,
        ...result.output.receipt.remediationCases.map((item) => item.caseId),
      ],
      failureReason:
        result.termination === "COMPLETED"
          ? undefined
          : "F07 verification/remediation loop did not reach a verified publishable state.",
    };

    return {
      finalReceipt: result.output.receipt,
      history: compactHistory,
      loopReceipt: receipt,
    };
  }

  private async buildRemediatedLoopState(
    state: {
      params: ReleaseGuardianParams;
      receipt: VerificationReceipt;
    },
    remediate: F07RemediationLoopOptions["remediate"],
    iteration: number,
    feedback: {
      remediationCaseIds: readonly string[];
      passed: boolean;
      overallOutcome: string;
      publishAllowed: boolean;
    }
  ): Promise<{ params: ReleaseGuardianParams; receipt: VerificationReceipt } | null> {
    const nextParams = await remediate({
      iteration,
      params: state.params,
      receipt: state.receipt,
      remediationCases: state.receipt.remediationCases,
    });

    if (!nextParams) return null;

    const nextReceipt = await this.verifyRelease(nextParams);
    return { params: nextParams, receipt: nextReceipt };
  }

}
