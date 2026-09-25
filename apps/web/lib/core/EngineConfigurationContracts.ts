/**
 * Engine configuration contracts.
 *
 * The Content Engine owns a declarative configuration schema. The dashboard
 * renders that schema; the server validates it again before creating a
 * ProductionSpec.
 */

export type EngineConfigSection =
  | "content"
  | "creative"
  | "media"
  | "delivery"
  | "runtime"
  | "lifecycle";

export type EngineConfigFieldType =
  | "text"
  | "textarea"
  | "select"
  | "number"
  | "toggle"
  | "multi-select";

export interface EngineConfigOption {
  value: string | number | boolean;
  label: string;
  description?: string;
}

export interface EngineConfigField {
  key: string;
  label: string;
  type: EngineConfigFieldType;
  section: EngineConfigSection;
  defaultValue: string | number | boolean | string[] | null;
  required?: boolean;
  advanced?: boolean;
  readonly?: boolean;
  helpText?: string;
  options?: EngineConfigOption[];
  min?: number;
  max?: number;
  step?: number;
  binding?: "generation" | "snapshot-only" | "delivery" | "lifecycle" | "runtime";
}

export interface EngineConfigurationSchema {
  schemaVersion: string;
  source: "declared" | "compatibility";
  fields: EngineConfigField[];
}

export interface EngineResearchContract {
  required: boolean;
  dataRequirements: string[];
  minSources?: number;
  citationRequired?: boolean;
  freshness?: "run" | "recent" | "any";
  sourcePolicy?: string;
  agentReachProfile?: string;
}

export interface EngineCognitiveContract {
  structuredOutput: boolean;
  promptRefs: string[];
}

export interface EngineCreativeContract {
  hookPrompt?: string;
  rules: string[];
}

export interface EngineAssetContract {
  requiredAssets: string[];
}

export interface EngineVoiceContract {
  required: boolean;
  languages?: string[];
}

export interface EngineTimelineContract {
  mapping: string;
  durationRules?: string[];
}

export interface EngineRenderContract {
  profile: string;
  aspectRatios: string[];
}

export interface EngineVerificationContract {
  requiredChecks: string[];
  criticRules?: string;
}

export interface EngineContractProfile {
  research?: EngineResearchContract;
  cognitive?: EngineCognitiveContract;
  creative?: EngineCreativeContract;
  assets?: EngineAssetContract;
  voice?: EngineVoiceContract;
  timeline?: EngineTimelineContract;
  render?: EngineRenderContract;
  verification?: EngineVerificationContract;
}

export interface EngineConfigValidationResult {
  valid: boolean;
  errors: string[];
}

function hasValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}

