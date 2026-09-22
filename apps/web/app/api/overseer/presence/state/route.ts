import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import type { FactoryMetrics } from "@/components/overseer/presence/OverseerMetricsHUD";
import type { ActivityEvent } from "@/components/overseer/presence/OverseerActivity";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const controller = await getFactoryOSController();
    const worldState = controller.worldState ? controller.worldState.getState() : { floors: {}, workers: {} };
    const activeCases = controller.caseManager ? await controller.caseManager.getActiveCases() : [];
    const allCases = controller.caseManager ? await controller.caseManager.getAllCases() : [];
    const activeMissions = controller.missionManager ? await controller.missionManager.getActiveMissions() : [];
    
    let recentDecisions: any[] = [];
    try {
      if (controller.overseer?.getDecisionLedger()) {
        recentDecisions = await controller.overseer.getDecisionLedger().getRecentDecisions(10);
      }
    } catch {}

    const floorList = worldState.floors ? Object.values(worldState.floors) : [];
    const onlineFloors = floorList.filter((f) => f.status === "ONLINE");
    const workerList = worldState.workers ? Object.values(worldState.workers) : [];
    const healthyWorkers = workerList.filter((w) => w.status === "HEALTHY");

    const criticalCases = activeCases.filter((c) => c.severity === "CRITICAL" || c.severity === "HIGH");
    const activeRepairs = activeCases.filter((c) => c.status === "HEALING" || c.status === "VERIFYING");

    // Calculate overall Factory Health Percentage
    let factoryHealthPercent = 100;
    if (criticalCases.length > 0) {
      factoryHealthPercent -= criticalCases.length * 20;
    }
    if (floorList.length > 0 && onlineFloors.length < floorList.length) {
      factoryHealthPercent -= (floorList.length - onlineFloors.length) * 15;
    }
    factoryHealthPercent = Math.max(10, Math.min(100, factoryHealthPercent));

    const metrics: FactoryMetrics = {
      factoryHealthPercent,
      factoryStatus:
        criticalCases.length > 0
          ? "CRITICAL"
          : onlineFloors.length < floorList.length
          ? "DEGRADED"
          : "ONLINE",
      activeMissionsCount: activeMissions.length,
      activeCasesCount: activeCases.length,
      criticalCasesCount: criticalCases.length,
      healthyWorkersCount: healthyWorkers.length,
      totalWorkersCount: workerList.length,
      onlineFloorsCount: onlineFloors.length,
      totalFloorsCount: floorList.length,
      activeRepairsCount: activeRepairs.length,
    };

    // Format human-friendly operational Activity Events
    const activity: ActivityEvent[] = [];

    // Recent case events
    for (const c of allCases.slice(-8).reverse()) {
      const caseTime = c.updatedAt || c.createdAt || new Date().toISOString();
      const formattedTime = new Date(caseTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

      if (c.status === "RESOLVED") {
        activity.push({
          id: `act_res_${c.caseId}`,
          timestamp: formattedTime,
          source: "VALIDATOR",
          title: `Repair Verified & Case Resolved: ${c.title}`,
          description: c.resolutionSummary || `Independent validator confirmed system health on floor ${c.floorId}.`,
          floorId: c.floorId,
          severity: "INFO",
        });
      } else if (c.status === "HEALING") {
        activity.push({
          id: `act_heal_${c.caseId}`,
          timestamp: formattedTime,
          source: "HEALER",
          title: `Healer Squad Dispatched: ${c.title}`,
          description: `Acquired repair lock on ${c.floorId}. Applying automated remediation.`,
          floorId: c.floorId,
          severity: c.severity as any,
        });
      } else {
        activity.push({
          id: `act_slayer_${c.caseId}`,
          timestamp: formattedTime,
          source: "SLAYER",
          title: `Anomaly Detected: ${c.title}`,
          description: c.description,
          floorId: c.floorId,
          severity: c.severity as any,
        });
      }
    }

    // Recent decisions
    for (const d of recentDecisions.slice(0, 5)) {
      activity.push({
        id: `act_dec_${d.decisionId}`,
        timestamp: new Date(d.timestamp || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        source: "OVERSEER",
        title: `Strategic Decision [${d.thinkingMode || "OPERATE"}]: ${d.selectedOption || "Optimized execution plan"}`,
        description: d.reasoningSummary || "Autonomous factory orchestration step.",
        severity: "INFO",
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        metrics,
        floors: floorList.map((f: any) => ({
          floorId: f.floorId,
          name: f.name || f.floorId?.replace(/_/g, " ")?.toUpperCase() || "FLOOR",
          status: f.status || "ONLINE",
          workersCount: typeof f.activeWorkers === "number" ? f.activeWorkers : (f.workers?.length ?? 1),
          lastError: f.recentAnomalies?.[0] || null,
          metrics: {
            queueDepth: f.queueDepth || 0,
            activeJobs: f.activeJobs?.length || 0,
          },
        })),
        missions: activeMissions.map((m: any) => ({
          missionId: m.missionId,
          goal: m.objective || m.title || "Autonomous Mission",
          status: m.status || "RUNNING",
          progress: m.progress ?? 0.5,
          budget: m.budget ?? 1.0,
          taskCount: m.taskIds?.length || m.tasks?.length || 0,
        })),
        cases: activeCases.map((c: any) => ({
          caseId: c.caseId,
          title: c.title,
          floorId: c.floorId,
          severity: c.severity,
          status: c.status,
          detectorId: c.detectorId,
          description: c.description,
          evidenceCount: c.evidence?.length || 0,
          hypothesesCount: c.hypotheses?.length || 0,
        })),
        decisions: recentDecisions.map((d: any) => ({
          decisionId: d.decisionId,
          thinkingMode: d.thinkingMode,
          selectedOption: d.selectedOption,
          reasoningSummary: d.reasoningSummary,
          timestamp: d.timestamp,
        })),
        activity: activity.slice(0, 15),
        subsystems: {
          capabilities: controller.capabilityRegistry ? controller.capabilityRegistry.getAll() : [],
          voiceFabric: {
            engines: ["GEMINI", "ELEVENLABS", "SILENT_WAV_FALLBACK"],
            profilesCount: 2,
            activeEngine: "GEMINI",
            fallbackReady: true,
          },
          renderFabric: {
            compilers: ["FFMPEG", "HYPERFRAMES"],
            status: "READY",
            activePlanner: "CAPABILITY_AWARE",
          },
          evolutionBrain: {
            proposalsCount: controller.evolutionBrain ? controller.evolutionBrain.getProposals().length : 0,
            activeCanaries: controller.evolutionBrain
              ? controller.evolutionBrain.getProposals().filter((p) => p.status === "CANARY_TESTING").length
              : 0,
          },
          contentGenome: {
            indexedGenomesCount: controller.contentGenome ? controller.contentGenome.getAllGenomes().length : 0,
          },
          researchRuntime: {
            status: "READY",
            adapter: "LightpandaCleanRoom",
            reachSubsystem: "ENABLED",
          },
        },
      },
    });
  } catch (err: any) {
    console.error("[API /overseer/presence/state GET] Error:", err);
    return NextResponse.json(
      { 
        success: false, 
        error: err.message || "Failed to fetch Overseer operational state" 
      },
      { status: 500 }
    );
  }
}
