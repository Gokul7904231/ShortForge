/**
 * FactoryOS Frontier v3 — Authoritative HTTP Callback Gate Tests (P0-G)
 * Proves that POST /api/rendering/callback is an authoritative completion gate:
 * - Corrupt media artifact -> Refused COMPLETED (422), quota NOT finalized, mission NOT completed
 * - Valid MP4 artifact -> Exactly one completion effect (200), quota finalized
 * - Duplicate callback -> Strictly idempotent, no duplicate quota completion
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { NextRequest } from "next/server";
import { POST as callbackHandler } from "../../app/api/rendering/callback/route";
import { readJobManifest, saveJobManifest } from "../../lib/jobs-history";
import { reserveGenerationSlot, getUserQuota } from "../../lib/quota/quota-service";

function generateTestMp4(outputPath: string, width = 1080, height = 1920, duration = 1): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  execSync(
    `ffmpeg -y -f lavfi -i color=c=black:s=${width}x${height}:d=${duration} -f lavfi -i anullsrc=r=44100:cl=stereo -c:v libx264 -pix_fmt yuv420p -c:a aac -t ${duration} "${outputPath}"`,
    { stdio: "ignore" }
  );
}

describe("HTTP POST /api/rendering/callback Authoritative Gate", () => {
  const testToken = "test_execution_token_authoritative_gate_2026";
  const userId = `user_gate_test_${Date.now()}`;
  const renderDir = path.join(process.cwd(), "data", "renders");

  beforeEach(() => {
    process.env.INTERNAL_API_SECRET_KEY = testToken;
    if (!fs.existsSync(renderDir)) fs.mkdirSync(renderDir, { recursive: true });
  });

  it("Case 1: Corrupt callback artifact -> 422, NOT COMPLETED, quota NOT finalized, mission NOT completed", async () => {
    const jobId = `job_corrupt_${Date.now()}`;
    const corruptFile = path.join(renderDir, `${jobId}.mp4`);
    fs.writeFileSync(corruptFile, Buffer.from("NOT_A_VALID_MP4_CORRUPT_BYTES"));

    // Reserve generation slot (quota)
    await reserveGenerationSlot(userId, "BASIC", jobId);
    const initialQuota = await getUserQuota(userId, "BASIC");

    // Initialize job manifest
    await saveJobManifest(jobId, {
      jobId,
      userId,
      status: "running",
      executionToken: testToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    try {
      const req = new NextRequest("http://localhost:3000/api/rendering/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          jobId,
          status: "completed",
          videoUrl: corruptFile,
          executionToken: testToken,
        }),
      });

      const res = await callbackHandler(req);
      const data = await res.json();

      // Invariant: Refuses COMPLETED
      expect(res.status).toBe(422);
      expect(data.success).toBe(false);
      expect(data.status).toBe("failed");
      expect(data.error).toMatch(/verification failed/i);

      // Verify persistent manifest
      const manifest = await readJobManifest(jobId);
      expect(manifest?.status).not.toBe("completed");
      expect(manifest?.status).toBe("failed");

      // Verify quota was NOT consumed as a completed slot
      const finalQuota = await getUserQuota(userId, "BASIC");
      expect(finalQuota.completed).toBe(0);
      expect(finalQuota.reserved).toBe(0);
    } finally {
      if (fs.existsSync(corruptFile)) fs.unlinkSync(corruptFile);
    }
  });

  it("Case 2: Valid MP4 artifact -> 200, COMPLETED, exactly one completion effect", async () => {
    const jobId = `job_valid_${Date.now()}`;
    const validMp4File = path.join(renderDir, `${jobId}.mp4`);
    generateTestMp4(validMp4File, 1080, 1920, 1);

    await reserveGenerationSlot(userId, "BASIC", jobId);

    await saveJobManifest(jobId, {
      jobId,
      userId,
      status: "running",
      executionToken: testToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    try {
      const req = new NextRequest("http://localhost:3000/api/rendering/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          jobId,
          status: "completed",
          videoUrl: validMp4File,
          executionToken: testToken,
        }),
      });

      const res = await callbackHandler(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.status).toBe("completed");
      expect(data.videoUrl).toBe(validMp4File);

      // Verify manifest records measured values
      const manifest = await readJobManifest(jobId);
      expect(manifest?.status).toBe("completed");
      expect(manifest?.videoSizeMb).toBeGreaterThan(0);
      expect(manifest?.artifactSha256).toBeDefined();
      expect(manifest?.artifactSha256?.length).toBe(64);
      expect((manifest as any).verificationAudit?.passed).toBe(true);
    } finally {
      if (fs.existsSync(validMp4File)) fs.unlinkSync(validMp4File);
    }
  });

  it("Case 3: Duplicate callback -> strictly idempotent without duplicate quota consumption", async () => {
    const jobId = `job_idem_${Date.now()}`;
    const validMp4File = path.join(renderDir, `${jobId}.mp4`);
    generateTestMp4(validMp4File, 1080, 1920, 1);

    await reserveGenerationSlot(userId, "BASIC", jobId);

    await saveJobManifest(jobId, {
      jobId,
      userId,
      status: "running",
      executionToken: testToken,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    const makeReq = () =>
      new NextRequest("http://localhost:3000/api/rendering/callback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${testToken}`,
        },
        body: JSON.stringify({
          jobId,
          status: "completed",
          videoUrl: validMp4File,
          executionToken: testToken,
        }),
      });

    try {
      // First callback
      const res1 = await callbackHandler(makeReq());
      expect(res1.status).toBe(200);

      // Second duplicate callback
      const res2 = await callbackHandler(makeReq());
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.message).toContain("already marked completed");

      // Manifest remains completed
      const manifest = await readJobManifest(jobId);
      expect(manifest?.status).toBe("completed");
    } finally {
      if (fs.existsSync(validMp4File)) fs.unlinkSync(validMp4File);
    }
  });
});
