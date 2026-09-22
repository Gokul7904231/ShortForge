/**
 * FactoryOS V3 Phase 4 — Canonical Template Production Pipeline
 *
 * Implements deterministic end-to-end execution:
 * TEMPLATE -> F2 SCRIPT -> F3 VISUAL/ASSETS -> F4 VOICE -> F5 TIMELINE -> RenderIntent -> F6 LOCAL RENDER -> factoryos-render -> physical MP4 -> F7
 *
 * Guaranteed invariants:
 * 1. Template identity survives entire mission
 * 2. Template-specific validation with localized failure isolation
 * 3. Shot recipe resolution through ShotRecipeLibrary
 * 4. Provenance-tracked asset realization via ProviderRouter
 * 5. Audio-first duration synchronization (physical duration truth)
 * 6. Native 9:16 rendering via LocalRenderAdapter & factoryos-render
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import * as crypto from 'node:crypto';
import { TemplateDefinition, ContentCategory } from '../../../lib/templates/schemas/TemplateSchema';
import { SHOT_RECIPES } from '../../../lib/templates/shots/ShotRecipeLibrary';
import { ProviderRouter } from '../../../lib/templates/providers/ProviderRouter';
import {
  LocalRenderAdapter,
  LocalRenderIntent,
  LocalRenderSceneIntent,
  LocalRenderShotIntent,
  RenderReceipt
} from '../render/LocalRenderAdapter';

export interface TemplateScriptBeat {
  beatId: string;
  type: string;
  narration: string;
  visualIntent: string;
  emphasis?: string;
  shotRecipeId: string;
  durationSeconds?: number;
  props?: Record<string, any>;
}

export interface NarrationSegment {
  segmentId: string;
  beatId: string;
  text: string;
  estimatedSeconds: number;
}

export interface TemplateScriptIR {
  templateId: string;
  templateVersion: string;
  contentEngine: string;
  formatFamily: string;
  title: string;
  hook: string;
  beats: TemplateScriptBeat[];
  cta?: string;
  estimatedDuration: number;
  narrationSegments: NarrationSegment[];
  metadata: Record<string, any>;
}

export interface TemplateScriptValidationResult {
  valid: boolean;
  code?: 'TEMPLATE_SCRIPT_INVALID' | 'TEMPLATE_NOT_FOUND' | 'SCHEMA_INVALID';
  errors: string[];
}

export interface ScenePlan {
  sceneId: string;
  beatId: string;
  narration: string;
  visualIntent: string;
  shotRecipeId: string;
  assetRequirements: any[];
  resolvedAssets: any[];
  captionIntent: {
    text: string;
    style?: string;
    position?: string;
    highlightWord?: string;
  };
  durationIntent: {
    min: number;
    max: number;
    target: number;
  };
  transitionIntent: {
    enter?: string;
    exit?: string;
  };
  emphasis?: string;
  props: Record<string, any>;
}

export interface ScenePlanValidationResult {
  valid: boolean;
  code?: 'SCENE_PLAN_INVALID';
  errors: string[];
}

export class TemplateProductionPipeline {
  private static instance: TemplateProductionPipeline | null = null;
  private providerRouter: ProviderRouter;

  public constructor() {
    this.providerRouter = ProviderRouter.getInstance();
  }

  public static getInstance(): TemplateProductionPipeline {
    if (!TemplateProductionPipeline.instance) {
      TemplateProductionPipeline.instance = new TemplateProductionPipeline();
    }
    return TemplateProductionPipeline.instance;
  }

  /**
   * FLOOR 02: Deterministic Script Generation from TemplateDefinition
   */
  public async generateTemplateScript(params: {
    templateDef: TemplateDefinition;
    topic: string;
    userInputs?: Record<string, any>;
  }): Promise<TemplateScriptIR> {
    const { templateDef, topic, userInputs = {} } = params;
    const templateId = templateDef.identity.id;
    const beats: TemplateScriptBeat[] = [];
    const narrationSegments: NarrationSegment[] = [];
    let title = `${templateDef.identity.name}: ${topic}`;
    let hook = `Did you know this about ${topic}?`;
    let cta = 'Follow for daily breakdowns.';

    if (templateId === 'facts.rapid-facts.v1') {
      title = `Top 3 Mind-Blowing Facts: ${topic}`;
      hook = `The reality of ${topic} defies everything you were taught.`;
      cta = 'Which fact stunned you most? Comment below.';

      beats.push({
        beatId: 'beat_01_hook',
        type: 'HOOK',
        narration: hook,
        visualIntent: 'Kinetic typography with neon highlight and energetic zoom',
        emphasis: 'HIGH',
        shotRecipeId: 'KINETIC_HOOK',
        durationSeconds: 2.5,
        props: { headline: topic, subtitle: hook, highlightWord: 'REALITY', tag: 'RAPID FACTS' }
      });

      beats.push({
        beatId: 'beat_02_fact1',
        type: 'FACT',
        narration: `First: In ${topic}, extreme conditions produce reactions that occur in less than a microsecond.`,
        visualIntent: 'Framed primary imagery showcasing reaction dynamics',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 3.5,
        props: { caption: 'Microsecond reaction dynamics', headline: 'FACT #1' }
      });

      beats.push({
        beatId: 'beat_03_stat',
        type: 'STAT',
        narration: 'Over 84 percent of observed phenomena cannot be replicated under standard atmospheric pressure.',
        visualIntent: 'Massive numerical stat highlight',
        emphasis: 'PUNCH',
        shotRecipeId: 'BIG_NUMBER',
        durationSeconds: 2.5,
        props: { number: '84%', label: 'NON-REPLICABLE UNDER 1 ATM', headline: 'KEY METRIC' }
      });

      beats.push({
        beatId: 'beat_04_fact2',
        type: 'FACT',
        narration: `Second: Researchers discovered that ${topic} stores energy ten times denser than lithium systems.`,
        visualIntent: 'Visual comparison card with high density energy illustration',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 3.5,
        props: { caption: '10x energy density discovery', headline: 'FACT #2' }
      });

      beats.push({
        beatId: 'beat_05_comp_stat',
        type: 'STAT',
        narration: 'This represents a 10x breakthrough over conventional thermodynamic benchmarks.',
        visualIntent: 'Comparative statistical scale card',
        shotRecipeId: 'STAT',
        durationSeconds: 2.5,
        props: { value: '10X', headline: 'THERMODYNAMIC GAIN' }
      });

      beats.push({
        beatId: 'beat_06_climax',
        type: 'CLIMAX',
        narration: `The ultimate takeaway? Mastering ${topic} may completely revolutionize modern astrophysics.`,
        visualIntent: 'Full bleed high impact payoff visual',
        shotRecipeId: 'FULL_BLEED_IMAGE',
        durationSeconds: 3.5,
        props: { caption: 'Astrophysics Revolution', headline: 'FINAL VERDICT' }
      });

      beats.push({
        beatId: 'beat_07_cta',
        type: 'CTA',
        narration: cta,
        visualIntent: 'Outro call to action engagement loop',
        shotRecipeId: 'OUTRO_CTA',
        durationSeconds: 2.5,
        props: { cta: 'DROP YOUR THOUGHTS', subtitle: cta }
      });
    } else if (templateId === 'history.timeline.v1') {
      const year = userInputs.keyYear || '1453';
      title = `${topic}: The Decisive Chronology (${year})`;
      hook = `What truly happened during ${topic} in ${year}?`;
      cta = 'Subscribe to uncover more forgotten historical turning points.';

      beats.push({
        beatId: 'beat_01_hook',
        type: 'HOOK',
        narration: hook,
        visualIntent: 'Dramatic historical question with gold ornate typography',
        shotRecipeId: 'KINETIC_HOOK',
        durationSeconds: 3.0,
        props: { headline: topic, subtitle: hook, highlightWord: year, tag: `YEAR ${year}` }
      });

      beats.push({
        beatId: 'beat_02_milestone1',
        type: 'MILESTONE',
        narration: `By early spring, the imperial vanguard assembled along the perimeter walls, shifting the geopolitical balance forever.`,
        visualIntent: 'Chronological timeline card with milestone date badge',
        shotRecipeId: 'TIMELINE_BUILD',
        durationSeconds: 4.0,
        props: { year, event: 'The Vanguard Mobilization', description: 'Forces assemble along the historic frontier.' }
      });

      beats.push({
        beatId: 'beat_03_quote',
        type: 'QUOTE',
        narration: `Eyewitness chronicles recorded: "The earth itself seemed to tremble before the siege engines."`,
        visualIntent: 'Direct primary source quote card in aged serif script',
        shotRecipeId: 'QUOTE_CARD',
        durationSeconds: 3.5,
        props: { quote: 'The earth itself seemed to tremble before the siege engines.', author: 'Contemporary Chronicler' }
      });

      beats.push({
        beatId: 'beat_04_milestone2',
        type: 'MILESTONE',
        narration: `Within fifty-three days, the final breach collapsed the ancient defenses, closing an epoch spanning over a millennium.`,
        visualIntent: 'Milestone culmination badge',
        shotRecipeId: 'TIMELINE_BUILD',
        durationSeconds: 4.0,
        props: { year: 'DAY 53', event: 'The Final Breach', description: 'Defenses fall, concluding an empire.' }
      });

      beats.push({
        beatId: 'beat_05_legacy',
        type: 'LEGACY',
        narration: `The reverberations of ${topic} reshaped maritime trade routes and sparked the Renaissance.`,
        visualIntent: 'Historical legacy overview with archival illustration',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 3.5,
        props: { caption: 'Birth of Modern Maritime Trade', headline: 'HISTORICAL LEGACY' }
      });

      beats.push({
        beatId: 'beat_06_outro',
        type: 'CTA',
        narration: cta,
        visualIntent: 'Outro card with historical engraving',
        shotRecipeId: 'OUTRO_CTA',
        durationSeconds: 2.5,
        props: { cta: 'EXPLORE HISTORY', subtitle: cta }
      });
    } else if (templateId === 'motivation.story-to-lesson.v1') {
      const protagonist = userInputs.protagonist || 'A determined soul';
      title = `${topic}: The Price of Mastery`;
      hook = `Nobody talks about the quiet suffering behind real mastery in ${topic}.`;
      cta = 'Save this for the days you feel like giving up.';

      beats.push({
        beatId: 'beat_01_hook',
        type: 'HOOK',
        narration: hook,
        visualIntent: 'Stark monochrome hook card with brutal contrast',
        shotRecipeId: 'KINETIC_HOOK',
        durationSeconds: 3.0,
        props: { headline: topic, subtitle: hook, highlightWord: 'MASTERY', tag: 'HARD TRUTH' }
      });

      beats.push({
        beatId: 'beat_02_struggle',
        type: 'STRUGGLE',
        narration: `${protagonist} spent three relentless years in complete obscurity, failing repeatedly before any recognition arrived.`,
        visualIntent: 'Atmospheric low-key narrative visual card',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 4.0,
        props: { caption: 'Three years in complete obscurity', headline: 'THE STRUGGLE' }
      });

      beats.push({
        beatId: 'beat_03_rule',
        type: 'RULE',
        narration: 'The uncompromising rule: "You do not rise to the level of your goals. You fall to the level of your systems."',
        visualIntent: 'Monochrome quote card with crisp sans-serif typography',
        shotRecipeId: 'QUOTE_CARD',
        durationSeconds: 4.0,
        props: { quote: 'You do not rise to your goals. You fall to the level of your systems.', author: 'Law of Discipline' }
      });

      beats.push({
        beatId: 'beat_04_lesson',
        type: 'LESSON',
        narration: 'Consistency beats intensity every single time. One percent daily compound creates insurmountable distance.',
        visualIntent: 'High impact mathematical compounding stat card',
        shotRecipeId: 'STAT',
        durationSeconds: 3.5,
        props: { value: '1.01^365 = 37.8', headline: 'COMPOUND DISCIPLINE' }
      });

      beats.push({
        beatId: 'beat_05_cta',
        type: 'CTA',
        narration: cta,
        visualIntent: 'Minimalist outro pill card',
        shotRecipeId: 'OUTRO_CTA',
        durationSeconds: 2.5,
        props: { cta: 'STAY DISCIPLINED', subtitle: cta }
      });
    } else if (templateId === 'reddit.story.v1') {
      const subreddit = userInputs.subreddit || 'AmItheAsshole';
      const postTitle = userInputs.postTitle || `AITA for walking away from ${topic}?`;
      title = `r/${subreddit}: ${postTitle}`;
      hook = `AITA for walking away from ${topic} after what happened last night?`;
      cta = 'Who was in the wrong here? Let me know in the comments.';

      beats.push({
        beatId: 'beat_01_hook',
        type: 'REDDIT_POST',
        narration: `Posted on r/${subreddit}: ${postTitle}. Here is how it all unfolded.`,
        visualIntent: 'Pixel-perfect native Reddit post card with upvotes and flair',
        shotRecipeId: 'REDDIT_POST',
        durationSeconds: 3.5,
        props: { subreddit, author: 'Throwaway_9912', title: postTitle }
      });

      beats.push({
        beatId: 'beat_02_context',
        type: 'CONTEXT',
        narration: `Everything started six months ago when we agreed on clear boundaries regarding ${topic}.`,
        visualIntent: 'Narrative context card with subtle ambient tension',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 4.0,
        props: { caption: 'Six months of mounting tension', headline: 'BACKGROUND' }
      });

      beats.push({
        beatId: 'beat_03_escalation',
        type: 'ESCALATION',
        narration: 'Then yesterday, they completely breached our agreement in front of the entire gathering.',
        visualIntent: 'Dramatic tension visual card',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 3.5,
        props: { caption: 'The public confrontation', headline: 'THE BREAKING POINT' }
      });

      beats.push({
        beatId: 'beat_04_comment',
        type: 'COMMENT',
        narration: 'The top comment with 24,000 upvotes said: "NTA. You set a boundary and they deliberately violated it."',
        visualIntent: 'Reddit comment card with upvotes and Reddit orange accent',
        shotRecipeId: 'REDDIT_COMMENT',
        durationSeconds: 4.0,
        props: { author: 'LegalEagle_88', comment: 'NTA. You set a boundary and they deliberately violated it in public.', upvotes: '24.2k' }
      });

      beats.push({
        beatId: 'beat_05_cta',
        type: 'CTA',
        narration: cta,
        visualIntent: 'Community poll outro card',
        shotRecipeId: 'OUTRO_CTA',
        durationSeconds: 2.5,
        props: { cta: 'WHAT WOULD YOU DO?', subtitle: cta }
      });
    } else if (templateId === 'news.why-it-matters.v1') {
      const source = userInputs.source || 'Reuters';
      const headline = userInputs.headline || `Major New Directive Issued on ${topic}`;
      title = `Why It Matters: ${headline}`;
      hook = `Breaking news from ${source}: ${headline}. Here is why this directly impacts you.`;
      cta = 'Follow for objective, evidence-grounded news analysis.';

      beats.push({
        beatId: 'beat_01_hook',
        type: 'HEADLINE',
        narration: hook,
        visualIntent: 'Authoritative breaking news card with red banner and source tag',
        shotRecipeId: 'HEADLINE_CARD',
        durationSeconds: 3.5,
        props: { headline, source }
      });

      beats.push({
        beatId: 'beat_02_source',
        type: 'SOURCE',
        narration: `According to verified regulatory filings cited by ${source}, enforcement begins immediately.`,
        visualIntent: 'Verified evidence card with regulatory citation',
        shotRecipeId: 'SOURCE_CARD',
        durationSeconds: 3.5,
        props: { source, claim: 'Official regulatory directive published and ratified.' }
      });

      beats.push({
        beatId: 'beat_03_impact',
        type: 'IMPACT',
        narration: 'Financial analysts project a 42 percent shift in global supply chains within the next 90 days.',
        visualIntent: 'Data stat card with blue analytical highlight',
        shotRecipeId: 'STAT',
        durationSeconds: 3.0,
        props: { value: '42% SHIFT', headline: 'SUPPLY CHAIN REALIGNMENT' }
      });

      beats.push({
        beatId: 'beat_04_why',
        type: 'WHY_IT_MATTERS',
        narration: 'Why does this matter to your wallet? Expect immediate price adjustments across consumer tech and logistics.',
        visualIntent: 'Practical consequence card',
        shotRecipeId: 'QUOTE_CARD',
        durationSeconds: 4.0,
        props: { quote: 'Expect immediate pricing adjustments across key consumer categories.', author: 'Economic Impact Assessment' }
      });

      beats.push({
        beatId: 'beat_05_cta',
        type: 'CTA',
        narration: cta,
        visualIntent: 'Journalistic outro discussion card',
        shotRecipeId: 'OUTRO_CTA',
        durationSeconds: 2.5,
        props: { cta: 'STAY INFORMED', subtitle: cta }
      });
    } else {
      // General Template Script Generator
      title = `${templateDef.identity.name}: ${topic}`;
      hook = `Here is what you need to understand about ${topic}.`;
      cta = 'Follow for more insightful deep dives.';

      for (let i = 0; i < templateDef.storyStructure.length; i++) {
        const step = templateDef.storyStructure[i];
        const dur = step.recommendedDurationSeconds || 3.5;
        beats.push({
          beatId: `beat_${i + 1}_${step.stepName.toLowerCase().replace(/\s+/g, '_')}`,
          type: step.stepName.toUpperCase(),
          narration: `${step.stepName}: Exploring ${topic} with focus on ${step.purpose}.`,
          visualIntent: `Composition for ${step.stepName}`,
          shotRecipeId: step.shotRecipeId || 'IMAGE_WITH_CAPTION',
          durationSeconds: dur,
          props: { caption: `${step.stepName}: ${topic}`, headline: step.stepName }
        });
      }
    }

    // Assemble narration segments
    let totalEstSeconds = 0;
    for (const b of beats) {
      const dur = b.durationSeconds || 3.0;
      narrationSegments.push({
        segmentId: `seg_${b.beatId}`,
        beatId: b.beatId,
        text: b.narration,
        estimatedSeconds: dur
      });
      totalEstSeconds += dur;
    }

    return {
      templateId: templateDef.identity.id,
      templateVersion: templateDef.identity.version,
      contentEngine: templateDef.category,
      formatFamily: templateDef.formatFamily,
      title,
      hook,
      beats,
      cta,
      estimatedDuration: Number(totalEstSeconds.toFixed(1)),
      narrationSegments,
      metadata: {
        topic,
        userInputs,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Template-Specific Script Validation
   */
  public validateTemplateScript(
    templateDef: TemplateDefinition,
    scriptIR: TemplateScriptIR
  ): TemplateScriptValidationResult {
    const errors: string[] = [];

    if (!scriptIR.templateId || scriptIR.templateId !== templateDef.identity.id) {
      errors.push(`Script templateId "${scriptIR.templateId}" does not match definition "${templateDef.identity.id}"`);
    }

    if (!scriptIR.hook || scriptIR.hook.trim().length === 0) {
      errors.push('Script missing required hook');
    }

    if (!Array.isArray(scriptIR.beats) || scriptIR.beats.length === 0) {
      errors.push('Script must contain at least one beat');
      return { valid: false, code: 'TEMPLATE_SCRIPT_INVALID', errors };
    }

    // Engine-specific validations
    const category = templateDef.category;
    if (category === 'FACTS') {
      const factBeats = scriptIR.beats.filter((b) => b.type === 'FACT' || b.type === 'CLIMAX');
      if (factBeats.length < 2) {
        errors.push(`FACTS template requires at least 2 distinct fact beats, found ${factBeats.length}`);
      }
      const statBeats = scriptIR.beats.filter((b) => b.type === 'STAT');
      if (statBeats.length < 1) {
        errors.push('FACTS template requires at least 1 statistical highlight beat');
      }
    } else if (category === 'HISTORY') {
      const milestoneBeats = scriptIR.beats.filter((b) => b.type === 'MILESTONE');
      if (milestoneBeats.length < 1) {
        errors.push('HISTORY template requires at least one verified chronological milestone');
      }
      const hasSourceOrQuote = scriptIR.beats.some((b) => b.type === 'QUOTE' || b.type === 'LEGACY');
      if (!hasSourceOrQuote) {
        errors.push('HISTORY template requires at least one quotation or legacy archival beat');
      }
    } else if (category === 'MOTIVATION') {
      const hasStruggle = scriptIR.beats.some((b) => b.type === 'STRUGGLE');
      const hasRule = scriptIR.beats.some((b) => b.type === 'RULE' || b.type === 'LESSON');
      if (!hasStruggle) {
        errors.push('MOTIVATION template requires a struggle/adversity beat');
      }
      if (!hasRule) {
        errors.push('MOTIVATION template requires a core rule or actionable lesson');
      }
    } else if (category === 'REDDIT') {
      const hasPost = scriptIR.beats.some((b) => b.shotRecipeId === 'REDDIT_POST');
      if (!hasPost) {
        errors.push('REDDIT template requires a native REDDIT_POST hook beat');
      }
      const hasComment = scriptIR.beats.some((b) => b.shotRecipeId === 'REDDIT_COMMENT' || b.type === 'COMMENT');
      if (!hasComment) {
        errors.push('REDDIT template requires a community comment reaction beat');
      }
    } else if (category === 'NEWS') {
      const hasHeadline = scriptIR.beats.some((b) => b.shotRecipeId === 'HEADLINE_CARD');
      const hasSource = scriptIR.beats.some((b) => b.shotRecipeId === 'SOURCE_CARD');
      if (!hasHeadline) {
        errors.push('NEWS template requires an authoritative HEADLINE_CARD beat');
      }
      if (!hasSource) {
        errors.push('NEWS template requires a verified SOURCE_CARD citation beat');
      }
    }

    if (errors.length > 0) {
      return { valid: false, code: 'TEMPLATE_SCRIPT_INVALID', errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * FLOOR 03: Visual Planning & Shot Recipe Mapping
   */
  public async planScenes(
    templateDef: TemplateDefinition,
    scriptIR: TemplateScriptIR
  ): Promise<ScenePlan[]> {
    const scenes: ScenePlan[] = [];

    for (let i = 0; i < scriptIR.beats.length; i++) {
      const beat = scriptIR.beats[i];
      const sceneId = `scene_${String(i + 1).padStart(2, '0')}_${beat.beatId}`;

      // Resolve shot recipe contract from ShotRecipeLibrary
      const recipeContract = (SHOT_RECIPES as Record<string, any>)[beat.shotRecipeId] || SHOT_RECIPES.IMAGE_WITH_CAPTION;
      const shotRecipeId = recipeContract.id;

      // Extract asset requirements from recipe
      const assetRequirements = recipeContract.assetRequirements || [];
      const resolvedAssets: any[] = [];

      // Resolve assets through ProviderRouter if required
      for (const req of assetRequirements) {
        try {
          const query = req.queryTemplate
            ? req.queryTemplate.replace('{headline}', scriptIR.title).replace('{caption}', beat.narration)
            : scriptIR.title;

          const assetRes = await this.providerRouter.resolveAsset(req, {
            topic: scriptIR.title,
            headline: scriptIR.title,
            caption: beat.narration,
            category: templateDef.category,
            query,
            semanticFallback: req.semanticFallback
          });

          if (assetRes) {
            resolvedAssets.push(assetRes);
          }
        } catch (err) {
          console.warn(`[TemplateProductionPipeline] Asset resolution error for ${req.role}:`, err);
        }
      }

      // Merge props with template visual policy
      const props: Record<string, any> = {
        ...(beat.props || {}),
        template_id: templateDef.identity.id,
        background_type: this.resolveBackgroundPalette(templateDef.category),
      };

      // If an asset was resolved, attach its physical path to props
      if (resolvedAssets.length > 0) {
        const primary = resolvedAssets[0];
        if (primary.uri && fs.existsSync(primary.uri)) {
          props.image_path = primary.uri;
        } else if (primary.content) {
          const tempAssetDir = path.resolve(process.cwd(), 'data', 'temp_assets');
          if (!fs.existsSync(tempAssetDir)) {
            fs.mkdirSync(tempAssetDir, { recursive: true });
          }
          const assetFile = path.join(tempAssetDir, `${primary.assetId}.svg`);
          fs.writeFileSync(assetFile, primary.content, 'utf-8');
          props.image_path = assetFile;
        }
      }

      const durSeconds = beat.durationSeconds || recipeContract.durationPolicy.defaultDuration || 3.0;

      scenes.push({
        sceneId,
        beatId: beat.beatId,
        narration: beat.narration,
        visualIntent: beat.visualIntent,
        shotRecipeId,
        assetRequirements,
        resolvedAssets,
        captionIntent: {
          text: beat.narration,
          style: templateDef.captionPolicy.style,
          position: templateDef.captionPolicy.defaultPosition,
          highlightWord: beat.props?.highlightWord
        },
        durationIntent: {
          min: recipeContract.durationPolicy.minDuration,
          max: recipeContract.durationPolicy.maxDuration,
          target: durSeconds
        },
        transitionIntent: {
          enter: recipeContract.motion.enterTransition,
          exit: recipeContract.motion.exitTransition
        },
        emphasis: beat.emphasis,
        props
      });
    }

    return scenes;
  }

  /**
   * Validates planned scenes against shot recipe library constraints
   */
  public validateScenePlans(scenePlans: ScenePlan[]): ScenePlanValidationResult {
    const errors: string[] = [];

    if (!Array.isArray(scenePlans) || scenePlans.length === 0) {
      errors.push('No scene plans provided');
      return { valid: false, code: 'SCENE_PLAN_INVALID', errors };
    }

    for (const s of scenePlans) {
      if (!s.shotRecipeId) {
        errors.push(`Scene "${s.sceneId}" missing shotRecipeId`);
        continue;
      }
      if (!(SHOT_RECIPES as Record<string, any>)[s.shotRecipeId]) {
        errors.push(`Scene "${s.sceneId}" references unrecognized shotRecipeId: ${s.shotRecipeId}`);
      }
      if (!s.narration || s.narration.trim().length === 0) {
        errors.push(`Scene "${s.sceneId}" missing narration text`);
      }
    }

    if (errors.length > 0) {
      return { valid: false, code: 'SCENE_PLAN_INVALID', errors };
    }

    return { valid: true, errors: [] };
  }

  /**
   * FLOOR 05: Compile Canonical LocalRenderIntent with Audio-First Timing
   */
  public compileLocalRenderIntent(params: {
    templateDef: TemplateDefinition;
    scenePlans: ScenePlan[];
    voiceArtifact?: { localPath: string; durationSeconds: number; sha256: string };
    jobId: string;
    outputPath?: string;
  }): LocalRenderIntent {
    const { templateDef, scenePlans, voiceArtifact, jobId, outputPath } = params;

    const outPath = outputPath || path.join(process.cwd(), 'data', 'renders', `${jobId}.mp4`);
    const totalScenes = scenePlans.length;

    // Physical audio duration truth: if voiceArtifact duration is provided, distribute scene durations proportionally
    const voiceDuration = voiceArtifact?.durationSeconds;
    let distributedDurations: number[] = [];

    if (voiceDuration && voiceDuration > 0) {
      const sumTargets = scenePlans.reduce((acc, s) => acc + s.durationIntent.target, 0);
      const ratio = voiceDuration / Math.max(1, sumTargets);
      distributedDurations = scenePlans.map((s) => Number((s.durationIntent.target * ratio).toFixed(2)));
      // Ensure sum matches voiceDuration exactly
      const sumDist = distributedDurations.reduce((a, b) => a + b, 0);
      const diff = Number((voiceDuration - sumDist).toFixed(2));
      if (distributedDurations.length > 0) {
        distributedDurations[distributedDurations.length - 1] += diff;
      }
    } else {
      distributedDurations = scenePlans.map((s) => s.durationIntent.target);
    }

    let currentOffset = 0;
    const localScenes: LocalRenderSceneIntent[] = scenePlans.map((scene, idx) => {
      const dur = Math.max(1.0, distributedDurations[idx] || 3.0);
      const startSec = currentOffset;
      currentOffset += dur;

      const shots: LocalRenderShotIntent[] = [
        {
          id: `shot_${scene.sceneId}_01`,
          recipe_id: scene.shotRecipeId,
          start_seconds: 0.0,
          duration_seconds: dur,
          props: scene.props,
          motion: scene.transitionIntent,
          assets: scene.resolvedAssets
        }
      ];

      const sceneIntent: LocalRenderSceneIntent = {
        scene_id: scene.sceneId,
        template_id: templateDef.identity.id,
        narration_text: scene.narration,
        duration_seconds: dur,
        shots
      };

      // If audio file exists, attach track to the first scene or scene slice
      if (voiceArtifact?.localPath && fs.existsSync(voiceArtifact.localPath)) {
        sceneIntent.audio_track = {
          track_id: `voice_${jobId}`,
          audio_path: voiceArtifact.localPath,
          start_seconds: startSec,
          duration_seconds: dur,
          volume: 1.0
        };
      }

      return sceneIntent;
    });

    return {
      project_id: jobId,
      title: `${templateDef.identity.name} — ${jobId}`,
      output_path: outPath,
      scenes: localScenes,
      output: {
        width: templateDef.outputPolicy.width || 1080,
        height: templateDef.outputPolicy.height || 1920,
        fps: templateDef.outputPolicy.fps || 30,
        video_codec: 'libx264',
        audio_codec: 'aac'
      },
      safe_area: {
        top: 160,
        bottom: 320,
        left: 60,
        right: 120
      },
      metadata: {
        templateId: templateDef.identity.id,
        templateVersion: templateDef.identity.version,
        contentEngine: templateDef.category,
        formatFamily: templateDef.formatFamily,
        jobId,
        voiceSha256: voiceArtifact?.sha256,
        compiledAt: new Date().toISOString()
      }
    };
  }

  /**
   * FLOOR 06: Execute Production Render via LocalRenderAdapter & factoryos-render
   * Supports both direct adapter invocation and Distributed Compute Fabric routing.
   */
  public async executeProductionRender(params: {
    localIntent: LocalRenderIntent;
    runId?: string;
    onProgress?: (msg: string) => void;
    useComputeFabric?: boolean;
    requirements?: any;
  }): Promise<{
    receipt: RenderReceipt;
    videoPath: string;
    sha256: string;
    durationSeconds: number;
    width: number;
    height: number;
    executionReceipt?: any;
  }> {
    const useComputeFabric = params.useComputeFabric !== false;
    const { localIntent, runId, onProgress } = params;

    if (useComputeFabric) {
      const { ComputeGateway } = await import("../compute/gateway/ComputeGateway");
      const gateway = ComputeGateway.getInstance();
      const jobId = localIntent.project_id || `job_${Date.now()}`;
      const factoryExecutionId = runId || `exec_${Date.now()}`;

      const computeJob = {
        jobId,
        factoryExecutionId,
        workloadType: "RENDER" as const,
        manifest: localIntent,
        inputArtifacts: {
          bundleId: `bundle_${jobId}`,
          artifacts: [],
          createdTimestamp: Date.now(),
        },
        requirements: params.requirements || {
          minCpuCores: 2,
          minMemoryMb: 2048,
          gpuRequired: false,
          estimatedDurationSeconds: localIntent.scenes.reduce((acc, s) => acc + s.duration_seconds, 0),
          workloadType: "RENDER" as const,
        },
        priority: "NORMAL" as const,
        timeoutMs: 600000,
        createdAt: new Date().toISOString(),
      };

      const { receipt: execReceipt } = await gateway.submitJob(computeJob, onProgress);

      if (execReceipt.status !== "COMPLETED" || !execReceipt.rawReceipt) {
        throw new Error(
          `[TemplateProductionPipeline] Compute fabric execution failed: ${
            execReceipt.failureReason || execReceipt.stderrSnippet || "Unknown error"
          }`
        );
      }

      const receipt = execReceipt.rawReceipt as RenderReceipt;
      return {
        receipt,
        videoPath: receipt.output_path,
        sha256: receipt.output_sha256,
        durationSeconds: receipt.duration_seconds,
        width: receipt.width,
        height: receipt.height,
        executionReceipt: execReceipt,
      };
    }

    const adapter = LocalRenderAdapter.getInstance();

    const receipt = await adapter.render(localIntent, runId, onProgress);

    if (!receipt.validation?.is_valid || !receipt.output_path || !fs.existsSync(receipt.output_path)) {
      throw new Error(`[TemplateProductionPipeline] Render validation failed: ${receipt.validation?.errors?.join('; ')}`);
    }

    return {
      receipt,
      videoPath: receipt.output_path,
      sha256: receipt.output_sha256,
      durationSeconds: receipt.duration_seconds,
      width: receipt.width,
      height: receipt.height
    };
  }

  private resolveBackgroundPalette(category: ContentCategory): string {
    switch (category) {
      case 'FACTS':
        return 'DEEP_INDIGO';
      case 'HISTORY':
        return 'AMBER_HISTORY';
      case 'MOTIVATION':
        return 'MONOCHROME';
      case 'REDDIT':
        return 'REDDIT_ORANGE';
      case 'NEWS':
        return 'DARK_SLATE';
      default:
        return 'DARK_SLATE';
    }
  }
}
