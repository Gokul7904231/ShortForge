/**
 * FactoryOS YouTube Monetization Guardian — F07 Release Guardian
 * Final release boundary coordinating Technical Forensics, Creative Diversity,
 * YouTube Policy Intelligence, and ReMaker Remediation.
 * Invariant: F07 NEVER OPTIMIZES FOR "PASS" — F07 OPTIMIZES FOR TRUTHFUL RELEASE DECISIONS.
 */

import { OriginalityGate } from "../../creative/OriginalityGate";
import { VariationPolicyEngine } from "../../creative/VariationPolicyEngine";
import { VerificationEngine } from "../VerificationEngine";
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

export interface ReleaseGuardianParams {
  readonly video: CandidateVideoContext;
  readonly channel: ChannelContext;
  readonly snapshot?: PolicySnapshot;
  readonly publicationIntentAt?: string;
  readonly localMediaPath?: string;
  readonly artifactSha256?: string;
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

  /**
   * Executes the comprehensive F07 verification boundary.
   */
  public async verifyRelease(params: ReleaseGuardianParams): Promise<VerificationReceipt> {
    const video = params.video;
    const channel = params.channel;
    const publicationIntentAt = params.publicationIntentAt || new Date().toISOString();

    // 0. Enforce Hard Content Engine Scope Boundary
    EnginePolicyProfiles.getProfile(video.contentEngine); // Throws if out-of-scope engine

    // 1. Technical Forensics Probe (Floor 07 Layer 1)
    let measurements = video.measurements;
    if (params.localMediaPath && (!measurements || !measurements.fileExists)) {
      measurements = await VerificationEngine.probeMediaFile(params.localMediaPath);
    }

    // Update video context with physical measurements
    const enrichedVideo: CandidateVideoContext = {
      ...video,
      measurements,
    };

    // 2. Creative Verification (Content Genome, Variation & Originality)
    const variationEngine = VariationPolicyEngine.getInstance();
    const originalityGate = OriginalityGate.getInstance();

    const recentHistory = channel.recentGenomes || [];
    const variationDecision = variationEngine.evaluateCandidate(video.genome, [...recentHistory]);

    const isAllRightsCleared = enrichedVideo.assets.length === 0 || enrichedVideo.assets.every((a) => a.isCommercialSafe || a.isOriginalSynthesis);
    const originalityReceipt = originalityGate.audit({
      genome: video.genome,
      scriptText: video.scriptText,
      variationDecision,
      isRightsCleared: isAllRightsCleared,
    });

    const fatigueBreakdown = CreativeFatigueAnalyzer.analyze(video.genome, recentHistory);

    // 3. YouTube Policy Guardian (G00 to G14 Sequential Evaluation)
    const policyResult = this.policyGuardian.evaluate({
      video: enrichedVideo,
      channel,
      snapshot: params.snapshot,
      publicationIntentAt,
      contentCreatedAt: video.genome.generatedAt || new Date().toISOString(),
    });

    // 4. Remediation Planning for ReMaker
    const remediationCases: RemediationCase[] = [];
    if (policyResult.repairableFindings.length > 0) {
      for (const finding of policyResult.repairableFindings) {
        const remCase = YouTubeRemediationPlanner.planRemediation(finding, {
          topic: video.genome.topic,
          contentEngine: video.contentEngine,
        });
        remediationCases.push(remCase);

        // Record invalidation of downstream evidence for affected stages
        this.invalidationTracker.invalidateDownstream(
          finding.affectedStages,
          `Remediation required for gate ${finding.gateId} (${finding.ruleId})`
        );
      }
    }

    const artifactSha256 = params.artifactSha256 || "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    const snapshot = params.snapshot || this.policyStore.getSnapshotForPublication(publicationIntentAt);

    // 5. Build Immutable CAS Verification Receipt
    return VerificationReceiptBuilder.build({
      artifactId: video.videoId,
      artifactSha256,
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
      overallOutcome: policyResult.overallOutcome,
      publishAllowed: policyResult.publishAllowed,
      publishBlockReason: policyResult.publishBlockReason,
      gateFindings: policyResult.gateFindings,
      remediationCases,
    });
  }
}
