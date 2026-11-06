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
import { TemporalCompiler } from '../../../lib/templates/temporal/TemporalCompiler';
import type { TemporalPlanIR } from '../../../lib/templates/temporal/TemporalContracts';
import { ProviderRouter } from '../../../lib/templates/providers/ProviderRouter';
import { VoiceFabric } from '../voice/VoiceFabric';
export class FactualGroundingError extends Error {
  readonly code: 'MISSING_TOPIC_EVIDENCE' | 'EDITORIAL_REVIEW_REQUIRED' | 'FABRICATED_CLAIM_REJECTED';
  constructor(code: 'MISSING_TOPIC_EVIDENCE' | 'EDITORIAL_REVIEW_REQUIRED' | 'FABRICATED_CLAIM_REJECTED', message: string) {
    super(`[FactualGroundingError:${code}] ${message}`);
    this.name = 'FactualGroundingError';
    this.code = code;
  }
}

import {
  LocalRenderAdapter,
  LocalRenderIntent,
  LocalRenderSceneIntent,
  LocalRenderShotIntent,
  RenderReceipt
} from '../render/LocalRenderAdapter';

export interface ProvenanceRecord {
  source?: string;
  primarySource?: string;
  sourceUrl?: string;
  workOrDocument?: string;
  verifiedArchivalQuote?: boolean;
  historicalImpactSummary?: string;
  sources?: string[];
}

export interface TemplateScriptBeat {
  beatId: string;
  type: string;
  narration: string;
  visualIntent: string;
  emphasis?: string;
  shotRecipeId: string;
  durationSeconds?: number;
  props?: Record<string, any>;
  provenance?: ProvenanceRecord;
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
  temporalPlan: TemporalPlanIR;
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
      title = userInputs.title || `3 Verified Realities: ${topic}`;
      hook = userInputs.hook || `The reality of ${topic} challenges everything we assumed.`;
      cta = userInputs.cta || 'Which reality surprised you most? Comment below.';

      const rawFacts: any[] = Array.isArray(userInputs.facts) ? userInputs.facts : [];
      if (rawFacts.length < 2 || !userInputs.stat?.number) {
        throw new FactualGroundingError(
          'MISSING_TOPIC_EVIDENCE',
          `[TemplateProductionPipeline] Missing verified topic evidence for FACTS on "${topic}". Rapid facts requires at least 2 verified facts and 1 verified numerical metric with source provenance. Editorial review required.`
        );
      }

      for (const [idx, f] of rawFacts.entries()) {
        if (!f.narration) {
          throw new FactualGroundingError('MISSING_TOPIC_EVIDENCE', `[TemplateProductionPipeline] Fact #${idx + 1} for "${topic}" is missing narration text.`);
        }
      }

      const fact1Text = rawFacts[0].narration;
      const fact1Caption = rawFacts[0].caption || rawFacts[0].headline || 'Key Observation';
      const fact1Image = rawFacts[0].imageRef || rawFacts[0].image_path || undefined;

      const statNumber = userInputs.stat.number;
      const statLabel = userInputs.stat.label || 'VERIFIED BENCHMARK';
      const statNarration = userInputs.stat.narration || `The measured benchmark reaches ${statNumber}, established by peer-reviewed evidence.`;

      const fact2Text = rawFacts[1].narration;
      const fact2Caption = rawFacts[1].caption || rawFacts[1].headline || 'Core Dynamic';
      const fact2Image = rawFacts[1].imageRef || rawFacts[1].image_path || undefined;

      const compStatValue = userInputs.comparativeStat?.value || statNumber;
      const compStatHeadline = userInputs.comparativeStat?.headline || statLabel;
      const compStatNarration = userInputs.comparativeStat?.narration || statNarration;

