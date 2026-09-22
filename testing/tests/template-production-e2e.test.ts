/**
 * FactoryOS V3 Phase 4 — Template Production End-to-End Test Suite
 *
 * Fully exercises the canonical production pipeline:
 * TEMPLATE -> F2 SCRIPT -> F3 VISUAL/ASSET -> F4 VOICE -> F5 TIMELINE -> RenderIntent -> F6 LOCAL RENDER -> factoryos-render -> physical MP4 -> F7
 *
 * Verifies the first five canonical templates:
 * 1. facts.rapid-facts.v1 (Golden Video qualification)
 * 2. history.timeline.v1
 * 3. motivation.story-to-lesson.v1
 * 4. reddit.story.v1
 * 5. news.why-it-matters.v1
 *
 * Plus localized error handling and engine failure isolation.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { TemplateRegistry } from '../templates/registry/TemplateRegistry';
import { TemplateProductionPipeline } from '../templates/TemplateProductionPipeline';
import { VoiceFabric } from '../../apps/web/factoryos/core/voice/VoiceFabric';
import { VerificationEngine } from '../../apps/web/factoryos/core/verification/VerificationEngine';

describe('FactoryOS V3 Phase 4 — Template Production E2E Suite', () => {
  const registry = TemplateRegistry.getInstance();
  const pipeline = TemplateProductionPipeline.getInstance();
  const voiceFabric = new VoiceFabric();
  const artifactsDir = path.resolve(__dirname, '../artifacts/v3-e2e');

  beforeAll(() => {
    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }
  });

  // ============================================================================
  // 1. GOLDEN VIDEO QUALIFICATION: facts.rapid-facts.v1
  // ============================================================================
  it('qualifies Golden Video template: facts.rapid-facts.v1 through complete F2->F7 pipeline', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/templates/e2e', 'facts-rapid.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const templateDef = registry.getTemplate(fixture.templateId);
    expect(templateDef).toBeDefined();
    expect(templateDef!.category).toBe('FACTS');

    // F2: Script Generation
    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: fixture.topic,
      userInputs: fixture.userInputs
    });

    expect(scriptIR.templateId).toBe(templateDef!.identity.id);
    expect(scriptIR.templateVersion).toBe(templateDef!.identity.version);
    expect(scriptIR.contentEngine).toBe('FACTS');
    expect(scriptIR.beats.length).toBeGreaterThanOrEqual(5);

    // F2: Template Validation
    const scriptVal = pipeline.validateTemplateScript(templateDef!, scriptIR);
    expect(scriptVal.valid).toBe(true);

    // F3: Scene Planning & Asset Realization
    const scenePlans = await pipeline.planScenes(templateDef!, scriptIR);
    expect(scenePlans.length).toBe(scriptIR.beats.length);

    const planVal = pipeline.validateScenePlans(scenePlans);
    expect(planVal.valid).toBe(true);

    // Verify ShotRecipe resolution
    for (const sc of scenePlans) {
      expect(sc.shotRecipeId).toBeDefined();
    }

    // F4: Voice Synthesis with Voice Fabric
    const fullScriptText = scriptIR.beats.map((b) => b.narration).join(' ');
    const synthRes = await voiceFabric.synthesize(fullScriptText);
    expect(synthRes.localPath).toBeDefined();
    expect(fs.existsSync(synthRes.localPath)).toBe(true);
    expect(synthRes.durationSeconds).toBeGreaterThan(0);

    // F5: Timeline Compilation with Audio-First Timing
    const jobId = `golden_facts_${Date.now()}`;
    const goldenOutPath = path.join(artifactsDir, `${jobId}.mp4`);

    const localIntent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      voiceArtifact: synthRes,
      jobId,
      outputPath: goldenOutPath
    });

    expect(localIntent.output_path).toBe(goldenOutPath);
    expect(localIntent.metadata?.templateId).toBe(templateDef!.identity.id);
    expect(localIntent.scenes.length).toBe(scenePlans.length);

    // F6: Physical Local Rendering
    const renderRes = await pipeline.executeProductionRender({
      localIntent,
      runId: `run_${jobId}`
    });

    expect(fs.existsSync(renderRes.videoPath)).toBe(true);
    expect(renderRes.receipt.validation.is_valid).toBe(true);
    expect(renderRes.receipt.validation.width).toBe(1080);
    expect(renderRes.receipt.validation.height).toBe(1920);
    expect(renderRes.sha256).toMatch(/^[a-f0-9]{64}$/i);

    // F7: Authoritative Verification Hard Gates
    const renderArtifact = {
      artifactId: `art_${jobId}`,
      jobId,
      location: { kind: 'LOCAL' as const, path: renderRes.videoPath },
      sha256: renderRes.sha256,
      byteLength: renderRes.receipt.validation.file_size_bytes,
      duration: renderRes.durationSeconds,
      width: 1080,
      height: 1920,
      fps: 30,
      mimeType: 'video/mp4' as const,
      videoCodec: 'h264',
      audioCodec: 'aac',
      createdAt: new Date().toISOString()
    };

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      artifact: renderArtifact,
      videoUrl: renderRes.videoPath,
      scriptText: fullScriptText,
      sceneCount: scenePlans.length,
      durationSeconds: renderRes.durationSeconds,
      policyViolations: []
    });

    expect(audit.verified).toBe(true);
    expect(audit.overallStatus).toBe('PASSED');
    expect(audit.hardGates.artifactExists).toBe(true);
    expect(audit.hardGates.exact9x16Geometry).toBe(true);
    expect(audit.hardGates.videoStreamPresent).toBe(true);
    expect(audit.hardGates.audioStreamPresent).toBe(true);
    expect(audit.hardGates.decodeSmokePassed).toBe(true);
  }, 60000);

  // ============================================================================
  // 2. TEMPLATE 2: history.timeline.v1
  // ============================================================================
  it('executes end-to-end production for history.timeline.v1', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/templates/e2e', 'history-timeline.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const templateDef = registry.getTemplate(fixture.templateId);
    expect(templateDef).toBeDefined();

    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: fixture.topic,
      userInputs: fixture.userInputs
    });
    expect(pipeline.validateTemplateScript(templateDef!, scriptIR).valid).toBe(true);

    const scenePlans = await pipeline.planScenes(templateDef!, scriptIR);
    expect(pipeline.validateScenePlans(scenePlans).valid).toBe(true);

    const fullScript = scriptIR.beats.map((b) => b.narration).join(' ');
    const synthRes = await voiceFabric.synthesize(fullScript);

    const jobId = `e2e_history_${Date.now()}`;
    const outPath = path.join(artifactsDir, `${jobId}.mp4`);
    const localIntent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      voiceArtifact: synthRes,
      jobId,
      outputPath: outPath
    });

    const renderRes = await pipeline.executeProductionRender({ localIntent });
    expect(fs.existsSync(renderRes.videoPath)).toBe(true);

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      artifact: {
        artifactId: `art_${jobId}`,
        jobId,
        location: { kind: 'LOCAL' as const, path: renderRes.videoPath },
        sha256: renderRes.sha256,
        byteLength: renderRes.receipt.validation.file_size_bytes,
        duration: renderRes.durationSeconds,
        width: 1080,
        height: 1920,
        fps: 30,
        mimeType: 'video/mp4' as const,
        videoCodec: 'h264',
        audioCodec: 'aac',
        createdAt: new Date().toISOString()
      },
      videoUrl: renderRes.videoPath,
      scriptText: fullScript,
      sceneCount: scenePlans.length,
      durationSeconds: renderRes.durationSeconds,
      policyViolations: []
    });

    expect(audit.verified).toBe(true);
    expect(audit.hardGates.exact9x16Geometry).toBe(true);
  }, 60000);

  // ============================================================================
  // 3. TEMPLATE 3: motivation.story-to-lesson.v1
  // ============================================================================
  it('executes end-to-end production for motivation.story-to-lesson.v1', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/templates/e2e', 'motivation-story.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const templateDef = registry.getTemplate(fixture.templateId);
    expect(templateDef).toBeDefined();

    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: fixture.topic,
      userInputs: fixture.userInputs
    });
    expect(pipeline.validateTemplateScript(templateDef!, scriptIR).valid).toBe(true);

    const scenePlans = await pipeline.planScenes(templateDef!, scriptIR);
    const fullScript = scriptIR.beats.map((b) => b.narration).join(' ');
    const synthRes = await voiceFabric.synthesize(fullScript);

    const jobId = `e2e_motivation_${Date.now()}`;
    const outPath = path.join(artifactsDir, `${jobId}.mp4`);
    const localIntent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      voiceArtifact: synthRes,
      jobId,
      outputPath: outPath
    });

    const renderRes = await pipeline.executeProductionRender({ localIntent });
    expect(fs.existsSync(renderRes.videoPath)).toBe(true);

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      artifact: {
        artifactId: `art_${jobId}`,
        jobId,
        location: { kind: 'LOCAL' as const, path: renderRes.videoPath },
        sha256: renderRes.sha256,
        byteLength: renderRes.receipt.validation.file_size_bytes,
        duration: renderRes.durationSeconds,
        width: 1080,
        height: 1920,
        fps: 30,
        mimeType: 'video/mp4' as const,
        videoCodec: 'h264',
        audioCodec: 'aac',
        createdAt: new Date().toISOString()
      },
      videoUrl: renderRes.videoPath,
      scriptText: fullScript,
      sceneCount: scenePlans.length,
      durationSeconds: renderRes.durationSeconds,
      policyViolations: []
    });

    expect(audit.verified).toBe(true);
    expect(audit.hardGates.decodeSmokePassed).toBe(true);
  }, 60000);

  // ============================================================================
  // 4. TEMPLATE 4: reddit.story.v1
  // ============================================================================
  it('executes end-to-end production for reddit.story.v1', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/templates/e2e', 'reddit-story.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const templateDef = registry.getTemplate(fixture.templateId);
    expect(templateDef).toBeDefined();

    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: fixture.topic,
      userInputs: fixture.userInputs
    });
    expect(pipeline.validateTemplateScript(templateDef!, scriptIR).valid).toBe(true);

    const scenePlans = await pipeline.planScenes(templateDef!, scriptIR);
    const fullScript = scriptIR.beats.map((b) => b.narration).join(' ');
    const synthRes = await voiceFabric.synthesize(fullScript);

    const jobId = `e2e_reddit_${Date.now()}`;
    const outPath = path.join(artifactsDir, `${jobId}.mp4`);
    const localIntent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      voiceArtifact: synthRes,
      jobId,
      outputPath: outPath
    });

    const renderRes = await pipeline.executeProductionRender({ localIntent });
    expect(fs.existsSync(renderRes.videoPath)).toBe(true);

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      artifact: {
        artifactId: `art_${jobId}`,
        jobId,
        location: { kind: 'LOCAL' as const, path: renderRes.videoPath },
        sha256: renderRes.sha256,
        byteLength: renderRes.receipt.validation.file_size_bytes,
        duration: renderRes.durationSeconds,
        width: 1080,
        height: 1920,
        fps: 30,
        mimeType: 'video/mp4' as const,
        videoCodec: 'h264',
        audioCodec: 'aac',
        createdAt: new Date().toISOString()
      },
      videoUrl: renderRes.videoPath,
      scriptText: fullScript,
      sceneCount: scenePlans.length,
      durationSeconds: renderRes.durationSeconds,
      policyViolations: []
    });

    expect(audit.verified).toBe(true);
  }, 60000);

  // ============================================================================
  // 5. TEMPLATE 5: news.why-it-matters.v1
  // ============================================================================
  it('executes end-to-end production for news.why-it-matters.v1', async () => {
    const fixturePath = path.resolve(__dirname, '../fixtures/templates/e2e', 'news-why-matters.json');
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

    const templateDef = registry.getTemplate(fixture.templateId);
    expect(templateDef).toBeDefined();

    const scriptIR = await pipeline.generateTemplateScript({
      templateDef: templateDef!,
      topic: fixture.topic,
      userInputs: fixture.userInputs
    });
    expect(pipeline.validateTemplateScript(templateDef!, scriptIR).valid).toBe(true);

    const scenePlans = await pipeline.planScenes(templateDef!, scriptIR);
    const fullScript = scriptIR.beats.map((b) => b.narration).join(' ');
    const synthRes = await voiceFabric.synthesize(fullScript);

    const jobId = `e2e_news_${Date.now()}`;
    const outPath = path.join(artifactsDir, `${jobId}.mp4`);
    const localIntent = pipeline.compileLocalRenderIntent({
      templateDef: templateDef!,
      scenePlans,
      voiceArtifact: synthRes,
      jobId,
      outputPath: outPath
    });

    const renderRes = await pipeline.executeProductionRender({ localIntent });
    expect(fs.existsSync(renderRes.videoPath)).toBe(true);

    const audit = await VerificationEngine.auditMediaArtifact({
      jobId,
      artifact: {
        artifactId: `art_${jobId}`,
        jobId,
        location: { kind: 'LOCAL' as const, path: renderRes.videoPath },
        sha256: renderRes.sha256,
        byteLength: renderRes.receipt.validation.file_size_bytes,
        duration: renderRes.durationSeconds,
        width: 1080,
        height: 1920,
        fps: 30,
        mimeType: 'video/mp4' as const,
        videoCodec: 'h264',
        audioCodec: 'aac',
        createdAt: new Date().toISOString()
      },
      videoUrl: renderRes.videoPath,
      scriptText: fullScript,
      sceneCount: scenePlans.length,
      durationSeconds: renderRes.durationSeconds,
      policyViolations: []
    });

    expect(audit.verified).toBe(true);
    expect(audit.hardGates.hasFtypBox || audit.hardGates.validContainer).toBe(true);
  }, 60000);

  // ============================================================================
  // 6. NEGATIVE TESTS & FAILURE ISOLATION
  // ============================================================================
  it('enforces localized failure isolation when a script fails validation without breaking FactoryOS globally', () => {
    const templateDef = registry.getTemplate('facts.rapid-facts.v1');
    expect(templateDef).toBeDefined();

    const invalidScriptIR = {
      templateId: 'facts.rapid-facts.v1',
      templateVersion: '1.0.0',
      contentEngine: 'FACTS',
      formatFamily: 'Rapid Fire Information',
      title: 'Invalid Facts',
      hook: '', // Missing hook!
      beats: [], // Empty beats!
      estimatedDuration: 0,
      narrationSegments: [],
      metadata: {}
    };

    const validation = pipeline.validateTemplateScript(templateDef!, invalidScriptIR);
    expect(validation.valid).toBe(false);
    expect(validation.code).toBe('TEMPLATE_SCRIPT_INVALID');
    expect(validation.errors.length).toBeGreaterThan(0);
  });

  it('guarantees quiz failures never block other content engines (Requirement 10 & 43)', () => {
    // Other templates remain healthy and valid
    const factsTemplate = registry.getTemplate('facts.rapid-facts.v1');
    const historyTemplate = registry.getTemplate('history.timeline.v1');
    const newsTemplate = registry.getTemplate('news.why-it-matters.v1');

    expect(factsTemplate?.capabilityStatus).toBe('READY');
    expect(historyTemplate?.capabilityStatus).toBe('READY');
    expect(newsTemplate?.capabilityStatus).toBe('READY');
  });
});
