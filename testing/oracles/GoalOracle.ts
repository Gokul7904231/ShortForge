import type { MissionRun } from "../model/MissionRun";
import type { MissionSpecification } from "../contracts/mission.contract";
import type { Finding } from "../model/Finding";

export class GoalOracle {
  public static evaluate(run: MissionRun, spec: MissionSpecification): Finding[] {
    const findings: Finding[] = [];

    // 1. Goal Duration Target Check
    const targetDuration = spec.goal.durationSeconds;
    const video = run.artifacts.find((a) => a.kind === "MP4_VIDEO");
    const actualDuration =
      (run.verificationResult?.measurements as any)?.videoDuration ??
      (video?.formatDetails as any)?.duration;

    if (typeof targetDuration === "number" && typeof actualDuration === "number") {
      const allowedTolerance = Math.max(1.5, targetDuration * 0.15); // 1.5s or 15% tolerance
      const drift = Math.abs(actualDuration - targetDuration);
      if (drift > allowedTolerance) {
        findings.push({
          id: "find_goal_duration_target_violated",
          rule: "goal/duration-target-violated",
          severity: "critical",
          subject: "video_duration",
          evidence: [
            `Target duration: ${targetDuration}s (allowed tolerance: +/- ${allowedTolerance.toFixed(1)}s)`,
            `Actual measured video duration: ${actualDuration}s`,
          ],
          expected: `Duration ~${targetDuration}s (+/- ${allowedTolerance.toFixed(1)}s)`,
          observed: `${actualDuration}s`,
          rootCause: "Compiled video duration deviated significantly from user mission goal specification",
          confidence: 1.0,
          supportedRepairs: ["Adjust timeline scene durations or voice speech rate to match goal duration"],
        });
      }
    }

    // 2. 9:16 Vertical Geometry Goal Check
    const width = (run.verificationResult?.measurements as any)?.width ?? (video?.formatDetails as any)?.width;
    const height = (run.verificationResult?.measurements as any)?.height ?? (video?.formatDetails as any)?.height;
    if (width && height) {
      if (width !== 1080 || height !== 1920) {
        findings.push({
          id: "find_goal_aspect_ratio_not_9x16",
          rule: "goal/geometry-9x16-required",
          severity: "critical",
          subject: "video_geometry",
          evidence: [`Measured dimensions: ${width}x${height}`],
          expected: "Exact 1080x1920 geometry (9:16 vertical short)",
          observed: `${width}x${height}`,
          rootCause: "Video rendered in non-standard geometry for vertical short format",
          confidence: 1.0,
          supportedRepairs: ["Enforce 1080x1920 resolution in timeline composition intent"],
        });
      }
    }

    // 3. Topic Presence & Content Relevance Check
    const topicTokens = spec.goal.topic.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    const scriptEvent = run.events.find((e) => e.actor.floor === "floor02_scripting" && e.action.type === "floor_complete");
    const scriptText = ((scriptEvent?.metadata as any)?.output?.script || "").toLowerCase();
    const strategyEvent = run.events.find((e) => e.actor.floor === "floor01_strategy" && e.action.type === "floor_complete");
    const strategyTopic = ((strategyEvent?.metadata as any)?.output?.topic || "").toLowerCase();

    const matchesToken = topicTokens.some((token) => scriptText.includes(token) || strategyTopic.includes(token));
    if (topicTokens.length > 0 && !matchesToken) {
      findings.push({
        id: "find_goal_topic_not_represented",
        rule: "goal/topic-missing-from-content",
        severity: "error",
        subject: "content_topic",
        evidence: [
          `Target goal topic: "${spec.goal.topic}"`,
          `Script generated: "${scriptText.slice(0, 100)}..."`,
        ],
        expected: `Script and strategy must address key concepts of topic: ${spec.goal.topic}`,
        observed: "No matching topic tokens found in script or strategy output",
        confidence: 0.9,
        supportedRepairs: ["Pass target topic accurately into scripting prompt"],
      });
    }

    // 4. Scene Completeness Check (e.g. for "Top 3 Secrets", must have at least 2-3 distinct scenes)
    const scenes = (scriptEvent?.metadata as any)?.output?.scenes;
    if (Array.isArray(scenes) && scenes.length < 2) {
      findings.push({
        id: "find_goal_insufficient_scenes",
        rule: "goal/scene-count-insufficient",
        severity: "error",
        subject: "scenes_structure",
        evidence: [`Scene count produced: ${scenes.length}`],
        expected: "At least 2 distinct scenes for factual short progression",
        observed: `${scenes.length} scene(s)`,
        confidence: 0.9,
        supportedRepairs: ["Configure minimum scene breakdown in scripting engine"],
      });
    }

    // 5. Artifact Delivery Goal Check
    if (spec.terminalConditions.requireDeliveryOutbox && !run.deliveryRecord?.verified) {
      findings.push({
        id: "find_goal_outbox_delivery_unverified",
        rule: "goal/delivery-outbox-unverified",
        severity: "error",
        subject: "delivery_outbox",
        evidence: [`Delivery outbox record verification status: ${run.deliveryRecord?.verified}`],
        expected: "Verified delivery record in durable outbox",
        observed: "Delivery outbox unverified or missing",
        confidence: 1.0,
        supportedRepairs: [],
      });
    }

    // 6. Media Verification Goal Check
    if (spec.terminalConditions.requireVerificationPass && !run.verificationResult?.passed) {
      findings.push({
        id: "find_goal_verification_gate_failed",
        rule: "goal/verification-hard-gates-failed",
        severity: "critical",
        subject: "floor07_compliance",
        evidence: [JSON.stringify(run.verificationResult || {})],
        expected: "Floor 07 Forensic Media Probe verification passed",
        observed: "Verification failed or missing",
        confidence: 1.0,
        supportedRepairs: [],
      });
    }

    return findings;
  }
}
