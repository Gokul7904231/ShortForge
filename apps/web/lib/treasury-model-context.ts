import crypto from "node:crypto";
import type { TreasuryModelExecutionContext, LLMProvider } from "../ai/provider";
import type { AutonomousFactoryController } from "../factoryos/core/controller/AutonomousFactoryController";

export interface PrepareTreasuryModelContextInput {
  readonly command: string;
  readonly missionId: string;
  readonly taskId: string;
  readonly floorId: string;
  readonly preferredProviderId?: LLMProvider | string;
  readonly subtask: string;
  readonly priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL";
  readonly maxRetries?: number;
  readonly maxCostUsd?: number;
}

export interface PreparedTreasuryModelContext {
  readonly controller: AutonomousFactoryController;
  readonly context?: TreasuryModelExecutionContext;
  readonly runId?: string;
  readonly overseerCommandId?: string;
}

export async function prepareTreasuryModelContext(
  input: PrepareTreasuryModelContextInput,
): Promise<PreparedTreasuryModelContext> {
  const production = process.env.NODE_ENV === "production";
  let controller =
    (globalThis as any).__factoryOSController as
      | AutonomousFactoryController
      | undefined;

  if (!controller) {
    const { AutonomousFactoryController } = await import(
      "../factoryos/core/controller/AutonomousFactoryController"
    );
    controller = new AutonomousFactoryController({
      storageType: production ? "mongo" : "memory",
      mongoUri:
        process.env.FACTORYOS_MONGO_URI ||
        process.env.MONGODB_URI ||
        "mongodb://localhost:27017",
      strictPersistence: production,
      autoStartSwarm: false,
    });
    await controller.boot();
    (globalThis as any).__factoryOSController = controller;
  }

  if (!controller.overseer) {
    throw new Error(
      "[TreasuryModelContext] Overseer control plane is unavailable",
    );
  }

  if (!controller.treasuryService) {
    if (production) {
      throw new Error(
        "[TreasuryModelContext] Production model work requires Treasury",
      );
    }
    return { controller };
  }

  const prepared = controller.overseer.prepareEconomicCommand({
    command: input.command,
    missionId: input.missionId,
    mode: "autonomous",
  });

  const scopeFingerprint = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        command: input.command,
        missionId: input.missionId,
        taskId: input.taskId,
        floorId: input.floorId,
      }),
    )
    .digest("hex");

  const context: TreasuryModelExecutionContext = {
    treasuryService: controller.treasuryService,
    accountId:
      process.env.FACTORYOS_TREASURY_ACCOUNT_ID || "factoryos",
    overseerCommandId: prepared.overseerCommandId,
    missionId: input.missionId,
    runId: prepared.runId,
    floorId: input.floorId,
    taskId: input.taskId,
    scopeFingerprint,
    priority: input.priority || "NORMAL",
    maxRetries: input.maxRetries ?? 0,
    maxCostUsd:
      input.maxCostUsd ??
      Number(
        process.env.FACTORYOS_MAX_INFERENCE_RESERVATION_USD || "0.10",
      ),
    preferredProviderId: input.preferredProviderId,
    subtask: input.subtask,
  };

  return {
    controller,
    context,
    runId: prepared.runId,
    overseerCommandId: prepared.overseerCommandId,
  };
}
