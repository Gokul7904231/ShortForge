import type { MissionRun } from "../model/MissionRun";
import type { Finding } from "../model/Finding";
import { CANONICAL_THRESHOLDS } from "../config/thresholds";

export class ArtifactOracle {
  public static evaluate(run: MissionRun): Finding[] {
    const findings: Finding[] = [];

    // Check for required physical artifacts: Audio WAV and Video MP4
    const audioArtifact = run.artifacts.find((a) => a.kind === "WAV_AUDIO");
    const videoArtifact = run.artifacts.find((a) => a.kind === "MP4_VIDEO");

    if (!audioArtifact) {
      findings.push({
        id: "find_missing_audio_artifact",
        rule: "artifact/audio-required",
        severity: "error",
        subject: "floor04_media_synthesis",
        evidence: ["No WAV_AUDIO artifact found in mission run record"],
        expected: "Synthesized WAV_AUDIO physical artifact",
        observed: "Artifact missing",
        rootCause: "Floor 04 Media Synthesis did not register synthesized audio",
        confidence: 1.0,
        supportedRepairs: [],
      });
    } else {
      if (!audioArtifact.existsPhysically) {
        findings.push({
          id: `find_audio_file_not_found_${audioArtifact.id}`,
          rule: "artifact/file-not-on-disk",
          severity: "critical",
          subject: audioArtifact.localPath,
          evidence: [`File does not exist physically at ${audioArtifact.localPath}`],
          expected: "Physical file on disk",
          observed: "File not found",
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
      if (audioArtifact.byteLength < CANONICAL_THRESHOLDS.minAudioBytes) {
        findings.push({
          id: `find_audio_too_small_${audioArtifact.id}`,
          rule: "artifact/file-size-below-threshold",
          severity: "error",
          subject: audioArtifact.localPath,
          evidence: [`Audio byteLength: ${audioArtifact.byteLength} < min ${CANONICAL_THRESHOLDS.minAudioBytes}`],
          expected: `>= ${CANONICAL_THRESHOLDS.minAudioBytes} bytes`,
          observed: `${audioArtifact.byteLength} bytes`,
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
    }

    if (!videoArtifact) {
      findings.push({
        id: "find_missing_video_artifact",
        rule: "artifact/video-required",
        severity: "critical",
        subject: "floor06_rendering",
        evidence: ["No MP4_VIDEO artifact found in mission run record"],
        expected: "Compiled MP4_VIDEO physical artifact",
        observed: "Artifact missing",
        rootCause: "Floor 06 Rendering did not compile physical video",
        confidence: 1.0,
        supportedRepairs: [],
      });
    } else {
      if (!videoArtifact.existsPhysically) {
        findings.push({
          id: `find_video_file_not_found_${videoArtifact.id}`,
          rule: "artifact/file-not-on-disk",
          severity: "critical",
          subject: videoArtifact.localPath,
          evidence: [`Video file does not exist physically at ${videoArtifact.localPath}`],
          expected: "Physical MP4 file on disk",
          observed: "File not found",
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
      if (videoArtifact.byteLength < CANONICAL_THRESHOLDS.minVideoBytes) {
        findings.push({
          id: `find_video_too_small_${videoArtifact.id}`,
          rule: "artifact/file-size-below-threshold",
          severity: "error",
          subject: videoArtifact.localPath,
          evidence: [`Video byteLength: ${videoArtifact.byteLength} < min ${CANONICAL_THRESHOLDS.minVideoBytes}`],
          expected: `>= ${CANONICAL_THRESHOLDS.minVideoBytes} bytes`,
          observed: `${videoArtifact.byteLength} bytes`,
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
    }

    return findings;
  }
}
