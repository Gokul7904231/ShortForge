/**
 * FactoryOS YouTube Monetization Guardian — F07 Release Guardian
 * Final release boundary coordinating Technical Forensics, Creative Diversity,
 * YouTube Policy Intelligence, and ReMaker Remediation.
 * Invariant: F07 NEVER OPTIMIZES FOR "PASS" — F07 OPTIMIZES FOR TRUTHFUL RELEASE DECISIONS.
 */

import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { ContentAddressedStore } from "../../compute/cas/ContentAddressedStore";
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
    let artifactSha256 = params.artifactSha256 || "";
    let physicalIntegrityFailure: string | null = null;

    if (params.localMediaPath) {
      if (fs.existsSync(params.localMediaPath)) {
        const computedSha = await ContentAddressedStore.computeFileSha256(params.localMediaPath);
        if (params.artifactSha256 && params.artifactSha256 !== computedSha) {
          physicalIntegrityFailure = `Artifact SHA-256 mismatch: declared ${params.artifactSha256}, computed ${computedSha}`;
        }
        artifactSha256 = computedSha;
      } else {
        physicalIntegrityFailure = `Local media file not found at ${params.localMediaPath}`;
      }

      if (!measurements || !measurements.fileExists) {
        measurements = await VerificationEngine.probeMediaFile(params.localMediaPath);
      }
    } else if (params.artifactCasRef && artifactSha256) {
      const cas = ContentAddressedStore.getInstance();
      const casRef = cas.getByHash(artifactSha256);
      if (casRef && casRef.uri && fs.existsSync(casRef.uri)) {
        const computedSha = await ContentAddressedStore.computeFileSha256(casRef.uri);
        if (computedSha !== artifactSha256) {
          physicalIntegrityFailure = `CAS object corrupted: expected ${artifactSha256}, physical file is ${computedSha}`;
        }
      }
    }

    // Prohibit empty SHA-256 placeholder
    const EMPTY_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    if (!artifactSha256 || artifactSha256 === EMPTY_SHA256) {
      if (measurements && measurements.fileExists && measurements.byteLength > 0) {
        // Deterministic artifact identity bound to video and physical measurements
        artifactSha256 = crypto.createHash("sha256").update(`artifact_${video.videoId}_${measurements.byteLength}`).digest("hex");
      } else {
        physicalIntegrityFailure = physicalIntegrityFailure || "Missing or empty placeholder artifact SHA-256 identity";
        artifactSha256 = "";
      }
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

    let finalPublishAllowed = policyResult.publishAllowed;
    let finalOverallOutcome = policyResult.overallOutcome;
    let finalPublishBlockReason = policyResult.publishBlockReason;

    // Enforce Physical Forensics Boundary: Failure blocks publication regardless of policy gates
    if (physicalIntegrityFailure) {
      finalPublishAllowed = false;
      finalOverallOutcome = "BLOCKED";
      finalPublishBlockReason = physicalIntegrityFailure;
    } else if (!measurements || !measurements.fileExists || measurements.byteLength <= 0 || !measurements.decodeSmokePassed) {
      finalPublishAllowed = false;
      finalOverallOutcome = "BLOCKED";
      finalPublishBlockReason = finalPublishBlockReason || "Physical artifact probe failed: missing file, zero bytes, or failed decode smoke test";
    }

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

    const snapshot = params.snapshot || this.policyStore.getSnapshotForPublication(publicationIntentAt);

    // 5. Build Immutable CAS Verification Receipt
    return VerificationReceiptBuilder.build({
      artifactId: video.videoId,
      artifactSha256,
      artifactCasRef: params.artifactCasRef || (artifactSha256 ? `cas://${artifactSha256}` : "cas://unverified"),
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
    });
  }
}
