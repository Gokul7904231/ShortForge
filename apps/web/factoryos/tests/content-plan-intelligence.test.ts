import { describe, it, expect } from 'vitest';
import {
  ContentPlanEngine,
  ClaimLedger,
  ClaimFaithfulnessAdapter,
  VerifiedClaim
} from '../core/templates/ContentPlan';

describe('Wave 2 — Template Intelligence & Factual Provenance', () => {
  const sampleClaims: VerifiedClaim[] = [
    {
      claimId: 'claim_hadal_01',
      statement: 'Descending beneath the planetary threshold, Mariana Trench reaches eleven thousand meters depth.',
      publisher: 'National Oceanic and Atmospheric Survey',
      sourceUrl: 'https://noaa.gov/mariana-trench-depth',
      retrievedAt: new Date().toISOString(),
      excerpt: 'The Mariana Trench reaches a maximum depth of approximately eleven thousand meters in the Challenger Deep.',
      confidenceScore: 0.98,
      claimType: 'FACTUAL'
    },
    {
      claimId: 'claim_hadal_02',
      statement: 'Hydrostatic pressure reaches crushing levels exceeding one thousand atmospheres in deep oceanic trenches.',
      publisher: 'Journal of Physical Oceanography',
      sourceUrl: 'https://oceanography.org/hydrostatic-hadal',
      retrievedAt: new Date().toISOString(),
      excerpt: 'Hydrostatic pressure exceeds one thousand atmospheres in the deepest hadal trenches, exerting enormous compressive stress.',
      confidenceScore: 0.95,
      claimType: 'FACTUAL'
    }
  ];

  describe('Dynamic Narrative Structure & Variable Scene Counts', () => {
    it('dynamically adapts scene counts based on target duration (not locked to 9)', () => {
      const plan30 = ContentPlanEngine.createDynamicPlan({
        topic: 'Mariana Trench',
        templateId: 'facts.deep-explainer.v1',
        targetDurationSeconds: 30
      });
      expect(plan30.scenes.length).toBe(4);

      const plan60 = ContentPlanEngine.createDynamicPlan({
        topic: 'Mariana Trench',
        templateId: 'facts.deep-explainer.v1',
        targetDurationSeconds: 60
      });
      expect(plan60.scenes.length).toBe(8);

      const plan180 = ContentPlanEngine.createDynamicPlan({
        topic: 'Mariana Trench',
        templateId: 'facts.deep-explainer.v1',
        targetDurationSeconds: 180
      });
      expect(plan180.scenes.length).toBe(12);

      // Verify that scene duration sums equal targetDurationSeconds
      const sumDurations = plan60.scenes.reduce((acc, s) => acc + s.durationIntent.target, 0);
      expect(Math.abs(sumDurations - 60)).toBeLessThan(0.01);
    });

    it('respects explicit scene count override when provided', () => {
      const plan = ContentPlanEngine.createDynamicPlan({
        topic: 'Mariana Trench',
        templateId: 'facts.deep-explainer.v1',
        targetDurationSeconds: 60,
        sceneCountOverride: 6
      });
      expect(plan.scenes.length).toBe(6);
      const sumDurations = plan.scenes.reduce((acc, s) => acc + s.durationIntent.target, 0);
      expect(Math.abs(sumDurations - 60)).toBeLessThan(0.01);
    });
  });

  describe('Template Diversity on the Same Topic', () => {
    it('generates distinctly different narrative structures and shot recipes for different templates', () => {
      const topic = 'The Fall of Constantinople';

      // 1. Facts Deep Explainer
      const factsPlan = ContentPlanEngine.createDynamicPlan({
        topic,
        templateId: 'facts.deep-explainer.v1',
        targetDurationSeconds: 60
      });

      // 2. History Timeline
      const historyPlan = ContentPlanEngine.createDynamicPlan({
        topic,
        templateId: 'history.timeline.v1',
        targetDurationSeconds: 60
      });

      // Categories must differ
      expect(factsPlan.contentCategory).toBe('FACTS');
      expect(historyPlan.contentCategory).toBe('HISTORY');

      // Narrative arcs must differ
      expect(factsPlan.narrativeArc).not.toBe(historyPlan.narrativeArc);
      expect(historyPlan.narrativeArc).toContain('Chronological Escalation');

      // Visual recipes must reflect template identities
      const factsRecipes = new Set(factsPlan.scenes.map((s) => s.shotRecipeId));
      const historyRecipes = new Set(historyPlan.scenes.map((s) => s.shotRecipeId));

      expect(factsRecipes.has('BIG_NUMBER')).toBe(true);
      expect(historyRecipes.has('MAP_ZOOM')).toBe(true);
      expect(historyRecipes.has('TIMELINE_BUILD')).toBe(true);
    });
  });

  describe('ClaimLedger Factual Provenance & DeepEval Faithfulness', () => {
    it('manages verified claims with deterministic content-addressed digest', () => {
      const ledger = new ClaimLedger(sampleClaims);
      expect(ledger.getAllClaims().length).toBe(2);

      const claim1 = ledger.getClaim('claim_hadal_01');
      expect(claim1).toBeDefined();
      expect(claim1?.publisher).toBe('National Oceanic and Atmospheric Survey');

      const digest = ledger.computeLedgerDigest();
      expect(typeof digest).toBe('string');
      expect(digest.length).toBe(64); // SHA-256
    });

    it('evaluates and passes faithful plans citing verified claims', () => {
      const ledger = new ClaimLedger(sampleClaims);
      const plan = ContentPlanEngine.createDynamicPlan({
        topic: 'Mariana Trench',
        templateId: 'facts.deep-explainer.v1',
        targetDurationSeconds: 60,
        claims: sampleClaims
      });

      const audit = ClaimFaithfulnessAdapter.evaluateFaithfulness(plan, ledger, 0.8);
      expect(audit.passed).toBe(true);
      expect(audit.overallFaithfulnessScore).toBeGreaterThanOrEqual(0.8);
      expect(audit.ungroundedStatements.length).toBe(0);
    });

    it('detects ungrounded statements and fails when cited claim is missing from ledger', () => {
      const ledger = new ClaimLedger(sampleClaims);
      const plan = ContentPlanEngine.createDynamicPlan({
        topic: 'Mariana Trench',
        templateId: 'facts.deep-explainer.v1',
        targetDurationSeconds: 60,
        claims: sampleClaims
      });

      // Mutate scene to reference non-existent unverified claim
      (plan.scenes[1] as any).claimIds = ['bogus_unverified_claim_999'];

      const audit = ClaimFaithfulnessAdapter.evaluateFaithfulness(plan, ledger, 0.85);
      expect(audit.passed).toBe(false);
      expect(audit.claimAudits.some((a) => a.claimId === 'bogus_unverified_claim_999' && !a.verified)).toBe(true);
      expect(audit.ungroundedStatements.length).toBeGreaterThan(0);
    });
  });
});