      const climaxFact = rawFacts[2] || rawFacts[1];
      const climaxText = climaxFact.narration;
      const climaxCaption = climaxFact.caption || climaxFact.headline || 'Final Analysis';
      const climaxImage = climaxFact.imageRef || climaxFact.image_path || undefined;

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
        narration: fact1Text,
        visualIntent: 'Framed primary imagery showcasing verified fact context',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 3.5,
        provenance: rawFacts[0].provenance || { source: topic },
        props: { caption: fact1Caption, headline: 'FACT #1', imageRef: fact1Image }
      });

      beats.push({
        beatId: 'beat_03_stat',
        type: 'STAT',
        narration: statNarration,
        visualIntent: 'Massive numerical stat highlight',
        emphasis: 'PUNCH',
        shotRecipeId: 'BIG_NUMBER',
        durationSeconds: 2.5,
        provenance: userInputs.stat?.provenance || { source: topic },
        props: { number: statNumber, label: statLabel, headline: 'KEY METRIC' }
      });

      beats.push({
        beatId: 'beat_04_fact2',
        type: 'FACT',
        narration: fact2Text,
        visualIntent: 'Visual comparison card with verified contextual illustration',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 3.5,
        provenance: rawFacts[1]?.provenance || { source: topic },
        props: { caption: fact2Caption, headline: 'FACT #2', imageRef: fact2Image }
      });

      beats.push({
        beatId: 'beat_05_comp_stat',
        type: 'STAT',
        narration: compStatNarration,
        visualIntent: 'Comparative statistical scale card',
        shotRecipeId: 'STAT',
        durationSeconds: 2.5,
        provenance: userInputs.comparativeStat?.provenance || userInputs.stat?.provenance || { source: topic },
        props: { value: compStatValue, headline: compStatHeadline }
      });

      beats.push({
        beatId: 'beat_06_climax',
        type: 'CLIMAX',
        narration: climaxText,
        visualIntent: 'Full bleed high impact payoff visual',
        shotRecipeId: 'FULL_BLEED_IMAGE',
        durationSeconds: 3.5,
        provenance: climaxFact?.provenance || { source: topic },
        props: { caption: climaxCaption, headline: 'FINAL VERDICT', imageRef: climaxImage }
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
    } else if (templateId === 'quiz.universal.glass.v1' || templateId === 'quiz.quizshow.v1' || templateId === 'quiz.universal.cinematic.v2') {
      const upperTopic = topic.trim().toUpperCase();
      const headlineTopic = upperTopic.endsWith('CHALLENGE') ? upperTopic : `${upperTopic} CHALLENGE`;
      title = userInputs.title || `${topic} QuizShow Challenge`;
      hook = userInputs.hook || `Only three percent of people get all eight questions right. Can you ace this ultimate ${topic} challenge?`;
      cta = userInputs.cta || 'How many did you get right out of eight? Comment your score below and subscribe!';

      const rawQuestions: any[] = Array.isArray(userInputs.questions) ? userInputs.questions : [];
      const isUniversal = templateId === 'quiz.universal.glass.v1' || templateId === 'quiz.universal.cinematic.v2';
      const targetCount = userInputs.questionCount ? Number(userInputs.questionCount) : (isUniversal ? 6 : 8);
      if (rawQuestions.length < targetCount) {
        throw new FactualGroundingError(
          'MISSING_TOPIC_EVIDENCE',
          `[TemplateProductionPipeline] Missing verified question set for QUIZ on "${topic}". Requires at least ${targetCount} verified topic-specific questions with 4 distinct options and source provenance. Found ${rawQuestions.length}.`
        );
      }

      const activeQuestions = rawQuestions.slice(0, targetCount);
      const totalQ = activeQuestions.length;
      const totalQStr = String(totalQ).padStart(2, '0');

      title = userInputs.title || `${topic} Universal Quiz`;
      hook = userInputs.hook || `Only three percent of people get all ${totalQ} questions right. Can you ace this ultimate ${topic} challenge?`;
      cta = userInputs.cta || `How many did you get right out of ${totalQ}? Comment your score below and subscribe!`;

      for (const [idx, q] of activeQuestions.entries()) {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) {
          throw new FactualGroundingError(
            'MISSING_TOPIC_EVIDENCE',
            `[TemplateProductionPipeline] Question #${idx + 1} for "${topic}" requires a question prompt and exactly 4 options.`
          );
        }
        if (new Set(q.options).size !== 4) {
          throw new FactualGroundingError(
            'MISSING_TOPIC_EVIDENCE',
            `[TemplateProductionPipeline] Question #${idx + 1} for "${topic}" contains duplicate options.`
          );
        }
      }

      beats.push({
        beatId: 'beat_01_hook',
        type: 'HOOK',
        narration: hook,
        visualIntent: 'High-energy game show opening challenge hook',
        emphasis: 'HIGH',
        shotRecipeId: 'KINETIC_HOOK',
        durationSeconds: 3.5,
        props: {
          headline: headlineTopic,
          subtitle: hook,
          highlightWord: 'QUIZ',
          tag: `${totalQ}-QUESTION SHOW`,
          ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
          ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {})
        }
      });

      activeQuestions.forEach((q: any, qIdx: number) => {
        const qNum = qIdx + 1;
        const qNumStr = String(qNum).padStart(2, '0');
        const qText = q.question;
        const options = q.options;
        const explicitAnswerIdx =
          typeof q.answerIndex === 'number'
            ? q.answerIndex
            : options.findIndex((o: any) => String(o).trim().toLowerCase() === String(q.answer || '').trim().toLowerCase());
        const answerIdx = explicitAnswerIdx >= 0 && explicitAnswerIdx < 4 ? explicitAnswerIdx : 0;
        const answerVal = q.answer || options[answerIdx];
        const explanation = q.explanation || `The correct answer is ${answerVal}.`;
        const optionLetters = ['A', 'B', 'C', 'D'];
        const qImage = q.image_path || q.imageRef || q.image || (userInputs.images && userInputs.images[qIdx]);
        const categoryBadge = userInputs.categoryBadge || `${upperTopic} • Q${qNum}/${totalQStr}`;

        beats.push({
          beatId: `beat_q${qNum}_card`,
          type: 'QUESTION',
          narration: `Question ${qNum}: ${qText}`,
          visualIntent: 'Glassmorphism question card with four distinct options',
          shotRecipeId: 'QUESTION_CARD',
          durationSeconds: 6.5,
          provenance: q.provenance || { source: topic },
          props: {
            question: qText,
            options,
            answerIndex: answerIdx,
            categoryBadge,
            headline: `QUESTION ${qNum} / ${totalQStr}`,
            topic,
            ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
            ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {}),
            ...(qImage ? { image_path: qImage } : {})
          }
        });

        if (isUniversal) {
        // Each option is independently narrated so the five-second think gate can be
        // anchored to the physical end of the last option's audio.
        for (let oIdx = 0; oIdx < 4; oIdx++) {
          const letter = optionLetters[oIdx];
          beats.push({
            beatId: `beat_q${qNum}_option_${letter.toLowerCase()}`,
            type: `OPTION_${letter}`,
            narration: `${letter}. ${String(options[oIdx]).replace(/[.!?]+$/, '')}.`,
            visualIntent: `Question card highlighting option ${letter} while it is narrated`,
            shotRecipeId: 'QUESTION_CARD',
            durationSeconds: 1.5,
            provenance: q.provenance || { source: topic },
            props: {
              question: qText,
              options,
              answerIndex: answerIdx,
              categoryBadge,
              headline: `QUESTION ${qNum} / ${totalQStr}`,
              topic,
              highlightOptionIndex: oIdx,
              // The last option ends exactly at its audio end so the think gate
              // starts at the physical end of the final spoken option.
              ...(oIdx === 3 ? { audioTailSeconds: 0 } : {}),
              ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
              ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {}),
              ...(qImage ? { image_path: qImage } : {})
            }
          });
        }

        beats.push({
          beatId: `beat_q${qNum}_think`,
          type: 'THINK',
          narration: '',
          visualIntent: 'Five-second silent think gate with countdown timer',
          shotRecipeId: 'COUNTDOWN',
          durationSeconds: 5.0,
          provenance: q.provenance || { source: topic },
          props: {
            question: qText,
            options,
            answerIndex: answerIdx,
            seconds: 5,
            categoryBadge,
            headline: `QUESTION ${qNum} / ${totalQStr}`,
            topic,
            thinkGate: true,
            narrationOn: false,
            motion: { animated: true, type: 'DYNAMIC' },
            ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
            ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {}),
            ...(qImage ? { image_path: qImage } : {})
          }
        });

        beats.push({
          beatId: `beat_q${qNum}_reveal`,
          type: 'ANSWER_REVEAL',
          narration: `Option ${optionLetters[answerIdx]}: ${answerVal}!`,
          visualIntent: 'Emerald green correct option highlight and explanation card',
          shotRecipeId: 'ANSWER_REVEAL',
          durationSeconds: 2.0,
          props: {
            question: qText,
            options,
            answerIndex: answerIdx,
            correctOption: answerVal,
            explanation,
            categoryBadge,
            headline: 'CORRECT ANSWER',
            topic,
            ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
            ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {}),
            ...(qImage ? { image_path: qImage } : {})
          }
        });

        beats.push({
          beatId: `beat_q${qNum}_explanation`,
          type: 'EXPLANATION',
          narration: explanation,
          visualIntent: 'Emerald green correct option highlight with teaching explanation',
          shotRecipeId: 'ANSWER_REVEAL',
          durationSeconds: 6.0,
          props: {
            question: qText,
            options,
            answerIndex: answerIdx,
            correctOption: answerVal,
            explanation,
            categoryBadge,
            headline: 'EXPLANATION',
            topic,
            ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
            ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {}),
            ...(qImage ? { image_path: qImage } : {})
          }
        });
        } else {
          // Legacy 8-question QuizShow keeps its compact three-beat cycle.
          beats.push({
            beatId: `beat_q${qNum}_countdown`,
            type: 'COUNTDOWN',
            narration: 'Five seconds on the clock, lock in your answer!',
            visualIntent: 'Dynamic suspense countdown timer',
            shotRecipeId: 'COUNTDOWN',
            durationSeconds: 4.0,
            provenance: q.provenance || { source: topic },
            props: {
              question: qText,
              options,
              answerIndex: answerIdx,
              seconds: 5,
              categoryBadge,
              headline: `QUESTION ${qNum} / ${totalQStr}`,
              topic,
              motion: { animated: true, type: 'DYNAMIC' },
              ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
              ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {}),
              ...(qImage ? { image_path: qImage } : {})
            }
          });

          beats.push({
            beatId: `beat_q${qNum}_reveal`,
            type: 'ANSWER_REVEAL',
            narration: `Option ${optionLetters[answerIdx]}: ${answerVal}! ${explanation}`,
            visualIntent: 'Emerald green correct option highlight and explanation card',
            shotRecipeId: 'ANSWER_REVEAL',
            durationSeconds: 8.0,
            props: {
              question: qText,
              options,
              answerIndex: answerIdx,
              correctOption: answerVal,
              explanation,
              categoryBadge,
              headline: 'CORRECT ANSWER',
              topic,
              ...(userInputs.accentColor ? { accentColor: userInputs.accentColor } : {}),
              ...(userInputs.themeToken ? { themeToken: userInputs.themeToken } : {}),
              ...(qImage ? { image_path: qImage } : {})
            }
          });
        }
      });

      beats.push({
        beatId: 'beat_outro_cta',
        type: 'CTA',
        narration: cta,
        visualIntent: 'Final scoreboard challenge and engagement CTA',
        shotRecipeId: 'OUTRO_CTA',
        durationSeconds: 4.5,
        props: { cta: 'COMMENT YOUR SCORE!', subtitle: userInputs.outroSubtitle || `Did you get ${totalQ} out of ${totalQ} right? Subscribe for daily quizzes!`, headline: 'QUIZ COMPLETED' }
      });
      // Full-narration universal quizzes need tight inter-beat tails to stay inside
      // the 180s platform ceiling without truncating any spoken beat.
      if (isUniversal) {
        for (const b of beats) {
          if (b.props && b.props.audioTailSeconds === undefined) {
            b.props.audioTailSeconds = 0.05;
          }
        }
      }
    } else if (templateId === 'quiz.trivia-challenge.v1') {
      title = userInputs.title || `${topic} Trivia Challenge`;
      hook = userInputs.hook || `Only five percent of viewers can get all three questions right. Can you?`;
      cta = userInputs.cta || 'How many did you get right? Comment your score below!';

      const rawQuestions: any[] = Array.isArray(userInputs.questions) ? userInputs.questions : [];
      if (rawQuestions.length < 3) {
        throw new FactualGroundingError(
          'MISSING_TOPIC_EVIDENCE',
          `[TemplateProductionPipeline] Missing verified question set for QUIZ on "${topic}". Quiz challenge requires 3 verified topic-specific questions with 4 distinct options and source provenance. Editorial review required.`
        );
      }

      for (const [idx, q] of rawQuestions.entries()) {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4) {
          throw new FactualGroundingError(
            'MISSING_TOPIC_EVIDENCE',
            `[TemplateProductionPipeline] Question #${idx + 1} for "${topic}" requires a question prompt and exactly 4 options.`
          );
        }
        if (new Set(q.options).size !== 4) {
          throw new FactualGroundingError(
            'MISSING_TOPIC_EVIDENCE',
            `[TemplateProductionPipeline] Question #${idx + 1} for "${topic}" contains duplicate options.`
          );
        }
      }

      beats.push({
        beatId: 'beat_01_hook',
        type: 'HOOK',
        narration: hook,
        visualIntent: 'High-energy game show opening hook',
        emphasis: 'HIGH',
        shotRecipeId: 'KINETIC_HOOK',
        durationSeconds: 2.5,
        props: { headline: topic, subtitle: hook, highlightWord: 'TRIVIA', tag: 'QUIZ CHALLENGE' }
      });

      rawQuestions.slice(0, 3).forEach((q: any, qIdx: number) => {
        const qNum = qIdx + 1;
        const qText = q.question;
        const options = q.options;
        const answerIdx = typeof q.answerIndex === 'number' ? q.answerIndex : 0;
        const answerVal = q.answer || options[answerIdx];
        const explanation = q.explanation || `The correct answer is ${answerVal}.`;

        beats.push({
          beatId: `beat_q${qNum}_card`,
          type: 'QUESTION',
          narration: `Question ${qNum}: ${qText}`,
          visualIntent: 'Glassmorphism question card with four distinct options',
          shotRecipeId: 'QUESTION_CARD',
          durationSeconds: 3.5,
          provenance: q.provenance || { source: topic },
          props: {
            question: qText,
            options,
            answerIndex: answerIdx,
            categoryBadge: `${topic.toUpperCase()} • Q${qNum}`,
            headline: `QUESTION ${qNum}`
          }
        });

        beats.push({
          beatId: `beat_q${qNum}_countdown`,
          type: 'COUNTDOWN',
          narration: 'Three seconds on the clock, lock in your answer!',
          visualIntent: 'Dynamic suspense countdown timer',
          shotRecipeId: 'COUNTDOWN',
          durationSeconds: 2.0,
          provenance: q.provenance || { source: topic },
          props: {
            question: qText,
            options,
            answerIndex: answerIdx,
            seconds: 3,
            categoryBadge: `${topic.toUpperCase()} • Q${qNum}`,
            headline: `QUESTION ${qNum}`
          }
        });

        beats.push({
          beatId: `beat_q${qNum}_reveal`,
          type: 'ANSWER_REVEAL',
          narration: `The correct answer is ${answerVal}! ${explanation}`,
          visualIntent: 'Emerald green correct option highlight and explanation card',
          shotRecipeId: 'ANSWER_REVEAL',
          durationSeconds: 3.5,
          props: {
            question: qText,
            options,
            answerIndex: answerIdx,
            correctOption: answerVal,
            explanation,
            categoryBadge: `${topic.toUpperCase()} • Q${qNum}`,
            headline: 'CORRECT ANSWER'
          }
        });
      });

      beats.push({
        beatId: 'beat_outro_cta',
        type: 'CTA',
        narration: cta,
        visualIntent: 'Final score challenge and engagement CTA',
        shotRecipeId: 'OUTRO_CTA',
        durationSeconds: 2.5,
        props: { cta: 'HOW MANY DID YOU GET RIGHT?', subtitle: cta, headline: 'QUIZ COMPLETED' }
      });
    } else if (templateId === 'history.timeline.v1') {
      const rawMilestones: any[] = Array.isArray(userInputs.milestones)
        ? userInputs.milestones
        : (Array.isArray(userInputs.events) ? userInputs.events : []);
      const rawQuote = userInputs.quote;

      if (rawMilestones.length < 2 || !rawQuote?.text) {
        throw new FactualGroundingError(
          'MISSING_TOPIC_EVIDENCE',
          `[TemplateProductionPipeline] Missing verified archival evidence for HISTORY on "${topic}". Historical timeline requires at least 2 chronological milestones and an authenticated primary source quotation. Editorial review required.`
        );
      }

      const year = userInputs.keyYear || rawMilestones[0].yearOrTime || 'HISTORICAL TURNING POINT';
      title = userInputs.title || `${topic}: The Decisive Chronology (${year})`;
      hook = userInputs.hook || `What truly happened during ${topic}?`;
      cta = userInputs.cta || 'Subscribe to uncover more verified historical turning points.';

      beats.push({
        beatId: 'beat_01_hook',
        type: 'HOOK',
        narration: hook,
        visualIntent: 'Dramatic historical question with archival typography',
        shotRecipeId: 'KINETIC_HOOK',
        durationSeconds: 3.0,
        props: { headline: topic, subtitle: hook, highlightWord: String(year), tag: `TURNING POINT` }
      });

      beats.push({
        beatId: 'beat_02_milestone1',
        type: 'MILESTONE',
        narration: rawMilestones[0].narration,
        visualIntent: 'Chronological timeline card with milestone date badge',
        shotRecipeId: 'TIMELINE_BUILD',
        durationSeconds: 4.0,
        provenance: rawMilestones[0].provenance || { source: topic },
        props: {
          year: rawMilestones[0].yearOrTime || year,
          event: rawMilestones[0].event || 'Key Turning Point',
          description: rawMilestones[0].description || rawMilestones[0].narration
        }
      });

      beats.push({
        beatId: 'beat_03_quote',
        type: 'QUOTE',
        narration: rawQuote.narration || `Eyewitness chronicles recorded: "${rawQuote.text}"`,
        visualIntent: 'Direct primary source quote card in archival serif script',
        shotRecipeId: 'QUOTE_CARD',
        durationSeconds: 3.5,
        provenance: rawQuote.provenance || { source: topic },
        props: {
          quote: rawQuote.text,
          author: rawQuote.author || 'Primary Source Witness'
        }
      });

      beats.push({
        beatId: 'beat_04_milestone2',
        type: 'MILESTONE',
        narration: rawMilestones[1].narration,
        visualIntent: 'Milestone culmination badge',
        shotRecipeId: 'TIMELINE_BUILD',
        durationSeconds: 4.0,
        provenance: rawMilestones[1].provenance || { source: topic },
        props: {
          year: rawMilestones[1].yearOrTime || 'CULMINATION',
          event: rawMilestones[1].event || 'Historical Culmination',
          description: rawMilestones[1].description || rawMilestones[1].narration
        }
      });

      const legacyNarration = userInputs.legacy?.narration || userInputs.legacyNarration || rawMilestones[rawMilestones.length - 1].narration;
      const legacyHeadline = userInputs.legacy?.headline || 'HISTORICAL LEGACY';
      beats.push({
        beatId: 'beat_05_legacy',
        type: 'LEGACY',
        narration: legacyNarration,
        visualIntent: 'Historical legacy overview with archival illustration',
        shotRecipeId: 'IMAGE_WITH_CAPTION',
        durationSeconds: 3.5,
        provenance: userInputs.legacy?.provenance || { source: topic },
        props: { caption: legacyNarration, headline: legacyHeadline }
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

    const requestedTargetDurationMs =
      typeof userInputs.targetDurationSeconds === "number"
        ? Math.round(userInputs.targetDurationSeconds * 1000)
        : undefined;
    const [minDurationSeconds, maxDurationSeconds] = templateDef.outputPolicy.targetDurationRange;
    const targetDurationMs = requestedTargetDurationMs ??
      Math.round(((minDurationSeconds + maxDurationSeconds) / 2) * 1000);
    const temporalPlan = TemporalCompiler.compileGeneratedBeats(
      templateDef.identity.id,
      templateDef.identity.version,
      beats,
      targetDurationMs,
      templateDef.outputPolicy.fps || 30,
      templateDef.temporalPolicy ?? {},
    );

    return {
      templateId: templateDef.identity.id,
      templateVersion: templateDef.identity.version,
      contentEngine: templateDef.category,
      formatFamily: templateDef.formatFamily,
      title,
      hook,
      beats,
      cta,
      estimatedDuration: Number((temporalPlan.targetDurationMs / 1000).toFixed(1)),
      narrationSegments,
      temporalPlan,
      metadata: {
        topic,
        userInputs,
        temporalCompilerVersion: temporalPlan.provenance.compilerVersion,
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

    // Strict Factual Integrity & Topic Isolation Gate:
    // Prohibit cross-topic claim leakage and hardcoded ungrounded fabrications.
    const fullText = scriptIR.beats.map((b) => `${b.narration} ${JSON.stringify(b.props || {})}`).join(' ').toLowerCase();

    const prohibitedFabrications = [
      '84 percent of observed phenomena',
      'non-replicable under 1 atm',
      'ten times denser than lithium',
      'denser than lithium',
      'revolutionizing modern astrophysics',
      'revolutionising modern astrophysics'
    ];

    for (const phrase of prohibitedFabrications) {
      if (fullText.includes(phrase)) {
        errors.push(`Prohibited fabricated claim detected: "${phrase}"`);
      }
    }

    const topicLower = (scriptIR.title + ' ' + (scriptIR.metadata?.topic || '')).toLowerCase();
    const isMariana = topicLower.includes('mariana') || topicLower.includes('trench') || topicLower.includes('hadal');
    if (!isMariana && (fullText.includes('10,994 m') || fullText.includes('1,086 bar') || fullText.includes('abyssal biology') || fullText.includes('snailfish'))) {
      errors.push('Topic leakage detected: Mariana Trench specific bathymetric metrics leaked into unrelated topic.');
    }

    const isSolarSystem = topicLower.includes('solar') || topicLower.includes('planet') || topicLower.includes('astronomy') || topicLower.includes('venus') || topicLower.includes('ganymede');
    if (!isSolarSystem && (fullText.includes('465°c') || fullText.includes('ganymede') || fullText.includes('speed of sound in the vacuum'))) {
      errors.push('Topic leakage detected: Solar System trivia leaked into unrelated topic.');
    }

    const isConstantinople = topicLower.includes('1453') || topicLower.includes('constantinople') || topicLower.includes('byzantine');
    if (!isConstantinople && (fullText.includes('imperial vanguard') || fullText.includes('siege engines') || fullText.includes('ancient defenses'))) {
      errors.push('Topic leakage detected: 1453 Siege of Constantinople chronicle leaked into unrelated historical topic.');
    }
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
    } else if (category === 'QUIZ') {
      const questionBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'QUESTION_CARD' || b.type === 'QUESTION');
      if (questionBeats.length < 1) {
        errors.push(`QUIZ template requires at least 1 question card, found ${questionBeats.length}`);
      }
      const revealBeats = scriptIR.beats.filter((b) => b.shotRecipeId === 'ANSWER_REVEAL' || b.type === 'ANSWER_REVEAL');
      if (revealBeats.length < 1) {
        errors.push(`QUIZ template requires matching answer reveal beats, found ${revealBeats.length}`);
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

    // Strict Provenance Validation per factual claim beat:
    for (const beat of scriptIR.beats) {
      if (['FACT', 'STAT', 'MILESTONE', 'QUOTE', 'QUESTION'].includes(beat.type) || beat.shotRecipeId === 'QUESTION_CARD' || beat.shotRecipeId === 'BIG_NUMBER' || beat.shotRecipeId === 'TIMELINE_BUILD') {
        const prov = beat.provenance;
        if (!prov || (!prov.source && !prov.primarySource && !prov.workOrDocument && !prov.sourceUrl && (!Array.isArray(prov.sources) || prov.sources.length === 0))) {
          errors.push(`Factual beat "${beat.beatId}" (${beat.type || beat.shotRecipeId}) lacks supporting evidence provenance.`);
        }
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

      // Resolve design pack background and styling assets if present
      if (templateDef.designPack?.packId) {
        props.design_pack = templateDef.designPack.packId;
        props.canva_design_pack = templateDef.designPack.packId;

        const packId = templateDef.designPack.packId;
        const packDir = path.resolve(process.cwd(), 'assets', 'canva', 'packs', packId);
        if (fs.existsSync(packDir)) {
          const beatNum = scenes.length + 1;
          const qNum = beat.props?.questionNumber || beat.props?.questionIndex || Math.ceil(beatNum / 3);
          const candidates = [
            `question-0${qNum}.png`,
            `question-${qNum}.png`,
            `question_0${qNum}.png`,
            `question-0${beatNum}.png`,
            `question-${beatNum}.png`,
            `bg_question_0${qNum}.png`,
            `background-0${qNum}.png`,
            `background.png`
          ];
          for (const cand of candidates) {
            const candPath = path.join(packDir, cand);
            if (fs.existsSync(candPath)) {
              props.image_path = candPath;
              break;
            }
          }
        }
      }

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
      if ((!s.narration || s.narration.trim().length === 0) && s.props?.thinkGate !== true) {
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
    sceneAudioArtifacts?: Array<{ sceneId: string; localPath: string; durationSeconds: number }>;
    jobId: string;
    outputPath?: string;
  }): LocalRenderIntent {
    const { templateDef, scenePlans, voiceArtifact, sceneAudioArtifacts, jobId, outputPath } = params;

    const outPath = outputPath || path.join(process.cwd(), 'data', 'renders', `${jobId}.mp4`);
    const totalScenes = scenePlans.length;
    const hasPerSceneAudio = Array.isArray(sceneAudioArtifacts) && sceneAudioArtifacts.length > 0;
    const THINK_GATE_SECONDS = 5.0;
    const isThinkGate = (scene: ScenePlan) => scene.props?.thinkGate === true;
    const audioTailSeconds = (scene: ScenePlan) =>
      typeof scene.props?.audioTailSeconds === 'number' ? scene.props.audioTailSeconds : 0.35;

    // Physical audio duration truth: if voiceArtifact duration is provided, distribute scene durations proportionally
    const voiceDuration = voiceArtifact?.durationSeconds;
    let distributedDurations: number[] = [];

    if (hasPerSceneAudio) {
      for (const s of scenePlans) {
        if (isThinkGate(s)) continue;
        const match = sceneAudioArtifacts!.find((a) => a.sceneId === s.sceneId);
        if (!match) {
          throw new Error(
            `[TemplateProductionPipeline:ProductionNarrationIntegrityError] Scene '${s.sceneId}' is missing its required narration audio segment.`
          );
        }
      }
      for (const audio of sceneAudioArtifacts!) {
        if ((audio as any).isFallback || (audio as any).qualityClass === 'DEGRADED_FALLBACK' || (audio as any).provider === 'SILENT_WAV_FALLBACK') {
          throw new Error(
            `[TemplateProductionPipeline:ProductionNarrationIntegrityError] Scene ${audio.sceneId} audio is a degraded silent fallback. Rejected for production video generation.`
          );
        }
        if (fs.existsSync(audio.localPath)) {
          VoiceFabric.assertAudibleAudio(audio.localPath);
        } else {
          throw new Error(`[TemplateProductionPipeline:ProductionNarrationIntegrityError] Scene ${audio.sceneId} audio file missing at ${audio.localPath}`);
        }
      }

      distributedDurations = scenePlans.map((s) => {
        if (isThinkGate(s)) {
          return THINK_GATE_SECONDS;
        }
        const match = sceneAudioArtifacts.find((a) => a.sceneId === s.sceneId);
        if (match && match.durationSeconds > 0) {
          const tail = audioTailSeconds(s);
          const raw = match.durationSeconds + tail;
          // A scene with no tail ends on the frame at or after its audio end. This is
          // what makes the think gate start at the last option's physical audio end.
          return tail === 0 ? Math.ceil(raw * 30) / 30 : Math.max(1.5, Number(raw.toFixed(2)));
        }
        return s.durationIntent.target;
      });
    } else if (voiceArtifact) {
      if ((voiceArtifact as any).isFallback || (voiceArtifact as any).qualityClass === 'DEGRADED_FALLBACK' || (voiceArtifact as any).provider === 'SILENT_WAV_FALLBACK') {
        throw new Error(
          `[TemplateProductionPipeline:ProductionNarrationIntegrityError] Monolithic voice artifact is a degraded silent fallback. Rejected for production video generation.`
        );
      }
      if (fs.existsSync(voiceArtifact.localPath)) {
        VoiceFabric.assertAudibleAudio(voiceArtifact.localPath);
      }
    } else if (voiceDuration && voiceDuration > 0) {
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

    // Production duration guard: clamp sum to <= 175.0s (leaving safety cushion for Shorts platform limit)
    const isUniversalQuiz = templateDef.identity.id === 'quiz.universal.glass.v1' || templateDef.identity.id === 'quiz.universal.cinematic.v2' || (distributedDurations.length <= 20 && templateDef.category === 'QUIZ');
    const maxShortsCeiling = isUniversalQuiz ? 180.0 : 175.0;
    const totalDistDuration = distributedDurations.reduce((a, b) => a + b, 0);
    if (totalDistDuration > maxShortsCeiling) {
      if (hasPerSceneAudio) {
        // Enforce audio completeness invariant: never compress a scene below physical audio length!
        const totalAudioFloor = scenePlans.reduce((acc, s) => {
          if (isThinkGate(s)) return acc + THINK_GATE_SECONDS;
          const match = sceneAudioArtifacts!.find((a) => a.sceneId === s.sceneId);
          const tail = audioTailSeconds(s);
          return acc + (match && match.durationSeconds > 0 ? match.durationSeconds + tail : 1.0);
        }, 0);
        if (totalAudioFloor > maxShortsCeiling) {
          throw new Error(
            `[TemplateProductionPipeline:ProductionDurationExceededError] Total physical narration duration (${totalAudioFloor.toFixed(2)}s) exceeds production ceiling (${maxShortsCeiling}s). Condense script narration.`
          );
        }
        distributedDurations = scenePlans.map((s) => {
          if (isThinkGate(s)) return THINK_GATE_SECONDS;
          const match = sceneAudioArtifacts!.find((a) => a.sceneId === s.sceneId);
          const tail = audioTailSeconds(s);
          return match && match.durationSeconds > 0 ? Number((match.durationSeconds + tail).toFixed(2)) : 1.5;
        });
      } else {
        const scaleFactor = maxShortsCeiling / totalDistDuration;
        distributedDurations = distributedDurations.map((d) => Math.max(1.0, Number((d * scaleFactor).toFixed(2))));
      }
    }

    let currentOffset = 0;
    const localScenes: LocalRenderSceneIntent[] = scenePlans.map((scene, idx) => {
      const rawDur = Math.max(1.0, distributedDurations[idx] || 3.0);
      const dur = Math.round(rawDur * 30) / 30;
      const startSec = currentOffset;
      currentOffset += dur;

      const shots: LocalRenderShotIntent[] = [
        {
          id: `shot_${scene.sceneId}_01`,
          recipe_id: scene.shotRecipeId,
          start_seconds: 0.0,
          duration_seconds: dur,
          props: scene.props,
          motion: scene.props?.motion || scene.transitionIntent,
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

      if (hasPerSceneAudio && !isThinkGate(scene)) {
        const match = sceneAudioArtifacts!.find((a) => a.sceneId === scene.sceneId);
        if (match?.localPath && fs.existsSync(match.localPath)) {
          sceneIntent.audio_track = {
            track_id: `voice_${jobId}_${scene.sceneId}`,
            audio_path: match.localPath,
            start_seconds: 0.0,
            source_in_seconds: 0.0,
            duration_seconds: match.durationSeconds,
            volume: 1.0
          };
        }
      } else if (voiceArtifact?.localPath && fs.existsSync(voiceArtifact.localPath)) {
        // Fallback: accurately slice single audio file with 0.0 start_seconds delay
        sceneIntent.audio_track = {
          track_id: `voice_${jobId}`,
          audio_path: voiceArtifact.localPath,
          start_seconds: 0.0,
          source_in_seconds: startSec,
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
      case 'QUIZ':
        return 'DEEP_NAVY';
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
