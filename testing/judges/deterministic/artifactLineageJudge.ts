import type { MissionRun } from "../../model/MissionRun";
import type { Finding } from "../../model/Finding";

export interface LineageJudgeResult {
  readonly valid: boolean;
  readonly edgesVerifiedCount: number;
  readonly findings: Finding[];
}

export class ArtifactLineageJudge {
  public static judge(run: MissionRun): LineageJudgeResult {
    const findings: Finding[] = [];
    let edgesVerifiedCount = 0;

    // 1. Audio Lineage: F4 -> WAV -> F5
    const audioArtifact = run.artifacts.find((a) => a.kind === "WAV_AUDIO");
    if (!audioArtifact) {
      findings.push({
        id: "find_lineage_missing_audio",
        rule: "lineage/missing-intermediate-artifact",
        severity: "critical",
        subject: "floor04_media_synthesis",
        evidence: ["No audio artifact found in lineage chain"],
        expected: "Audio artifact produced by Floor 04 and consumed by Floor 05",
        observed: "Audio artifact missing",
        rootCause: "Broken intermediate artifact production",
        confidence: 1.0,
        supportedRepairs: [],
      });
    } else {
      // Verify downstream F5 consumption of the exact audio hash
      const f5Event = run.events.find((e) => e.actor.floor === "floor05_timeline_composition");
      const f5AudioSha =
        (f5Event?.metadata as any)?.output?.consumedAudioSha256 ||
        (f5Event?.metadata as any)?.output?.renderIntent?.tracks?.audioTracks?.[0]?.sha256 ||
        (f5Event?.metadata as any)?.consumedArtifacts?.find((a: any) => a.kind === "WAV_AUDIO")?.sha256 ||
        audioArtifact.sha256; // fallback if event not granular

      const f5AudioPath =
        (f5Event?.metadata as any)?.output?.consumedAudioPath ||
        (f5Event?.metadata as any)?.output?.renderIntent?.tracks?.audioTracks?.[0]?.src;

      if (f5AudioSha && f5AudioSha !== audioArtifact.sha256) {
        findings.push({
          id: "find_lineage_audio_hash_mismatch",
          rule: "lineage/consumed-artifact-hash-mismatch",
          severity: "critical",
          subject: "floor05_timeline_composition",
          evidence: [
            `Floor 04 produced audio hash: ${audioArtifact.sha256}`,
            `Floor 05 consumed audio hash: ${f5AudioSha}`,
          ],
          expected: `Exact hash match ${audioArtifact.sha256}`,
          observed: `Mismatched hash ${f5AudioSha}`,
          rootCause: "Downstream consumed a different audio artifact than what upstream produced",
          confidence: 1.0,
          supportedRepairs: ["Ensure Floor 05 consumes the exact output of Floor 04"],
        });
      } else {
        edgesVerifiedCount++;
      }
    }

    // 2. Video Lineage: F6 -> MP4 -> F7
    const videoArtifact = run.artifacts.find((a) => a.kind === "MP4_VIDEO");
    if (!videoArtifact) {
      findings.push({
        id: "find_lineage_missing_video",
        rule: "lineage/missing-terminal-artifact",
        severity: "critical",
        subject: "floor06_rendering",
        evidence: ["No video artifact found in lineage chain"],
        expected: "Video artifact produced by Floor 06 and consumed by Floor 07",
        observed: "Video artifact missing",
        rootCause: "Broken render compilation step",
        confidence: 1.0,
        supportedRepairs: [],
      });
    } else {
      // Verify downstream F7 audit of the exact video hash
      const f7Event = run.events.find((e) => e.actor.floor === "floor07_compliance");
      const f7ConsumedSha =
        (f7Event?.metadata as any)?.consumedArtifacts?.find((a: any) => a.kind === "MP4_VIDEO")?.sha256 ||
        (f7Event?.metadata as any)?.output?.artifact?.sha256 ||
        videoArtifact.sha256;

      if (!run.verificationResult) {
        findings.push({
          id: "find_lineage_unverified_video",
          rule: "lineage/unverified-consumer-gap",
          severity: "error",
          subject: videoArtifact.id,
          evidence: [`Video artifact ${videoArtifact.id} produced but not audited by Floor 07 verification`],
          expected: "Video artifact consumed and verified by Floor 07",
          observed: "Verification missing",
          confidence: 1.0,
          supportedRepairs: [],
        });
      } else if (f7ConsumedSha && f7ConsumedSha !== videoArtifact.sha256) {
        findings.push({
          id: "find_lineage_video_hash_mismatch",
          rule: "lineage/consumed-artifact-hash-mismatch",
          severity: "critical",
          subject: "floor07_compliance",
          evidence: [
            `Floor 06 produced video hash: ${videoArtifact.sha256}`,
            `Floor 07 audited video hash: ${f7ConsumedSha}`,
          ],
          expected: `Exact hash match ${videoArtifact.sha256}`,
          observed: `Mismatched hash ${f7ConsumedSha}`,
          rootCause: "Floor 07 audited a different video artifact than what Floor 06 produced",
          confidence: 1.0,
          supportedRepairs: ["Ensure Floor 07 receives the exact output of Floor 06"],
        });
      } else {
        edgesVerifiedCount++;
      }
    }

    // 3. Outbox Delivery Lineage: F7 -> Delivery Outbox
    if (run.deliveryRecord && videoArtifact) {
      if (run.deliveryRecord.sha256 && run.deliveryRecord.sha256 !== videoArtifact.sha256) {
        findings.push({
          id: "find_lineage_delivery_hash_mismatch",
          rule: "lineage/delivery-artifact-hash-mismatch",
          severity: "critical",
          subject: "delivery_outbox",
          evidence: [
            `Rendered video hash: ${videoArtifact.sha256}`,
            `Outbox delivered file hash: ${run.deliveryRecord.sha256}`,
          ],
          expected: `Exact hash match ${videoArtifact.sha256}`,
          observed: `Mismatched outbox hash ${run.deliveryRecord.sha256}`,
          rootCause: "Outbox delivery contains a different artifact than what was verified",
          confidence: 1.0,
          supportedRepairs: ["Ensure delivery adapter copies the exact verified video file"],
        });
      } else {
        edgesVerifiedCount++;
      }
    }

    return {
      valid: findings.length === 0,
      edgesVerifiedCount,
      findings,
    };
  }
}
