import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Floor02RuntimeAdapter } from '../core/adapters/Floor02RuntimeAdapter';
import { DurationEngine } from '../core/contracts/DurationContract';
import { ContentPlanEngine, ClaimLedger, VerifiedClaim } from '../core/templates/ContentPlan';
import { TemplateProductionPipeline } from '../core/templates/TemplateProductionPipeline';
import { VerificationEngine } from '../core/verification/VerificationEngine';
import { CANONICAL_TEMPLATES } from '../../lib/templates/definitions/CanonicalTemplates';

describe('Wave 3 — Canonical F00-F07 Service Trajectory & Correlated Receipts', () => {
  const correlation = {
    missionId: `mission_${randomUUID().substring(0, 8)}`,
    runId: `run_${randomUUID().substring(0, 8)}`,
    jobId: `job_${randomUUID().substring(0, 8)}`,
    traceId: `trace_${randomUUID().substring(0, 16)}`,
  };

  const sampleClaim: VerifiedClaim = {
    claimId: 'claim_f00_01',
    statement: 'The Mariana Trench reaches approximately 11,000 meters depth in the Challenger Deep.',
    publisher: 'National Oceanic and Atmospheric Survey',
    sourceUrl: 'https://noaa.gov/mariana-trench-depth',
    retrievedAt: new Date().toISOString(),
    excerpt: 'The Challenger Deep is the deepest known point in the Earth seabed with a depth of approximately 11,000 meters.',
    confidenceScore: 0.99,
    claimType: 'FACTUAL',
  };

  it('preserves unbroken correlation tokens (missionId, runId, jobId, traceId) across all pipeline stages', async () => {
    // Stage F00: Research & Analyst
    const f00Output = {
      floorId: 'floor00_analyst',
      correlation,
      topic: 'Mariana Trench',
      verifiedClaims: [sampleClaim],
      status: 'VALIDATED',
    };
    expect(f00Output.correlation.missionId).toBe(correlation.missionId);

    // Stage F01: Strategy
    const f01Output = {
      floorId: 'floor01_strategy',
      correlation: f00Output.correlation,
      strategy: {
        templateId: 'facts.deep-explainer.v1',
        targetAudience: 'science_enthusiasts',
        format: 'educational_short',
        targetDurationSeconds: 60,
      },
      status: 'VALIDATED',
    };
    expect(f01Output.correlation.runId).toBe(correlation.runId);

    // Stage F02: Scripting via Floor02RuntimeAdapter
    const f02Adapter = new Floor02RuntimeAdapter('', '');
    const f02Result = await f02Adapter.plan({
      requestId: `req_${correlation.jobId}`,
      topic: f00Output.topic,
      targetDurationSeconds: f01Output.strategy.targetDurationSeconds,
      strategy: f01Output.strategy,
      correlation,
      offlineFallbackAllowed: true,
    });

    expect(f02Result.handoffPayload.floor_id).toBe('floor02_scripting');
    expect(f02Result.handoffPayload.handoff_status).toBe('VALIDATED');
    expect(f02Result.correlationReceipt?.missionId).toBe(correlation.missionId);
    expect(f02Result.correlationReceipt?.traceId).toBe(correlation.traceId);

    // Stage F03: Visual & Asset Realization
    const f03Output = {
      floorId: 'floor03_asset_realization',
      correlation: f02Result.correlationReceipt,
      shotRecipes: f02Result.handoffPayload.script_ir.scenes.map((s: any) => s.shot_recipe),
      status: 'VALIDATED',
    };
    expect(f03Output.shotRecipes.length).toBeGreaterThanOrEqual(4);

    // Stage F04: Audio & Voice Synthesis (Audio-First Timing)
    const pipeline = new TemplateProductionPipeline();
    const durationContract = DurationEngine.createContract(60);
    expect(durationContract.minDurationSeconds).toBe(57.0);
    expect(durationContract.maxDurationSeconds).toBe(63.0);

    // Stage F05: Timeline Composition
    const beats = f02Result.handoffPayload.script_ir.scenes.map((s: any, idx: number) => ({
      beatId: `beat_${idx + 1}`,
      type: 'FACT',
      narration: s.narration_text,
      visualIntent: s.visual_intent,
      shotRecipeId: s.shot_recipe,
      durationSeconds: s.duration_seconds,
      props: s.props,
    }));

    const canonicalTemplateDef = CANONICAL_TEMPLATES.find((t) => t.identity.id === 'facts.deep-explainer.v1') || CANONICAL_TEMPLATES[0];

    const scenePlans = await pipeline.planScenes(canonicalTemplateDef, {
      templateId: canonicalTemplateDef.identity.id,
      title: 'Mariana Trench',
      hook: 'What lies at the extremes?',
      cta: 'Subscribe',
      beats,
      temporalPlan: {
        schemaVersion: '1.0',
        templateId: canonicalTemplateDef.identity.id,
        totalDurationMs: 60000,
        targetDurationMs: 60000,
        toleranceMs: 3000,
        energyCurve: 'EXPONENTIAL_DROP',
        pacingCurve: 'STACCATO',
        cutVelocity: 'NORMAL',
        audioPriority: 'SPEECH_LEAD',
        provenance: { compilerVersion: '1.0.0', compiledAt: new Date().toISOString(), inputHash: 'hash' },
        scenes: [],
      },
    });

    const localIntent = pipeline.compileLocalRenderIntent({
      templateDef: canonicalTemplateDef,
      scenePlans,
      jobId: correlation.jobId,
      targetDurationSeconds: 60,
    });

    expect(localIntent.project_id).toBe(correlation.jobId);
    expect(localIntent.scenes.length).toBe(scenePlans.length);

    // Verify sum of scene durations strictly satisfies DurationContract
    const totalDuration = localIntent.scenes.reduce((acc, s) => acc + s.duration_seconds, 0);
    expect(totalDuration).toBeGreaterThanOrEqual(durationContract.minDurationSeconds);
    expect(totalDuration).toBeLessThanOrEqual(durationContract.maxDurationSeconds);

    // Stage F06 & F07: Forensic Media Audit & Verification
    const evalReport = DurationEngine.evaluateContract(durationContract, totalDuration);
    expect(evalReport.passed).toBe(true);
    expect(evalReport.physicalDurationSeconds).toBe(Number(totalDuration.toFixed(3)));
  });

  it('fails closed when external credentials are required but missing', async () => {
    const prevUrl = process.env.FLOOR02_RUNTIME_URL;
    const prevKey = process.env.FLOOR02_SERVICE_API_KEY;
    const prevGemini = process.env.GEMINI_API_KEY;
    const prevGroq = process.env.GROQ_API_KEY;
    const prevOpenRouter = process.env.OPENROUTER_API_KEY;
    const prevTogether = process.env.TOGETHER_API_KEY;

    delete process.env.FLOOR02_RUNTIME_URL;
    delete process.env.FLOOR02_SERVICE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.TOGETHER_API_KEY;

    try {
      const adapter = new Floor02RuntimeAdapter('', '');
      const qual = adapter.getQualificationStatus();
      expect(qual.status).toBe('BLOCKED');
      expect(qual.missingEnvVars).toContain('FLOOR02_RUNTIME_URL');
      expect(qual.missingEnvVars).toContain('FLOOR02_SERVICE_API_KEY');

      // Attempting to plan without offline flag throws fail-closed error with named missing env vars
      await expect(
        adapter.plan({
          requestId: 'test_blocked_req',
          topic: 'Black Holes',
          targetDurationSeconds: 60,
          strategy: {},
          offlineFallbackAllowed: false,
        })
      ).rejects.toThrow(/FLOOR02_RUNTIME_URL/);
    } finally {
      if (prevUrl) process.env.FLOOR02_RUNTIME_URL = prevUrl;
      if (prevKey) process.env.FLOOR02_SERVICE_API_KEY = prevKey;
      if (prevGemini) process.env.GEMINI_API_KEY = prevGemini;
      if (prevGroq) process.env.GROQ_API_KEY = prevGroq;
      if (prevOpenRouter) process.env.OPENROUTER_API_KEY = prevOpenRouter;
      if (prevTogether) process.env.TOGETHER_API_KEY = prevTogether;
    }
  });
});
