import { describe, test, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET as getJobHandler } from "../../app/api/jobs/[id]/route";
import { readJobManifest } from "@/lib/jobs-history";

let currentMockUser: { uid: string; role: string } | null = null;

vi.mock("@/lib/auth/auth", () => ({
  verifySession: vi.fn(async () => {
    if (!currentMockUser) {
      throw new Error("Unauthorized: no valid session");
    }
    return { user: currentMockUser, isSecretKey: false };
  }),
}));

vi.mock("@/lib/jobs-history", () => ({
  readJobManifest: vi.fn(async () => null),
  saveJobManifest: vi.fn(async () => undefined),
}));

vi.mock("@/lib/firebase-admin", () => ({ db: null }));

vi.mock("@/factoryos/core/treasury/TreasuryQuotaCompatibility", () => ({
  releaseLegacyGenerationSlot: vi.fn(async () => undefined),
  finalizeLegacyGenerationSlot: vi.fn(async () => undefined),
}));

const TOKEN_A = "a".repeat(64);
const TOKEN_B = "b".repeat(64);

function manifestFor(jobId: string, token: string, userId = "user_owner") {
  return { id: jobId, jobId, userId, executionToken: token, status: "processing" };
}

function get(jobId: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/jobs/${jobId}`, { headers });
}

describe("GET /api/jobs/[id] worker manifest fetch authorization", () => {
  beforeEach(() => {
    vi.mocked(readJobManifest).mockReset();
    currentMockUser = null;
  });

  test("accepts the job-scoped execution token and returns that job", async () => {
    vi.mocked(readJobManifest).mockResolvedValue(manifestFor("job_a", TOKEN_A) as any);

    const res = await getJobHandler(get("job_a", { "x-execution-token": TOKEN_A }), {
      params: Promise.resolve({ id: "job_a" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.job.jobId).toBe("job_a");
  });

  test("accepts the token in the Authorization header", async () => {
    vi.mocked(readJobManifest).mockResolvedValue(manifestFor("job_a", TOKEN_A) as any);

    const res = await getJobHandler(get("job_a", { authorization: `Bearer ${TOKEN_A}` }), {
      params: Promise.resolve({ id: "job_a" }),
    });

    expect(res.status).toBe(200);
  });

  test("rejects a valid token issued for a different job", async () => {
    vi.mocked(readJobManifest).mockResolvedValue(manifestFor("job_b", TOKEN_B) as any);

    const res = await getJobHandler(get("job_a", { "x-execution-token": TOKEN_A }), {
      params: Promise.resolve({ id: "job_a" }),
    });

    expect(res.status).toBe(401);
  });

  test("rejects a token that does not match the requested job's manifest", async () => {
    vi.mocked(readJobManifest).mockResolvedValue(manifestFor("job_a", TOKEN_B) as any);

    const res = await getJobHandler(get("job_a", { "x-execution-token": TOKEN_A }), {
      params: Promise.resolve({ id: "job_a" }),
    });

    expect(res.status).toBe(401);
  });

  test("rejects an unauthenticated request without a session", async () => {
    vi.mocked(readJobManifest).mockResolvedValue(manifestFor("job_a", TOKEN_A) as any);

    const res = await getJobHandler(get("job_a", {}), {
      params: Promise.resolve({ id: "job_a" }),
    });

    expect(res.status).toBe(401);
  });

  test("does not grant access to a job the session user does not own", async () => {
    currentMockUser = { uid: "user_other", role: "USER" };
    vi.mocked(readJobManifest).mockResolvedValue(manifestFor("job_a", TOKEN_A) as any);

    const res = await getJobHandler(get("job_a", {}), {
      params: Promise.resolve({ id: "job_a" }),
    });

    expect(res.status).toBe(403);
  });

  test("still serves the owning session user", async () => {
    currentMockUser = { uid: "user_owner", role: "USER" };
    vi.mocked(readJobManifest).mockResolvedValue(manifestFor("job_a", TOKEN_A) as any);

    const res = await getJobHandler(get("job_a", {}), {
      params: Promise.resolve({ id: "job_a" }),
    });

    expect(res.status).toBe(200);
  });
});
