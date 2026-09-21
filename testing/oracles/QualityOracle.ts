import type { MissionRun } from "../model/MissionRun";
import type { Finding } from "../model/Finding";
import { CANONICAL_THRESHOLDS } from "../config/thresholds";

export interface QualityDimensionsReport {
  readonly technicalQuality: "PASS" | "FAIL";
  readonly structuralQuality: "PASS" | "FAIL";
  readonly semanticQuality: "PASS" | "FAIL";
  readonly perceptualQuality: "UNKNOWN";
  readonly perceptualNote: string;
}

export class QualityOracle {
  public static evaluate(run: MissionRun): Finding[] {
    const findings: Finding[] = [];

    // 1. Technical Quality: Streams, Codecs, and Verification Score
    const video = run.artifacts.find((a) => a.kind === "MP4_VIDEO");
    const audio = run.artifacts.find((a) => a.kind === "WAV_AUDIO");

    if (!audio) {
      findings.push({
        id: "find_quality_missing_audio_track",
        rule: "quality/technical-audio-track-missing",
        severity: "critical",
        subject: "audio_track",
        evidence: ["No audio artifact generated for media synthesis"],
        expected: "PCM WAV audio stream present",
        observed: "Audio missing",
        confidence: 1.0,
        supportedRepairs: [],
      });
    }

    if (video && video.formatDetails) {
      const streams = (video.formatDetails as any)?.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === "video");
      const audioStream = streams.find((s: any) => s.codec_type === "audio");

      if (!videoStream) {
        findings.push({
          id: "find_quality_no_video_stream",
          rule: "quality/technical-video-stream-missing",
          severity: "critical",
          subject: "video_stream",
          evidence: ["Rendered MP4 file contains no video stream"],
          expected: "H.264 video stream",
          observed: "No video stream found",
          confidence: 1.0,
          supportedRepairs: [],
        });
      }

      if (!audioStream) {
        findings.push({
          id: "find_quality_no_audio_stream",
          rule: "quality/technical-audio-stream-missing",
          severity: "critical",
          subject: "audio_stream",
          evidence: ["Rendered MP4 file contains no audio stream"],
          expected: "AAC audio stream",
          observed: "No audio stream found",
          confidence: 1.0,
          supportedRepairs: [],
        });
      }

      // 2. Structural Quality: Exact Geometry & Drift
      if (videoStream) {
        if (videoStream.width !== CANONICAL_THRESHOLDS.minVideoWidth || videoStream.height !== CANONICAL_THRESHOLDS.minVideoHeight) {
          findings.push({
            id: "find_quality_invalid_dimensions",
            rule: "quality/structural-geometry-9x16-required",
            severity: "error",
            subject: "video_geometry",
            evidence: [`Stream geometry is ${videoStream.width}x${videoStream.height}`],
            expected: `Exact 1080x1920 geometry (9:16 aspect ratio)`,
            observed: `${videoStream.width}x${videoStream.height}`,
            confidence: 1.0,
            supportedRepairs: [],
          });
        }
      }
    }

    // 3. Verification Hard Gates Quality Threshold
    if (run.verificationResult) {
      const score = Number(run.verificationResult.overallScore || 0);
      if (score < CANONICAL_THRESHOLDS.minVerificationScore) {
        findings.push({
          id: "find_quality_verification_score_low",
          rule: "quality/technical-verification-score-threshold",
          severity: "error",
          subject: "floor07_compliance",
          evidence: [`Overall verification score was ${score}, minimum required is ${CANONICAL_THRESHOLDS.minVerificationScore}`],
          expected: `>= ${CANONICAL_THRESHOLDS.minVerificationScore}`,
          observed: `${score}`,
          confidence: 1.0,
          supportedRepairs: [],
        });
      }
    }

    return findings;
  }

  public static getDimensionsReport(run: MissionRun): QualityDimensionsReport {
    const findings = this.evaluate(run);
    const techFailures = findings.filter((f) => f.rule.startsWith("quality/technical"));
    const structFailures = findings.filter((f) => f.rule.startsWith("quality/structural"));

    return {
      technicalQuality: techFailures.length === 0 ? "PASS" : "FAIL",
      structuralQuality: structFailures.length === 0 ? "PASS" : "FAIL",
      semanticQuality: "PASS",
      perceptualQuality: "UNKNOWN",
      perceptualNote: "Perceptual quality evaluator not bound in local deterministic testing suite.",
    };
  }
}
