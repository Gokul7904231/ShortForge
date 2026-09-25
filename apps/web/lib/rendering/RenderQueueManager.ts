import { RenderJobValidator } from "./RenderJobValidator";
import { WorkerPoolRegistry, RegisteredWorker } from "./WorkerPoolRegistry";
import { BasicRenderingCapacityGuard } from "./BasicRenderingCapacityGuard";
import { GitHubActionsRenderManager } from "./GitHubActionsRenderManager";

export type UserTier = "FREE" | "PRO" | "ENTERPRISE" | "ADMIN";
export type RenderJobStatus =
  | "QUEUED"
  | "PROCESSING"
  | "RENDERED"
  | "QA_PASSED"
  | "DELIVERY_PENDING"
  | "DELIVERING"
  | "DELIVERED"
  | "CALLBACK_PENDING"
  | "COMPLETED"
  | "RENDER_FAILED"
  | "QA_FAILED"
  | "DELIVERY_FAILED"
  | "CALLBACK_FAILED"
  | "FAILED"
  | "CANCELLED";

export type ContentEngineType = "quiz" | "facts" | "narration" | "education" | "stories" | "v2_custom";
export type AIExecutionMode = "CLOUD" | "BYOK" | "BYOLM";

export type DeliveryTarget = "GOOGLE_DRIVE" | "CLOUDINARY" | "LOCAL_OUTBOX";

export type DeliveryFallbackConfig =
  | false
  | {
      target: DeliveryTarget;
      reason: string;
    };

export interface RenderJobOutputConfig {
  format: "mp4" | "webm";
  width: number;
  height: number;
  fps: number;
}

export interface RenderJobDeliveryConfig {
  target?: DeliveryTarget;
  authMode?: "OAUTH_USER" | "SERVICE_ACCOUNT_SHARED_DRIVE";
  folderId?: string;
  artifactVersion?: string;
  allowFallback?: DeliveryFallbackConfig;
  download?: boolean;
  googleDrive?: boolean;
}

export interface RenderArtifactMeta {
  uri: string;
  sizeBytes: number;
  durationMs: number;
  sha256?: string;
}

export interface UniversalRenderJob {
  id: string;
  jobId: string;
  factoryVersion: string; // e.g. "v1"
  contentEngine: ContentEngineType;
  tenantId: string;
  userId: string;
  tier: UserTier;
  aiExecutionMode: AIExecutionMode;
  topic: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
  status: RenderJobStatus;
  attempts: number;
  maxAttempts: number;
  timeline: any;
  assets: any[];
  audio: any[];
  subtitles: any;
  output: RenderJobOutputConfig;
  delivery: RenderJobDeliveryConfig;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  workerId?: string;
  workerCredentialVersion?: string;
  renderDurationSeconds?: number;
  outputArtifact?: RenderArtifactMeta;
  error?: string;
}

export type RenderJob = UniversalRenderJob;

export interface WorkerHeartbeat {
  workerId: string;
  name: string;
  status: "READY" | "BUSY" | "OFFLINE";
  architecture: "arm64" | "x86_64";
  ffmpegAvailable: boolean;
  queueDepth: number;
  endpoint: string;
  activeJobId?: string;
  lastHeartbeat: string;
  vendor?: string;
}

export class RenderQueueManager {
  private static queue: UniversalRenderJob[] = [];
  private static activeJobs = new Map<string, UniversalRenderJob>();
  private static workers: WorkerHeartbeat[] = [
    {
      workerId: "oracle-a1-01",
      name: "Oracle Cloud Always Free A1 (ARM64 Worker)",
      status: "READY",
      architecture: "arm64",
      ffmpegAvailable: true,
      queueDepth: 0,
      endpoint: process.env.NEXT_PUBLIC_RENDER_ENGINE_URL || "http://127.0.0.1:8000",
      lastHeartbeat: new Date().toISOString(),
      vendor: "oracle",
    },
  ];

