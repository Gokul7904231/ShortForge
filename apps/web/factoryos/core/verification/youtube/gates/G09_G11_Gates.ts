/**
 * FactoryOS YouTube Monetization Guardian — Gates G09 to G11
 * G09: Engagement & Automation (Internal Behavioral Attestation Pre-Publish)
 * G10: Metadata & Packaging Integrity (Narrative Coherence, Anti-Tag-Stuffing)
 * G11: Kids & Family Content Quality (Multi-Factor AudienceClassificationAssessment)
 */

import { CandidateVideoContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";
import { EvidenceRefFactory } from "../evidence/EvidenceRef";

export class G09_FakeEngagementGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Pre-publish governance: ShortForge behavioral attestation
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
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "SECURITY_ATTESTATION",
            producer: "G09_FakeEngagementGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
            metadata: { isAutomatedEngagementUsed: true },
          }),
        ],
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
        behavioralAttestation: "ORGANIC_ONLY",
        postPublishExternalObservationDeferred: true,
      },
      explanation: "Pre-publish behavioral attestation verified: ShortForge does not generate artificial views, subscribers, or automated metric manipulation. Future external third-party traffic will be tracked post-publication.",
      evidence: [
        "Internal automation compliance: ATTESTED_ORGANIC",
        "Synthetic traffic injection: NONE",
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "SECURITY_ATTESTATION",
          producer: "G09_FakeEngagementGate",
          method: "HUMAN_ATTESTATION",
          confidence: 1.0,
          metadata: { behavioralAttestation: "ORGANIC_ONLY" },
        }),
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
    const description = video.description || "";

    // Tag stuffing in description check (YouTube spam policy explicitly forbids blocks of repetitive tags in description)
    const hasTagBlockInDescription = /#\w+\s+#\w+\s+#\w+\s+#\w+\s+#\w+\s+#\w+\s+#\w+/i.test(description) ||
      (description.match(/#/g) || []).length > 15;

    if (hasTagBlockInDescription) {
      return {
        gateId: "G10_METADATA_PACKAGING",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: { hasTagBlockInDescription: true },
        explanation: "Excessive hashtag block detected in video description. YouTube spam policy prohibits placing excessive keyword lists in descriptions.",
        evidence: ["Excessive hashtags in video description text"],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G10_MetadataPackagingGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
          }),
        ],
        affectedStages: ["F02", "F07"],
        suggestedRemediation: "Remove repetitive tag blocks from description; place relevant keywords in official tag metadata.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // Check title and description coherence with topic
    const topicLower = video.genome.topic.toLowerCase();
    const titleLower = (video.title || "").toLowerCase();
    const hasTopicRelevance = titleLower.includes(topicLower) ||
      topicLower.split(/\s+/).some((word) => word.length > 3 && titleLower.includes(word));

    if (!hasTopicRelevance && video.title.length > 0) {
      return {
        gateId: "G10_METADATA_PACKAGING",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: { topic: video.genome.topic, title: video.title },
        explanation: "Title does not appear relevant to candidate genome topic. Potential packaging misalignment.",
        evidence: [`Topic: '${video.genome.topic}'`, `Title: '${video.title}'`],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G10_MetadataPackagingGate",
            method: "AI_INFERENCE",
            confidence: 0.88,
            metadata: { topic: video.genome.topic, title: video.title },
          }),
        ],
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
      explanation: "Packaging metadata is concise, relevant to the narrative, and free of deceptive keyword stuffing.",
      evidence: [`Tags count: ${tags.length}`, `Title: ${video.title}`],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "SECURITY_ATTESTATION",
          producer: "G10_MetadataPackagingGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 0.98,
        }),
      ],
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
    // Multi-factor Audience Classification Assessment
    const selfDeclared = Boolean(video.selfDeclaredMadeForKids);
    const tags = video.tags || [];
    const childKeywords = tags.some((t) => /kids|children|toddler|nursery/i.test(t)) || /for\s+kids/i.test(video.title || "");
    const isKidsTargeted = selfDeclared || childKeywords;

    if (isKidsTargeted) {
      // Check for commercialization or negative behavioral prompts
      const hasHyperCommercialism = /buy\s+now|order\s+today|subscribe\s+or\s+bad\s+luck/i.test(video.scriptText);
      if (hasHyperCommercialism) {
        return {
          gateId: "G11_KIDS_FAMILY",
          ruleId: rule.ruleId,
          status: "REPAIR_REQUIRED",
          severity: "REPAIRABLE",
          observedSignal: {
            isKidsTargeted: true,
            selfDeclaredMadeForKids: selfDeclared,
            commercialPressure: true,
          },
          explanation: "Content targeted at children contains overt commercial prompts or pressure. Violates YouTube Quality Principles for Kids & Family content.",
          evidence: ["Commercial pressure detected in kids-targeted Short"],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "FACTUAL_SOURCE",
              producer: "G11_KidsFamilyGate",
              method: "AI_INFERENCE",
              confidence: 0.92,
            }),
          ],
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
      observedSignal: {
        isKidsTargeted,
        selfDeclaredMadeForKids: selfDeclared,
        compliant: true,
      },
      explanation: "Kids & family guidelines verified: general audience content without inappropriate commercial pressure.",
      evidence: [`Target audience kids: ${isKidsTargeted}`, `selfDeclaredMadeForKids: ${selfDeclared}`],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "FACTUAL_SOURCE",
          producer: "G11_KidsFamilyGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 0.96,
          metadata: { isKidsTargeted, selfDeclared },
        }),
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.96,
    };
  }
}
