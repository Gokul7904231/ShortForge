import { ServiceRegistry } from "./ServiceRegistry";
import { RenderQueue, QueueJob, JobStatus } from "./RenderQueue";
import { CheckpointDB } from "./CheckpointDB";
import { WorkflowRuntime } from "../../content-engines/_runtime/workflow-runtime";
import { EventBus, WorkflowEvents } from "../../ai/event-bus";
import crypto from "crypto";

export class RenderQueueProcessor {
  private _queue: RenderQueue | null = null;
  private workerId: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private activeJobs = new Map<string, NodeJS.Timeout>(); // jobId -> heartbeatInterval

  private get queue(): RenderQueue {
    if (this._queue) return this._queue;
    if (!ServiceRegistry.has("renderQueue")) {
      const { SQLiteRenderQueue } = require("./SQLiteRenderQueue");
      ServiceRegistry.register("renderQueue", new SQLiteRenderQueue());
    }
    this._queue = ServiceRegistry.get<RenderQueue>("renderQueue");
    return this._queue;
  }

  constructor() {
    this.workerId = `worker_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * Starts the background processor polling loop
   */
  start(intervalMs = 3000): void {
    if (this.pollInterval) return;

    // FactoryOS is the production execution authority. This daemon is retained only
    // for explicit legacy compatibility when ENABLE_LEGACY_QUEUE_PROCESSOR=true.
    const executionAuthority = (process.env.EXECUTION_AUTHORITY || "factoryos").toLowerCase();
    if (executionAuthority === "factoryos" && process.env.ENABLE_LEGACY_QUEUE_PROCESSOR !== "true") {
      console.log("[RenderQueueProcessor] FactoryOS authority active; legacy queue processor disabled.");
      return;
    }

    console.log(`[RenderQueueProcessor] Starting queue processor daemon. Worker ID: ${this.workerId}`);
    
    // Subscribe to EventBus to track job progress and update queue rows
    this.setupEventSubscriptions();

    this.pollInterval = setInterval(async () => {
      await this.tick();
    }, intervalMs);
  }

  /**
   * Stops the background processor polling loop
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    // Clear all heartbeats
    for (const timer of this.activeJobs.values()) {
      clearInterval(timer);
    }
    this.activeJobs.clear();
    console.log(`[RenderQueueProcessor] Queue processor daemon stopped.`);
  }

  private setupEventSubscriptions() {
    // Listen to step completions to update progress percentage
    EventBus.subscribe<{ jobId: string; stepId: string; duration: number }>("step.completed", async (event) => {
      const { jobId, stepId } = event.payload;
      const qJob = await this.queue.getJob(jobId);
      if (!qJob) return;

      // Define percentage maps based on workflow stages
      const stepPercentages: Record<string, number> = {
        script: 12.5,
        critic: 25.0,
        scene: 37.5,
        voice: 50.0,
        image: 62.5,
        render: 75.0,
        upload: 87.5,
        publish: 100.0,
      };

      const percent = stepPercentages[stepId] ?? 50.0;
      
      // Fetch latest checkpoint outputs to store saga state
      const checkpoint = CheckpointDB.getCheckpoint(jobId);
      const sagaState = checkpoint ? JSON.parse(checkpoint.outputs) : {};

      await this.queue.updateProgress(qJob.id, stepId, percent, sagaState);
      
      // Publish dynamic JobProgress event
      EventBus.publish("job.progress", {
        jobId,
        stepId,
        progress: percent,
        status: "running"
      }, jobId);
    });
  }

  private async tick(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // 1. Evict stale jobs where other workers crashed (heartbeat timeout: 30 seconds)
      const sqliteQueue = this.queue as any;
      if (typeof sqliteQueue.evictStaleJobs === "function") {
        await sqliteQueue.evictStaleJobs(30000);
      }

      // 2. Claim next available job
      const job = await this.queue.claim(this.workerId);
      if (job) {
        console.log(`[RenderQueueProcessor] Claimed job ${job.jobId} for execution (priority: ${job.priority}).`);
        
        // Start heartbeats
        const heartbeatTimer = setInterval(async () => {
          try {
            await this.queue.heartbeat(job.id, this.workerId);
          } catch (err: any) {
            console.error(`[RenderQueueProcessor] Failed sending heartbeat for job ${job.id}:`, err.message);
          }
        }, 10000); // Send heartbeat every 10 seconds

        this.activeJobs.set(job.jobId, heartbeatTimer);

        // Execute in background
        this.executeJob(job).catch(err => {
          console.error(`[RenderQueueProcessor] Background execution threw uncaught error:`, err.message);
        });
      }
    } catch (err: any) {
      console.error(`[RenderQueueProcessor] Error in tick processing:`, err.message);
    } finally {
      this.isProcessing = false;
    }
  }

  private async executeJob(job: QueueJob): Promise<void> {
    const jobId = job.jobId;

    const executionAuthority = (process.env.EXECUTION_AUTHORITY || "factoryos").toLowerCase();
    if (executionAuthority === "factoryos" && process.env.ENABLE_LEGACY_QUEUE_PROCESSOR !== "true") {
      console.warn(`[RenderQueueProcessor] Refusing legacy render execution of job ${jobId}: FactoryOS is authoritative.`);
      return;
    }

    console.log(`[RenderQueueProcessor] Starting pipeline execution for Job: ${jobId}`);

    // Publish event bus WorkflowStarted equivalent
    EventBus.publish("job.started", { jobId, payload: job.payload }, jobId);

    try {
      // 1. Check if a resume checkpoint exists
      const checkpoint = CheckpointDB.getCheckpoint(jobId);
      let result;

      if (checkpoint && checkpoint.current_step && checkpoint.current_step !== "completed") {
        const resumeStep = checkpoint.current_step;
        console.log(`[RenderQueueProcessor] Saga checkpoint found for ${jobId}. Resuming execution from step "${resumeStep}"...`);
        
        // Resubmitting with workflow replay starting from checkpoint.current_step
        result = await WorkflowRuntime.replay(jobId, resumeStep);
      } else {
        // Run fresh pipeline execution
        console.log(`[RenderQueueProcessor] No checkpoint found for ${jobId}. Initiating fresh generation...`);
        result = await WorkflowRuntime.run(job.payload);
      }

      // 2. Update job status on queue based on result
      if (result && result.success) {
        console.log(`[RenderQueueProcessor] Job ${jobId} completed successfully.`);
        await this.queue.complete(job.id, result.outputs || {});
        EventBus.publish("job.completed", { jobId, outputs: result.outputs }, jobId);
      } else {
        const errMsg = result?.error || "Unknown compilation failure";
        await this.handleJobFailure(job, errMsg);
      }
    } catch (err: any) {
      console.error(`[RenderQueueProcessor] Exception caught during job run:`, JSON.stringify({
        jobId,
        error: err?.message || String(err)
      }));
      await this.handleJobFailure(job, err?.message || String(err));
    } finally {
      // Clear heartbeats
      const timer = this.activeJobs.get(jobId);
      if (timer) {
        clearInterval(timer);
        this.activeJobs.delete(jobId);
      }
    }
  }

  private async handleJobFailure(job: QueueJob, error: string): Promise<void> {
    try {
      // Calculate exponential backoff delay: 2 * 5^(attempts - 1)
      // Attempt 1 -> 2 * 5^0 = 2 seconds
      // Attempt 2 -> 2 * 5^1 = 10 seconds
      // Attempt 3 -> 2 * 5^2 = 50 seconds
      const backoffDelay = 2 * Math.pow(5, Math.max(0, job.attempts - 1));
      
      await this.queue.fail(job.id, error, backoffDelay);
      EventBus.publish("job.failed", { jobId: job.jobId, error, attempt: job.attempts, maxAttempts: job.maxAttempts }, job.jobId);
    } catch (failErr: any) {
      console.error(`[RenderQueueProcessor] Failed to persist job failure state:`, JSON.stringify({
        jobId: job.jobId,
        error: failErr?.message || String(failErr)
      }));
    }
  }
}

const globalForQueueProcessor = globalThis as unknown as {
  QueueProcessor: RenderQueueProcessor;
};

export const QueueProcessor =
  globalForQueueProcessor.QueueProcessor || new RenderQueueProcessor();

if (process.env.NODE_ENV !== "production") {
  globalForQueueProcessor.QueueProcessor = QueueProcessor;
}
