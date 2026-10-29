/**
 * JobStatusProjection — Creator-Safe Status Presentation
 *
 * Translates underlying execution states (F1-F7, DAG nodes, worker phases)
 * into human-friendly creator language without inventing synthetic progress
 * or modifying canonical FactoryOS state machines.
 */

export type CreatorStatus =
  | "Planning"
  | "Writing Script"
  | "Generating Visuals"
  | "Synthesizing Voice"
  | "Composing Timeline"
  | "Rendering Video"
  | "Verifying Final Video"
  | "Ready"
  | "Needs Attention"
  | "Queued";

export interface CreatorJobProjection {
  label: CreatorStatus;
  badgeClass: string;
  isTerminal: boolean;
  isInProgress: boolean;
  isError: boolean;
}

export type DeliveryState =
  | "DRIVE_DELIVERED"
  | "DRIVE_PENDING"
  | "OUTBOX_ONLY"
  | "DELIVERY_FAILED"
  | "NOT_RECORDED"
  | "NOT_READY";

export interface DeliveryProjection {
  state: DeliveryState;
  label: string;
  detail: string;
  linkUrl?: string;
}

export interface DeliveryFacts {
  status?: string;
  deliveryTarget?: string;
  deliveryMethod?: string;
  verified?: boolean;
  driveFileId?: string;
  driveUrl?: string;
}

/**
 * Turns recorded delivery facts into creator copy.
 * It never upgrades a local outbox copy or a missing receipt into a Drive delivery.
 */
export function describeDelivery(facts: DeliveryFacts): DeliveryProjection {
  const status = (facts.status || "").toLowerCase();
  const method = facts.deliveryMethod;
  const driveFileId = facts.driveFileId;
  const driveUrl = facts.driveUrl || (driveFileId ? `https://drive.google.com/file/d/${driveFileId}/view` : undefined);

  if (status && status !== "completed" && status !== "ready") {
    return {
      state: "NOT_READY",
      label: "Delivery not started",
      detail: "Delivery is attempted after the video is rendered and verified.",
    };
  }

  if (method === "GOOGLE_DRIVE") {
    if (driveFileId) {
      return {
        state: "DRIVE_DELIVERED",
        label: "Delivered to Google Drive",
        detail: "The worker recorded a verified upload to the connected Drive account.",
        linkUrl: driveUrl,
      };
    }
    return {
      state: "DRIVE_PENDING",
      label: "Google Drive upload not confirmed",
      detail: "A Drive delivery was attempted, but no file ID was recorded yet. This is not proof of delivery.",
    };
  }

  if (method === "LOCAL_OUTBOX") {
    if (facts.verified) {
      return {
        state: "OUTBOX_ONLY",
        label: "Saved to the local delivery outbox",
        detail: "The file is stored on the ShortForge server, not in Google Drive.",
      };
    }
    return {
      state: "DELIVERY_FAILED",
      label: "Delivery failed",
      detail: "The Drive upload failed and the file was not committed to the outbox.",
    };
  }

  return {
    state: "NOT_RECORDED",
    label: "Delivery not recorded",
    detail: "No delivery receipt exists for this job, so it is not evidence of a Drive upload.",
  };
}

export function projectCreatorJobStatus(rawStatus?: string, rawStep?: string): CreatorJobProjection {
  const status = (rawStatus || "").toLowerCase().trim();
  const step = (rawStep || "").toLowerCase().trim();

  // Failed state
  if (status === "failed" || status === "error" || step === "error") {
    return {
      label: "Needs Attention",
      badgeClass: "bg-rose-500/10 text-rose-500 border border-rose-500/20",
      isTerminal: true,
      isInProgress: false,
      isError: true,
    };
  }

  // Completed state
  if (status === "completed" || status === "ready" || status === "done" || step === "ready" || step === "f7_verified") {
    return {
      label: "Ready",
      badgeClass: "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20",
      isTerminal: true,
      isInProgress: false,
      isError: false,
    };
  }

  // Queued state
  if (status === "queued" || status === "pending" || step === "queued") {
    return {
      label: "Queued",
      badgeClass: "bg-zinc-500/10 text-zinc-400 border border-zinc-500/20",
      isTerminal: false,
      isInProgress: false,
      isError: false,
    };
  }

  // Active / Processing states mapped from underlying steps/floors
  if (step.includes("f7") || step.includes("verify") || step.includes("verification")) {
    return {
      label: "Verifying Final Video",
      badgeClass: "bg-purple-500/10 text-purple-400 border border-purple-500/20 animate-pulse",
      isTerminal: false,
      isInProgress: true,
      isError: false,
    };
  }

  if (step.includes("f6") || step.includes("render") || step.includes("encode") || step.includes("export")) {
    return {
      label: "Rendering Video",
      badgeClass: "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse",
      isTerminal: false,
      isInProgress: true,
      isError: false,
    };
  }

  if (step.includes("f5") || step.includes("timeline") || step.includes("compose") || step.includes("composition")) {
    return {
      label: "Composing Timeline",
      badgeClass: "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 animate-pulse",
      isTerminal: false,
      isInProgress: true,
      isError: false,
    };
  }

  if (step.includes("f4") || step.includes("voice") || step.includes("speech") || step.includes("audio") || step.includes("tts")) {
    return {
      label: "Synthesizing Voice",
      badgeClass: "bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse",
      isTerminal: false,
      isInProgress: true,
      isError: false,
    };
  }

  if (step.includes("f3") || step.includes("visual") || step.includes("scene") || step.includes("image")) {
    return {
      label: "Generating Visuals",
      badgeClass: "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 animate-pulse",
      isTerminal: false,
      isInProgress: true,
      isError: false,
    };
  }

  if (step.includes("f2") || step.includes("script") || step.includes("write") || step.includes("writing")) {
    return {
      label: "Writing Script",
      badgeClass: "bg-sky-500/10 text-sky-400 border border-sky-500/20 animate-pulse",
      isTerminal: false,
      isInProgress: true,
      isError: false,
    };
  }

  if (step.includes("f0") || step.includes("f1") || step.includes("plan") || step.includes("strategy") || step.includes("research")) {
    return {
      label: "Planning",
      badgeClass: "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse",
      isTerminal: false,
      isInProgress: true,
      isError: false,
    };
  }

  // Fallback for generic processing
  return {
    label: "Planning",
    badgeClass: "bg-blue-500/10 text-blue-400 border border-blue-500/20 animate-pulse",
    isInProgress: true,
    isTerminal: false,
    isError: false,
  };
}
