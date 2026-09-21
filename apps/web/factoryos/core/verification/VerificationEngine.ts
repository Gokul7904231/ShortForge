/**
 * FactoryOS Frontier v3 — Verification & Forensic Media Audit Engine
 * Guarantees that Overseer CANNOT declare a mission complete without verified, independently measured evidence.
 * Integrates ArtifactResolver, ffprobe MediaProbe, decode smoke tests, hard gates, and dimensional verifiers.
 */

import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { Mission, DefinitionOfDoneItem, MissionCompletionResult } from "../contracts/MissionContracts";
import { Artifact } from "../contracts/ArtifactContracts";
import { MissionEvidence } from "../contracts/EvidenceContracts";
import type { RenderArtifact } from "../contracts/RenderIntentContracts";
import { ArtifactResolver, ResolvedArtifact } from "../rendering/ArtifactResolver";

export interface MediaProbeMeasurements {
  readonly fileExists: boolean;
  readonly byteLength: number;
  readonly hasFtypBox: boolean;
  readonly decodeSmokePassed: boolean;
  readonly width: number;
  readonly height: number;
  readonly videoCodec: string;
  readonly audioCodec: string;
  readonly videoDuration: number;
  readonly audioDuration: number;
  readonly syncDriftMs: number;
  readonly pixelFormat: string;
  readonly fps: number;
  readonly bitrateKbps: number;
  readonly streamCount: number;
  readonly audioSampleRate: number;
  readonly audioChannels: number;
}

export interface VerificationReport {
  readonly verified: boolean;
  readonly passed: boolean;
  readonly overallStatus: "PASSED" | "FAILED";
  readonly overallScore: number;
  readonly scores: {
    readonly technicalQuality: number;
    readonly contentQuality: number;
    readonly policy: number;
    readonly deliveryReadiness: number;
  };
  readonly evidence: string[];
  readonly jobId: string;
  readonly hardGates: {
    readonly artifactExists: boolean;
    readonly validContainer: boolean;
    readonly videoStreamPresent: boolean;
    readonly audioStreamPresent: boolean;
    readonly exact9x16Geometry: boolean;
    readonly compliantCodecs: boolean;
    readonly durationWithinBounds: boolean;
    readonly audioVideoSyncValid: boolean;
    readonly decodeSmokePassed: boolean;
  };
  readonly measurements: MediaProbeMeasurements;
  readonly dimensionScores: {
    readonly technicalQuality: number;
    readonly contentQuality: number;
    readonly policyCompliance: number;
    readonly deliveryReadiness: number;
    readonly overall: number;
  };
  readonly layers: {
    readonly layer1PhysicalForensics: {
      readonly passed: boolean;
      readonly measurements: MediaProbeMeasurements;
      readonly hardGates: {
        readonly artifactExists: boolean;
        readonly validContainer: boolean;
        readonly videoStreamPresent: boolean;
        readonly audioStreamPresent: boolean;
        readonly exact9x16Geometry: boolean;
        readonly compliantCodecs: boolean;
        readonly durationWithinBounds: boolean;
        readonly audioVideoSyncValid: boolean;
        readonly decodeSmokePassed: boolean;
      };
      readonly evidenceType: "PHYSICAL_MEASUREMENT";
    };
    readonly layer2ContentEvidence: {
      readonly passed: boolean;
      readonly scriptDetected: boolean;
      readonly sceneCount: number;
      readonly score: number;
      readonly evidenceType: "CONTENT_EVIDENCE";
    };
    readonly layer3HeuristicQuality: {
      readonly score: number;
      readonly evidenceType: "HEURISTIC";
    };
  };
  readonly qualityScore: number;
  readonly confidence: number;
  readonly failures: string[];
  readonly warnings: string[];
  readonly timestamp: string;
}