  static enqueue(jobData: Partial<UniversalRenderJob> & { jobId: string; topic: string; tenantId: string; userId: string; requestedWorkerId?: string }): UniversalRenderJob {
    const tier = jobData.tier || "FREE";

    let tierError: string | undefined = undefined;
    if (tier === "PRO") {
      tierError = "PRO_RENDERING_NOT_AVAILABLE: Pro rendering tier is not currently available.";
    } else if (tier === "ENTERPRISE") {
      tierError = "ENTERPRISE_RENDERING_NOT_AVAILABLE: Enterprise rendering tier is not currently available.";
    }

    if (tier === "FREE") {
      // Basic Local Billing Safety Check
      const guardCheck = BasicRenderingCapacityGuard.checkBasicDispatchAllowed(jobData.userId, jobData.tenantId);
      if (!guardCheck.allowed) {
        throw new Error(guardCheck.reason || "BASIC_RENDER_CAPACITY_UNAVAILABLE: Global Basic rendering capacity limit reached.");
      }
    }

    const validation = RenderJobValidator.validate(jobData);
    if (!validation.valid) {
      throw new Error(`INVALID_RENDER_JOB: ${validation.errors.join(", ")}`);
    }

    const job: UniversalRenderJob = {
      id: jobData.id || `render_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      jobId: jobData.jobId,
      factoryVersion: jobData.factoryVersion || "v1",
      contentEngine: jobData.contentEngine || "quiz",
      tenantId: jobData.tenantId,
      userId: jobData.userId,
      tier: tier,
      aiExecutionMode: jobData.aiExecutionMode || "CLOUD",
      topic: jobData.topic,
      aspectRatio: jobData.aspectRatio || "9:16",
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 3,
      timeline: jobData.timeline || {},
      assets: jobData.assets || [],
      audio: jobData.audio || [],
      subtitles: jobData.subtitles || {},
      output: jobData.output || { format: "mp4", width: 1080, height: 1920, fps: 30 },
      delivery: jobData.delivery || {
        target: "GOOGLE_DRIVE",
        authMode: "OAUTH_USER",
        artifactVersion: "v1",
        allowFallback: false,
      },
      createdAt: new Date().toISOString(),
      error: tierError,
    };

    this.queue.push(job);
    this.sortQueue();
    this.updateWorkerQueueDepths();

    if (tier === "FREE") {
      // Trigger GitHub Actions workflow dispatch for Basic jobs
      GitHubActionsRenderManager.dispatchWorkflowRun(job).catch((err) => {
        console.error(`[RenderQueueManager] Basic GitHub Actions dispatch error: ${err.message}`);
      });
    }

    return job;
  }

  static sortQueue() {
    const tierPriority: Record<UserTier, number> = { ADMIN: 4, ENTERPRISE: 3, PRO: 2, FREE: 1 };
    this.queue.sort((a, b) => {
      const pA = tierPriority[a.tier] || 1;
      const pB = tierPriority[b.tier] || 1;
      if (pA !== pB) return pB - pA;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }

  static updateWorkerQueueDepths() {
    for (const w of this.workers) {
      w.queueDepth = this.queue.length;
    }
  }

  static getQueue(): UniversalRenderJob[] {
    return [...this.queue];
  }

  static getActiveJobs(): UniversalRenderJob[] {
    return Array.from(this.activeJobs.values());
  }

  static getWorkers(): WorkerHeartbeat[] {
    const registered = WorkerPoolRegistry.getAllWorkers();
    const result = [...this.workers];

    for (const rw of registered) {
      if (!result.some(w => w.workerId === rw.workerId)) {
        result.push({
          workerId: rw.workerId,
          name: rw.name,
          status: rw.state === "READY" ? "READY" : rw.state === "BUSY" ? "BUSY" : "OFFLINE",
          architecture: rw.capabilities.architecture,
          ffmpegAvailable: true,
          queueDepth: this.queue.length,
          endpoint: rw.endpoint,
          activeJobId: rw.assignedJobId,
          lastHeartbeat: rw.lastHeartbeat,
          vendor: rw.vendor,
        });
      }
    }
    return result;
  }

  static processNextJob(workerId: string): UniversalRenderJob | null {
    if (this.queue.length === 0) return null;
    const worker = this.getWorkers().find(w => w.workerId === workerId);
    if (!worker || worker.status === "BUSY") return null;

    // Select the oldest eligible queued job. Provider authorization is handled by FactoryOS
    // compute routing, not this legacy compatibility queue.
    const targetIndex = this.queue.length > 0 ? 0 : -1;

    if (targetIndex === -1) return null;

    const job = this.queue.splice(targetIndex, 1)[0];
    job.status = "PROCESSING";
    job.startedAt = new Date().toISOString();
    job.workerId = workerId;
    job.attempts += 1;

    worker.status = "BUSY";
    worker.activeJobId = job.id;
    const regWorker = WorkerPoolRegistry.getWorker(workerId);
    if (regWorker) {
      regWorker.state = "BUSY";
      regWorker.assignedJobId = job.id;
    }

    this.updateWorkerQueueDepths();
    this.activeJobs.set(job.id, job);
    return job;
  }

  static completeJob(jobId: string, artifact: RenderArtifactMeta): UniversalRenderJob | null {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    job.status = "COMPLETED";
    job.completedAt = new Date().toISOString();
    job.outputArtifact = artifact;
    job.renderDurationSeconds = Math.round(artifact.durationMs / 1000);

    if (job.workerId) {
      const worker = this.getWorkers().find(w => w.workerId === job.workerId);
      if (worker) {
        worker.status = "READY";
        worker.activeJobId = undefined;
      }
      const regWorker = WorkerPoolRegistry.getWorker(job.workerId);
      if (regWorker) {
        regWorker.state = "READY";
        regWorker.assignedJobId = undefined;
      }
    }

    this.activeJobs.delete(jobId);
    return job;
  }

  static failJob(jobId: string, error: string): UniversalRenderJob | null {
    const job = this.activeJobs.get(jobId);
    if (!job) return null;

    if (job.workerId) {
      const worker = this.workers.find(w => w.workerId === job.workerId);
      if (worker) {
        worker.status = "READY";
        worker.activeJobId = undefined;
      }
    }

    if (job.attempts < job.maxAttempts) {
      job.status = "QUEUED";
      job.error = `Attempt ${job.attempts} failed: ${error}`;
      this.queue.push(job);
      this.sortQueue();
      this.updateWorkerQueueDepths();
      this.activeJobs.delete(jobId);
      return job;
    }

    job.status = "FAILED";
    job.completedAt = new Date().toISOString();
    job.error = error;
    this.activeJobs.delete(jobId);
    return job;
  }

  static cancelJob(jobId: string, requestingTenantId?: string): boolean {
    // Multi-tenant check: tenantId must match if provided
    const inQueueIndex = this.queue.findIndex(j => (j.id === jobId || j.jobId === jobId) && (!requestingTenantId || j.tenantId === requestingTenantId));
    if (inQueueIndex >= 0) {
      this.queue.splice(inQueueIndex, 1);
      this.updateWorkerQueueDepths();
      return true;
    }

    const activeJob = Array.from(this.activeJobs.values()).find(j => (j.id === jobId || j.jobId === jobId) && (!requestingTenantId || j.tenantId === requestingTenantId));
    if (activeJob) {
      activeJob.status = "CANCELLED";
      if (activeJob.workerId) {
        const worker = this.workers.find(w => w.workerId === activeJob.workerId);
        if (worker) {
          worker.status = "READY";
          worker.activeJobId = undefined;
        }
      }
      this.activeJobs.delete(activeJob.id);
      return true;
    }

    return false;
  }

  static clear(): void {
    this.queue = [];
    this.activeJobs.clear();
  }
}
