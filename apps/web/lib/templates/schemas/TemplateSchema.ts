import { z } from 'zod';

export const ContentCategorySchema = z.enum([
  'FACTS',
  'HISTORY',
  'MOTIVATION',
  'REDDIT',
  'NEWS',
  'CODING',
  'PSYCHOLOGY',
  'STORY',
  'GUESS_FLAG',
  'GUESS_LOGO',
  'QUANTUM_TRIVIA',
  'QUIZ',
  'CUSTOM'
]);
export type ContentCategory = z.infer<typeof ContentCategorySchema>;

export const CapabilityStatusSchema = z.enum([
  'READY',      // Real complete path passes (script -> scene -> assets -> voice -> timeline -> render -> F7)
  'DEGRADED',   // Fallback works but preferred high-fidelity provider/asset is missing
  'BETA',       // Functional pipeline undergoing qualification
  'BLOCKED'     // Cannot execute or required resources missing
]);
export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;

export const ProviderTypeSchema = z.enum([
  'IMAGE',
  'VIDEO',
  'SEARCH',
  'RESEARCH',
  'NEWS',
  'REDDIT',
  'LOGO',
  'FLAG',
  'CODE',
  'CAPTION',
  'CHART',
  'AUDIO',
  'MUSIC'
]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const ShotRecipeIdSchema = z.enum([
  'KINETIC_HOOK',
  'BIG_NUMBER',
  'IMAGE_WITH_CAPTION',
  'FULL_BLEED_IMAGE',
  'FULL_BLEED_BROLL',
  'QUOTE_CARD',
  'STAT',
  'CODE_REVEAL',
  'TERMINAL_SCREEN',
  'MAP_ZOOM',
  'TIMELINE_BUILD',
  'HEADLINE_CARD',
  'SOURCE_CARD',
  'REDDIT_POST',
  'REDDIT_COMMENT',
  'QUESTION_CARD',
  'ANSWER_REVEAL',
  'COUNTDOWN',
  'FLAG_REVEAL',
  'LOGO_REVEAL',
  'PROGRESSIVE_CLUE',
  'CHART',
  'AUDIO_WAVEFORM',
  'OUTRO_CTA'
]);
export type ShotRecipeId = z.infer<typeof ShotRecipeIdSchema>;

export const SafeArea916Schema = z.object({
  top: z.number().default(160),     // Avoid header / status bar / creator handle
  bottom: z.number().default(320),  // Avoid caption bar / TikTok/YT shorts engagement UI
  left: z.number().default(60),
  right: z.number().default(120)    // Avoid like/share/comment right rails
});
export type SafeArea916 = z.infer<typeof SafeArea916Schema>;

export const AssetRequirementSchema = z.object({
  role: z.string(),
  type: ProviderTypeSchema,
  optional: z.boolean().default(false),
  queryTemplate: z.string().optional(),
  semanticFallback: z.string().optional(),
  expectedFormat: z.string().optional() // 'image/png', 'video/mp4', 'code/snippet', etc.
});
export type AssetRequirement = z.infer<typeof AssetRequirementSchema>;

export const ShotRecipeContractSchema = z.object({
  id: ShotRecipeIdSchema,
  version: z.string().default('1.0.0'),
  name: z.string(),
  description: z.string(),
  inputContract: z.record(z.string(), z.any()),
  durationPolicy: z.object({
    minDuration: z.number().default(1.0),
    maxDuration: z.number().default(10.0),
    defaultDuration: z.number().default(3.0),
    syncToAudio: z.boolean().default(true)
  }),
  layout: z.object({
    safeArea: SafeArea916Schema.default({ top: 160, bottom: 320, left: 60, right: 120 }),
    aspect: z.literal('9:16').default('9:16'),
    zIndex: z.number().default(0),
    splitScreen: z.boolean().optional()
  }),
  motion: z.object({
    enterTransition: z.string().optional(),
    exitTransition: z.string().optional(),
    textAnimation: z.string().optional(),
    cameraMotion: z.string().optional()
  }).default({}),
  visualStyle: z.object({
    motionPreset: z.string().optional(),
    overlayType: z.string().optional(),
    colorTreatment: z.string().optional(),
    enterTransition: z.string().optional(),
    exitTransition: z.string().optional(),
    textAnimation: z.string().optional(),
    cameraMotion: z.string().optional()
  }).optional(),
  assetRequirements: z.array(AssetRequirementSchema).default([]),
  captionBehavior: z.object({
    mode: z.enum(['WORD_HIGHLIGHT', 'GROUPED', 'MINIMAL', 'HIDDEN']).default('WORD_HIGHLIGHT'),
    position: z.enum(['CENTER', 'LOWER_THIRD', 'TOP']).default('LOWER_THIRD')
  }).default({ mode: 'WORD_HIGHLIGHT', position: 'LOWER_THIRD' }),
  fallbackRecipeId: ShotRecipeIdSchema.optional()
});
export type ShotRecipeContract = z.infer<typeof ShotRecipeContractSchema>;

export const StoryStructureStepSchema = z.object({
  stepName: z.string(),
  purpose: z.string(),
  shotRecipeId: ShotRecipeIdSchema,
  recommendedDurationSeconds: z.number(),
  optional: z.boolean().optional()
});
export type StoryStructureStep = z.infer<typeof StoryStructureStepSchema>;

export const TemplateVariableSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'select']),
  label: z.string(),
  required: z.boolean().default(true),
  default: z.any().optional(),
  options: z.array(z.string()).optional(),
  description: z.string()
});
export type TemplateVariable = z.infer<typeof TemplateVariableSchema>;

export const TemplateDefinitionSchema = z.object({
  identity: z.object({
    id: z.string(), // e.g. "facts.rapid-facts.v1"
    version: z.string().default('1.0.0'),
    name: z.string(),
    slug: z.string(),
    author: z.string().default('FactoryOS Canonical'),
    isSystem: z.boolean().default(true)
  }),
  category: ContentCategorySchema,
  formatFamily: z.string(), // e.g. "Rapid Fire Facts", "Timeline Documentary"
  description: z.string(),
  tags: z.array(z.string()).default([]),
  storyStructure: z.array(StoryStructureStepSchema),
  inputContract: z.object({
    variables: z.array(TemplateVariableSchema).default([]),
    promptSeed: z.string().optional()
  }),
  visualPolicy: z.object({
    colorPalette: z.array(z.string()).default(['#0F172A', '#1E293B', '#38BDF8', '#F8FAFC']),
    typography: z.object({
      headerFont: z.string().default('Inter-Bold'),
      bodyFont: z.string().default('Inter-Regular'),
      accentColor: z.string().default('#38BDF8')
    }),
    motionIntensity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM')
  }),
  captionPolicy: z.object({
    style: z.string().default('TiktokBouncy'),
    defaultPosition: z.enum(['CENTER', 'LOWER_THIRD', 'TOP']).default('LOWER_THIRD'),
    maxWordsPerLine: z.number().default(4),
    highlightColor: z.string().default('#FDE047')
  }),
  voicePolicy: z.object({
    paceMultiplier: z.number().default(1.05),
    tone: z.string().default('authoritative and energetic'),
    suggestedVoices: z.array(z.string()).default(['en-US-Neural2-F', 'en-US-Journey-O'])
  }),
  outputPolicy: z.object({
    width: z.number().default(1080),
    height: z.number().default(1920),
    fps: z.number().default(30),
    targetDurationRange: z.tuple([z.number(), z.number()]).default([30, 58])
  }),
  capabilityStatus: CapabilityStatusSchema.default('BETA'),
  statusReason: z.string().optional()
});
export type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;
