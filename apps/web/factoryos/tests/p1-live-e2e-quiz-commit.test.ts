import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { POST as dispatchHandler } from "../../app/api/rendering/instabox/dispatch/route";
import { POST as callbackHandler } from "../../app/api/rendering/instabox/callback/route";
import { InstaBoxFleetRegistry } from "../core/compute/instabox/InstaBoxFleetRegistry";
import { ComputeGateway } from "../core/compute/gateway/ComputeGateway";

describe("P1 Live E2E Quiz Commit Path (Dispatch -> Worker -> Staged -> Callback -> Verifier -> CAS)", () => {
  const originalEnv = { ...process.env };
  const BOX2_SECRET = "box2-e2e-secret-key-32chars-001";
  const WORKER_ID = "instabox-box2";
  const NODE_ID = "box2";
  const workDir = path.join(process.cwd(), "data", "p1-e2e-quiz-test");

  let registry: InstaBoxFleetRegistry;

  beforeEach(() => {
    process.env.INSTABOX_WORKER_SECRET_BOX2 = BOX2_SECRET;
    process.env.INSTABOX_CONTROL_PLANE_ADMIN_SECRET = "admin-e2e-secret";
    registry = InstaBoxFleetRegistry.resetInstanceForTesting();
    ComputeGateway.resetInstanceForTesting();

    registry.recordHeartbeat({
      workerId: WORKER_ID,
      nodeId: NODE_ID,
      status: "HEALTHY",
      metrics: {
        cpuCores: 4,
        cpuUsagePercent: 10,
        memoryTotalMb: 8000,
        memoryAvailableMb: 6000,
        diskTotalMb: 20000,
        diskAvailableMb: 15000,
        operatingSystem: "Windows",
        activeJobs: 0,
      },
    });
    fs.mkdirSync(workDir, { recursive: true });
  });

  afterEach(() => {
    InstaBoxFleetRegistry.resetInstanceForTesting();
    process.env = { ...originalEnv };
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it("allows 138s quiz duration through dispatch without 30s clamp", async () => {
    const jobId = "p1-e2e-duration-138";
    const dispatchReq = new NextRequest("http://localhost:3000/api/rendering/instabox/dispatch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer admin-e2e-secret",
      },
      body: JSON.stringify({ nodeId: NODE_ID, jobId, topic: "138s Quiz Policy Check", duration: 138 }),
    });
    const dispatchPromise = dispatchHandler(dispatchReq);
    let claim: any = null;
    for (let i = 0; i < 60; i++) {
      claim = registry.claimJob(WORKER_ID);
      if (claim?.claimed) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(claim?.claimed).toBe(true);
    const lease = registry.getNodeRecordByWorkerId(WORKER_ID)?.activeLease;
    expect(lease?.job.manifest.duration).toBe(138);
    // Cleanly fail the lease so dispatchPromise resolves immediately
    registry.failActiveJob(WORKER_ID, lease!.executionToken, "Duration policy check complete");
    await dispatchPromise;
  });

  it("traverses dispatch -> real quiz render -> result.json (staged) -> fenced callback -> F06/F07 verifier PASS -> CAS committed", async () => {
    const jobId = "p1-e2e-quiz-001";

    // 1. Dispatch via control-plane route handler (duration=10.33 matches 1-question quiz render)
    const dispatchReq = new NextRequest("http://localhost:3000/api/rendering/instabox/dispatch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer admin-e2e-secret",
      },
      body: JSON.stringify({
        nodeId: NODE_ID,
        jobId,
        topic: "P1 E2E Geography Quiz",
        duration: 10.2,
        localRenderIntent: {
          project_id: `proj_${jobId}`,
          title: "P1 E2E Geography Quiz",
          output: {
            width: 1080,
            height: 1920,
            fps: 30,
            duration_seconds: 10.2,
            video_codec: "libx264",
            audio_codec: "aac",
          },
        },
      }),
    });

    // 1. Dispatch via control-plane route handler (duration=45 proves 30s clamp is gone)
    // Note: dispatchHandler awaits completion from the worker callback, so we launch it
    // concurrently and claim the queued job just like the InstaBox worker daemon does.
    const dispatchPromise = dispatchHandler(dispatchReq);
    let claim: any = null;
    for (let i = 0; i < 60; i++) {
      claim = registry.claimJob(WORKER_ID);
      if (claim?.claimed) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(claim?.claimed).toBe(true);
    expect(claim.jobId).toBe(jobId);
    const lease = registry.getNodeRecordByWorkerId(WORKER_ID)?.activeLease;
    expect(lease).toBeDefined();
    expect(lease!.attemptId).toBe(1);

    // 2. Worker executes real quiz render + emits staged result.json (no self-attestation)
    const repoRoot = path.resolve(process.cwd(), "..", "..");
    const engineDir = path.join(repoRoot, "services", "rendering-engine");
    const pyScript = `
import json, subprocess, sys
from pathlib import Path
sys.path.insert(0, r"${engineDir.replace(/\\/g, "\\\\")}")
sys.path.insert(0, r"${path.join(engineDir, "scripts").replace(/\\/g, "\\\\")}")
import create_short
from core.commit import emit_staged_result

async def hermetic_tts(text, voice, rate, out_mp3):
    subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libmp3lame", "-b:a", "128k", str(out_mp3)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
    )
create_short._async_generate_tts_mp3 = hermetic_tts

out_dir = Path(r"${workDir.replace(/\\/g, "\\\\")}")
out_audio = out_dir / "audio.wav"
out_srt = out_dir / "subtitles.srt"
out_final = out_dir / "final.mp4"
out_thumb = out_dir / "thumbnail.png"
timings = {}
job = {
    "jobId": "${jobId}",
    "topic": "World Geography Quiz",
    "contentType": "QUIZ_SHORTS",
    "voiceCode": "en-US-AriaNeural",
    "quizData": {
        "hook": "Only 2% get full marks!",
        "questions": [
            {
                "question": "Which country has the most natural lakes?",
                "options": ["Canada", "Russia", "United States", "Brazil"],
                "answer": "Canada",
                "answerIndex": 0,
            }
        ]
    }
}
res = create_short.run_quiz_shorts(job, out_dir, out_audio, out_srt, out_final, out_thumb, timings)
staged = emit_staged_result(
    job_id="${jobId}",
    out_dir=out_dir,
    artifact_path=out_final,
    probe={"duration": res.get("videoDuration"), "playable": True, "audioDetected": True},
    timings=timings,
    extra={"fps": res.get("fps", 30), "resolution": res.get("resolution", "1080x1920")}
)
print("STAGED_JSON=" + json.dumps(staged))
`;

    const pyOut = execFileSync("python", ["-c", pyScript], { encoding: "utf-8" });
    const resultJsonPath = path.join(workDir, "result.json");
    expect(fs.existsSync(resultJsonPath)).toBe(true);
    const staged = JSON.parse(fs.readFileSync(resultJsonPath, "utf-8"));
    expect(staged.status).toBe("staged");
    expect(staged.artifactSha256).toMatch(/^[a-f0-9]{64}$/);

    const finalMp4 = path.join(workDir, "final.mp4");
    expect(fs.existsSync(finalMp4)).toBe(true);

    // 3. Fenced Callback -> F06 RenderArtifactVerifier -> F07 VerificationEngine -> CAS/Control Plane COMMITTED
    const callbackReq = new NextRequest("http://localhost:3000/api/rendering/instabox/callback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${BOX2_SECRET}`,
      },
      body: JSON.stringify({
        workerId: WORKER_ID,
        executionToken: lease!.executionToken,
        executionId: lease!.executionId,
        jobId,
        status: "RENDER_SUCCEEDED",
        attemptId: lease!.attemptId,
        exitCode: 0,
        sha256Proof: staged.artifactSha256,
        byteLength: staged.byteLength,
        casUri: finalMp4,
        metrics: { timings: staged.timings, probe: staged.probe },
      }),
    });

    const callbackRes = await callbackHandler(callbackReq);
    const callbackJson = await callbackRes.json();
    const dispatchRes = await dispatchPromise;
    const dispatchJson = await dispatchRes.json();
    console.log(
      "[P1-E2E-TRACE]",
      JSON.stringify({
        dispatch: { status: dispatchRes.status, jobId, duration: 10.2, attemptId: lease!.attemptId, error: dispatchJson.error, artifactSha256: dispatchJson.artifact?.computedSha256, verifier: dispatchJson.verifierResult?.status, f07: dispatchJson.f07Audit?.overallStatus },
        staged: { status: staged.status, artifactSha256: staged.artifactSha256, byteLength: staged.byteLength },
        callback: callbackJson,
      }),
    );

    expect(callbackRes.status).toBe(200);
    expect(callbackJson.success).toBe(true);
    expect(callbackJson.status).toBe("COMPLETED");
    expect(callbackJson.sha256).toBe(staged.artifactSha256);
    expect(callbackJson.receiptId).toBeTruthy();
    expect(dispatchRes.status).toBe(200);
    expect(dispatchJson.success).toBe(true);
    expect(pyOut).toContain("STAGED_JSON=");
  }, 240000);

  it("rejects non-doctrine 18fps artifact at F06 callback even if producer declared fps=18", async () => {
    const jobId = "p20-reject-18fps";
    const dispatchReq = new NextRequest("http://localhost:3000/api/rendering/instabox/dispatch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer admin-e2e-secret",
      },
      body: JSON.stringify({
        nodeId: NODE_ID,
        jobId,
        topic: "Non-doctrine 18fps rejection test",
        duration: 2,
        localRenderIntent: {
          project_id: `proj_${jobId}`,
          title: "18fps test",
          output: { width: 1080, height: 1920, fps: 18, duration_seconds: 2 },
        },
      }),
    });

    const dispatchPromise = dispatchHandler(dispatchReq);
    let claim: any = null;
    for (let i = 0; i < 60; i++) {
      claim = registry.claimJob(WORKER_ID);
      if (claim?.claimed) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(claim?.claimed).toBe(true);
    const lease = registry.getNodeRecordByWorkerId(WORKER_ID)?.activeLease!;

    const badMp4 = path.join(workDir, "bad_18fps.mp4");
    execFileSync("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "color=c=0x0a0f1d:s=1080x1920:d=2:r=18",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-shortest", badMp4,
    ], { stdio: "ignore" });
    const crypto = await import("node:crypto");
    const badSha = crypto.createHash("sha256").update(fs.readFileSync(badMp4)).digest("hex");

    const callbackReq = new NextRequest("http://localhost:3000/api/rendering/instabox/callback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${BOX2_SECRET}`,
      },
      body: JSON.stringify({
        workerId: WORKER_ID,
        executionToken: lease.executionToken,
        executionId: lease.executionId,
        jobId,
        status: "RENDER_SUCCEEDED",
        attemptId: lease.attemptId,
        exitCode: 0,
        sha256Proof: badSha,
        byteLength: fs.statSync(badMp4).size,
        casUri: badMp4,
      }),
    });

    const callbackRes = await callbackHandler(callbackReq);
    const callbackJson = await callbackRes.json();
    expect(callbackRes.status).toBe(422);
    expect(callbackJson.success).toBe(false);
    expect(callbackJson.error).toContain("F06 physical artifact rejected");
    await dispatchPromise;
  }, 60000);
});
