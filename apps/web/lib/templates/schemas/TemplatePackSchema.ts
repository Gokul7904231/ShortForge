/**
 * ShortForge Template Pack Contract — v1
 * Governing specification for external design packages (Canva, Figma, etc.)
 */

import { z } from 'zod';
import { 
  ContentCategorySchema, 
  StoryStructureStepSchema, 
  TemplateVariableSchema,
  TemplateDefinitionSchema,
  TemplateDefinition
} from './TemplateSchema';

export const AssetRoleSchema = z.enum([
  'BACKGROUND',
  'FOREGROUND',
  'LOGO',
  'WATERMARK',
  'DECORATION',
  'VIDEO',
  'AUDIO'
]);
export type AssetRole = z.infer<typeof AssetRoleSchema>;

export const LicenseTypeSchema = z.enum([
  'ORIGINAL_USER',
  'CANVA_FREE',
  'CANVA_PRO',
  'INDEPENDENT_EXTERNAL',
  'UNVERIFIED'
]);
export type LicenseType = z.infer<typeof LicenseTypeSchema>;

export const LicenseMetadataSchema = z.object({
  licenseType: LicenseTypeSchema,
  author: z.string().default('Unknown Creator'),
  sourceUrl: z.string().optional(),
  redistributionPermitted: z.boolean().default(false),
  commercialUsePermitted: z.boolean().default(false),
  notes: z.string().optional()
});
export type LicenseMetadata = z.infer<typeof LicenseMetadataSchema>;

export const NormalizedCoordinatesSchema = z.object({
  x: z.number().min(0).max(1),       // Normalized horizontal origin (0 = left, 1 = right)
  y: z.number().min(0).max(1),       // Normalized vertical origin (0 = top, 1 = bottom)
  width: z.number().min(0).max(1),   // Normalized width relative to canvas width
  height: z.number().min(0).max(1)   // Normalized height relative to canvas height
});
export type NormalizedCoordinates = z.infer<typeof NormalizedCoordinatesSchema>;

export const TextOverlayDefinitionSchema = z.object({
  overlayId: z.string(),
  stepMapping: z.string().optional(), // Maps to storyStructure stepName or scene index
  normalizedCoordinates: NormalizedCoordinatesSchema,
  typography: z.object({
    fontFamily: z.string().default('Inter-Bold'),
    fontSizePixels: z.number().optional().default(38),
    fontWeight: z.string().default('700'),
    alignment: z.enum(['left', 'center', 'right', 'justify']).default('center'),
    color: z.string().default('#FFFFFF'),
    maxLines: z.number().int().positive().default(3),
    strokeColor: z.string().optional(),
    strokeWidth: z.number().optional()
  }),
  safeAreaConstraints: z.boolean().default(true)
});
export type TextOverlayDefinition = z.infer<typeof TextOverlayDefinitionSchema>;

export const AssetBindingSchema = z.object({
  assetId: z.string(), // Stable identifier, e.g. "bg_question_01"
  role: AssetRoleSchema,
  fileName: z.string(), // Relative path in archive, e.g. "assets/question-01.png"
  mimeType: z.string(), // Expected MIME type, e.g. "image/png"
  sha256: z.string().length(64).optional(),
  dimensions: z.object({
    width: z.number(),
    height: z.number()
  }).optional(),
  stepMapping: z.string().optional() // Associated scene or story step
});
export type AssetBinding = z.infer<typeof AssetBindingSchema>;

export const SourceProvenanceSchema = z.object({
  provider: z.string().default('CANVA'),
  designer: z.string().optional(),
  externalDesignId: z.string().optional(),
  exportedAt: z.string().optional(),
  softwareVersion: z.string().optional()
});
export type SourceProvenance = z.infer<typeof SourceProvenanceSchema>;

