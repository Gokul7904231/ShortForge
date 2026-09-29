import type { EventEnvelope } from "../contracts/EventContracts";
import type { DurableEventBus } from "../events/DurableEventBus";
import {
  ProductionTrajectoryEvaluator,
  type FloorTrajectoryObservation,
  type ProductionTrajectory,
  type TrajectoryEvaluationInput,
  type TrajectoryProofLevel,
} from "./ProductionTrajectory";
import type { TrajectoryLearningBridge } from "../cognitive/TrajectoryLearningBridge";

interface TrajectoryBuffer {
  missionId: string;
  runId?: string;
  startedAt: string;
  completedAt?: string;
  floors: Map<string, FloorTrajectoryObservation>;
}

function loopObservationFromEvent(payload: Record<string, any>): FloorTrajectoryObservation | null {
  if (!payload.floorId || !payload.loopReceipt || typeof payload.loopReceipt !== "object") {
    return null;
  }

  const receipt = payload.loopReceipt;
  return {
    floorId: String(payload.floorId),
    loopType: receipt.loopType,
    proofLevel:
      receipt.loopType === "DETERMINISTIC_OPERATIONAL" || receipt.loopType === "VERIFICATION_REMEDIATION"
        ? "PHYSICAL_VERIFICATION"
        : "LOOP_RECEIPT",
    verified: Boolean(receipt.verified),
    termination: receipt.termination,
    iterations: Number(receipt.iterations || 0),
    evidenceRefs: Array.isArray(receipt.evidenceRefs) ? receipt.evidenceRefs : [],
    failureReason: receipt.failureReason,
  };
}

function handoffObservationFromEvent(payload: Record<string, any>): FloorTrajectoryObservation | null {
  if (!payload.floorId || payload.loopReceipt) return null;

  const output = payload.output;
  const handoff =
    payload.handoff ||
    payload.handoffPayload ||
    (output && typeof output === "object" ? output.handoffPayload || output : undefined);

  const validated =
    Boolean(handoff && typeof handoff === "object" && (
      handoff.handoff_status === "VALIDATED" ||
      handoff.handoffStatus === "VALIDATED"
    ));

  if (!validated) {
    return {
      floorId: String(payload.floorId),
      loopType: "COGNITIVE_EXECUTION",
      proofLevel: "NONE",
      verified: false,
      termination: "RUNTIME_HANDOFF_UNVERIFIED",
      iterations: 1,
      evidenceRefs: [],
      failureReason: "Runtime task event did not contain verifiable closure evidence.",
    };
  }

  return {
    floorId: String(payload.floorId),
    loopType: "COGNITIVE_EXECUTION",
    proofLevel: "HANDOFF_CONTRACT",
    // A validated handoff proves the boundary contract, not the local closed loop.
    verified: false,
    termination: "RUNTIME_HANDOFF_VALIDATED",
    iterations: 1,
    evidenceRefs: [],
    failureReason: "Validated handoff observed without a floor closed-loop receipt.",
  };
}

export class ProductionTrajectoryCollector {
  private readonly buffers = new Map<string, TrajectoryBuffer>();
  private readonly predictions = new Map<string, boolean>();
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly eventBus: DurableEventBus,
    private readonly learningBridge?: TrajectoryLearningBridge,
  ) {}

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

  setPrediction(missionId: string, predictedSuccess: boolean): void {
    this.predictions.set(missionId, predictedSuccess);
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
        startedAt: typeof payload.startedAt === "string" ? payload.startedAt : now,
        floors: new Map(),
      });
    }

    const buffer = this.buffers.get(missionId)!;
    if (typeof payload.runId === "string") buffer.runId = payload.runId;

    if (event.topic === "TASK_COMPLETED") {
      const observation = loopObservationFromEvent(payload) || handoffObservationFromEvent(payload);
      if (observation) buffer.floors.set(observation.floorId, observation);
    }

    if (event.topic === "RUN_COMPLETED" || event.topic === "MISSION_COMPLETED") {
      buffer.completedAt = now;
    }
  }

  async finalize(missionId: string, completedAt?: string): Promise<ProductionTrajectory> {
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

    if (trajectory.trainingEligible && this.learningBridge) {
      const predictedSuccess = this.predictions.get(missionId);
      if (predictedSuccess !== undefined) {
        const learned = await this.learningBridge.recordVerifiedTrajectory(
          trajectory,
          predictedSuccess,
        );
        await this.eventBus.publish(
          "ASCALON_LEARNING_SIGNAL_RECORDED",
          {
            signalId: learned.signal.signalId,
            trajectoryId: learned.signal.trajectoryId,
            missionId: learned.signal.missionId,
            runId: learned.signal.runId,
            outcome: learned.signal.outcome,
            predictedSuccess: learned.signal.predictedSuccess,
            validatorPassed: learned.signal.validatorPassed,
            verificationStatus: learned.signal.verificationStatus,
            trainingEligible: learned.signal.trainingEligible,
            evidenceRefs: learned.signal.evidenceRefs,
          },
          {
            correlationId: trajectory.trajectoryId,
            idempotencyKey: "ascalon-learning:" + trajectory.trajectoryFingerprint,
            source: "production-trajectory-collector",
          },
        );
      }
    }

    this.buffers.delete(missionId);
    this.predictions.delete(missionId);
    return trajectory;
  }

  getPendingMissionIds(): readonly string[] {
    return Object.freeze([...this.buffers.keys()]);
  }

  dispose(): void {
    this.stop();
    this.buffers.clear();
    this.predictions.clear();
  }
}
