/**
 * FactoryOS YouTube Monetization Guardian — YouTube Remediation Planner
 * Creates structured RemediationCases for ReMaker targeting the smallest affected production surface.
 */

import { GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { RemediationCase } from "./RemediationCase";

export class YouTubeRemediationPlanner {
  /**
   * Translates a repairable GateEvaluationFinding into an actionable RemediationCase.
   */
  public static planRemediation(
    finding: GateEvaluationFinding,
    context?: {
      topic?: string;
      contentEngine?: string;
    }
  ): RemediationCase {
    const caseId = `case_${finding.gateId.toLowerCase()}_${Date.now()}`;

    let repairObjective = finding.suggestedRemediation || "Repair affected production stage according to policy.";
    let allowedActions: string[] = [];

    switch (finding.gateId) {
      case "G03_INAUTHENTIC_CONTENT":
        repairObjective = "Change substantive narrative experience and restructure hook.";
        allowedActions = [
          "rewrite hook",
          "change narrative structure",
          "change thesis framing",
          "replace repeated visual grammar",
          "replace repetitive examples",
        ];
        break;

      case "G04_REUSED_CONTENT":
        repairObjective = "Add original editorial commentary and transformative analysis.";
        allowedActions = [
          "synthesize original commentary",
          "add critical perspective",
          "ground reporting in multi-source evidence",
          "replace verbatim quotations with analytical summary",
        ];
        break;

      case "G05_COMMERCIAL_RIGHTS":
        repairObjective = "Replace un-cleared or expired assets with verified commercial licenses.";
        allowedActions = [
          "substitute asset with approved commercial stock",
          "generate original synthetic image/broll",
          "replace claimed audio bed with CC0 or YouTube Audio Library track",
        ];
        break;

      case "G06_ADVERTISER_SUITABILITY":
        repairObjective = "Reframe sensitive topic with educational objectivity and replace graphic visuals.";
        allowedActions = [
          "soften graphic wording",
          "emphasize educational/documentary framing",
          "replace sensitive thumbnail or focal b-roll scene",
        ];
        break;

      case "G08_SPAM_DECEPTION":
      case "G10_METADATA_PACKAGING":
        repairObjective = "Align packaging metadata directly with verified video narrative.";
        allowedActions = [
          "rewrite title to describe genuine content",
          "prune irrelevant tags",
          "remove sensational ungrounded promises",
        ];
        break;

      case "G12_SHORTS_ELIGIBILITY":
        repairObjective = "Adjust video duration or geometry to satisfy YouTube Shorts format rules.";
        allowedActions = [
          "trim timeline to <= 180s (or <= 60s if claimed audio bed)",
          "adjust canvas crop to 9:16 (1080x1920)",
          "replace claimed music track",
        ];
        break;

      case "G13_CHANNEL_REPETITION":
        repairObjective = "Vary narrative archetype and hook family to eliminate channel fatigue.";
        allowedActions = [
          "select unrepresented hook family",
          "switch from curiosity-reveal to engineering-breakdown or myth-busting",
          "alter visual pacing and typography style",
        ];
        break;

      default:
        allowedActions = ["regenerate affected stage", "verify policy compliance"];
        break;
    }

    const forbiddenShallowRepairs = finding.forbiddenShallowRepairs && finding.forbiddenShallowRepairs.length > 0
      ? finding.forbiddenShallowRepairs
      : [
          "font-only change",
          "color-only change",
          "crop-only change",
          "zoom-only change",
          "caption-style-only change",
        ];

    // Determine rerun list based on affected stages
    const rerunStages = new Set<string>(["f07", "youtube_policy"]);
    if (finding.affectedStages.includes("F01") || finding.affectedStages.includes("F02")) {
      rerunStages.add("variation");
      rerunStages.add("originality");
      rerunStages.add("render");
    }
    if (finding.affectedStages.includes("F03") || finding.affectedStages.includes("F04") || finding.affectedStages.includes("F05")) {
      rerunStages.add("render");
    }

    return {
      caseId,
      policyId: finding.ruleId,
      severity: finding.severity,
      finding: finding.explanation,
      evidence: finding.evidence,
      affectedStages: finding.affectedStages,
      repairObjective,
      allowedActions: Object.freeze(allowedActions),
      forbiddenShallowRepairs: Object.freeze(forbiddenShallowRepairs),
      preserve: Object.freeze(["verified facts", "approved sources", "brand identity"]),
      rerunRequired: Object.freeze(Array.from(rerunStages)),
      createdAt: new Date().toISOString(),
    };
  }
}