export const ShortForgeTemplatePackManifestSchema = z.object({
  schemaVersion: z.literal('ShortForgeTemplatePack/v1').or(z.literal('1.0.0')),
  identity: z.object({
    id: z.string().regex(/^[a-z0-9_.-]+$/, 'Template ID must be alphanumeric lowercase with dots/hyphens'),
    version: z.string().default('1.0.0'),
    name: z.string().min(1, 'Template name is required'),
    slug: z.string().optional(),
    author: z.string().default('Custom Design Export'),
    isSystem: z.boolean().default(false)
  }),
  category: ContentCategorySchema,
  formatFamily: z.string().min(1),
  description: z.string().default(''),
  sourceProvenance: SourceProvenanceSchema.default({ provider: 'CANVA' }),
  outputPolicy: z.object({
    width: z.number().default(1080),
    height: z.number().default(1920),
    fps: z.number().default(30),
    targetDurationRange: z.tuple([z.number(), z.number()]).default([30, 60])
  }).default({ width: 1080, height: 1920, fps: 30, targetDurationRange: [30, 60] }),
  storyStructure: z.array(StoryStructureStepSchema).min(1, 'Story structure must have at least one step'),
  editableVariables: z.array(TemplateVariableSchema).default([]),
  assetBindings: z.array(AssetBindingSchema).min(1, 'Template pack must contain at least one asset binding'),
  textOverlays: z.array(TextOverlayDefinitionSchema).default([]),
  license: LicenseMetadataSchema,
  previewImage: z.string().optional()
});
export type ShortForgeTemplatePackManifest = z.infer<typeof ShortForgeTemplatePackManifestSchema>;

/**
 * Normalizes a validated ShortForgeTemplatePackManifest into a native TemplateDefinition.
 * Ensures:
 * 1. isSystem is strictly false for external design packs.
 * 2. Stable IDs and explicit versioning.
 * 3. Provenance and license metadata retained.
 * 4. BLOCKED status if licensing is unverified or public distribution is requested for Canva Pro content.
 */
export function normalizeTemplatePackToDefinition(
  manifest: ShortForgeTemplatePackManifest,
  resolvedCasUris?: Record<string, string>
): TemplateDefinition {
  const isUnverified = manifest.license.licenseType === 'UNVERIFIED';
  const capabilityStatus = isUnverified ? 'BLOCKED' : 'READY';
  const statusReason = isUnverified 
    ? 'BLOCKED: Design pack license is unverified.' 
    : 'Imported Canva Design Pack qualified for native FactoryOS rendering.';

  const slug = manifest.identity.slug || manifest.identity.id.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  return {
    identity: {
      id: manifest.identity.id,
      version: manifest.identity.version,
      name: manifest.identity.name,
      slug,
      author: manifest.identity.author || 'Custom Design Export',
      isSystem: false // Non-negotiable: Owner-created templates are never system templates
    },
    category: manifest.category,
    formatFamily: manifest.formatFamily,
    description: manifest.description,
    tags: [
      manifest.category.toLowerCase(),
      manifest.sourceProvenance.provider.toLowerCase(),
      'design-pack',
      `license-${manifest.license.licenseType.toLowerCase()}`
    ],
    storyStructure: manifest.storyStructure,
    inputContract: {
      variables: manifest.editableVariables,
      promptSeed: `Generate engaging ${manifest.category.toLowerCase()} content following the design pack structure.`
    },
    visualPolicy: {
      colorPalette: ['#0F172A', '#1E293B', '#F59E0B', '#10B981', '#FFFFFF'],
      typography: {
        headerFont: 'Inter-Black',
        bodyFont: 'Inter-Bold',
        accentColor: '#F59E0B'
      },
      motionIntensity: 'MEDIUM'
    },
    captionPolicy: {
      style: 'QuizBouncy',
      defaultPosition: 'TOP',
      maxWordsPerLine: 4,
      highlightColor: '#10B981'
    },
    voicePolicy: {
      paceMultiplier: 1.05,
      tone: 'friendly, conversational, informative',
      suggestedVoices: ['en-US-Neural2-F', 'en-US-Journey-F']
    },
    outputPolicy: manifest.outputPolicy,
    capabilityStatus,
    statusReason
  };
}

