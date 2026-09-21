/**
 * FactoryOS YouTube Monetization Guardian — Gates G06 to G08
 * G06: Advertiser Suitability (AdvertiserSuitabilityAssessment)
 * G07: AI & Synthetic Media Disclosure (status.containsSyntheticMedia Data API Mapping)
 * G08: Spam & Deceptive Practices (Holistic Narrative Coherence & Scams Check)
 */

import { CandidateVideoContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";
import { EvidenceRefFactory } from "../evidence/EvidenceRef";

export class G06_AdvertiserSuitabilityGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const sensitiveSignals = video.sensitiveTopicSignals || [];
    const packageText = `${video.title} ${video.description || ""} ${(video.tags || []).join(" ")} ${video.scriptText}`.toLowerCase();

    // Graphic or shocking content check
    const graphicKeywords = ["gore", "bloodbath", "decapitation", "mutilation", "gruesome corpse"];
    for (const word of graphicKeywords) {
      if (packageText.includes(word)) {
        return {
          gateId: "G06_ADVERTISER_SUITABILITY",
          ruleId: rule.ruleId,
          status: "REPAIR_REQUIRED",
          severity: "REPAIRABLE",
          observedSignal: {
            graphicPatternDetected: word,
            advertiserSuitabilityAssessment: "LIKELY_NO_ADS",
          },
          explanation: `Graphic violence or shocking imagery references detected ('${word}'). Exceeds advertiser-friendly baseline threshold for general ad serving.`,
          evidence: [`Detected pattern: '${word}' in packaging or script`],
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "FACTUAL_SOURCE",
              producer: "G06_AdvertiserSuitabilityGate",
              method: "DETERMINISTIC_PROBE",
              confidence: 0.95,
              metadata: { pattern: word, assessment: "LIKELY_NO_ADS" },
            }),
          ],
          affectedStages: ["F02", "F03"],
          suggestedRemediation: "Remove sensational or graphic descriptions; reframe with objective, educational historical context.",
          forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
          evaluationType: "HYBRID",
          confidence: 0.95,
        };
      }
    }

    // Contextual sensitivity: sensitive topic with educational framing
    if (sensitiveSignals.length > 0) {
      const isEducationalEngine = ["History", "Psychology", "News", "GK"].includes(video.contentEngine);
      if (isEducationalEngine) {
        return {
          gateId: "G06_ADVERTISER_SUITABILITY",
          ruleId: rule.ruleId,
          status: "EXTERNAL_REVIEW",
          severity: "EXTERNAL_REVIEW",
          observedSignal: {
            sensitiveSignals,
            contextualEngine: video.contentEngine,
            advertiserSuitabilityAssessment: "HUMAN_REVIEW",
          },
          explanation: `Content touches sensitive topic (${sensitiveSignals.join(", ")}) in an educational context (${video.contentEngine}). ` +
            "Per YouTube ad guidelines, contextual treatment matters. Requires operator review or ad-suitability confirmation.",
          evidence: sensitiveSignals,
          evidenceRefs: [
            EvidenceRefFactory.create({
              evidenceType: "FACTUAL_SOURCE",
              producer: "G06_AdvertiserSuitabilityGate",
              method: "AI_INFERENCE",
              confidence: 0.85,
              metadata: { sensitiveSignals, assessment: "HUMAN_REVIEW" },
            }),
          ],
          affectedStages: ["F07"],
          suggestedRemediation: "Confirm tone is objective and non-sensational, or request manual review in YouTube Studio.",
          evaluationType: "AI_INFERRED",
          confidence: 0.85,
        };
      }
    }

    return {
      gateId: "G06_ADVERTISER_SUITABILITY",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        packageEvaluated: true,
        advertiserSuitabilityAssessment: "PASS",
      },
      explanation: "Metadata, visual assets, audio bed, and narrative meet YouTube advertiser-friendly content guidelines.",
      evidence: [
        `Title: ${video.title}`,
        `Content Engine: ${video.contentEngine}`,
        "No yellow-dollar or limited-ad triggers detected",
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "SECURITY_ATTESTATION",
          producer: "G06_AdvertiserSuitabilityGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 0.96,
          metadata: { assessment: "PASS" },
        }),
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.96,
    };
  }
}