export class VerificationEngine {
  /**
   * Generates standard Definition of Done checklist for a Mission type
   */
  static createStandardVideoDoD(): DefinitionOfDoneItem[] {
    return [
      { id: "dod_script_valid", description: "Script JSON generated and retention rules validated", requiredArtifactType: "SCRIPT", satisfied: false },
      { id: "dod_creative_bible", description: "Creative Bible and character continuity established", requiredArtifactType: "CREATIVE_BIBLE", satisfied: false },
      { id: "dod_timeline_ready", description: "Deterministic video timeline constructed with all scenes", requiredArtifactType: "TIMELINE", satisfied: false },
      { id: "dod_voice_generated", description: "Audio narration synthesized and verified", requiredArtifactType: "VOICE_AUDIO", satisfied: false },
      { id: "dod_mp4_rendered", description: "Final MP4 video rendered and readable", requiredArtifactType: "RENDERED_VIDEO", satisfied: false },
      { id: "dod_artifact_stored", description: "Artifact stored in persistent storage (Drive / CDN)", satisfied: false },
      { id: "dod_evidence_committed", description: "All task execution evidence committed to ledger", satisfied: false },
    ];
  }

  /**
   * Verifies Mission against DoD, Artifacts, and Evidence
   */
  static verifyMission(
    mission: Mission,
    artifacts: Artifact[],
    evidences: MissionEvidence[]
  ): MissionCompletionResult {
    const dodList = mission.definitionOfDone || this.createStandardVideoDoD();
    const evaluatedDoD: { condition: string; passed: boolean; reason?: string }[] = [];
    const failedConditions: string[] = [];

    for (const item of dodList) {
      let passed = item.satisfied;
      let reason: string | undefined;

      if (!passed && item.requiredArtifactType) {
        const matchingArtifact = artifacts.find(
          (a) => a.type === item.requiredArtifactType && a.validationStatus === "VALID"
        );
        if (matchingArtifact) {
          passed = true;
          item.satisfied = true;
          item.evidenceId = matchingArtifact.artifactId;
          item.verifiedAt = new Date().toISOString();
        } else {
          reason = `Missing valid artifact of type ${item.requiredArtifactType}`;
        }
      }

      if (!passed && item.id === "dod_evidence_committed") {
        if (evidences.length > 0 && evidences.every((e) => e.status === "SUCCESS" || e.status === "RECOVERED")) {
          passed = true;
          item.satisfied = true;
          item.verifiedAt = new Date().toISOString();
        } else {
          reason = "Unresolved or failed execution evidence records detected";
        }
      }

      if (!passed && item.id === "dod_artifact_stored") {
        const videoArtifact = artifacts.find((a) => a.type === "RENDERED_VIDEO");
        if (videoArtifact && (videoArtifact.storageLocation.uri || videoArtifact.storageLocation.driveFileId)) {
          passed = true;
          item.satisfied = true;
          item.verifiedAt = new Date().toISOString();
        } else {
          reason = "No storage URI or Drive file ID recorded for rendered artifact";
        }
      }

      evaluatedDoD.push({ condition: item.description, passed, reason });
      if (!passed) {
        failedConditions.push(item.description);
      }
    }

    const allPassed = failedConditions.length === 0;

    return {
      eligible: allPassed,
      passed: allPassed,
      successConditions: evaluatedDoD,
      failedConditions,
      outstandingTasks: (mission.tasks || [])
        .filter((t) => t.status !== "COMPLETED" && t.status !== "SKIPPED")
        .map((t) => t.name),
      unresolvedCases: [],
      validatorResults: [],
      scopeHealth: { healthy: allPassed, issues: failedConditions },
      objectiveResult: {
        met: allPassed,
        summary: allPassed
          ? "All Definition of Done conditions verified with concrete evidence."
          : `Verification pending for ${failedConditions.length} conditions: ${failedConditions.join(", ")}`,
      },
      evidence: evaluatedDoD.map((cond) => ({
        type: "DOD_EVALUATION",
        condition: cond.condition,
        passed: cond.passed,
        reason: cond.reason,
      })),
    };
  }

