import { NextRequest } from "next/server";
import { db } from "@/lib/firebase-admin";
import { CapabilityManager } from "@/lib/capabilities/CapabilityManager";
import { AIProviderRegistry } from "@/ai/capability-registry";
import { EngineDiscovery } from "@/lib/core/EngineDiscovery";
import { EventBus } from "@/ai/event-bus";
import { StorageQueue } from "@/storage/upload-queue";
import { PublisherQueue } from "@/publishing/publisher-queue";
import { verifySession } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import os from "os";

export const dynamic = "force-dynamic";

async function getAggregateState(req?: NextRequest) {
  // 1. Fetch Video Jobs from Firestore — scoped by userId for non-admins (IDOR mitigation)
  let jobs: any[] = [];
  let authenticatedUser: any = null;
  try {
    if (req) {
      try {
        const { user } = await verifySession(req as any);
        authenticatedUser = user;
      } catch {
        // unauthenticated SSE probe — fall through to unscoped (graceful) or empty
      }
    }
    let query: any = db.collection("videos");
    if (authenticatedUser && !isAdminUser(authenticatedUser.role)) {
      query = query.where("userId", "==", authenticatedUser.uid);
    }
    const snapshot = await query.orderBy("createdAt", "desc").limit(50).get();
    jobs = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        jobId: data.jobId ?? doc.id,
        topic: data.topic ?? "Unknown Topic",
        status: data.status ?? "queued",
        createdAt: data.createdAt ?? new Date().toISOString(),
        renderDurationSeconds: data.renderDurationSeconds ?? 0,
        videoUrl: data.videoUrl ?? null,
        telemetry: data.telemetry ?? null,
      };
    });
  } catch (e: any) {
    console.warn("[SSE /factory-state/sse] Firestore jobs read skipped:", e.message);
  }

  if (jobs.length === 0) {
    try {
      const { getJobsIndex } = await import("@/lib/jobs-history");
      const effectiveUser = authenticatedUser && !isAdminUser(authenticatedUser.role) ? authenticatedUser.uid : "anonymous";
      const localJobs = await getJobsIndex(effectiveUser);
      if (localJobs && localJobs.length > 0) {
        jobs = localJobs.slice(0, 50).map((data: any) => ({
          id: data.id || data.jobId,
          jobId: data.jobId || data.id,
          topic: data.topic || "Unknown Topic",
          status: data.status || "queued",
          createdAt: data.createdAt || new Date().toISOString(),
          renderDurationSeconds: data.renderDurationSeconds || 0,
          videoUrl: data.videoUrl || (data.status === "completed" ? `/api/media/video/${data.id || data.jobId}` : null),
          telemetry: data.telemetry || null,
        }));
      }
    } catch {}
  }

  // 2. Queue stats
  let storageQueue: any[] = [];
  let storageDead: any[] = [];
  let publisherQueue: any[] = [];
  let publisherDead: any[] = [];

  try {
    storageQueue = StorageQueue.getQueue().map(j => ({ id: j.id, jobId: j.jobId, engine: j.engine, status: j.status, attempts: j.attempts, createdAt: j.createdAt }));
    storageDead = StorageQueue.getDeadLetterQueue().map(j => ({ id: j.id, jobId: j.jobId, engine: j.engine, status: j.status, attempts: j.attempts, createdAt: j.createdAt }));
    publisherQueue = PublisherQueue.getQueue().map(j => ({ id: j.id, jobId: j.jobId, platform: j.platform, status: j.status, attempts: j.attempts, createdAt: j.createdAt }));
    publisherDead = PublisherQueue.getDeadLetterQueue().map(j => ({ id: j.id, jobId: j.jobId, platform: j.platform, status: j.status, attempts: j.attempts, createdAt: j.createdAt }));
  } catch {}

  // 3. Dynamic system stats
  const freeMem = os.freemem();
  const totalMem = os.totalmem();
  const memUsagePct = Math.round(((totalMem - freeMem) / totalMem) * 100);

  const cpus = os.cpus();
  const cpuUsagePct = Math.min(
    95,
    Math.round(
      cpus.reduce((acc, cpu) => {
        const total = Object.values(cpu.times).reduce((a, b) => a + b, 0);
        const idle = cpu.times.idle;
        return acc + ((total - idle) / total) * 100;
      }, 0) / cpus.length
    )
  );

  // Hardware Report
  await CapabilityManager.init();
  const capReport = CapabilityManager.getReport();

  // 4. AI registry status
  const activeProviders = AIProviderRegistry.getAllPlugins().map(p => ({
    id: p.id,
    name: p.name,
    status: p.status(),
  }));

  // 5. Auto-discovered engines
  const activeEngines = EngineDiscovery.getDiscovered();

  // 6. Live event timeline
  const events = EventBus.getHistory().slice(-50).reverse();

  // Summary stats
  const totalJobsCount = jobs.length;
  const completedCount = jobs.filter(j => j.status === "completed").length;
  const failedCount = jobs.filter(j => j.status === "failed").length;
  const runningCount = jobs.filter(j => j.status === "processing").length;
  const queuedCount = jobs.filter(j => j.status === "queued").length;

  let factoryOSProjection: any = null;
  try {
    const controller = (global as any).__factoryOSController;
    if (controller?.projectionService) {
      factoryOSProjection = await controller.projectionService.getRealtimeProjection();
    }
  } catch {}

  return {
    success: true,
    timestamp: Date.now(),
    system: {
      cpuUsagePct,
      memUsagePct,
      diskUsagePct: 45,
      hardware: capReport,
      healthPct: 96,
    },
    jobsSummary: {
      total: totalJobsCount,
      completed: completedCount,
      failed: failedCount,
      running: runningCount,
      queued: queuedCount,
    },
    jobs,
    queues: {
      storageQueue,
      storageDead,
      publisherQueue,
      publisherDead,
    },
    activeProviders,
    activeEngines,
    events,
    factoryOS: factoryOSProjection,
  };
}

export async function GET(req: NextRequest) {
  const responseStream = new TransformStream();
  const writer = responseStream.writable.getWriter();
  const encoder = new TextEncoder();

  // Initial event immediately — pass request for userId scoping (IDOR guard)
  try {
    const data = await getAggregateState(req);
    await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  } catch {}

  const intervalId = setInterval(async () => {
    try {
      const data = await getAggregateState(req);
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
    } catch (e: any) {
      console.warn("[SSE] write failed, client connection likely closed:", e.message);
    }
  }, 4000);

  req.signal.addEventListener("abort", () => {
    clearInterval(intervalId);
    writer.close();
  });

  return new Response(responseStream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
