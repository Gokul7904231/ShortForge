/**
 * FactoryOS YouTube Monetization Guardian — Content Engine Policy Profiles
 * HARD BOUNDARY: Exclusively supports the 11 approved Content Engines.
 * Third-party movie/TV/cartoon clipping is strictly rejected.
 */

export const APPROVED_CONTENT_ENGINES = [
  "Quiz",
  "GK",
  "History",
  "Coding",
  "Motivation",
  "Psychology",
  "News",
  "Reddit",
  "Story",
  "Guess Flag",
  "Guess Logo",
] as const;

export type ApprovedContentEngine = typeof APPROVED_CONTENT_ENGINES[number];

export interface EnginePolicySignalProfile {
  readonly engine: ApprovedContentEngine;
  readonly defaultStoryArchetypes: readonly string[];
  readonly requiredEvidenceType: "PHYSICAL_FACT" | "VERIFIED_SOURCE" | "CODE_EXECUTION" | "CURATED_DATA" | "PSYCHOLOGICAL_LITERATURE" | "HISTORICAL_RECORD";
  readonly sensitiveTopicRisk: "LOW" | "MEDIUM" | "HIGH";
  readonly requiresExternalSourceAttribution: boolean;
  readonly forbidsRawTtsReading: boolean;
  readonly allowsRealisticAiDepiction: boolean;
}

export class EnginePolicyProfiles {
  private static readonly PROFILES: Record<ApprovedContentEngine, EnginePolicySignalProfile> = {
    Quiz: {
      engine: "Quiz",
      defaultStoryArchetypes: ["curiosity-reveal", "myth-vs-reality"],
      requiredEvidenceType: "CURATED_DATA",
      sensitiveTopicRisk: "LOW",
      requiresExternalSourceAttribution: false,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: false,
    },
    GK: {
      engine: "GK",
      defaultStoryArchetypes: ["curiosity-reveal", "engineering-breakdown"],
      requiredEvidenceType: "PHYSICAL_FACT",
      sensitiveTopicRisk: "LOW",
      requiresExternalSourceAttribution: true,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: false,
    },
    History: {
      engine: "History",
      defaultStoryArchetypes: ["historical-context", "perspective-narrative"],
      requiredEvidenceType: "HISTORICAL_RECORD",
      sensitiveTopicRisk: "MEDIUM",
      requiresExternalSourceAttribution: true,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: true, // e.g. historical likeness or maps
    },
    Coding: {
      engine: "Coding",
      defaultStoryArchetypes: ["engineering-breakdown", "deep-analogy"],
      requiredEvidenceType: "CODE_EXECUTION",
      sensitiveTopicRisk: "LOW",
      requiresExternalSourceAttribution: false,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: false,
    },
    Motivation: {
      engine: "Motivation",
      defaultStoryArchetypes: ["perspective-narrative", "deep-analogy"],
      requiredEvidenceType: "CURATED_DATA",
      sensitiveTopicRisk: "LOW",
      requiresExternalSourceAttribution: false,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: false,
    },
    Psychology: {
      engine: "Psychology",
      defaultStoryArchetypes: ["consequence-speculation", "deep-analogy", "myth-vs-reality"],
      requiredEvidenceType: "PSYCHOLOGICAL_LITERATURE",
      sensitiveTopicRisk: "MEDIUM",
      requiresExternalSourceAttribution: true,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: false,
    },
    News: {
      engine: "News",
      defaultStoryArchetypes: ["perspective-narrative", "curiosity-reveal"],
      requiredEvidenceType: "VERIFIED_SOURCE",
      sensitiveTopicRisk: "HIGH",
      requiresExternalSourceAttribution: true,
      forbidsRawTtsReading: true, // Must not read third-party wire copy verbatim
      allowsRealisticAiDepiction: false,
    },
    Reddit: {
      engine: "Reddit",
      defaultStoryArchetypes: ["perspective-narrative", "consequence-speculation"],
      requiredEvidenceType: "VERIFIED_SOURCE",
      sensitiveTopicRisk: "MEDIUM",
      requiresExternalSourceAttribution: true,
      forbidsRawTtsReading: true, // Must not be simple TTS reading of raw post
      allowsRealisticAiDepiction: false,
    },
    Story: {
      engine: "Story",
      defaultStoryArchetypes: ["curiosity-reveal", "perspective-narrative", "deep-analogy"],
      requiredEvidenceType: "CURATED_DATA",
      sensitiveTopicRisk: "LOW",
      requiresExternalSourceAttribution: false,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: true,
    },
    "Guess Flag": {
      engine: "Guess Flag",
      defaultStoryArchetypes: ["curiosity-reveal"],
      requiredEvidenceType: "CURATED_DATA",
      sensitiveTopicRisk: "LOW",
      requiresExternalSourceAttribution: false,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: false,
    },
    "Guess Logo": {
      engine: "Guess Logo",
      defaultStoryArchetypes: ["curiosity-reveal"],
      requiredEvidenceType: "CURATED_DATA",
      sensitiveTopicRisk: "LOW",
      requiresExternalSourceAttribution: false,
      forbidsRawTtsReading: false,
      allowsRealisticAiDepiction: false,
    },
  };

  /**
   * Validates if engine is strictly within the 11 approved engines.
   */
  public static isEngineApproved(engineName: string): boolean {
    return APPROVED_CONTENT_ENGINES.includes(engineName as any);
  }

  /**
   * Retrieves profile for approved engine. Throws if unapproved.
   */
  public static getProfile(engineName: string): EnginePolicySignalProfile {
    if (!this.isEngineApproved(engineName)) {
      throw new Error(
        `Content Engine '${engineName}' is OUT OF SCOPE. ShortForge strictly supports only: ${APPROVED_CONTENT_ENGINES.join(", ")}. Third-party entertainment clipping is prohibited.`
      );
    }
    return this.PROFILES[engineName as ApprovedContentEngine];
  }
}