  /**
   * Forensic Media Probe: Reads actual artifact from disk and extracts real measurements
   */
  static async probeMediaFile(filePath: string): Promise<MediaProbeMeasurements> {
    if (!fs.existsSync(filePath)) {
      return {
        fileExists: false,
        byteLength: 0,
        hasFtypBox: false,
        decodeSmokePassed: false,
        width: 0,
        height: 0,
        videoCodec: "none",
        audioCodec: "none",
        videoDuration: 0,
        audioDuration: 0,
        syncDriftMs: 0,
        pixelFormat: "none",
        fps: 0,
        bitrateKbps: 0,
        streamCount: 0,
        audioSampleRate: 0,
        audioChannels: 0,
      };
    }

    const stat = fs.statSync(filePath);
    if (stat.size === 0) {
      return {
        fileExists: true,
        byteLength: 0,
        hasFtypBox: false,
        decodeSmokePassed: false,
        width: 0,
        height: 0,
        videoCodec: "none",
        audioCodec: "none",
        videoDuration: 0,
        audioDuration: 0,
        syncDriftMs: 0,
        pixelFormat: "none",
        fps: 0,
        bitrateKbps: 0,
        streamCount: 0,
        audioSampleRate: 0,
        audioChannels: 0,
      };
    }

    // 1. Magic byte check for MP4 ftyp box (offset 4)
    let hasFtypBox = false;
    const fd = fs.openSync(filePath, "r");
    try {
      const headerBuf = Buffer.alloc(12);
      fs.readSync(fd, headerBuf, 0, 12, 0);
      const boxType = headerBuf.toString("ascii", 4, 8);
      hasFtypBox = boxType === "ftyp";
    } catch {
      hasFtypBox = false;
    } finally {
      fs.closeSync(fd);
    }

    // 2. Run ffprobe
    let probeJson: any = null;
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        const proc = spawn("ffprobe", [
          "-v",
          "quiet",
          "-print_format",
          "json",
          "-show_format",
          "-show_streams",
          filePath,
        ]);
        let out = "";
        proc.stdout.on("data", (d) => (out += d.toString()));
        proc.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(`ffprobe code ${code}`))));
        proc.on("error", reject);
      });
      probeJson = JSON.parse(stdout);
    } catch {
      probeJson = null;
    }

    if (!probeJson || !probeJson.streams) {
      return {
        fileExists: true,
        byteLength: stat.size,
        hasFtypBox,
        decodeSmokePassed: false,
        width: 0,
        height: 0,
        videoCodec: "unknown",
        audioCodec: "none",
        videoDuration: 0,
        audioDuration: 0,
        syncDriftMs: 0,
        pixelFormat: "none",
        fps: 0,
        bitrateKbps: 0,
        streamCount: 0,
        audioSampleRate: 0,
        audioChannels: 0,
      };
    }

    const videoStream = probeJson.streams.find((s: any) => s.codec_type === "video");
    const audioStream = probeJson.streams.find((s: any) => s.codec_type === "audio");

    const videoDuration = parseFloat(videoStream?.duration || probeJson.format?.duration || "0");
    const audioDuration = parseFloat(audioStream?.duration || probeJson.format?.duration || "0");
    const syncDriftMs = videoStream && audioStream ? Math.abs(videoDuration - audioDuration) * 1000 : 0;

    let fps = 0;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
      fps = den ? Math.round(num / den) : 30;
    }

    // 3. Decode smoke test: ffmpeg -v error -i filePath -f null -
    let decodeSmokePassed = false;
    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn("ffmpeg", ["-v", "error", "-i", filePath, "-f", "null", "-"]);
        proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg decode failed`))));
        proc.on("error", reject);
      });
      decodeSmokePassed = true;
    } catch {
      decodeSmokePassed = false;
    }

    return {
      fileExists: true,
      byteLength: stat.size,
      hasFtypBox,
      decodeSmokePassed,
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      videoCodec: videoStream?.codec_name || "none",
      audioCodec: audioStream?.codec_name || "none",
      videoDuration,
      audioDuration,
      syncDriftMs,
      pixelFormat: videoStream?.pix_fmt || "none",
      fps,
      bitrateKbps: Math.round(parseInt(probeJson.format?.bit_rate || "0", 10) / 1000),
      streamCount: probeJson.streams.length,
      audioSampleRate: parseInt(audioStream?.sample_rate || "0", 10),
      audioChannels: parseInt(audioStream?.channels || "0", 10),
    };
  }

  /**
   * Evidence-Based Media Artifact Audit:
   * Independently resolves artifact, opens file, executes MediaProbe and dimensional verifiers.
   * Enforces HARD GATES: missing file, wrong geometry, or decode failure unconditionally FAILS.
   */
  static async auditMediaArtifact(params: {
    jobId?: string;
    targetId?: string;
    artifact?: RenderArtifact;
    videoUrl?: string;
    durationSeconds?: number;
    aspectRatio?: string;
    audioVerified?: boolean;
    scriptText?: string;
    sceneCount?: number;
    policyViolations?: string[];
  }): Promise<VerificationReport> {
    const effectiveJobId = params.jobId || params.targetId || "unknown_job";
    const failures: string[] = [];
    const warnings: string[] = [];

    // 1. Resolve physical file path
    let localFilePath = "";
    let resolverCleanup: (() => Promise<void>) | undefined;

    if (params.artifact) {
      try {
        const resolver = new ArtifactResolver();
        const resolved = await resolver.resolve(params.artifact);
        localFilePath = resolved.localPath;
        resolverCleanup = resolved.cleanup;
      } catch (err: any) {
        failures.push(`Artifact resolution failed: ${err.message}`);
      }
    } else if (params.videoUrl) {
      if (fs.existsSync(params.videoUrl)) {
        localFilePath = params.videoUrl;
      } else if (params.videoUrl.startsWith("file://")) {
        localFilePath = params.videoUrl.replace("file://", "");
      } else {
        // Look in data/renders
        const candidate = path.join(process.cwd(), "data", "renders", `${params.jobId}.mp4`);
        if (fs.existsSync(candidate)) {
          localFilePath = candidate;
        }
      }
    }

    // 2. MediaProbe inspection
    const m = await this.probeMediaFile(localFilePath);

    // 3. HARD GATES (Must ALL pass before quality score is positive)
    const artifactExists = m.fileExists && m.byteLength > 0;
    const validContainer = m.hasFtypBox && (m.videoCodec === "h264" || m.videoCodec === "hevc");
    const videoStreamPresent = m.width > 0 && m.height > 0 && m.videoCodec !== "none";
    const audioStreamPresent = m.audioCodec === "aac" || m.audioCodec === "mp3";
    const exact9x16Geometry = m.width === 1080 && m.height === 1920;
    const compliantCodecs = (m.videoCodec === "h264" || m.videoCodec === "hevc") && m.audioCodec === "aac";
    const durationWithinBounds = m.videoDuration >= 1.0 && m.videoDuration <= 180.0;
    const audioVideoSyncValid = m.syncDriftMs <= 1000;
    const decodeSmokePassed = m.decodeSmokePassed;

    if (!artifactExists) failures.push(`Artifact does not exist or has 0 bytes: ${localFilePath || "none"}`);
    if (!validContainer) failures.push(`Invalid MP4 container structure (missing ftyp box or unsupported video codec)`);
    if (!videoStreamPresent) failures.push(`No valid video stream detected`);
    if (!exact9x16Geometry) failures.push(`Geometry mismatch: observed ${m.width}x${m.height}, expected 1080x1920 (9:16)`);
    if (!compliantCodecs) failures.push(`Codec non-compliance: observed video=${m.videoCodec}, audio=${m.audioCodec}`);
    if (!durationWithinBounds) failures.push(`Video duration out of bounds: ${m.videoDuration.toFixed(2)}s`);
    if (!audioVideoSyncValid) failures.push(`Audio/video desync exceeds threshold: ${m.syncDriftMs.toFixed(0)}ms drift`);
    if (!decodeSmokePassed) failures.push(`FFmpeg decode smoke test failed on artifact`);

    const allHardGatesPassed =
      artifactExists &&
      validContainer &&
      videoStreamPresent &&
      audioStreamPresent &&
      exact9x16Geometry &&
      compliantCodecs &&
      durationWithinBounds &&
      audioVideoSyncValid &&
      decodeSmokePassed;

    // 4. Dimensional Verification
    // Technical Quality (Layer 1 Physical Forensics Gate)
    let technicalQuality = 0;
    if (allHardGatesPassed) {
      technicalQuality = 100;
      if (m.syncDriftMs > 200) technicalQuality -= 10;
      if (m.bitrateKbps < 500) technicalQuality -= 10;
    } else {
      technicalQuality = 0;
    }

    // Content Quality (Layer 2 Content Evidence)
    const hasScript = Boolean(params.scriptText && params.scriptText.length >= 10);
    const sceneCount = params.sceneCount || 0;
    let contentQuality = 0;
    if (hasScript && sceneCount > 0) {
      contentQuality = 95;
    } else if (hasScript || sceneCount > 0) {
      contentQuality = 75;
    } else {
      contentQuality = 30;
      warnings.push("No script text or scenes recorded for narrative verification");
    }

    // Policy Compliance
    const policyViolations = params.policyViolations || [];
    let policyCompliance = policyViolations.length === 0 ? 100 : 0;
    if (policyViolations.length > 0) {
      failures.push(`Policy violations detected: ${policyViolations.join(", ")}`);
    }

    // Delivery Readiness
    let deliveryReadiness = 0;
    if (allHardGatesPassed && m.byteLength > 10000) {
      deliveryReadiness = 100;
    } else if (allHardGatesPassed) {
      deliveryReadiness = 80;
    } else {
      deliveryReadiness = 0;
    }

    // Overall Weighted Score: STRICT ZERO on hard gate failure (Heuristics cannot override physical gates)
    const overall = allHardGatesPassed
      ? Math.round(
          technicalQuality * 0.35 +
          deliveryReadiness * 0.25 +
          contentQuality * 0.2 +
          policyCompliance * 0.2
        )
      : 0;

    if (resolverCleanup) {
      try {
        await resolverCleanup();
      } catch {}
    }

    const verified = allHardGatesPassed && policyCompliance === 100;

    const hardGates = {
      artifactExists,
      validContainer,
      videoStreamPresent,
      audioStreamPresent,
      exact9x16Geometry,
      compliantCodecs,
      durationWithinBounds,
      audioVideoSyncValid,
      decodeSmokePassed,
    };

    const layers = {
      layer1PhysicalForensics: {
        passed: allHardGatesPassed,
        measurements: m,
        hardGates,
        evidenceType: "PHYSICAL_MEASUREMENT" as const,
      },
      layer2ContentEvidence: {
        passed: hasScript && sceneCount > 0,
        scriptDetected: hasScript,
        sceneCount,
        score: contentQuality,
        evidenceType: "CONTENT_EVIDENCE" as const,
      },
      layer3HeuristicQuality: {
        score: allHardGatesPassed ? Math.min(100, Math.round((contentQuality + technicalQuality) / 2)) : 0,
        evidenceType: "HEURISTIC" as const,
      },
    };

    return {
      verified,
      passed: verified,
      overallStatus: verified ? "PASSED" : "FAILED",
      overallScore: overall,
      scores: {
        technicalQuality,
        contentQuality,
        policy: policyCompliance,
        deliveryReadiness,
      },
      evidence: [
        `Artifact exists: ${artifactExists}`,
        `Valid container: ${validContainer}`,
        `Geometry 9:16: ${exact9x16Geometry}`,
        `Decode smoke test: ${decodeSmokePassed}`,
        `Technical quality: ${technicalQuality}/100`,
      ],
      jobId: effectiveJobId,
      hardGates,
      measurements: m,
      layers,
      dimensionScores: {
        technicalQuality,
        contentQuality,
        policyCompliance,
        deliveryReadiness,
        overall,
      },
      qualityScore: overall,
      confidence: allHardGatesPassed ? 0.98 : 0.0,
      failures,
      warnings,
      timestamp: new Date().toISOString(),
    };
  }
}
