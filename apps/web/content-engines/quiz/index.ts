import { WorkflowLoader } from "../_loader";

const quizConfiguration = {
  schemaVersion: "1.0",
  source: "declared" as const,
  fields: [
    {
      key: "topic",
      label: "Topic / Theme",
      type: "text" as const,
      section: "content" as const,
      defaultValue: "",
      required: true,
      binding: "generation" as const,
      helpText: "The knowledge domain the quiz should test.",
    },
    {
      key: "difficulty",
      label: "Difficulty",
      type: "select" as const,
      section: "content" as const,
      defaultValue: "medium",
      binding: "generation" as const,
      options: [
        { value: "easy", label: "Easy" },
        { value: "medium", label: "Medium" },
        { value: "hard", label: "Hard" },
      ],
    },
    {
      key: "audience",
      label: "Audience",
      type: "select" as const,
      section: "content" as const,
      defaultValue: "general",
      binding: "generation" as const,
      options: [
        { value: "general", label: "General" },
        { value: "kids", label: "Kids" },
        { value: "experts", label: "Experts" },
      ],
    },
    {
      key: "tone",
      label: "Engagement Tone",
      type: "select" as const,
      section: "creative" as const,
      defaultValue: "Challenging",
      binding: "generation" as const,
      options: [
        { value: "Challenging", label: "Challenging" },
        { value: "Dramatic", label: "Dramatic" },
        { value: "Friendly", label: "Friendly" },
      ],
    },
    {
      key: "voice",
      label: "Voice Synthesizer",
      type: "select" as const,
      section: "media" as const,
      defaultValue: "neutral",
      binding: "generation" as const,
      options: [
        { value: "neutral", label: "Neutral Voice" },
        { value: "male", label: "Male Voice" },
        { value: "female", label: "Female Voice" },
      ],
    },
    {
      key: "thumbnailStyle",
      label: "Thumbnail Style",
      type: "select" as const,
      section: "media" as const,
      defaultValue: "cinematic",
      advanced: true,
      binding: "snapshot-only" as const,
      options: [
        { value: "cinematic", label: "Cinematic" },
        { value: "flat", label: "Minimalist" },
        { value: "isometric", label: "Isometric" },
      ],
    },
    {
      key: "ratio",
      label: "Output Ratio",
      type: "select" as const,
      section: "media" as const,
      defaultValue: "9:16",
      binding: "generation" as const,
      options: [
        { value: "9:16", label: "Portrait Shorts (9:16)" },
        { value: "16:9", label: "Horizontal Landscape (16:9)" },
      ],
    },
    {
      key: "durationSeconds",
      label: "Duration",
      type: "number" as const,
      section: "media" as const,
      defaultValue: 45,
      min: 30,
      max: 60,
      step: 1,
      advanced: true,
      binding: "generation" as const,
      helpText: "Current Shorts path clamps execution to 30-60 seconds.",
    },
    {
      key: "platforms",
      label: "Publish Targets",
      type: "multi-select" as const,
      section: "delivery" as const,
      defaultValue: [],
      binding: "delivery" as const,
      options: [
        { value: "youtube", label: "YouTube" },
        { value: "tiktok", label: "TikTok" },
        { value: "instagram", label: "Instagram" },
      ],
    },
    {
      key: "providerOverride",
      label: "AI Provider Override",
      type: "select" as const,
      section: "runtime" as const,
      defaultValue: "auto",
      advanced: true,
      binding: "runtime" as const,
      helpText: "Request-level override only; sovereign routing policy remains authoritative.",
      options: [
        { value: "auto", label: "Auto Router" },
        { value: "google", label: "Google Gemini Only" },
        { value: "groq", label: "Groq LPU Only" },
      ],
    },
    {
      key: "retentionHours",
      label: "Retention Policy",
      type: "select" as const,
      section: "lifecycle" as const,
      defaultValue: 72,
      advanced: true,
      binding: "lifecycle" as const,
      options: [
        { value: 24, label: "Delete after 24h" },
        { value: 48, label: "Delete after 48h" },
        { value: 72, label: "Delete after 72h" },
        { value: 0, label: "Never Delete" },
      ],
    },
  ],
};

const quizContracts = {
  research: {
    required: true,
    dataRequirements: [
      "Factual claims must be grounded by evidence appropriate to the topic.",
      "Questions and answers need source-backed verification before release.",
    ],
    minSources: 2,
    citationRequired: true,
    freshness: "any" as const,
    sourcePolicy: "F00 Research Passport evidence is the upstream research boundary.",
    agentReachProfile: "engine:quiz",
  },
  cognitive: {
    structuredOutput: true,
    promptRefs: ["hook:v1", "scene:v1", "critic:v1"],
  },
  creative: {
    hookPrompt: "hook:v1",
    rules: ["Curiosity-driven hook", "Clear question/reveal pacing"],
  },
  assets: {
    requiredAssets: ["Question scene visual", "Readable answer options", "Thumbnail"],
  },
  voice: {
    required: true,
    languages: ["en"],
  },
  timeline: {
    mapping: "Quiz scene template -> TimelineIR",
    durationRules: ["Duration must remain inside the configured 30-60 second Shorts range."],
  },
  render: {
    profile: "FAST_QUIZ",
    aspectRatios: ["9:16", "16:9"],
  },
  verification: {
    requiredChecks: [
      "Question validity",
      "Answer consistency",
      "Hook/scene critic",
      "F07 social compliance",
    ],
    criticRules: "content-engines/quiz/critic.json",
  },
};

WorkflowLoader.register({
  configuration: quizConfiguration,
  contracts: quizContracts,
  id: "quiz",
  name: "Quiz Engine",
  version: "1.0",
  renderProfile: "FAST_QUIZ",
  workflowVersion: "v1",
  hookPromptSlug: "hook:v1",
  scenePromptSlug: "scene:v1",
  voicePromptSlug: "hook:v1", // stub
  metadataPromptSlug: "critic:v1", // stub
  steps: [
    { id: "script", enabled: true, dependsOn: [], retry: 2 },
    { id: "critic", enabled: true, dependsOn: ["script"], approvalRequired: false },
    { id: "scene", enabled: true, dependsOn: ["script"] },
    { id: "voice", enabled: true, dependsOn: ["scene"] },
    { id: "image", enabled: true, dependsOn: ["scene"], timeout: 30000 },
    { id: "render", enabled: true, dependsOn: ["voice", "image"] },
    { id: "upload", enabled: true, dependsOn: ["render"] },
    { id: "publish", enabled: true, dependsOn: ["upload"] }
  ]
});