export function validateEngineConfigurationSchema(
  schema?: EngineConfigurationSchema
): EngineConfigValidationResult {
  if (!schema) return { valid: true, errors: [] };

  const errors: string[] = [];
  const seen = new Set<string>();

  if (!schema.schemaVersion) {
    errors.push("Configuration schema version is required.");
  }

  for (const field of schema.fields ?? []) {
    if (!field.key || !field.label) {
      errors.push("Every configuration field requires a key and label.");
      continue;
    }

    if (seen.has(field.key)) {
      errors.push("Duplicate configuration field: " + field.key);
    }
    seen.add(field.key);

    if (
      (field.type === "select" || field.type === "multi-select") &&
      (!field.options || field.options.length === 0)
    ) {
      errors.push("Field " + field.key + " requires options.");
    }

    if (
      field.type === "number" &&
      field.min !== undefined &&
      field.max !== undefined &&
      field.min > field.max
    ) {
      errors.push("Field " + field.key + " has min > max.");
    }

    if (field.options && hasValue(field.defaultValue)) {
      const values = field.options.map((option) => option.value);
      if (field.type === "multi-select") {
        const defaults = Array.isArray(field.defaultValue) ? field.defaultValue : [];
        for (const value of defaults) {
          if (!values.includes(value as any)) {
            errors.push("Field " + field.key + " has unsupported default option " + String(value) + ".");
          }
        }
      } else if (!values.includes(field.defaultValue as any)) {
        errors.push("Field " + field.key + " has unsupported default value " + String(field.defaultValue) + ".");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function getConfigurationDefaults(
  schema?: EngineConfigurationSchema
): Record<string, any> {
  const defaults: Record<string, any> = {};
  for (const field of schema?.fields ?? []) {
    defaults[field.key] = field.defaultValue;
  }
  return defaults;
}

/**
 * Transitional schema for engines that have not yet declared a precise
 * configuration contract. New engines should declare one directly.
 */
export function getCompatibilityEngineConfiguration(
  engineId: string
): EngineConfigurationSchema {
  const fields: EngineConfigField[] = [
    {
      key: "topic",
      label: "Topic / Theme",
      type: "text",
      section: "content",
      defaultValue: "",
      required: true,
      binding: "generation",
      helpText: "Primary subject the engine should manufacture content about.",
    },
    {
      key: "audience",
      label: "Audience",
      type: "select",
      section: "content",
      defaultValue: "general",
      options: [
        { value: "general", label: "General" },
        { value: "kids", label: "Kids" },
        { value: "experts", label: "Experts" },
      ],
      binding: "generation",
    },
    {
      key: "tone",
      label: "Engagement Tone",
      type: "select",
      section: "creative",
      defaultValue: "Challenging",
      options: [
        { value: "Challenging", label: "Challenging" },
        { value: "Dramatic", label: "Dramatic" },
        { value: "Friendly", label: "Friendly" },
      ],
      binding: "generation",
    },
    {
      key: "voice",
      label: "Voice Synthesizer",
      type: "select",
      section: "media",
      defaultValue: "neutral",
      options: [
        { value: "neutral", label: "Neutral Voice" },
        { value: "male", label: "Male Voice" },
        { value: "female", label: "Female Voice" },
      ],
      binding: "generation",
    },
    {
      key: "thumbnailStyle",
      label: "Thumbnail Style",
      type: "select",
      section: "media",
      defaultValue: "cinematic",
      advanced: true,
      binding: "snapshot-only",
      options: [
        { value: "cinematic", label: "Cinematic" },
        { value: "flat", label: "Minimalist" },
        { value: "isometric", label: "Isometric" },
      ],
    },
    {
      key: "ratio",
      label: "Output Ratio",
      type: "select",
      section: "media",
      defaultValue: "9:16",
      binding: "generation",
      options: [
        { value: "9:16", label: "Portrait Shorts (9:16)" },
        { value: "16:9", label: "Horizontal Landscape (16:9)" },
      ],
    },
    {
      key: "durationSeconds",
      label: "Duration",
      type: "number",
      section: "media",
      defaultValue: 45,
      min: 30,
      max: 60,
      step: 1,
      advanced: true,
      binding: "generation",
      helpText: "Current Shorts production path clamps execution to 30-60 seconds.",
    },
    {
      key: "platforms",
      label: "Publish Targets",
      type: "multi-select",
      section: "delivery",
      defaultValue: [],
      binding: "delivery",
      options: [
        { value: "youtube", label: "YouTube" },
        { value: "tiktok", label: "TikTok" },
        { value: "instagram", label: "Instagram" },
      ],
    },
    {
      key: "providerOverride",
      label: "AI Provider Override",
      type: "select",
      section: "runtime",
      defaultValue: "auto",
      advanced: true,
      binding: "runtime",
      helpText: "Request-level override only. Sovereign routing and security policy remain authoritative.",
      options: [
        { value: "auto", label: "Auto Router" },
        { value: "google", label: "Google Gemini Only" },
        { value: "groq", label: "Groq LPU Only" },
      ],
    },
    {
      key: "retentionHours",
      label: "Retention Policy",
      type: "select",
      section: "lifecycle",
      defaultValue: 72,
      advanced: true,
      binding: "lifecycle",
      options: [
        { value: 24, label: "Delete after 24h" },
        { value: 48, label: "Delete after 48h" },
        { value: 72, label: "Delete after 72h" },
        { value: 0, label: "Never Delete" },
      ],
    },
  ];

  if (engineId === "quiz") {
    fields.splice(1, 0, {
      key: "difficulty",
      label: "Difficulty",
      type: "select",
      section: "content",
      defaultValue: "medium",
      binding: "generation",
      options: [
        { value: "easy", label: "Easy" },
        { value: "medium", label: "Medium" },
        { value: "hard", label: "Hard" },
      ],
    });
  }

  return {
    schemaVersion: "1.0",
    source: "compatibility",
    fields,
  };
}

export function getCompatibilityEngineContracts(
  engineId: string
): EngineContractProfile {
  return {
    research: {
      required: engineId !== "motivation",
      dataRequirements: [
        "Topic-specific factual grounding when the engine makes factual claims.",
        "Evidence provenance must survive the F00 Research Passport boundary.",
      ],
      minSources: engineId === "quiz" ? 2 : 1,
      citationRequired: engineId === "quiz",
      freshness: engineId === "reddit" || engineId === "news" ? "recent" : "any",
      sourcePolicy:
        "Content Engine requirements constrain F00/AgentReach; AgentReach does not invent engine requirements.",
      agentReachProfile: "engine:" + engineId,
    },
    cognitive: {
      structuredOutput: true,
      promptRefs: [],
    },
    creative: {
      rules: ["Engine-specific creative rules are authoritative when declared."],
    },
    assets: {
      requiredAssets: ["Engine-defined scene/visual requirements."],
    },
    voice: {
      required: true,
      languages: ["en"],
    },
    timeline: {
      mapping: "TimelineIR-compatible engine template.",
      durationRules: ["Use the compiled ProductionSpec duration constraints."],
    },
    render: {
      profile: engineId === "quiz" ? "FAST_QUIZ" : "FAST_SHORTS",
      aspectRatios: ["9:16", "16:9"],
    },
    verification: {
      requiredChecks: [
        "Schema validity",
        "Engine-specific critic rules",
        "F07 compliance gate",
      ],
    },
  };
}
