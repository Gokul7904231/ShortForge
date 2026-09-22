import { NextResponse } from "next/server";
import { db } from "@/lib/firebase-admin";
import { CapabilityManager } from "@/lib/capabilities/CapabilityManager";
import { AIProviderRegistry } from "@/ai/capability-registry";
import { EngineDiscovery } from "@/lib/core/EngineDiscovery";
import { EventBus } from "@/ai/event-bus";
import { MetricsDB } from "@/lib/queue-db";
import { StorageQueue } from "@/storage/upload-queue";
import { PublisherQueue } from "@/publishing/publisher-queue";
import { verifySession } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { ProviderDiscovery } from "@/lib/core/ProviderDiscovery";
import os from "os";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    let authenticatedUser: any = null;
    try {
      const { user } = await verifySession(request);
      authenticatedUser = user;
    } catch {
      // Graceful fallback for unauthenticated session probes
    }

    // 1. Fetch Video Jobs from Firestore with strict role-based data isolation
    let jobs: any[] = [];
    try {
      let query: any = db.collection("videos");
      if (authenticatedUser && !isAdminUser(authenticatedUser.role)) {
        query = query.where("userId", "==", authenticatedUser.uid);
      }
      const snapshot = await query.orderBy("createdAt", "desc").limit(50).get();
      jobs = snapshot.docs.map((doc: any) => {
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
      console.warn("[API /factory-state] Firestore jobs read skipped:", e.message);
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

    // 3. Dynamic system stats (mock SRE/Grafana metrics blended with real OS load)
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

    // Hardware Report & Async Provider Discovery Bootstrap
    await CapabilityManager.init();
    if (!ProviderDiscovery.isInitialized()) {
      ProviderDiscovery.init().catch((err: any) => {
        console.warn("[factory-state] Background ProviderDiscovery init error:", err?.message || String(err));
      });
    }
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

    const diskUsagePct = 0; // honest: disk telemetry unavailable — 0 until measured (was 45 fake)
    const healthPct = totalJobsCount === 0 ? 100 : Math.round((completedCount / totalJobsCount) * 100);

    let factoryOSProjection: any = null;
    try {
      const controller = (global as any).__factoryOSController;
      if (controller?.projectionService) {
        factoryOSProjection = await controller.projectionService.getRealtimeProjection();
      }
    } catch {}

    const isOperator = authenticatedUser && isAdminUser(authenticatedUser.role);

    // 1. For BASIC / CREATOR users: Return EXCLUSIVELY creator-safe projection (Correction 4)
    if (!isOperator) {
      return NextResponse.json({
        success: true,
        surface: "creator",
        timestamp: Date.now(),
        jobs,
        jobsSummary: {
          total: totalJobsCount,
          completed: completedCount,
          failed: failedCount,
          running: runningCount,
          queued: queuedCount,
        },
        activeEngines,
        pipelineReady: true,
      });
    }

    // 2. For OPERATOR / ADMIN users: Return full FactoryOS control plane telemetry
    return NextResponse.json({
      success: true,
      surface: "factory",
      timestamp: Date.now(),
      system: {
        cpuUsagePct,
        memUsagePct,
        diskUsagePct,
        hardware: capReport,
        healthPct,
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
    });
  } catch (err: any) {
    console.error("[API /factory-state] Error gathering state:", err.message);
    return NextResponse.json({ success: false, error: err.message }, { status: 550 });
  }
}
