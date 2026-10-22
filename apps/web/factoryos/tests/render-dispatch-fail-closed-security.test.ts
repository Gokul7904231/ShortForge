import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as dispatchHandler } from "../../app/api/rendering/github/dispatch/route";
import { POST as statusHandler } from "../../app/api/rendering/github/status/route";
import { DELETE as deleteJobHandler } from "../../app/api/jobs/[id]/route";
import { RenderQueueManager } from "../../lib/rendering/RenderQueueManager";
import { BasicRenderingCapacityGuard } from "../../lib/rendering/BasicRenderingCapacityGuard";
import { GitHubActionsRenderManager } from "../../lib/rendering/GitHubActionsRenderManager";
import { saveJobManifest } from "@/lib/jobs-history";
import { releaseLegacyGenerationSlot } from "@/factoryos/core/treasury/TreasuryQuotaCompatibility";
import { ServiceRegistry } from "@/lib/core/ServiceRegistry";

// Mutable authenticated session for route handlers under test.
let currentMockUser: { uid: string; role: string } | null = { uid: "user_owner", role: "USER" };

vi.mock("@/lib/auth/auth", () => ({
  verifySession: vi.fn(async () => {
    if (!currentMockUser) {
      throw new Error("Unauthorized: no valid session");
    }
    return { user: currentMockUser, isSecretKey: false };
  }),
}));

const mockQueue = vi.hoisted(() => ({
  getJob: vi.fn(async () => null),
  cancel: vi.fn(async () => undefined),
}));

vi.mock("@/lib/core/ServiceRegistry", () => ({
  ServiceRegistry: {
    has: () => true,
    get: () => mockQueue,
    register: () => undefined,
  },
}));

const mockFirestore = vi.hoisted(() => {
  const docRef = {
    get: vi.fn(async () => ({ exists: false, data: () => undefined })),
    set: vi.fn(async () => undefined),
  };
  return { docRef, db: { collection: () => ({ doc: () => docRef }) } };
});

vi.mock("@/lib/firebase-admin", () => ({ db: mockFirestore.db }));

vi.mock("@/lib/jobs-history", () => ({
  readJobManifest: vi.fn(async () => null),
  saveJobManifest: vi.fn(async () => undefined),
}));

vi.mock("@/factoryos/core/treasury/TreasuryQuotaAdmission", () => ({
  TreasuryQuotaAdmission: vi.fn().mockImplementation(() => ({
    releaseGenerationSlot: vi.fn(async () => undefined),
  })),
}));

vi.mock("@/factoryos/core/treasury/TreasuryRuntime", () => ({
  getTreasuryRuntime: vi.fn(async () => ({})),
}));

vi.mock("@/factoryos/core/treasury/TreasuryQuotaCompatibility", () => ({
  releaseLegacyGenerationSlot: vi.fn(async () => undefined),
}));

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const FTyp_HEADER_HEX = "000000206674797069736f6d"; // MP4 'ftyp' box header