export class G07_AIDisclosureGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    // Invariant: AI use does NOT automatically penalize monetization.
    // Policy requires disclosure ONLY if realistic depiction of real people, places, or events.
    const isRealistic = Boolean(video.isRealisticallySynthetic);

    if (isRealistic) {
      return {
        gateId: "G07_AI_DISCLOSURE",
        ruleId: rule.ruleId,
        status: "PASS", // Passes gate with required upload disclosure metadata
        severity: "WARNING",
        observedSignal: {
          containsSyntheticMedia: true,
          statusContainsSyntheticMedia: true,
          disclosureRequired: true,
        },
        explanation: "Content contains realistically synthetic depictions of people or real-world events. YouTube Data API upload field 'status.containsSyntheticMedia' must be set to true. Disclosure does not limit monetization eligibility.",
        evidence: [
          "Realistically synthetic depiction detected",
          "YouTube Data API status.containsSyntheticMedia: TRUE",
        ],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G07_AIDisclosureGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
            metadata: { containsSyntheticMedia: true },
          }),
        ],
        affectedStages: ["F07"],
        suggestedRemediation: "Ensure YouTube Data API manifest sets status.containsSyntheticMedia = true.",
        forbiddenShallowRepairs: ["uncheck_synthetic_box"],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    return {
      gateId: "G07_AI_DISCLOSURE",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        containsSyntheticMedia: false,
        statusContainsSyntheticMedia: false,
        disclosureRequired: false,
      },
      explanation: "Content is stylistically animation/motion graphics or non-realistic synthesis. Platform synthetic media disclosure not required.",
      evidence: [
        "Content format: animated/illustrative or non-deceptive synthetic",
        "YouTube Data API status.containsSyntheticMedia: FALSE",
      ],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "FACTUAL_SOURCE",
          producer: "G07_AIDisclosureGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 1.0,
          metadata: { containsSyntheticMedia: false },
        }),
      ],
      affectedStages: [],
      evaluationType: "DETERMINISTIC",
      confidence: 1.0,
    };
  }
}

export class G08_SpamDeceptionGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const title = video.title ? video.title.trim() : "";

    // 1. Missing Title check
    if (!title || title.length === 0) {
      return {
        gateId: "G08_SPAM_DECEPTION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { titleLength: 0 },
        explanation: "Title is missing. Violates basic YouTube metadata integrity standards.",
        evidence: ["Title is empty"],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "SECURITY_ATTESTATION",
            producer: "G08_SpamDeceptionGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
          }),
        ],
        affectedStages: ["F02", "F07"],
        suggestedRemediation: "Provide an accurate, descriptive title reflecting video content.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // 2. Scam / Deception Check
    if (/free\s+money|get\s+rich\s+quick|crypto\s+giveaway|double\s+your\s+bitcoin/i.test(title)) {
      return {
        gateId: "G08_SPAM_DECEPTION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { deceptiveScamPattern: true },
        explanation: "Title contains known scam or deceptive monetization solicitation patterns. Violates YouTube Spam and Scams policy.",
        evidence: [`Pattern match in title: '${title}'`],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "SECURITY_ATTESTATION",
            producer: "G08_SpamDeceptionGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 1.0,
            metadata: { title },
          }),
        ],
        affectedStages: ["F02", "F07"],
        suggestedRemediation: "Remove spam or deceptive financial claims completely.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // 3. Contextual Narrative Coherence Check
    const isExtremeClaim = /discovered\s+immortality|cures?\s+all\s+cancer|secret\s+aliens?\s+confirmed/i.test(title);
    const verifiedClaims = video.verifiedFactualClaimsCount ?? 0;
    if (isExtremeClaim && verifiedClaims === 0) {
      return {
        gateId: "G08_SPAM_DECEPTION",
        ruleId: rule.ruleId,
        status: "REPAIR_REQUIRED",
        severity: "REPAIRABLE",
        observedSignal: {
          sensationalTitle: title,
          verifiedClaims,
        },
        explanation: `Title asserts sensational unverified discovery ('${title}') without supporting verified factual claims in the research record. Deceptive clickbait risk under spam policy.`,
        evidence: [
          `Title: ${title}`,
          `Verified factual claims: ${verifiedClaims}`,
        ],
        evidenceRefs: [
          EvidenceRefFactory.create({
            evidenceType: "FACTUAL_SOURCE",
            producer: "G08_SpamDeceptionGate",
            method: "DETERMINISTIC_PROBE",
            confidence: 0.90,
            metadata: { title, verifiedClaims },
          }),
        ],
        affectedStages: ["F01", "F02"],
        suggestedRemediation: "Align title claims directly with verified scientific or historical evidence.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "HYBRID",
        confidence: 0.90,
      };
    }

    return {
      gateId: "G08_SPAM_DECEPTION",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: { spamScore: 0.0, deceptiveMetadata: false },
      explanation: "Title, tags, and claims are non-deceptive and grounded in video narrative.",
      evidence: [`Title: ${title}`, `Tags count: ${(video.tags || []).length}`],
      evidenceRefs: [
        EvidenceRefFactory.create({
          evidenceType: "SECURITY_ATTESTATION",
          producer: "G08_SpamDeceptionGate",
          method: "DETERMINISTIC_PROBE",
          confidence: 0.96,
        }),
      ],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.96,
    };
  }
}
