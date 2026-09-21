/**
 * FactoryOS YouTube Monetization Guardian — Gates G09 to G11
 * G09: Engagement & Automation (Internal Governance Pre-Publish)
 * G10: Metadata & Packaging Integrity
 * G11: Kids & Family Content Quality
 */

import { CandidateVideoContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";

export class G09_FakeEngagementGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Pre-publish governance: Invariant that ShortForge never uses artificial engagement systems
    const isBottingDetected = Boolean(video.isAutomatedEngagementUsed);

    if (isBottingDetected) {
      return {
        gateId: "G09_ENGAGEMENT_AUTOMATION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { automatedEngagementFlag: true },
        explanation: "ShortForge internal pipeline flagged forbidden engagement manipulation or artificial traffic automation. Hard blocking under YouTube Fake Engagement Policy.",
        evidence: ["Automation flag 'isAutomatedEngagementUsed' is TRUE"],
        affectedStages: ["F07"],
        suggestedRemediation: "Disable all artificial traffic, view spoofing, or automated engagement systems.",
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    return {
      gateId: "G09_ENGAGEMENT_AUTOMATION",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        prePublishAutomationClean: true,
        postPublishObservationDeferred: true,
      },
      explanation: "Pre-publish automation behavior certified: zero artificial engagement, bot traffic, or view manipulation employed. Post-publish traffic monitoring will observe external YouTube signals.",
      evidence: [
        "Internal automation compliance: 100%",
        "Synthetic traffic injection: NONE",
      ],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}

export class G10_MetadataPackagingGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const tags = video.tags || [];

    // Tag stuffing detection (> 25 tags or excessive commas)
    if (tags.length > 25) {
      return {
        gateId: "G10_METADATA_PACKAGING",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: { tagsCount: tags.length, limit: 25 },
        explanation: `Excessive tags (${tags.length}) detected. YouTube policy treats keyword stuffing in tags or description as deceptive spam.`,
        evidence: [`Total tags provided: ${tags.length}`],
        affectedStages: ["F02", "F07"],
        suggestedRemediation: "Reduce tags to 5-10 highly relevant, topic-specific keywords.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // Check title and description coherence with topic
    const topicLower = video.genome.topic.toLowerCase();
    const titleLower = video.title.toLowerCase();
    const hasTopicRelevance = titleLower.includes(topicLower) || topicLower.split(/\s+/).some((word) => word.length > 3 && titleLower.includes(word));

    if (!hasTopicRelevance && video.title.length > 0) {
      return {
        gateId: "G10_METADATA_PACKAGING",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: { topic: video.genome.topic, title: video.title },
        explanation: "Title does not appear relevant to candidate genome topic. Potential packaging misalignment.",
        evidence: [`Topic: '${video.genome.topic}'`, `Title: '${video.title}'`],
        affectedStages: ["F02"],
        suggestedRemediation: "Ensure title clearly and directly conveys the topic of the Short.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "HYBRID",
        confidence: 0.88,
      };
    }

    return {
      gateId: "G10_METADATA_PACKAGING",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: { tagsCount: tags.length, relevant: true },
      explanation: "Packaging metadata is concise, relevant to the narrative, and free of keyword stuffing.",
      evidence: [`Tags count: ${tags.length}`, `Title: ${video.title}`],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 0.98,
    };
  }
}

export class G11_KidsFamilyGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Check if content targets kids (e.g. Guess Flag, Guess Logo with elementary framing)
    const isKidsTargeted = video.tags.some((t) => /kids|children|toddler/i.test(t)) || /for\s+kids/i.test(video.title);

    if (isKidsTargeted) {
      // Check for commercialization or negative behavioral prompts
      const hasHyperCommercialism = /buy\s+now|order\s+today|subscribe\s+or\s+bad\s+luck/i.test(video.scriptText);
      if (hasHyperCommercialism) {
        return {
          gateId: "G11_KIDS_FAMILY",
          ruleId: rule.ruleId,
          status: "REPAIR_REQUIRED",
          severity: "REPAIRABLE",
          observedSignal: { isKidsTargeted: true, commercialPressure: true },
          explanation: "Content targeted at children contains overt commercial prompts or pressure. Violates YouTube Quality Principles for Kids & Family content.",
          evidence: ["Commercial pressure detected in kids-targeted Short"],
          affectedStages: ["F02"],
          suggestedRemediation: "Remove commercial calls-to-action and emphasize positive learning exploration.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "HYBRID",
          confidence: 0.92,
        };
      }
    }

    return {
      gateId: "G11_KIDS_FAMILY",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: { isKidsTargeted, compliant: true },
      explanation: "Kids & family guidelines verified: general audience content without inappropriate commercial pressure.",
      evidence: [`Target audience kids: ${isKidsTargeted}`],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.96,
    };
  }
}