describe("Render dispatch/callback/job-cancellation fail-closed security suite", () => {
  beforeEach(() => {
    RenderQueueManager.clear();
    BasicRenderingCapacityGuard.reset();
    GitHubActionsRenderManager.reset();
    mockQueue.getJob.mockReset();
    mockQueue.getJob.mockResolvedValue(null);
    mockQueue.cancel.mockReset();
    mockFirestore.docRef.get.mockReset();
    mockFirestore.docRef.get.mockResolvedValue({ exists: false, data: () => undefined });
    mockFirestore.docRef.set.mockReset();
    vi.mocked(saveJobManifest).mockReset();
    vi.mocked(saveJobManifest).mockResolvedValue(undefined);
    vi.mocked(releaseLegacyGenerationSlot).mockReset();
    vi.mocked(releaseLegacyGenerationSlot).mockResolvedValue(undefined);

    process.env.FACTORYOS_EXECUTION_SECRET = "test_execution_secret";
    process.env.GITHUB_RENDER_TOKEN = "test_render_token";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, status: 200, text: async () => "" })));
    currentMockUser = { uid: "user_owner", role: "USER" };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FACTORYOS_EXECUTION_SECRET;
    delete process.env.GITHUB_RENDER_TOKEN;
  });

  test("D1: dispatch requires authentication", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_dispatch_auth",
      topic: "Dispatch Auth",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    currentMockUser = null;

    const res = await dispatchHandler(jsonRequest("http://localhost/api/rendering/github/dispatch", { jobId: job.id }));
    expect(res.status).toBe(401);
  });

  test("D2: dispatch rejects a job the requester does not own", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_dispatch_owner",
      topic: "Dispatch Ownership",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    currentMockUser = { uid: "user_attacker", role: "USER" };

    const res = await dispatchHandler(jsonRequest("http://localhost/api/rendering/github/dispatch", { jobId: job.id }));
    expect(res.status).toBe(403);
  });

  test("D3: dispatch succeeds for the owning user", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_dispatch_ok",
      topic: "Dispatch OK",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });

    const res = await dispatchHandler(jsonRequest("http://localhost/api/rendering/github/dispatch", { jobId: job.id }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  test("S1: COMPLETED callback without artifact bytes (header hex) is rejected", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_status_nohdr",
      topic: "No Header",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    RenderQueueManager.processNextJob("oracle-a1-01");
    const { token } = GitHubActionsRenderManager.generateExecutionToken(job.id, "t_sec");

    const res = await statusHandler(
      jsonRequest("http://localhost/api/rendering/github/status", {
        jobId: job.id,
        tenantId: "t_sec",
        executionToken: token,
        status: "COMPLETED",
        artifactUri: "b2://bucket/real.mp4",
        sizeBytes: 32984,
        durationMs: 2000,
        // headerBytesHex intentionally missing
      })
    );
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("metadata-only completion is rejected");
    // Release the worker lease the 422 early-return does not release.
    RenderQueueManager.failJob(job.id, "test cleanup");
  });

  test("S2: COMPLETED callback without artifactUri gets no synthesized b2:// fallback", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_status_nouri",
      topic: "No URI",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    RenderQueueManager.processNextJob("oracle-a1-01");
    const { token } = GitHubActionsRenderManager.generateExecutionToken(job.id, "t_sec");

    const res = await statusHandler(
      jsonRequest("http://localhost/api/rendering/github/status", {
        jobId: job.id,
        tenantId: "t_sec",
        executionToken: token,
        status: "COMPLETED",
        sizeBytes: 32984,
        headerBytesHex: FTyp_HEADER_HEX,
        durationMs: 2000,
      })
    );
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("ARTIFACT_URI_MISSING");
    RenderQueueManager.failJob(job.id, "test cleanup");
  });

  test("S3: COMPLETED callback without measured duration gets no default duration", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_status_nodur",
      topic: "No Duration",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    RenderQueueManager.processNextJob("oracle-a1-01");
    const { token } = GitHubActionsRenderManager.generateExecutionToken(job.id, "t_sec");

    const res = await statusHandler(
      jsonRequest("http://localhost/api/rendering/github/status", {
        jobId: job.id,
        tenantId: "t_sec",
        executionToken: token,
        status: "COMPLETED",
        artifactUri: "b2://bucket/real.mp4",
        sizeBytes: 32984,
        headerBytesHex: FTyp_HEADER_HEX,
      })
    );
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toContain("DURATION_MISSING");
    RenderQueueManager.failJob(job.id, "test cleanup");
  });

  test("S4: valid COMPLETED callback completes with the real measured values only", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_status_ok",
      topic: "Valid Completion",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    RenderQueueManager.processNextJob("oracle-a1-01");
    const { token } = GitHubActionsRenderManager.generateExecutionToken(job.id, "t_sec");

    const res = await statusHandler(
      jsonRequest("http://localhost/api/rendering/github/status", {
        jobId: job.id,
        tenantId: "t_sec",
        executionToken: token,
        status: "COMPLETED",
        artifactUri: "b2://bucket/real.mp4",
        sizeBytes: 32984,
        headerBytesHex: FTyp_HEADER_HEX,
        durationMs: 2000,
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.job.outputArtifact.uri).toBe("b2://bucket/real.mp4");
    expect(data.job.outputArtifact.sizeBytes).toBe(32984);
    expect(data.job.outputArtifact.durationMs).toBe(2000);
    expect(data.job.renderDurationSeconds).toBe(2);
  });

  test("S5b: duplicate COMPLETED callback after the job already completed is rejected, not re-settled", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_status_dup",
      topic: "Duplicate Completion",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    RenderQueueManager.processNextJob("oracle-a1-01");
    const { token } = GitHubActionsRenderManager.generateExecutionToken(job.id, "t_sec");
    const body = {
      jobId: job.id,
      tenantId: "t_sec",
      executionToken: token,
      status: "COMPLETED",
      artifactUri: "b2://bucket/real.mp4",
      sizeBytes: 32984,
      headerBytesHex: FTyp_HEADER_HEX,
      durationMs: 2000,
    };

    const first = await statusHandler(jsonRequest("http://localhost/api/rendering/github/status", body));
    expect(first.status).toBe(200);

    // Second identical callback: the job is no longer active, so it must not succeed twice.
    const second = await statusHandler(jsonRequest("http://localhost/api/rendering/github/status", body));
    expect(second.status).toBe(409);
    const data = await second.json();
    expect(data.error).toContain("JOB_NOT_ACTIVE");
  });

  test("S5: non-completed callback with an invalid token is rejected, not swallowed", async () => {
    const job = RenderQueueManager.enqueue({
      jobId: "job_sec_status_badtoken",
      topic: "Bad Token Progress",
      tenantId: "t_sec",
      userId: "user_owner",
      tier: "FREE",
    });
    RenderQueueManager.processNextJob("oracle-a1-01");

    const res = await statusHandler(
      jsonRequest("http://localhost/api/rendering/github/status", {
        jobId: job.id,
        tenantId: "t_sec",
        executionToken: "j_bogus:t_bogus:1:deadbeef",
        status: "PROCESSING",
      })
    );
    expect(res.status).toBe(401);
  });

  test("J1: DELETE rejects a non-owner before any store is mutated", async () => {
    vi.mocked(saveJobManifest).mockResolvedValue(undefined);
    const { readJobManifest } = await import("@/lib/jobs-history");
    vi.mocked(readJobManifest).mockResolvedValue({
      id: "job_sec_del_1",
      userId: "user_someone_else",
      status: "processing",
      tier: "BASIC",
    } as any);
    mockQueue.getJob.mockResolvedValue(null);
    currentMockUser = { uid: "user_attacker", role: "USER" };

    const res = await deleteJobHandler(new NextRequest("http://localhost/api/jobs/job_sec_del_1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "job_sec_del_1" }),
    });

    expect(res.status).toBe(403);
    expect(mockQueue.cancel).not.toHaveBeenCalled();
    expect(saveJobManifest).not.toHaveBeenCalled();
    expect(mockFirestore.docRef.set).not.toHaveBeenCalled();
    expect(releaseLegacyGenerationSlot).not.toHaveBeenCalled();
  });

  test("J2: DELETE of a job with no resolvable owner fails closed with 404", async () => {
    const { readJobManifest } = await import("@/lib/jobs-history");
    vi.mocked(readJobManifest).mockResolvedValue(null);
    mockQueue.getJob.mockResolvedValue(null);
    mockFirestore.docRef.get.mockResolvedValue({ exists: false, data: () => undefined });

    const res = await deleteJobHandler(new NextRequest("http://localhost/api/jobs/job_unknown", { method: "DELETE" }), {
      params: Promise.resolve({ id: "job_unknown" }),
    });

    expect(res.status).toBe(404);
    expect(mockQueue.cancel).not.toHaveBeenCalled();
    expect(saveJobManifest).not.toHaveBeenCalled();
    expect(releaseLegacyGenerationSlot).not.toHaveBeenCalled();
  });

  test("J3: DELETE by the owner mutates stores only after authorization", async () => {
    const { readJobManifest } = await import("@/lib/jobs-history");
    vi.mocked(readJobManifest).mockResolvedValue({
      id: "job_sec_del_2",
      userId: "user_owner",
      status: "processing",
      tier: "BASIC",
    } as any);
    mockQueue.getJob.mockResolvedValue({ payload: { userId: "user_owner" }, status: "PROCESSING" });
    currentMockUser = { uid: "user_owner", role: "USER" };

    const res = await deleteJobHandler(new NextRequest("http://localhost/api/jobs/job_sec_del_2", { method: "DELETE" }), {
      params: Promise.resolve({ id: "job_sec_del_2" }),
    });

    expect(res.status).toBe(200);
    expect(mockQueue.cancel).toHaveBeenCalledWith("job_sec_del_2");
    expect(saveJobManifest).toHaveBeenCalled();
    expect(releaseLegacyGenerationSlot).toHaveBeenCalledWith("user_owner", "job_sec_del_2");
  });

  test("J4: DELETE job that exists only in the SQLite queue still enforces ownership", async () => {
    const { readJobManifest } = await import("@/lib/jobs-history");
    vi.mocked(readJobManifest).mockResolvedValue(null);
    mockQueue.getJob.mockResolvedValue({ payload: { userId: "user_queue_owner" }, status: "QUEUED" });
    currentMockUser = { uid: "user_attacker", role: "USER" };

    const res = await deleteJobHandler(new NextRequest("http://localhost/api/jobs/job_sec_del_3", { method: "DELETE" }), {
      params: Promise.resolve({ id: "job_sec_del_3" }),
    });

    expect(res.status).toBe(403);
    expect(mockQueue.cancel).not.toHaveBeenCalled();
  });
});
