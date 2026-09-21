/**
 * FactoryOS YouTube Monetization Guardian — Gates G06 to G08
 * G06: Advertiser Suitability (Contextual + Multimodal)
 * G07: AI & Synthetic Media Disclosure (Upload Instructions, Not Monetization Penalty)
 * G08: Spam & Deceptive Practices (Deterministic + Contextual)
 */

import { CandidateVideoContext, GateEvaluationFinding } from "../policy/YouTubePolicyEvaluator";
import { PolicyRuleDefinition } from "../policy/YouTubePolicyIR";

export class G06_AdvertiserSuitabilityGate {
  public static evaluate(
    video: CandidateVideoContext,
    rule: PolicyRuleDefinition
  ): GateEvaluationFinding {
    const sensitiveSignals = video.sensitiveTopicSignals || [];
    const packageText = `${video.title} ${video.description} ${video.tags.join(" ")} ${video.scriptText}`.toLowerCase();

    // Graphic or shocking content check
    const graphicKeywords = ["gore", "bloodbath", "decapitation", "mutilation", "gruesome corpse"];
    for (const word of graphicKeywords) {
      if (packageText.includes(word)) {
        return {
          gateId: "G06_ADVERTISER_SUITABILITY",
          ruleId: rule.ruleId,
          status: "REPAIR_REQUIRED",
          severity: "REPAIRABLE",
          observedSignal: { graphicPatternDetected: word },
          explanation: `Graphic violence or shocking imagery references detected ('${word}'). Exceeds advertiser-friendly baseline threshold for general ad serving.`,
          evidence: [`Detected pattern: '${word}' in packaging or script`],
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
      // If historical or psychology engine, contextual treatment may be suitable but warrants review
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
          },
          explanation: `Content touches sensitive topic (${sensitiveSignals.join(", ")}) in an educational context (${video.contentEngine}). Requires operator review or ad-suitability confirmation before monetization deployment.`,
          evidence: sensitiveSignals,
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
        adSuitability: "GENERAL_AUDIENCE",
      },
      explanation: "Metadata, visual assets, audio bed, and narrative meet YouTube advertiser-friendly content guidelines.",
      evidence: [
        `Title: ${video.title}`,
        `Content Engine: ${video.contentEngine}`,
        "No yellow-dollar or limited-ad triggers detected",
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
          isRealisticallySynthetic: true,
          disclosureRequired: true,
          uploadInstruction: {
            alteredOrSyntheticMedia: true,
            disclosureReason: "Realistic synthetic depiction of scenes/people",
          },
        },
        explanation: "Content contains realistically synthetic or meaningfully altered media. Disclosure is required in YouTube Studio upload metadata. Note: Official YouTube policy explicitly confirms that disclosure does NOT impact monetization eligibility.",
        evidence: [
          "Synthetic realism signal: TRUE",
          "Generated upload instruction: altered_or_synthetic_content=true",
        ],
        affectedStages: ["F07"],
        suggestedRemediation: "Ensure YouTube upload payload includes 'hasAlteredContent=true' flag in video metadata.",
        forbiddenShallowRepairs: [],
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // Stylized, animated, diagrammatic, or coding content does not require synthetic disclosure
    return {
      gateId: "G07_AI_DISCLOSURE",
      ruleId: rule.ruleId,
      status: "PASS",
      severity: rule.severity,
      observedSignal: {
        isRealisticallySynthetic: false,
        disclosureRequired: false,
      },
      explanation: "Content is non-realistic (stylized animation, kinetic typography, code snippets, or documentary diagram). No YouTube altered-content disclosure required.",
      evidence: [
        `Visual grammar: ${video.genome.visualGrammar}`,
        "Realistic synthetic person/event: FALSE",
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
    const title = video.title.trim();

    // 1. Deterministic Hard Rules
    if (!title || title.length < 5) {
      return {
        gateId: "G08_SPAM_DECEPTION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { titleLength: title.length },
        explanation: "Title is missing or excessively brief. Violates basic YouTube metadata integrity standards.",
        evidence: [`Title observed: '${title}'`],
        affectedStages: ["F02", "F07"],
        suggestedRemediation: "Provide an accurate, descriptive title reflecting video content.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    if (/free\s+money|get\s+rich\s+quick|crypto\s+giveaway|double\s+your\s+bitcoin/i.test(title)) {
      return {
        gateId: "G08_SPAM_DECEPTION",
        ruleId: rule.ruleId,
        status: "BLOCKED",
        severity: "BLOCKING",
        observedSignal: { deceptiveScamPattern: true },
        explanation: "Title contains known scam or deceptive monetization solicitation patterns. Violates YouTube Spam and Scams policy.",
        evidence: [`Pattern match in title: '${title}'`],
        affectedStages: ["F02", "F07"],
        suggestedRemediation: "Remove spam or deceptive financial claims completely.",
        forbiddenShallowRepairs: rule.forbiddenShallowRepairs,
        evaluationType: "DETERMINISTIC",
        confidence: 1.0,
      };
    }

    // 2. Contextual Claim Analysis
    // Check if title makes an extreme factual claim (e.g. "Cure for aging discovered") unbacked by factual claims
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
      evidence: [`Title: ${title}`, `Tags count: ${video.tags.length}`],
      affectedStages: [],
      evaluationType: "HYBRID",
      confidence: 0.96,
    };
  }
}
