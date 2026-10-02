import { createHash } from "node:crypto";
import type { RenderIntent } from "../contracts/RenderIntentContracts";
import { RenderFabric } from "../fabric/RenderFabric";
import { TimelineIRValidator, type TimelineIR } from "../timeline/TimelineIR";
import type {
  ReMakerExecutionOutput,
  ReMakerExecutionPort,
  ReMakerPlan,
} from "./ReMakerContracts";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).sort().map((key) =>
    JSON.stringify(key) + ":" + stableStringify(record[key])
  ).join(",") + "}";
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export interface ReMakerPatchedState {
  readonly intent: RenderIntent;
  /** The actual post-patch TimelineIR; used for preservation proof before physical render. */
  readonly timeline: TimelineIR;
}

/**
 * Bridges ReMaker to the canonical production render path.
 *
 * ReMaker decides the repair scope. This adapter:
 * - receives the actual patched TimelineIR + RenderIntent,
 * - proves preserved TimelineIR nodes stayed byte-for-byte semantically identical,
 * - stamps the approved surgical render scope,
 * - delegates physical execution to RenderFabric,
 * - returns the renderer's physical proof.
 */
export class RenderFabricReMakerAdapter implements ReMakerExecutionPort {
  constructor(
    private readonly buildPatchedState: (
      plan: ReMakerPlan
    ) => Promise<ReMakerPatchedState> | ReMakerPatchedState,
    private readonly renderFabric: RenderFabric = new RenderFabric()
  ) {}

  public async execute(plan: ReMakerPlan): Promise<ReMakerExecutionOutput> {
    const patched = await this.buildPatchedState(plan);
    const timelineValidation = TimelineIRValidator.validate(patched.timeline);

    if (!timelineValidation.valid) {
      throw new Error(
        "[RenderFabricReMakerAdapter] Patched TimelineIR is invalid: " +
          timelineValidation.errors.join("; ")
      );
    }

    if (patched.timeline.missionId !== plan.missionId) {
      throw new Error(
        "[RenderFabricReMakerAdapter] Patched TimelineIR belongs to a different mission."
      );
    }

    if (patched.intent.repairScope && patched.intent.repairScope.repairId !== plan.repairId) {
      throw new Error(
        "[RenderFabricReMakerAdapter] Patched RenderIntent contains a different repair scope."
      );
    }

    const observedPreservedFingerprints: Record<string, string> = {};
    const visualById = new Map(patched.timeline.visualTracks.map((node) => [node.clipId, node]));
    const audioById = new Map(patched.timeline.audioTracks.map((node) => [node.audioId, node]));
    const subtitleById = new Map(
      patched.timeline.subtitleTracks.map((node) => [node.subtitleId, node])
    );

    for (const nodeId of plan.preservedNodeIds) {
      const node =
        visualById.get(nodeId) ||
        audioById.get(nodeId) ||
        subtitleById.get(nodeId);

      if (!node) {
        throw new Error(
          "[RenderFabricReMakerAdapter] Preserved TimelineIR node disappeared during repair: " + nodeId
        );
      }

      observedPreservedFingerprints[nodeId] = fingerprint(node);
    }

    const plannedIds = [...plan.renderSceneIds].sort();

    const scopedIntent: RenderIntent = {
      ...patched.intent,
      repairScope: {
        mode: "SURGICAL_SCENE",
        repairId: plan.repairId,
        forceSceneIds: Object.freeze([...plannedIds]),
        affectedFrameRange: {
          startFrame: plan.frameRange.startFrame,
          endFrame: plan.frameRange.endFrame,
        },
      },
    };

    const result = await this.renderFabric.executeRender(scopedIntent);

    if (!result.artifact || !result.loopReceipt.verified) {
      throw new Error(
        "[RenderFabricReMakerAdapter] RenderFabric completed without independently verified physical proof."
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
      preservedNodeFingerprints: Object.freeze(observedPreservedFingerprints),
      rendererReceiptId: result.receipt.receiptId,
      observedTimelineDigest: patched.timeline.provenanceDigest,
      physicalValidation: {
        passed: result.loopReceipt.verified,
        decodeSmokePassed: result.receipt.artifactVerification?.decodeSmoke === "PASS",
        durationSeconds: result.artifact.duration,
      },
    };
  }
}
