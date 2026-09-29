import type { EventEnvelope } from "../contracts/EventContracts";
import type { DurableEventBus } from "../events/DurableEventBus";
import {
  ProductionTrajectoryEvaluator,
  type FloorTrajectoryObservation,
  type ProductionTrajectory,
  type TrajectoryEvaluationInput,
  type TrajectoryProofLevel,
} from "./ProductionTrajectory";

interface TrajectoryBuffer {
  missionId: string;
  runId?: string;
  startedAt: string;
  completedAt?: string;
  floors: Map<string, FloorTrajectoryObservation>;
}

function floorObservationFromEvent(payload: Record<string, any>): FloorTrajectoryObservation | null {
  if (!payload.floorId || !payload.loopReceipt) {
    return null;
  }

  const receipt = payload.loopReceipt;
  return {
    floorId: String(payload.floorId),
    loopType: receipt.loopType,
    proofLevel: (receipt.loopType === "DETERMINISTIC_OPERATIONAL" || receipt.loopType === "VERIFICATION_REMEDIATION")
      ? "PHYSICAL_VERIFICATION"
      : "LOOP_RECEIPT",
    verified: Boolean(receipt.verified),
    termination: receipt.termination,
    iterations: Number(receipt.iterations || 0),
    evidenceRefs: Array.isArray(receipt.evidenceRefs) ? receipt.evidenceRefs : [],
    failureReason: receipt.failureReason,
  };
}

function weakObservationFromEvent(payload: Record<string, any>): FloorTrajectoryObservation | null {
  if (!payload.floorId || payload.loopReceipt) return null;
  const output = payload.output;
  const validated =
    payload.status === "OK" ||
    output?.handoff_status === "VALIDATED" ||
    output?.handoffStatus === "VALIDATED";

  return {
    floorId: String(payload.floorId),
    loopType: "COGNITIVE_EXECUTION",
    proofLevel: validated ? ("HANDOFF_CONTRACT" as TrajectoryProofLevel) : "NONE",
    verified: Boolean(validated),
    termination: validated ? "RUNTIME_HANDOFF_VALIDATED" : "RUNTIME_HANDOFF_UNVERIFIED",
    iterations: 1,
    evidenceRefs: [],
    failureReason: validated ? undefined : "Runtime task event did not contain verifiable closure evidence.",
  };
}

export class ProductionTrajectoryCollector {
  private readonly buffers = new Map<string, TrajectoryBuffer>();
  private unsubscribers: Array<() => void> = [];

  constructor(private readonly eventBus: DurableEventBus) {}

  start(): void {
    if (this.unsubscribers.length > 0) return;
    const topics = ["TASK_COMPLETED", "RUN_COMPLETED", "MISSION_COMPLETED"] as const;
    this.unsubscribers = topics.map((topic) =>
      this.eventBus.subscribe(topic, async (event: EventEnvelope<any>) => {
        this.ingest(event);
      }),
    );
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
  }

  ingest(event: EventEnvelope<any>): void {
    const payload = (event.payload || {}) as Record<string, any>;
    const missionId = typeof payload.missionId === "string" ? payload.missionId : undefined;
    if (!missionId) return;

    const now = event.timestamp;
    const existing = this.buffers.get(missionId);

    if (!existing) {
      this.buffers.set(missionId, {
        missionId,
        runId: typeof payload.runId === "string" ? payload.runId : undefined,
        startedAt: now,
        floors: new Map(),
      });
    }

    const buffer = this.buffers.get(missionId)!;
    if (typeof payload.runId === "string") buffer.runId = payload.runId;

    if (event.topic === "TASK_COMPLETED") {
      const observation = floorObservationFromEvent(payload) || weakObservationFromEvent(payload);
      if (observation) buffer.floors.set(observation.floorId, observation);
    }

    if (event.topic === "RUN_COMPLETED" || event.topic === "MISSION_COMPLETED") {
      buffer.completedAt = now;
    }
  }

  finalize(missionId: string, completedAt?: string): ProductionTrajectory {
    const buffer = this.buffers.get(missionId);
    if (!buffer) {
      throw new Error("TRAJECTORY_NOT_FOUND: no observed trajectory for mission " + missionId);
    }

    const input: TrajectoryEvaluationInput = {
      missionId: buffer.missionId,
      runId: buffer.runId,
      startedAt: buffer.startedAt,
      completedAt: completedAt || buffer.completedAt || new Date().toISOString(),
      floorObservations: [...buffer.floors.values()],
    };

    const trajectory = ProductionTrajectoryEvaluator.evaluate(input);
    this.buffers.delete(missionId);
    return trajectory;
  }

  getPendingMissionIds(): readonly string[] {
    return Object.freeze([...this.buffers.keys()]);
  }
}
