import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { RenderQueueManager } from "../../lib/rendering/RenderQueueManager";
import { WorkerPoolRegistry } from "../../lib/rendering/WorkerPoolRegistry";
import { AzureWorkerManager } from "../../lib/rendering/AzureWorkerManager";
import { AzureFinOpsGuard } from "../../lib/rendering/AzureFinOpsGuard";
import { BasicRenderingCapacityGuard } from "../../lib/rendering/BasicRenderingCapacityGuard";
import { GitHubActionsRenderManager } from "../../lib/rendering/GitHubActionsRenderManager";

describe("FactoryOS — Basic Cloud Rendering Plane & Admin-Only Azure Architecture Suite", () => {
  beforeEach(() => {
    RenderQueueManager.clear();
    WorkerPoolRegistry.clear();
    AzureWorkerManager.reset();
    AzureFinOpsGuard.reset();
    BasicRenderingCapacityGuard.reset();
    GitHubActionsRenderManager.reset();

    // Dispatch is fail-closed: tests exercise the real configured path with stubbed credentials.
    process.env.FACTORYOS_EXECUTION_SECRET = "test_execution_secret";
    process.env.GITHUB_RENDER_TOKEN = "test_render_token";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FACTORYOS_EXECUTION_SECRET;
    delete process.env.GITHUB_RENDER_TOKEN;
  });

  test("01: Basic job routes to GitHub Actions cloud renderer", () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_basic_01",
      topic: "Basic Cloud Render Short",
      tenantId: "tenant_basic_1",
      userId: "user_basic_1",
      tier: "FREE",
    });

    expect(job.status).toBe("QUEUED");
    expect(job.tier).toBe("FREE");

    const record = GitHubActionsRenderManager.getRunRecord(job.id);
    expect(record).not.toBeUndefined();
    expect(record?.status).toBe("DISPATCHED");
  });

  test("02: Admin job routes to Azure VM Pool", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_admin_01",
      topic: "Admin Exclusive Short",
      tenantId: "tenant_admin_1",
      userId: "user_admin_1",
      tier: "ADMIN",
    });

    expect(job.tier).toBe("ADMIN");
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(AzureWorkerManager.getState()).toBe("READY");
  });

  test("03: Basic job targeting Azure is rejected server-side with RENDER_BACKEND_FORBIDDEN", () => {
    expect(() => {
      RenderQueueManager.enqueue({
        jobId: "job_exploit_01",
        topic: "Malicious Basic Azure Request",
        tenantId: "tenant_basic_attacker",
        userId: "user_basic_attacker",
        tier: "FREE",
        requestedWorkerId: "azure-b4ls-01",
      });
    }).toThrow("RENDER_BACKEND_FORBIDDEN");
  });

  test("04: Free job targeting Azure is rejected server-side with RENDER_BACKEND_FORBIDDEN", () => {
    expect(() => {
      RenderQueueManager.enqueue({
        jobId: "job_exploit_02",
        topic: "Free Azure Target",
        tenantId: "tenant_free_attacker",
        userId: "user_free_attacker",
        tier: "FREE",
        workerId: "azure-admin-01",
      });
    }).toThrow("RENDER_BACKEND_FORBIDDEN");
  });

  test("05: Pro job returns PRO_RENDERING_NOT_AVAILABLE (No Azure / Basic Fallback)", () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_pro_01",
      topic: "Pro Short",
      tenantId: "tenant_pro_1",
      userId: "user_pro_1",
      tier: "PRO",
    });
    expect(job.error).toContain("PRO_RENDERING_NOT_AVAILABLE");
  });

  test("06: Enterprise job returns ENTERPRISE_RENDERING_NOT_AVAILABLE (No Azure / Basic Fallback)", () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_ent_01",
      topic: "Enterprise Short",
      tenantId: "tenant_ent_1",
      userId: "user_ent_1",
      tier: "ENTERPRISE",
    });
    expect(job.error).toContain("ENTERPRISE_RENDERING_NOT_AVAILABLE");
  });

  test("07: GitHub workflow_dispatch execution token generation and verification", () => {
    const { token, expiresAt } = GitHubActionsRenderManager.generateExecutionToken("j_tok_1", "t_tok_1");
    expect(token).toContain("j_tok_1:t_tok_1");

    const valid = GitHubActionsRenderManager.verifyExecutionToken(token, "j_tok_1", "t_tok_1");
    expect(valid).toBe(true);

    const invalidJob = GitHubActionsRenderManager.verifyExecutionToken(token, "j_wrong", "t_tok_1");
    expect(invalidJob).toBe(false);

    const invalidTenant = GitHubActionsRenderManager.verifyExecutionToken(token, "j_tok_1", "t_wrong");
    expect(invalidTenant).toBe(false);
  });

  test("08: GitHub dispatch failure is handled cleanly", async () => {
    // Simulate GitHub API rejection
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, text: async () => "Forbidden" })));
    const job = {
      id: "j_fail_dispatch",
      jobId: "j_fail_dispatch",
      factoryVersion: "v1",
      contentEngine: "quiz" as const,
      tenantId: "t_fd",
      userId: "u_fd",
      tier: "FREE" as const,
      aiExecutionMode: "CLOUD" as const,
      topic: "Failed Dispatch",
      status: "QUEUED" as const,
      attempts: 0,
      maxAttempts: 3,
      timeline: {},
      assets: [],
      audio: [],
      subtitles: {},
      output: { format: "mp4" as const, width: 1080, height: 1920, fps: 30 },
      delivery: { download: true, googleDrive: true },
      createdAt: new Date().toISOString(),
    };

    const res = await GitHubActionsRenderManager.dispatchWorkflowRun(job);
    expect(res.success).toBe(false);
    expect(res.error).toContain("workflow_dispatch failed");
    expect(GitHubActionsRenderManager.getRunRecord("j_fail_dispatch")?.status).toBe("FAILED");
  });

  test("08b: Unconfigured dispatch fails closed — dry-run is never DISPATCHED", async () => {
    delete process.env.GITHUB_RENDER_TOKEN;
    const job = {
      id: "j_dry_run",
      jobId: "j_dry_run",
      factoryVersion: "v1",
      contentEngine: "quiz" as const,
      tenantId: "t_dry",
      userId: "u_dry",
      tier: "FREE" as const,
      aiExecutionMode: "CLOUD" as const,
      topic: "Dry Run",
      status: "QUEUED" as const,
      attempts: 0,
      maxAttempts: 3,
      timeline: {},
      assets: [],
      audio: [],
      subtitles: {},
      output: { format: "mp4" as const, width: 1080, height: 1920, fps: 30 },
      delivery: { download: true, googleDrive: true },
      createdAt: new Date().toISOString(),
    };

    const res = await GitHubActionsRenderManager.dispatchWorkflowRun(job);
    expect(res.success).toBe(false);
    expect(res.error).toContain("RENDER_DISPATCH_NOT_CONFIGURED");
    expect(GitHubActionsRenderManager.getRunRecord("j_dry_run")).toBeUndefined();
  });

  test("08c: Missing execution secret fails closed for token signing", () => {
    delete process.env.FACTORYOS_EXECUTION_SECRET;
    expect(() => GitHubActionsRenderManager.generateExecutionToken("j_nosecret", "t_nosecret")).toThrow("EXECUTION_SECRET_MISSING");
    // Verification also fails closed without the secret.
    const token = "j_nosecret:t_nosecret:123:abc";
    expect(GitHubActionsRenderManager.verifyExecutionToken(token, "j_nosecret", "t_nosecret")).toBe(false);
  });

  test("09: Workflow callback updates status and validates execution token", () => {
    const { token } = GitHubActionsRenderManager.generateExecutionToken("j_cb_1", "t_cb_1");
    GitHubActionsRenderManager.dispatchWorkflowRun({
      id: "j_cb_1",
      jobId: "j_cb_1",
      factoryVersion: "v1",
      contentEngine: "quiz",
      tenantId: "t_cb_1",
      userId: "u_cb_1",
      tier: "FREE",
      aiExecutionMode: "CLOUD",
      topic: "Callback Test",
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 3,
      timeline: {},
      assets: [],
      audio: [],
      subtitles: {},
      output: { format: "mp4", width: 1080, height: 1920, fps: 30 },
      delivery: { download: true, googleDrive: true },
      createdAt: new Date().toISOString(),
    });

    const res = GitHubActionsRenderManager.handleWorkflowCallback("j_cb_1", "t_cb_1", token, "PROCESSING", { runId: 991823 });
    expect(res.success).toBe(true);
    expect(GitHubActionsRenderManager.getRunRecord("j_cb_1")?.status).toBe("PROCESSING");

    const badTokenRes = GitHubActionsRenderManager.handleWorkflowCallback("j_cb_1", "t_cb_1", "invalid_token", "COMPLETED");
    expect(badTokenRes.success).toBe(false);
    expect(badTokenRes.error).toContain("UNAUTHORIZED_EXECUTION_TOKEN");
  });

  test("10: Workflow run timeout is detected after max duration", () => {
    const { token } = GitHubActionsRenderManager.generateExecutionToken("j_timeout_1", "t_to_1");
    GitHubActionsRenderManager.dispatchWorkflowRun({
      id: "j_timeout_1",
      jobId: "j_timeout_1",
      factoryVersion: "v1",
      contentEngine: "quiz",
      tenantId: "t_to_1",
      userId: "u_to_1",
      tier: "FREE",
      aiExecutionMode: "CLOUD",
      topic: "Timeout Test",
      status: "QUEUED",
      attempts: 0,
      maxAttempts: 3,
      timeline: {},
      assets: [],
      audio: [],
      subtitles: {},
      output: { format: "mp4", width: 1080, height: 1920, fps: 30 },
      delivery: { download: true, googleDrive: true },
      createdAt: new Date(Date.now() - 400000).toISOString(), // 400 seconds ago
    });

    const timedOut = GitHubActionsRenderManager.checkTimedOutRuns();
    expect(timedOut).toContain("j_timeout_1");
    expect(GitHubActionsRenderManager.getRunRecord("j_timeout_1")?.status).toBe("TIMEOUT");
  });

  test("11: Server-side independent MP4 artifact verification rejects 0-byte files", () => {
    const checkEmpty = GitHubActionsRenderManager.verifyArtifactIntegrity("j_art_1", "t_art_1", { sizeBytes: 0 });
    expect(checkEmpty.valid).toBe(false);
    expect(checkEmpty.error).toContain("0 bytes");
  });

  test("12: Server-side independent MP4 artifact verification validates valid MP4 container", () => {
    const checkValid = GitHubActionsRenderManager.verifyArtifactIntegrity("j_art_2", "t_art_2", {
      sizeBytes: 1540000,
      headerBytesHex: "000000206674797069736f6d", // 'ftyp' hex
    });
    expect(checkValid.valid).toBe(true);
  });

  test("13: Server-side independent MP4 artifact verification rejects invalid container header", () => {
    const checkInvalidHeader = GitHubActionsRenderManager.verifyArtifactIntegrity("j_art_3", "t_art_3", {
      sizeBytes: 1540000,
      headerBytesHex: "494433030000000000", // MP3 ID3 tag header instead of MP4
    });
    expect(checkInvalidHeader.valid).toBe(false);
    expect(checkInvalidHeader.error).toContain("Invalid MP4 container header");
  });

  test("13b: Artifact verification rejects metadata-only completion (no header bytes)", () => {
    const checkNoHeader = GitHubActionsRenderManager.verifyArtifactIntegrity("j_art_4", "t_art_4", {
      sizeBytes: 1540000,
    });
    expect(checkNoHeader.valid).toBe(false);
    expect(checkNoHeader.error).toContain("metadata-only completion is rejected");
  });

  test("13c: Artifact verification rejects non-MP4 binary that merely starts with zero bytes", () => {
    const checkLooseHeader = GitHubActionsRenderManager.verifyArtifactIntegrity("j_art_5", "t_art_5", {
      sizeBytes: 1540000,
      headerBytesHex: "0000000000000000000", // zeros only — no 'ftyp' signature
    });
    expect(checkLooseHeader.valid).toBe(false);
    expect(checkLooseHeader.error).toContain("Invalid MP4 container header");
  });

  test("14: Basic user quota limit (5 Shorts/month) is strictly enforced", () => {
    const userId = "user_quota_test";
    const tenantId = "tenant_quota_test";

    for (let i = 0; i < 5; i++) {
      const check = BasicRenderingCapacityGuard.checkBasicDispatchAllowed(userId, tenantId);
      expect(check.allowed).toBe(true);
      BasicRenderingCapacityGuard.recordRenderUsage(userId, tenantId, 60);
    }

    const sixthCheck = BasicRenderingCapacityGuard.checkBasicDispatchAllowed(userId, tenantId);
    expect(sixthCheck.allowed).toBe(false);
    expect(sixthCheck.reason).toContain("USER_BASIC_QUOTA_EXCEEDED");
  });

  test("15: Global Basic render minutes limit blocks dispatch with BASIC_RENDER_CAPACITY_UNAVAILABLE", () => {
    BasicRenderingCapacityGuard.recordRenderUsage("u_bulk", "t_bulk", 60 * 1005); // 1005 minutes (> 1000 min default limit)

    expect(BasicRenderingCapacityGuard.getCapacityState()).toBe("EXHAUSTED");

    const check = BasicRenderingCapacityGuard.checkBasicDispatchAllowed("u_new", "t_new");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("BASIC_RENDER_CAPACITY_UNAVAILABLE");

    expect(() => {
      RenderQueueManager.enqueue({
        jobId: "j_cap_exceeded",
        topic: "Capacity Exceeded Render",
        tenantId: "t_new",
        userId: "u_new",
        tier: "FREE",
      });
    }).toThrow("BASIC_RENDER_CAPACITY_UNAVAILABLE");
  });

  test("16: Azure emergency lockdown NEVER causes Basic jobs to use Azure", () => {
    AzureFinOpsGuard.setEmergencyLockdown(true);
    BasicRenderingCapacityGuard.reset();

    // Basic job enqueue should succeed for GitHub Actions dispatch, not touching Azure
    const job = RenderQueueManager.enqueue({
      jobId: "job_basic_no_azure_touch",
      topic: "Basic Job Under Lockdown",
      tenantId: "t_lock_basic",
      userId: "u_lock_basic",
      tier: "FREE",
    });

    expect(job.tier).toBe("FREE");
    expect(AzureWorkerManager.getState()).toBe("DEALLOCATED"); // Azure VM remains deallocated
  });

  test("17: WorkerPoolRegistry enforces Azure ADMIN_ONLY isolation server-side", () => {
    WorkerPoolRegistry.registerWorker({
      workerId: "azure-prod-vm-01",
      vendor: "azure",
      accessTier: "ADMIN_ONLY",
      name: "Azure Admin Worker",
      endpoint: "https://azure.internal",
      tokenHash: "hash_az",
      capabilities: {
        vendor: "azure",
        accessTier: "ADMIN_ONLY",
        architecture: "x86_64",
        vCPU: 4,
        memoryMb: 8192,
        ffmpegVersion: "6.1",
        supportsGpu: false,
        maxConcurrentRenders: 1,
      },
      state: "READY",
      telemetry: {
        cpuUtilizationPct: 10,
        ramUtilizationPct: 20,
        activeRenders: 0,
        tempStorageFreeMb: 20000,
        b2Connectivity: true,
        lastHeartbeatTimestamp: Date.now(),
      },
      lastHeartbeat: new Date().toISOString(),
    });

    const freeJob = {
      id: "j_free_check",
      jobId: "j_free_check",
      factoryVersion: "v1",
      contentEngine: "quiz" as const,
      tenantId: "t_free",
      userId: "u_free",
      tier: "FREE" as const,
      aiExecutionMode: "CLOUD" as const,
      topic: "Free Job",
      status: "QUEUED" as const,
      attempts: 0,
      maxAttempts: 3,
      timeline: {},
      assets: [],
      audio: [],
      subtitles: {},
      output: { format: "mp4" as const, width: 1080, height: 1920, fps: 30 },
      delivery: { download: true, googleDrive: true },
      createdAt: new Date().toISOString(),
    };

    const matchedWorker = WorkerPoolRegistry.findAvailableWorker(freeJob);
    expect(matchedWorker).toBeNull(); // Azure worker rejected for Free job
  });

  test("18: RenderQueueManager.processNextJob refuses to assign non-admin job to Azure worker", () => {
    // Manually register ready Azure worker
    WorkerPoolRegistry.registerWorker({
      workerId: "azure-b4ls-01",
      vendor: "azure",
      accessTier: "ADMIN_ONLY",
      name: "Azure Admin Worker",
      endpoint: "https://azure.internal",
      tokenHash: "hash_az",
      capabilities: {
        vendor: "azure",
        accessTier: "ADMIN_ONLY",
        architecture: "x86_64",
        vCPU: 4,
        memoryMb: 8192,
        ffmpegVersion: "6.1",
        supportsGpu: false,
        maxConcurrentRenders: 1,
      },
      state: "READY",
      telemetry: {
        cpuUtilizationPct: 10,
        ramUtilizationPct: 20,
        activeRenders: 0,
        tempStorageFreeMb: 20000,
        b2Connectivity: true,
        lastHeartbeatTimestamp: Date.now(),
      },
      lastHeartbeat: new Date().toISOString(),
    });

    // Enqueue Basic job
    RenderQueueManager.enqueue({
      jobId: "j_free_in_queue",
      topic: "Free Job In Queue",
      tenantId: "t_fq",
      userId: "u_fq",
      tier: "FREE",
    });

    const processed = RenderQueueManager.processNextJob("azure-b4ls-01");
    expect(processed).toBeNull(); // Cannot assign Free job to Azure worker
  });

  test("19: Preservation of 10 frozen core files", async () => {
    const { execSync } = await import("child_process");
    const frozenFiles = [
      "agents/script-agent.ts",
      "agents/quiz-corrector-agent.ts",
      "app/api/quiz/compile/route.ts",
      "app/api/quiz/generate/route.ts",
      "app/api/quiz/geo/route.ts",
      "app/api/quiz/mock/route.ts",
      "app/api/quiz/render-batch/route.ts",
      "content-engines/quiz/critic.json",
      "content-engines/quiz/index.ts",
      "lib/core/QuestionOptimizer.ts",
    ];

    const gitOutput = execSync(`git status --porcelain ${frozenFiles.join(" ")}`, {
      encoding: "utf-8",
      cwd: process.cwd(),
    }).trim();

    expect(gitOutput).toBe("");
  });
});
