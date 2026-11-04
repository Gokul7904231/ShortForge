import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { GET } from "../app/api/media/video/[jobId]/route";
import { GET as getThumb } from "../app/api/media/thumb/[jobId]/route";
import { getInMemoryJobs, saveJobManifest } from "../lib/jobs-history";
import { TempManager } from "../lib/core/TempManager";

let currentUser: { uid: string; role: string } | null = { uid: "owner_uid", role: "USER" };

vi.mock("@/lib/auth/auth", () => ({
  verifySession: vi.fn(async () => {
    if (!currentUser) {
      const err: any = new Error("Unauthorized");
      err.status = 401;
      throw err;
    }
    return { user: currentUser, isSecretKey: false };
  }),
}));

const jobId = "job_media_owner_001";

async function requestVideo(uid: string | null, role = "USER") {
  currentUser = uid ? { uid, role } : null;
  return GET(new Request(`http://localhost/api/media/video/${jobId}`), {
    params: Promise.resolve({ jobId }),
  });
}

describe("GET /api/media/video/[jobId] ownership", () => {
  beforeEach(async () => {
    getInMemoryJobs().clear();
    await saveJobManifest(jobId, { userId: "owner_uid", status: "completed" });
    fs.writeFileSync(
      path.join(TempManager.getTempDir(jobId), "final_video.mp4"),
      Buffer.alloc(1024, 7)
    );
  });

  afterEach(async () => {
    await TempManager.cleanup(jobId);
    getInMemoryJobs().clear();
    currentUser = { uid: "owner_uid", role: "USER" };
  });

  it("serves the video to its owner", async () => {
    const res = await requestVideo("owner_uid");
    expect(res.status).toBe(200);
  });

  it("refuses a different authenticated user", async () => {
    const res = await requestVideo("someone_else");
    expect(res.status).toBe(403);
  });

  it("refuses an unauthenticated request", async () => {
    const res = await requestVideo(null);
    expect(res.status).toBe(401);
  });

  it("fails closed for an unowned job and lets admins through", async () => {
    getInMemoryJobs().clear();
    await saveJobManifest("job_media_unowned_001", { status: "completed" });
    fs.writeFileSync(
      path.join(TempManager.getTempDir("job_media_unowned_001"), "final_video.mp4"),
      Buffer.alloc(16, 1)
    );

    currentUser = { uid: "any_user", role: "USER" };
    const denied = await GET(new Request("http://localhost/api/media/video/job_media_unowned_001"), {
      params: Promise.resolve({ jobId: "job_media_unowned_001" }),
    });
    expect(denied.status).toBe(404);

    currentUser = { uid: "admin_user", role: "OWNER" };
    const allowed = await GET(new Request("http://localhost/api/media/video/job_media_unowned_001"), {
      params: Promise.resolve({ jobId: "job_media_unowned_001" }),
    });
    expect(allowed.status).toBe(200);

    await TempManager.cleanup("job_media_unowned_001");
  });

  it("rejects ids that could escape the media directories", async () => {
    const res = await GET(new Request("http://localhost/api/media/video/..%2F..%2Fetc%2Fpasswd"), {
      params: Promise.resolve({ jobId: "../../etc/passwd" }),
    });
    expect(res.status).toBe(404);
  });

  it("applies the same ownership rule to thumbnails", async () => {
    currentUser = { uid: "someone_else", role: "USER" };
    const denied = await getThumb(new Request(`http://localhost/api/media/thumb/${jobId}`), {
      params: Promise.resolve({ jobId }),
    });
    expect(denied.status).toBe(403);

    currentUser = null;
    const unauthenticated = await getThumb(new Request(`http://localhost/api/media/thumb/${jobId}`), {
      params: Promise.resolve({ jobId }),
    });
    expect(unauthenticated.status).toBe(401);
  });
});
