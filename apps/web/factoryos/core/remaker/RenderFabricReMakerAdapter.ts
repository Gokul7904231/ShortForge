import type { RenderIntent } from "../contracts/RenderIntentContracts";
import { RenderFabric } from "../fabric/RenderFabric";
import type {
  ReMakerExecutionOutput,
  ReMakerExecutionPort,
  ReMakerPlan,
} from "./ReMakerContracts";

/**
 * Bridges ReMaker to the canonical production render path.
 *
 * The adapter does not render itself. It:
 * 1. asks the caller to produce a patched RenderIntent,
 * 2. stamps the exact ReMaker surgical scope,
 * 3. delegates physical rendering to RenderFabric,
 * 4. returns the resulting artifact receipt.
 */
export class RenderFabricReMakerAdapter implements ReMakerExecutionPort {
  constructor(
    private readonly buildPatchedIntent: (
      plan: ReMakerPlan
    ) => Promise<RenderIntent> | RenderIntent,
    private readonly renderFabric: RenderFabric = new RenderFabric()
  ) {}

  public async execute(plan: ReMakerPlan): Promise<ReMakerExecutionOutput> {
    const intent = await this.buildPatchedIntent(plan);

    if (!intent.repairScope || intent.repairScope.repairId !== plan.repairId) {
      throw new Error(
        "[RenderFabricReMakerAdapter] Patched RenderIntent is missing the matching ReMaker repair scope."
      );
    }

    const plannedIds = [...plan.renderSceneIds].sort();
    const actualIds = [...intent.repairScope.forceSceneIds].sort();

    if (JSON.stringify(plannedIds) !== JSON.stringify(actualIds)) {
      throw new Error(
        "[RenderFabricReMakerAdapter] Render scope does not match the approved ReMaker plan."
      );
    }

    const result = await this.renderFabric.executeRender(intent);

    if (!result.artifact || !result.loopReceipt.verified) {
      throw new Error(
        "[RenderFabricReMakerAdapter] RenderFabric completed without a physical artifact."
      );
    }

    return {
      candidateArtifact: {
        artifactId: result.artifact.artifactId,
        sha256: result.artifact.sha256,
        byteLength: result.artifact.byteLength,
        uri:
          result.videoUrl ||
          (result.artifact.location.kind === "LOCAL"
            ? result.artifact.location.path
            : result.artifact.location.uri),
        mimeType: result.artifact.mimeType,
      },
      changedNodeIds: Object.freeze([...plan.changedNodeIds]),
      preservedNodeIds: Object.freeze([...plan.preservedNodeIds]),
      rendererReceiptId: result.receipt.receiptId,
      physicalValidation: {
        passed: result.loopReceipt.verified,
        decodeSmokePassed: result.receipt.artifactVerification?.decodeSmoke === "PASS",
        durationSeconds: result.artifact.duration,
      },
    };
  }
}
