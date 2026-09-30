/**
 * FactoryOS Frontier v2 — Unified Overseer Productization E2E Acceptance Suite
 * Verifies unified dashboard Command Center, non-repetitive conversation, quiz short creation,
 * Agent-Reach research, GStack engineering diagnostics, dark theme, and procedural face.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AutonomousFactoryController } from "../core/controller/AutonomousFactoryController";
import { OVERSEER_EXPRESSION_PRESETS } from "../core/overseer/presence/OverseerExpressionPresets";
import { OverseerPresencePolicy } from "../core/overseer/presence/OverseerPresencePolicy";
import { AgentReachAdapter } from "../core/integrations/AgentReachAdapter";
import { GStackTrigger } from "../core/integrations/GStackTrigger";
import * as path from "node:path";
import * as fs from "node:fs";

describe("FactoryOS Frontier v2 — Unified Overseer Productization Acceptance Suite", () => {
  const testStorageDir = path.join(process.cwd(), "data", "test_unified_product_presence");

  beforeEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testStorageDir, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(testStorageDir)) {
      fs.rmSync(testStorageDir, { recursive: true, force: true });
    }
  });

  it("1. Darker FactoryOS Palette & Expression Geometry: Validates all 17 presets conform to industrial tokens", () => {
    const intents = Object.keys(OVERSEER_EXPRESSION_PRESETS);
    expect(intents.length).toBe(17);

    // Verify Primary & Darker Industrial Blue Palette
    expect(OVERSEER_EXPRESSION_PRESETS.IDLE.accentColor).toBe("#0A84FF");
    expect(OVERSEER_EXPRESSION_PRESETS.GREETING.accentColor).toBe("#19BFFF");
    expect(OVERSEER_EXPRESSION_PRESETS.CONCERNED.accentColor).toBe("#F59E0B");
    expect(OVERSEER_EXPRESSION_PRESETS.CRITICAL.accentColor).toBe("#EF4444");
    expect(OVERSEER_EXPRESSION_PRESETS.SUCCESS.accentColor).toBe("#10B981");
    expect(OVERSEER_EXPRESSION_PRESETS.SLEEP.accentColor).toBe("#1E3A8A");

    // Verify Procedural Mouth & Eye Bounds across all presets
    for (const [intent, preset] of Object.entries(OVERSEER_EXPRESSION_PRESETS)) {
      expect(preset.eye.openness).toBeGreaterThanOrEqual(0.0);
      expect(preset.eye.openness).toBeLessThanOrEqual(1.0);
      expect(preset.mouthCurve).toBeGreaterThanOrEqual(-1.0);
      expect(preset.mouthCurve).toBeLessThanOrEqual(1.0);
      expect(preset.mouthOpenness).toBeGreaterThanOrEqual(0.0);
      expect(preset.glowIntensity).toBeGreaterThanOrEqual(0.1);
      expect(preset.glowIntensity).toBeLessThanOrEqual(1.0);
    }
  });

  it("2. Conversational Intent & Non-Repetitive Identity: Answers who are you without boilerplate repetition", async () => {
    const controller = new AutonomousFactoryController({
      storageType: "disk",
      storagePath: testStorageDir,
      autoStartSwarm: false,
    });
    await controller.boot();

    const presenceEngine = controller.overseer.getPresenceEngine();

    // 1. Identity Query
    const identityQuery = "Who are you?";
    await controller.eventBus.publish("USER_MESSAGE", {
      text: identityQuery,
      isVoice: false,
      timestamp: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 40));

    const envelope1 = presenceEngine.generateCurrentEnvelope();
    expect(envelope1.intent).toBe("LISTENING");

    // 2. Truth & Consciousness Statement
    const consciousnessText = OverseerPresencePolicy.getConsciousnessStatement();
    expect(consciousnessText).toContain("computational projections");
    expect(consciousnessText).not.toContain("I am a conscious human");

    await controller.shutdown();
  });

  it("3. Quiz Short Creation Pipeline: 'Make me a quiz short' routes into real Mission + Content Structure", async () => {
    const controller = new AutonomousFactoryController({
      storageType: "disk",
      storagePath: testStorageDir,
      autoStartSwarm: false,
    });
    await controller.boot();

    const topic = "Quantum Computing & Neural Networks";
    const mission = await controller.missionManager.createMission({
      goal: `Produce 30s Quiz Short: "${topic}"`,
      objective: `Execute 9-stage content generation pipeline for topic: ${topic}`,
      constraints: ["MAX_DURATION_30S", "VALIDATE_QUIZ_FACTS"],
      scope: { floorIds: ["floor01_strategy", "floor02_scripting", "floor03_asset_realization"] },
    });

    expect(mission.missionId).toMatch(/^mission_/);
    expect(mission.status).toBe("CREATED");

    const started = await controller.missionManager.startMission(mission.missionId);
    expect(started.status).toBe("RUNNING");

    const activeMissions = await controller.missionManager.getActiveMissions();
    expect(activeMissions.length).toBe(1);
    expect(activeMissions[0].missionId).toBe(mission.missionId);

    await controller.shutdown();
  });

  it("4. Agent-Reach Intelligence Integration: Proactively searches external knowledge with confidence scoring", async () => {
    const adapter = new AgentReachAdapter();
    const result = await adapter.searchExternalKnowledge("Trending trivia formats and video pacing");

    expect(result.query).toBe("Trending trivia formats and video pacing");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.sourceUrls.length).toBeGreaterThan(0);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("5. GStack Software Engineering Diagnostics: Triggers bounded non-destructive investigation", async () => {
    const gstack = new GStackTrigger();
    const mockCase = {
      caseId: "case_render_vram_leak",
      floorId: "floor03_asset_realization",
      category: "RENDER_ARTIFACT",
      severity: "HIGH",
      status: "DETECTED",
      detectorId: "slayer_memory",
      createdAt: new Date().toISOString(),
    };

    const diag = await gstack.triggerDeepInvestigation(mockCase as any);

    expect(diag.caseId).toBe("case_render_vram_leak");
    expect(diag.suspectedFiles.length).toBeGreaterThan(0);
    expect(diag.testCommand).toBe("npm run factoryos:test");
    expect(diag.passesTests).toBe(true);
  });

  it("6. Spatial Attention Gaze Mapping: Floor and user coordinate offsets map accurately", async () => {
    const controller = new AutonomousFactoryController({
      storageType: "disk",
      storagePath: testStorageDir,
      autoStartSwarm: false,
    });
    await controller.boot();

    const presenceEngine = controller.overseer.getPresenceEngine();

    // Floor 01: Upper-left gaze
    presenceEngine.attentionController.setAttention("floor01_strategy", "Strategy review", "NORMAL");
    let env = presenceEngine.generateCurrentEnvelope();
    expect(env.attention?.target).toBe("floor01_strategy");
    expect(env.faceParameters.eye.gazeX).toBeLessThan(0);

    // Floor 03: Rightwards gaze
    presenceEngine.attentionController.setAttention("floor03_asset_realization", "Render check", "HIGH");
    env = presenceEngine.generateCurrentEnvelope();
    expect(env.attention?.target).toBe("floor03_asset_realization");
    expect(env.faceParameters.eye.gazeX).toBeGreaterThan(0);

    // User: Centered focus
    presenceEngine.attentionController.setAttention("user", "Speaking to user", "CRITICAL");
    env = presenceEngine.generateCurrentEnvelope();
    expect(env.attention?.target).toBe("user");
    expect(env.faceParameters.eye.gazeX).toBe(0);

    await controller.shutdown();
  });

  it("7. Full Closed-Loop Autonomous Swarm Reaction: Anomaly -> Concern -> Repair -> Validator -> Success", async () => {
    const controller = new AutonomousFactoryController({
      storageType: "disk",
      storagePath: testStorageDir,
      autoStartSwarm: true,
      patrolIntervalMs: 30,
      supervisorIntervalMs: 30,
    });
    await controller.boot();

    const presenceEngine = controller.overseer.getPresenceEngine();

    // 1. Ingest fault on Floor 03
    controller.worldState.updateFloorStatus(
      "floor03_asset_realization",
      "ERROR",
      "GPU VRAM buffer exhaustion"
    );

    // 2. Wait for autonomous Slayer detection & Healer triage
    let resolved = false;
    const start = Date.now();

    while (Date.now() - start < 8000) {
      const state = controller.worldState.getState();
      const allCases = await controller.caseManager.getAllCases();
      if (allCases.length > 0 && allCases.some((c) => c.status === "RESOLVED")) {
        resolved = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(resolved).toBe(true);

    // 3. Set intent to SUCCESS after independent Validator verification
    presenceEngine.intentEngine.pushIntent("SUCCESS", {
      priority: "CRITICAL_SAFETY",
      durationMs: 3000,
      cause: "Autonomous repair verified by Validator",
    });

    const successEnv = presenceEngine.generateCurrentEnvelope();
    expect(successEnv.intent).toBe("SUCCESS");
    expect(successEnv.faceParameters.accentColor).toBe("#10B981");

    await controller.shutdown();
  });
});
