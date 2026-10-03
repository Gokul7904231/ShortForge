/**
 * Workflow Runtime — AI Factory OS Executor Engine
 *
 * Dynamically runs workflow pipelines structured via step configuration lists (DSL).
 * No hardcoded sequences. Integrates learning recommendations, approval suspenders,
 * metrics recording, and EventBus standardization.
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";

import { WorkflowLoader, type JobDefinition, type WorkflowManifest } from "../_loader";
import { RecommendationEngine, type Recommendation } from "../../lib/recommendation-engine";
import { EventBus, WorkflowEvents } from "../../ai/event-bus";
import { BenchmarkRecorder } from "../../ai/benchmark-db";
import { db } from "../../lib/firebase-admin";
import { DAGRunner } from "../../lib/scheduler/DAGRunner";
import { CapabilityManager } from "../../lib/capabilities/CapabilityManager";
import { IntelligentRouter, AIProfile } from "../../ai/intelligent-router";
import { CheckpointDB } from "../../lib/core/CheckpointDB";
import type { TreasuryModelExecutionContext } from "../../ai/provider";

// Ensure executors register
import { WorkflowStepRegistry } from "./step-registry";
import "./step-registry-init";

import { EngineDiscovery } from "../../lib/core/EngineDiscovery";

export interface StepMetric {
  step: string;
  startedAt: string;
  finishedAt: string;
  duration: number;
  provider: string;
  model: string;
  cost: number;
  tokens: number;
  cacheHit: boolean;
  worker: string;
  gpu: string;
  cpu: string;
  memory: string;
  attempt: number;
  success: boolean;
  error?: string;
}

export interface ExecutionContext {
  jobId: string;
  workflow: WorkflowManifest;
  job: JobDefinition;
  outputs: Record<string, any>;
  metrics: Record<string, StepMetric>;
  cache: any;
  logger: any;
  capabilities: any;
  recommendation: Recommendation;
  abortSignal?: AbortSignal;
  treasuryModelContext?: TreasuryModelExecutionContext;
  versions: {
    workflowVersion: string;
    engineVersion: string;
    promptVersion: string;
    providerVersion: string;
    rendererVersion: string;
    publisherVersion: string;
    storageVersion: string;
    jobVersion: string;
    runtimeVersion: string;
    okfVersion: string;
  };
}

export interface WorkflowResult {
  jobId: string;
  workflow: string;
  topic: string;
  success: boolean;
  outputs?: Record<string, any>;
  durationMs: number;
  error?: string;
  status: "completed" | "suspended" | "failed";
}

class WorkflowRuntimeClass {
  /**
   * Run a generation job through the dynamic steps workflow DSL.
   */
  async run(job: JobDefinition, signal?: AbortSignal): Promise<WorkflowResult> {
    const jobId = (job as any).jobId || `job_${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
    const startMs = Date.now();

    console.log(`[WorkflowRuntime] Commencing DSL job ${jobId} | workflow: "${job.engine}"`);
    EventBus.publish(WorkflowEvents.WORKFLOW_STARTED, { jobId, engine: job.engine, topic: job.topic }, jobId);
    CheckpointDB.logEvent(jobId, "workflow.started", { engine: job.engine, topic: job.topic });

    // Ensure dynamic engines are loaded
    await EngineDiscovery.discoverAll();
    await CapabilityManager.init();

    const workflow = WorkflowLoader.getWorkflow(job.engine);
    if (!workflow) {
      const error = `Workflow manifest for "${job.engine}" not found.`;
      EventBus.publish(WorkflowEvents.WORKFLOW_FAILED, { jobId, error }, jobId);
      CheckpointDB.logEvent(jobId, "workflow.failed", { error });
      return { jobId, workflow: job.engine, topic: job.topic, success: false, durationMs: 0, error, status: "failed" };
    }

    // Dynamic router profile sync
    try {
      const profile = (job.profile || workflow.renderProfile || "Balanced") as AIProfile;
      IntelligentRouter.setProfile(profile);
    } catch (err: any) {
      console.warn(`[WorkflowRuntime] Failed to sync profile to IntelligentRouter:`, err.message);
    }

    let versions = {
      workflowVersion: workflow.workflowVersion ?? "v1",
      engineVersion: workflow.version,
      promptVersion: "1.0",
      providerVersion: "1.0",
      rendererVersion: "2.0",
      publisherVersion: "1.0",
      storageVersion: "1.0",
      jobVersion: "1.0",
      runtimeVersion: "1.0",
      okfVersion: "1.0",
    };

    let context: ExecutionContext | null = null;
    let treasuryModelContext: TreasuryModelExecutionContext | undefined;

    try {
      const existingTreasuryContext =
        (job as any).treasuryModelContext ||
        (job as any).options?.treasuryModelContext;

      if (existingTreasuryContext) {
        treasuryModelContext =
          existingTreasuryContext as TreasuryModelExecutionContext;
      } else {
        const production = process.env.NODE_ENV === "production";
        let controller =
          (globalThis as any).__factoryOSController as
            | import("../../factoryos/core/controller/AutonomousFactoryController").AutonomousFactoryController
            | undefined;

        if (!controller) {
          const { AutonomousFactoryController } = await import(
            "../../factoryos/core/controller/AutonomousFactoryController"
          );
          controller = new AutonomousFactoryController({
            storageType: production ? "mongo" : "memory",
            mongoUri:
              process.env.FACTORYOS_MONGO_URI ||
              process.env.MONGODB_URI ||
              "mongodb://localhost:27017",
            strictPersistence: production,
            autoStartSwarm: false,
          });
          await controller.boot();
          (globalThis as any).__factoryOSController = controller;
        }

        if (controller.treasuryService && controller.overseer) {
          const missionId =
            String(
              (job as any).missionId ||
                (job as any).options?.missionId ||
                "mis_workflow_" + jobId,
            );
          const prepared =
            (job as any).overseerCommandId
              ? {
                  runId:
                    String(
                      (job as any).runId || "run_workflow_" + jobId,
                    ),
                  overseerCommandId: String(
                    (job as any).overseerCommandId,
                  ),
                }
              : controller.overseer.prepareEconomicCommand({
                  command:
                    "Workflow model execution: " +
                    String(job.engine) +
                    " / " +
                    String(job.topic),
                  missionId,
                  mode: "autonomous",
                });

          treasuryModelContext = {
            treasuryService: controller.treasuryService,
            accountId:
              process.env.FACTORYOS_TREASURY_ACCOUNT_ID ||
              "factoryos",
            overseerCommandId: prepared.overseerCommandId,
            missionId,
            runId: prepared.runId,
            floorId: "floor02_scripting",
            taskId: jobId + ":workflow-model",
            scopeFingerprint: crypto
              .createHash("sha256")
              .update(
                JSON.stringify({
                  jobId,
                  missionId,
                  engine: job.engine,
                  topic: job.topic,
                }),
              )
              .digest("hex"),
            priority: "NORMAL",
            maxRetries: 0,
            maxCostUsd: Number(
              process.env.FACTORYOS_MAX_INFERENCE_RESERVATION_USD ||
                "0.10",
            ),
            preferredProviderId:
              typeof (job as any).provider === "string"
                ? (job as any).provider
                : undefined,
            subtask: "workflow_step",
          };
        } else if (production) {
          throw new Error(
            "[WorkflowRuntime] Production model execution requires Treasury",
          );
        }
      }
      // 1. Get optimization recommendation from AI Factory OS Brain
      const recommendation = RecommendationEngine.recommend(job.engine);
      versions.promptVersion = recommendation.promptVersion;

      context = {
        jobId,
        workflow,
        job,
        outputs: {},
        metrics: {},
        cache: {},
        logger: console,
        capabilities: CapabilityManager,
        recommendation,
        abortSignal: signal,
        treasuryModelContext,
        versions,
      };

      // Save initial state to Firestore
      try {
        await db.collection("videos").doc(jobId).set({
          userId: "anonymous",
          jobId,
          topic: job.topic,
          status: "processing",
          createdAt: new Date().toISOString(),
          renderProfile: job.profile ?? workflow.renderProfile,
          versions,
        }, { merge: true });
      } catch (err: any) {
        console.warn(`[WorkflowRuntime] Initial Firestore logging failed: ${err.message}`);
      }

      CheckpointDB.saveCheckpoint(jobId, "started", "processing", { job, workflow, versions }, {});

      // ── Demo Mode ──────────────────────────────────────────────────────────
      const isDemo = (job as any).demo === true || (job as any).options?.demo === true;
      if (isDemo) {
        console.log(`[WorkflowRuntime] [${jobId}] DEMO MODE activated — simulating generation pipeline...`);

        const demoSteps = ["script", "critic", "scene", "voice", "image", "render", "upload", "publish"];
        const demoDelays: Record<string, number> = {
          script: 1800, critic: 1200, scene: 1500, voice: 3500,
          image: 2800, render: 4000, upload: 1000, publish: 800
        };

        for (const stepId of demoSteps) {
          if (signal?.aborted) break;
          const delay = demoDelays[stepId] ?? 1000;
          console.log(`[WorkflowRuntime] [DEMO] Step "${stepId}" starting...`);
          CheckpointDB.logEvent(jobId, "step.started", { stepId });
          EventBus.publish("step.started", { jobId, stepId }, jobId);
          await new Promise(r => setTimeout(r, delay));
          CheckpointDB.logEvent(jobId, "step.completed", { stepId, duration: delay });
          EventBus.publish("step.completed", { jobId, stepId, duration: delay }, jobId);
          console.log(`[WorkflowRuntime] [DEMO] Step "${stepId}" completed (${delay}ms simulated).`);
        }

        // Resolve a matching demo video by topic keywords
        const topicLower = (job.topic || "").toLowerCase();
        const demoCategoryMap: Record<string, string> = {
          history: "history", science: "science", coding: "coding",
          programming: "coding", flag: "flags", flags: "flags",
          logo: "logos", logos: "logos", movie: "movies", film: "movies",
          animal: "animals", nature: "animals"
        };
        let demoCategory = "general";
        for (const [keyword, cat] of Object.entries(demoCategoryMap)) {
          if (topicLower.includes(keyword)) { demoCategory = cat; break; }
        }

        const demoBasePath = path.join(process.cwd(), "data", "demo");
        const candidates = [
          path.join(demoBasePath, demoCategory, "demo.mp4"),
          path.join(demoBasePath, "general", "demo.mp4"),
        ];
        const demoVideoSrc = candidates.find(p => fs.existsSync(p));

        const { TempManager } = await import("../../lib/core/TempManager");
        const assetsDir = TempManager.getTempDir(jobId);
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
        const demoOutputPath = path.join(assetsDir, "final_video.mp4");

        if (demoVideoSrc) {
          fs.copyFileSync(demoVideoSrc, demoOutputPath);
          console.log(`[WorkflowRuntime] [DEMO] Copied pre-rendered video: ${demoVideoSrc} → ${demoOutputPath}`);
        } else {
          console.warn(`[WorkflowRuntime] [DEMO] No pre-rendered demo video found. Writing placeholder.`);
          fs.writeFileSync(demoOutputPath, Buffer.alloc(0));
        }

        // Write Generation Manifest for demo run
        const demoManifest = {
          jobId, topic: job.topic, mode: job.profile || "AUTO",
          provider: "edge", maleVoice: "en-US-GuyNeural", femaleVoice: "en-US-JennyNeural",
          questionCount: 6, imageCountPerQuestion: 4, totalImages: 26,
          audioDuration: 58.4, videoDuration: 60.0,
          validation: "PASS (DEMO)", renderTimestamp: new Date().toISOString(), demo: true
        };
        const manifestDir = path.join(process.cwd(), "data", "manifests");
        if (!fs.existsSync(manifestDir)) fs.mkdirSync(manifestDir, { recursive: true });
        fs.writeFileSync(path.join(manifestDir, `${jobId}-manifest.json`), JSON.stringify(demoManifest, null, 2));

        const demoMs = Date.now() - startMs;
        try {
          await db.collection("videos").doc(jobId).set({
            status: "completed",
            videoUrl: `/api/media/video/${jobId}`,
            renderDurationSeconds: Math.round(demoMs / 1000),
            demo: true,
          }, { merge: true });
        } catch {}

        CheckpointDB.saveCheckpoint(jobId, "completed", "completed", { job, workflow, versions }, { videoPath: demoOutputPath });
        CheckpointDB.logEvent(jobId, "workflow.completed", { durationMs: demoMs, demo: true });
        EventBus.publish(WorkflowEvents.WORKFLOW_COMPLETED, { jobId, durationMs: demoMs, demo: true }, jobId);
        console.log(`[WorkflowRuntime] [DEMO] Simulation complete in ${demoMs}ms.`);

        return {
          jobId, workflow: job.engine, topic: job.topic, success: true,
          outputs: { videoPath: demoOutputPath, generationManifest: demoManifest },
          durationMs: demoMs, status: "completed"
        };
      }


      const defaultSteps = [
        { id: "script",  enabled: true, dependsOn: [] },
        { id: "critic",  enabled: true, dependsOn: ["script"] },
        { id: "scene",   enabled: true, dependsOn: ["script"] },
        { id: "voice",   enabled: true, dependsOn: ["script"] },
        { id: "image",   enabled: true, dependsOn: ["scene"] },
        { id: "render",  enabled: true, dependsOn: ["voice", "image"] },
        { id: "upload",  enabled: true, dependsOn: ["render"] },
        { id: "publish", enabled: true, dependsOn: ["upload"] },
      ];
      
      const rawSteps = workflow.steps ?? defaultSteps;
      const workflowSteps = rawSteps.map((step: any) => {
        if (step.dependsOn) return step;
        const defaultMatch = defaultSteps.find(s => s.id === step.id);
        return {
          ...step,
          dependsOn: defaultMatch ? defaultMatch.dependsOn : []
        };
      });

      // 3. Execute steps via DAG Scheduler (parallel-aware topological sort)
      await DAGRunner.run(workflowSteps, context, async (step, ctx) => {
        // Human approval suspender gate
        if (step.approvalRequired || (step.id === "critic" && job.options?.humanApproval)) {
          console.log(`[WorkflowRuntime] [${jobId}] Step "${step.id}" requires approval. Suspending...`);
          await db.collection("videos").doc(jobId).set({
            status: "waiting_approval",
            suspendedStep: step.id,
            script: ctx.outputs.script || null,
          }, { merge: true });
          EventBus.publish("job.approval_required", { jobId, stepId: step.id, context: { outputs: ctx.outputs } }, jobId);
          CheckpointDB.saveCheckpoint(jobId, step.id, "suspended", { job, workflow, versions }, ctx.outputs);
          CheckpointDB.logEvent(jobId, "step.suspended", { stepId: step.id });
          throw new Error(`__SUSPENDED__:${step.id}`);
        }

        const executor = WorkflowStepRegistry.get(step.id);
        if (!executor) throw new Error(`Step executor for "${step.id}" is not registered.`);

        // Per-step StepMetric telemetry
        const stepStartedAt = new Date().toISOString();
        const stepT0 = Date.now();
        const maxRetries = step.retry ?? 1;
        let attempt = 0;
        let stepErr: any = null;

        CheckpointDB.logEvent(jobId, "step.started", { stepId: step.id });

        while (attempt < maxRetries) {
          try {
            attempt++;
            await executor(ctx);
            const finishedAt = new Date().toISOString();
            ctx.metrics[step.id] = {
              step: step.id,
              startedAt: stepStartedAt,
              finishedAt,
              duration: Date.now() - stepT0,
              provider: ctx.recommendation.provider,
              model: ctx.recommendation.model,
              cost: ctx.recommendation.expectedCost,
              tokens: 0,
              cacheHit: false,
              worker: `cpu-${process.pid}`,
              gpu: ctx.capabilities?.getReport()?.gpuName ?? "none",
              cpu: ctx.capabilities?.getReport()?.cpuModel ?? "unknown",
              memory: `${ctx.capabilities?.getReport()?.totalMemoryGB ?? 0}GB`,
              attempt,
              success: true,
            };
            CheckpointDB.saveCheckpoint(jobId, step.id, "processing", { job, workflow, versions }, ctx.outputs);
            CheckpointDB.logEvent(jobId, "step.completed", { stepId: step.id, duration: Date.now() - stepT0 });
            EventBus.publish("step.completed", { jobId, stepId: step.id, duration: Date.now() - stepT0 }, jobId);
            return;
          } catch (err: any) {
            stepErr = err;
            if (err.message?.startsWith("__SUSPENDED__")) throw err;
            console.warn(`[WorkflowRuntime] Step "${step.id}" attempt ${attempt} failed: ${err.message}`);
          }
        }

        ctx.metrics[step.id] = {
          step: step.id, startedAt: stepStartedAt,
          finishedAt: new Date().toISOString(),
          duration: Date.now() - stepT0,
          provider: ctx.recommendation.provider, model: ctx.recommendation.model,
          cost: 0, tokens: 0, cacheHit: false,
          worker: `cpu-${process.pid}`, gpu: "none", cpu: "unknown", memory: "0GB",
          attempt, success: false, error: stepErr?.message,
        };
        CheckpointDB.saveCheckpoint(jobId, step.id, "failed", { job, workflow, versions }, ctx.outputs);
        CheckpointDB.logEvent(jobId, "step.failed", { stepId: step.id, error: stepErr?.message });
        throw new Error(`Step "${step.id}" failed after ${maxRetries} attempts: ${stepErr?.message}`);
      });

      const durationMs = Date.now() - startMs;
      console.log(`[WorkflowRuntime] [${jobId}] Completed successfully in ${durationMs}ms`);

      // Update Firestore to complete with full telemetry
      try {
        await db.collection("videos").doc(jobId).set({
          status: "completed",
          videoUrl: `/api/media/video/${jobId}`,
          renderDurationSeconds: Math.round(durationMs / 1000),
          sha256: context.outputs.sha256 ?? null,
          telemetry: context.metrics,
          capabilities: CapabilityManager.getReport(),
        }, { merge: true });
      } catch {}

      CheckpointDB.saveCheckpoint(jobId, "completed", "completed", { job, workflow, versions }, context.outputs);
      CheckpointDB.logEvent(jobId, "workflow.completed", { durationMs });
      EventBus.publish(WorkflowEvents.WORKFLOW_COMPLETED, { jobId, durationMs, telemetry: context.metrics }, jobId);

      // Record benchmark metrics
      await BenchmarkRecorder.record({
        task: jobId,
        provider: recommendation.provider,
        model: recommendation.model,
        capability: "SCRIPT",
        promptHash: Buffer.from(job.topic).toString("base64").slice(0, 16),
        responseHash: Buffer.from(context?.outputs?.script ?? "").toString("base64").slice(0, 16),
        executionTime: durationMs,
        memoryUsage: 0,
        cpuUsage: 0,
        gpuUsage: 0,
        temperature: 0.8,
        maxTokens: 1200,
        costUSD: recommendation.expectedCost,
        jsonSuccess: true,
        retryCount: 0,
      });

      return {
        jobId,
        workflow: job.engine,
        topic: job.topic,
        success: true,
        outputs: context?.outputs ?? {},
        durationMs,
        status: "completed",
      };

    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      console.error(`[WorkflowRuntime] DSL execution failed:`, err.message);
      
      try {
        await db.collection("videos").doc(jobId).set({
          status: "failed",
          error: err.message,
          renderDurationSeconds: Math.round(durationMs / 1000),
        }, { merge: true });
      } catch {}

      const failedStepId = err.message?.includes('Step "') ? err.message.split('"')[1] : "failed";
      CheckpointDB.saveCheckpoint(jobId, failedStepId, "failed", { job, workflow, versions }, context?.outputs ?? {});
      CheckpointDB.logEvent(jobId, "workflow.failed", { error: err.message });
      EventBus.publish(WorkflowEvents.WORKFLOW_FAILED, { jobId, error: err.message }, jobId);
      return {
        jobId,
        workflow: job.engine,
        topic: job.topic,
        success: false,
        durationMs,
        error: err.message,
        status: "failed",
      };
    }
  }

  /**
   * Resumes execution of a suspended job step.
   */
  async resumeApproval(jobId: string, approvedScript: string): Promise<WorkflowResult> {
    const startMs = Date.now();
    console.log(`[WorkflowRuntime] Resuming approved job: ${jobId}`);

    try {
      const doc = await db.collection("videos").doc(jobId).get();
      if (!doc.exists) throw new Error(`Job ${jobId} not found.`);
      const jobData = doc.data()!;

      // Restore baseline context
      const workflow = WorkflowLoader.getWorkflow(jobData.renderProfile ?? "quiz")!;
      const recommendation = RecommendationEngine.recommend(workflow.id);

      const context: ExecutionContext = {
        jobId,
        workflow,
        job: { engine: workflow.id, topic: jobData.topic },
        outputs: { script: approvedScript },
        metrics: {},
        cache: {},
        logger: console,
        capabilities: CapabilityManager,
        recommendation,
        versions: jobData.versions,
      };

      await db.collection("videos").doc(jobId).set({ status: "processing", suspendedStep: null }, { merge: true });

      // Run remaining steps (steps after script/critic)
      const workflowSteps = workflow.steps ?? [
        { id: "script", enabled: true },
        { id: "critic", enabled: true },
        { id: "scene", enabled: true },
        { id: "voice", enabled: true },
        { id: "image", enabled: true },
        { id: "render", enabled: true },
        { id: "upload", enabled: true },
        { id: "publish", enabled: true }
      ];

      const suspendedIndex = workflowSteps.findIndex((s) => s.id === jobData.suspendedStep);
      const remainingSteps = workflowSteps.slice(suspendedIndex + 1);

      await DAGRunner.run(remainingSteps, context, async (step, ctx) => {
        const executor = WorkflowStepRegistry.get(step.id);
        if (!executor) throw new Error(`Step executor for "${step.id}" is not registered.`);
        await executor(ctx);
      });

      const durationMs = Date.now() - startMs;
      await db.collection("videos").doc(jobId).set({
        status: "completed",
        videoUrl: `/api/media/video/${jobId}`,
      }, { merge: true });
      EventBus.publish(WorkflowEvents.WORKFLOW_COMPLETED, { jobId, durationMs }, jobId);

      return {
        jobId,
        workflow: workflow.id,
        topic: jobData.topic,
        success: true,
        outputs: context.outputs,
        durationMs,
        status: "completed",
      };

    } catch (err: any) {
      console.error(`[WorkflowRuntime] Resume approval failed for ${jobId}:`, err.message);
      EventBus.publish(WorkflowEvents.WORKFLOW_FAILED, { jobId, error: err.message }, jobId);
      return {
        jobId,
        workflow: "quiz",
        topic: "Resume Failed",
        success: false,
        durationMs: Date.now() - startMs,
        error: err.message,
        status: "failed",
      };
    }
  }

  /**
   * Replays/Resumes a failed job from a specific step onward using SQLite checkpoints.
   */
  async replay(jobId: string, resumeStepName: string, signal?: AbortSignal): Promise<WorkflowResult> {
    const startMs = Date.now();
    console.log(`[WorkflowRuntime] Replaying job ${jobId} starting from step "${resumeStepName}"`);

    const checkpoint = CheckpointDB.getCheckpoint(jobId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found for job ${jobId}`);
    }

    const contextSnapshot = JSON.parse(checkpoint.context_snapshot);
    const prevOutputs = JSON.parse(checkpoint.outputs);
    const { job, workflow, versions } = contextSnapshot;

    CheckpointDB.logEvent(jobId, "workflow.replayed", { resumeStepName });

    // Ensure dynamic engines are loaded
    await EngineDiscovery.discoverAll();
    await CapabilityManager.init();

    try {
      const context: ExecutionContext = {
        jobId,
        workflow,
        job,
        outputs: prevOutputs,
        metrics: {},
        cache: {},
        logger: console,
        capabilities: CapabilityManager,
        recommendation: RecommendationEngine.recommend(job.engine),
        abortSignal: signal,
        versions,
      };

      // Resolve steps or use standard DAG list
      const defaultSteps = [
        { id: "script",  enabled: true, dependsOn: [] },
        { id: "critic",  enabled: true, dependsOn: ["script"] },
        { id: "scene",   enabled: true, dependsOn: ["script"] },
        { id: "voice",   enabled: true, dependsOn: ["script"] },
        { id: "image",   enabled: true, dependsOn: ["scene"] },
        { id: "render",  enabled: true, dependsOn: ["voice", "image"] },
        { id: "upload",  enabled: true, dependsOn: ["render"] },
        { id: "publish", enabled: true, dependsOn: ["upload"] },
      ];
      
      const rawSteps = workflow.steps ?? defaultSteps;
      const workflowSteps = rawSteps.map((step: any) => {
        if (step.dependsOn) return step;
        const defaultMatch = defaultSteps.find(s => s.id === step.id);
        return {
          ...step,
          dependsOn: defaultMatch ? defaultMatch.dependsOn : []
        };
      });

      // Identify steps that are pre-completed (any step that sits before the resume step)
      const stepIndex = workflowSteps.findIndex((s: any) => s.id === resumeStepName);
      const preCompletedList = stepIndex > 0 ? workflowSteps.slice(0, stepIndex).map((s: any) => s.id) : [];

      // Remove the resume step and subsequent steps from outputs so they are re-run
      const stepsToRun = workflowSteps.slice(stepIndex);
      for (const step of stepsToRun) {
        delete context.outputs[step.id];
      }

      await DAGRunner.run(workflowSteps, context, async (step, ctx) => {
        // Human approval suspender gate
        if (step.approvalRequired || (step.id === "critic" && job.options?.humanApproval)) {
          console.log(`[WorkflowRuntime] [${jobId}] Step "${step.id}" requires approval. Suspending...`);
          await db.collection("videos").doc(jobId).set({
            status: "waiting_approval",
            suspendedStep: step.id,
            script: ctx.outputs.script || null,
          }, { merge: true });
          EventBus.publish("job.approval_required", { jobId, stepId: step.id, context: { outputs: ctx.outputs } }, jobId);
          CheckpointDB.saveCheckpoint(jobId, step.id, "suspended", { job, workflow, versions }, ctx.outputs);
          CheckpointDB.logEvent(jobId, "step.suspended", { stepId: step.id });
          throw new Error(`__SUSPENDED__:${step.id}`);
        }

        const executor = WorkflowStepRegistry.get(step.id);
        if (!executor) throw new Error(`Step executor for "${step.id}" is not registered.`);

        const stepStartedAt = new Date().toISOString();
        const stepT0 = Date.now();
        const maxRetries = step.retry ?? 1;
        let attempt = 0;
        let stepErr: any = null;

        CheckpointDB.logEvent(jobId, "step.started", { stepId: step.id });

        while (attempt < maxRetries) {
          try {
            attempt++;
            await executor(ctx);
            const finishedAt = new Date().toISOString();
            ctx.metrics[step.id] = {
              step: step.id,
              startedAt: stepStartedAt,
              finishedAt,
              duration: Date.now() - stepT0,
              provider: ctx.recommendation.provider,
              model: ctx.recommendation.model,
              cost: ctx.recommendation.expectedCost,
              tokens: 0,
              cacheHit: false,
              worker: `cpu-${process.pid}`,
              gpu: ctx.capabilities?.getReport()?.gpuName ?? "none",
              cpu: ctx.capabilities?.getReport()?.cpuModel ?? "unknown",
              memory: `${ctx.capabilities?.getReport()?.totalMemoryGB ?? 0}GB`,
              attempt,
              success: true,
            };
            CheckpointDB.saveCheckpoint(jobId, step.id, "processing", { job, workflow, versions }, ctx.outputs);
            CheckpointDB.logEvent(jobId, "step.completed", { stepId: step.id, duration: Date.now() - stepT0 });
            EventBus.publish("step.completed", { jobId, stepId: step.id, duration: Date.now() - stepT0 }, jobId);
            return;
          } catch (err: any) {
            stepErr = err;
            if (err.message?.startsWith("__SUSPENDED__")) throw err;
            console.warn(`[WorkflowRuntime] Step "${step.id}" attempt ${attempt} failed: ${err.message}`);
          }
        }

        ctx.metrics[step.id] = {
          step: step.id, startedAt: stepStartedAt,
          finishedAt: new Date().toISOString(),
          duration: Date.now() - stepT0,
          provider: ctx.recommendation.provider, model: ctx.recommendation.model,
          cost: 0, tokens: 0, cacheHit: false,
          worker: `cpu-${process.pid}`, gpu: "none", cpu: "unknown", memory: "0GB",
          attempt, success: false, error: stepErr?.message,
        };
        CheckpointDB.saveCheckpoint(jobId, step.id, "failed", { job, workflow, versions }, ctx.outputs);
        CheckpointDB.logEvent(jobId, "step.failed", { stepId: step.id, error: stepErr?.message });
        throw new Error(`Step "${step.id}" failed after ${maxRetries} attempts: ${stepErr?.message}`);
      }, preCompletedList);

      const durationMs = Date.now() - startMs;
      console.log(`[WorkflowRuntime] [${jobId}] Completed successfully in ${durationMs}ms`);

      // Update Firestore to complete with full telemetry
      try {
        await db.collection("videos").doc(jobId).set({
          status: "completed",
          videoUrl: `/api/media/video/${jobId}`,
          renderDurationSeconds: Math.round(durationMs / 1000),
          sha256: context.outputs.sha256 ?? null,
          telemetry: context.metrics,
          capabilities: CapabilityManager.getReport(),
        }, { merge: true });
      } catch {}

      CheckpointDB.saveCheckpoint(jobId, "completed", "completed", { job, workflow, versions }, context.outputs);
      CheckpointDB.logEvent(jobId, "workflow.completed", { durationMs });
      EventBus.publish(WorkflowEvents.WORKFLOW_COMPLETED, { jobId, durationMs, telemetry: context.metrics }, jobId);

      return {
        jobId,
        workflow: job.engine,
        topic: job.topic,
        success: true,
        outputs: context.outputs,
        durationMs,
        status: "completed",
      };

    } catch (err: any) {
      const durationMs = Date.now() - startMs;
      console.error(`[WorkflowRuntime] DSL replay execution failed:`, err.message);
      CheckpointDB.saveCheckpoint(jobId, "failed", "failed", { job, workflow, versions }, prevOutputs);
      CheckpointDB.logEvent(jobId, "workflow.failed", { error: err.message });
      EventBus.publish(WorkflowEvents.WORKFLOW_FAILED, { jobId, error: err.message }, jobId);
      return {
        jobId,
        workflow: job.engine,
        topic: job.topic,
        success: false,
        durationMs,
        error: err.message,
        status: "failed",
      };
    }
  }
}

export const WorkflowRuntime = new WorkflowRuntimeClass();
// Compatibility aliases
export const EngineRuntime = WorkflowRuntime;
export type JobResult = WorkflowResult;
// Backward compat type alias
export type WorkflowContext = ExecutionContext;
