import { 
  TemplateDefinition, 
  TemplateDefinitionSchema, 
  ContentCategory, 
  CapabilityStatus, 
  ShotRecipeContract, 
  ShotRecipeId 
} from '../schemas/TemplateSchema';
import { CANONICAL_TEMPLATES } from '../definitions/CanonicalTemplates';
import { SHOT_RECIPES } from '../shots/ShotRecipeLibrary';

export interface TemplateFilterOptions {
  category?: ContentCategory;
  capabilityStatus?: CapabilityStatus;
  search?: string;
  tag?: string;
  isSystem?: boolean;
}

export class TemplateRegistry {
  private static instance: TemplateRegistry | null = null;
  private templates: Map<string, TemplateDefinition> = new Map();
  private shotRecipes: Map<ShotRecipeId, ShotRecipeContract> = new Map();

  private constructor() {
    this.initializeShotRecipes();
    this.initializeCanonicalTemplates();
  }

  public static getInstance(): TemplateRegistry {
    if (!TemplateRegistry.instance) {
      TemplateRegistry.instance = new TemplateRegistry();
    }
    return TemplateRegistry.instance;
  }

  private initializeShotRecipes(): void {
    for (const [key, recipe] of Object.entries(SHOT_RECIPES)) {
      this.shotRecipes.set(key as ShotRecipeId, recipe);
    }
  }

  private initializeCanonicalTemplates(): void {
    for (const template of CANONICAL_TEMPLATES) {
      this.registerTemplate(template);
    }
  }

  /**
   * Register or update a template definition. Enforces validation.
   */
  public registerTemplate(template: TemplateDefinition): { success: boolean; error?: string } {
    const parseResult = TemplateDefinitionSchema.safeParse(template);
    if (!parseResult.success) {
      return {
        success: false,
        error: `Template validation failed: ${parseResult.error.message}`
      };
    }

    const key = `${template.identity.id}@${template.identity.version}`;
    this.templates.set(key, parseResult.data);
    // Also index without version to point to latest registered version
    this.templates.set(template.identity.id, parseResult.data);
    return { success: true };
  }

  /**
   * Retrieve template by ID and optional version
   */
  public getTemplate(id: string, version?: string): TemplateDefinition | undefined {
    if (version) {
      return this.templates.get(`${id}@${version}`);
    }
    return this.templates.get(id);
  }

  /**
   * Retrieve shot recipe by ID
   */
  public getShotRecipe(id: ShotRecipeId): ShotRecipeContract | undefined {
    return this.shotRecipes.get(id);
  }

  /**
   * List all available shot recipes
   */
  public listShotRecipes(): ShotRecipeContract[] {
    return Array.from(this.shotRecipes.values());
  }

  /**
   * List templates with flexible filtering
   */
  public listTemplates(filter?: TemplateFilterOptions): TemplateDefinition[] {
    // Unique templates by id@version
    const seen = new Set<string>();
    const results: TemplateDefinition[] = [];

    for (const [key, tpl] of this.templates.entries()) {
      if (!key.includes('@')) continue; // Skip unversioned aliases
      if (seen.has(key)) continue;
      seen.add(key);

      if (filter) {
        if (filter.category && tpl.category !== filter.category) continue;
        if (filter.capabilityStatus && tpl.capabilityStatus !== filter.capabilityStatus) continue;
        if (filter.isSystem !== undefined && tpl.identity.isSystem !== filter.isSystem) continue;
        if (filter.tag && !tpl.tags.includes(filter.tag)) continue;
        if (filter.search) {
          const s = filter.search.toLowerCase();
          const matchName = tpl.identity.name.toLowerCase().includes(s);
          const matchDesc = tpl.description.toLowerCase().includes(s);
          const matchFormat = tpl.formatFamily.toLowerCase().includes(s);
          const matchCategory = tpl.category.toLowerCase().includes(s);
          if (!matchName && !matchDesc && !matchFormat && !matchCategory) continue;
        }
      }

      results.push(tpl);
    }

    return results;
  }

  /**
   * Migrate a legacy prompt-only template into a valid TemplateDefinition
   */
  public migrateLegacyTemplate(legacy: {
    id: string;
    name: string;
    description?: string;
    category?: string;
    promptSeed?: string;
    version?: string;
  }): TemplateDefinition {
    const rawCategory = (legacy.category || 'CUSTOM').toUpperCase();
    const validCategory: ContentCategory = [
      'FACTS', 'HISTORY', 'MOTIVATION', 'REDDIT', 'NEWS', 'CODING',
      'PSYCHOLOGY', 'STORY', 'GUESS_FLAG', 'GUESS_LOGO', 'QUANTUM_TRIVIA', 'QUIZ'
    ].includes(rawCategory) ? (rawCategory as ContentCategory) : 'CUSTOM';

    return {
      identity: {
        id: `migrated.${legacy.id}`,
        version: legacy.version || '1.0.0',
        name: legacy.name || 'Migrated Custom Template',
        slug: legacy.id.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        author: 'Migrated from Legacy',
        isSystem: false
      },
      category: validCategory,
      formatFamily: 'Standard Informative',
      description: legacy.description || 'Migrated legacy template structure',
      tags: ['migrated', validCategory.toLowerCase()],
      storyStructure: [
        { stepName: 'Hook', purpose: 'Capture viewer interest', shotRecipeId: 'KINETIC_HOOK', recommendedDurationSeconds: 2.5 },
        { stepName: 'Main Content', purpose: 'Core narrative or fact delivery', shotRecipeId: 'IMAGE_WITH_CAPTION', recommendedDurationSeconds: 6.0 },
        { stepName: 'Outro', purpose: 'Call to action', shotRecipeId: 'OUTRO_CTA', recommendedDurationSeconds: 2.5 }
      ],
      inputContract: {
        variables: [
          { name: 'topic', type: 'string', label: 'Topic', required: true, description: 'Core subject' }
        ],
        promptSeed: legacy.promptSeed
      },
      visualPolicy: {
        colorPalette: ['#0F172A', '#1E293B', '#38BDF8', '#F8FAFC'],
        typography: { headerFont: 'Inter-Bold', bodyFont: 'Inter-Regular', accentColor: '#38BDF8' },
        motionIntensity: 'MEDIUM'
      },
      captionPolicy: {
        style: 'TiktokBouncy',
        defaultPosition: 'LOWER_THIRD',
        maxWordsPerLine: 4,
        highlightColor: '#FDE047'
      },
      voicePolicy: {
        paceMultiplier: 1.05,
        tone: 'clear and conversational',
        suggestedVoices: ['en-US-Neural2-F']
      },
      outputPolicy: {
        width: 1080,
        height: 1920,
        fps: 30,
        targetDurationRange: [30, 60]
      },
      capabilityStatus: 'BETA',
      statusReason: 'Migrated from legacy prompt-only definition; awaiting pipeline qualification.'
    };
  }
}
