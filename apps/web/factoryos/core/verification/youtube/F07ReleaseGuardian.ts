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

export interface ReleaseGuardianParams {
  readonly video: CandidateVideoContext;
  readonly channel: ChannelContext;
  readonly snapshot?: PolicySnapshot;
  readonly publicationIntentAt?: string;
  readonly localMediaPath?: string;
  readonly artifactSha256?: string;
  readonly artifactCasRef?: string;
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
}
