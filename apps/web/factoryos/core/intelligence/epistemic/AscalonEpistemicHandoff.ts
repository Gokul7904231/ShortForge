import { createHash } from "node:crypto";
import type {
  AscalonEpistemicHandoff,
  EpistemicContext,
} from "./EpistemicContracts";

export class AscalonEpistemicHandoffBuilder {
  public build(context: EpistemicContext): AscalonEpistemicHandoff {
    const handoffId =
      "aer_handoff_" +
      createHash("sha256")
        .update(context.contextFingerprint + context.contextId)
        .digest("hex")
        .slice(0, 20);

    return {
      schemaVersion: "1.0",
      handoffId,
      contextFingerprint: context.contextFingerprint,
      mode: "SHADOW",
      modelAuthority: "ADVISORY_ONLY",
      epistemicContext: context,
      instructions: [
        "Treat observed/verified measurements as stronger than model inference.",
        "Do not convert UNKNOWN, UNCERTAIN, or UNRESOLVED state into confirmed fact without evidence.",
        "Return bounded reasoning, explicit assumptions, evidence needs, and unresolved items.",
        "Propose actions only; capability authorization and execution remain outside Ascalon.",
        "Do not declare F07/release truth or modify leases, fencing, capabilities, or production policy.",
      ],
    };
  }
}
