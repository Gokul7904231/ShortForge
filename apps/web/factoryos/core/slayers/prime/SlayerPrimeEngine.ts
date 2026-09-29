import { createHash, randomUUID } from "node:crypto";
import type { DurableEventBus } from "../../events/DurableEventBus";
import type { LeaseManager } from "../../leases/LeaseManager";
import type {
  SlayerActionIntent,
  SlayerAuthorizationGrant,
  SlayerEnforcementReceipt,
  SlayerPrimeEvidence,
  SlayerPrimeIncidentState,
  SlayerIncident,
  SlayerPrimeAction,
  SlayerPrimeObservationInput,
  SlayerPrimeOptions,
  SlayerPrimeScope,
} from "../../contracts/SlayerPrimeContracts";
import {
  SlayerEvidenceQuorum,
  type EvidenceQuorumResult,
} from "./SlayerEvidenceQuorum";
import {
  SlayerActionExecutor,
  LeaseRevokeEnforcementAdapter,
} from "./SlayerActionExecutor";

const STATE_TRANSITIONS: Record<
  SlayerPrimeIncidentState,
  SlayerPrimeIncidentState[]
> = {
  OBSERVED: ["ANOMALOUS", "INCIDENT_OPEN", "STALE", "UNKNOWN"],
  ANOMALOUS: ["CONFIRMING", "INCIDENT_OPEN", "INVESTIGATING", "UNKNOWN"],
  CONFIRMING: ["INCIDENT_OPEN", "UNKNOWN", "CONFLICTED"],
  INCIDENT_OPEN: [
    "INVESTIGATING",
    "CORRELATED",
    "ACTION_ELIGIBLE",
    "AUTHORIZATION_PENDING",
    "ESCALATED",
    "CONFLICTED",
  ],
  INVESTIGATING: [
    "CORRELATED",
    "ACTION_ELIGIBLE",
    "UNKNOWN",
    "CONFLICTED",
    "ESCALATED",
  ],
  CORRELATED: ["ACTION_ELIGIBLE", "INVESTIGATING", "ESCALATED"],
  ACTION_ELIGIBLE: [
    "AUTHORIZATION_PENDING",
    "AUTHORIZED",
    "DENIED",
    "STALE",
    "ESCALATED",
  ],
  AUTHORIZATION_PENDING: ["AUTHORIZED", "DENIED", "STALE", "ESCALATED"],
  AUTHORIZED: ["ACTION_RESERVED", "DENIED", "STALE"],
  ACTION_RESERVED: ["CONTAINING", "ACTION_FAILED", "STALE"],
  CONTAINING: [
    "CONTAINED",
    "ACTION_FAILED",
    "VERIFICATION_FAILED",
    "ESCALATED",
  ],
  CONTAINED: ["HANDOFF", "VERIFYING", "CLOSED"],
  HANDOFF: ["VERIFYING", "CLOSED", "ESCALATED"],
  VERIFYING: ["CLOSED", "VERIFICATION_FAILED", "ESCALATED"],
  CLOSED: [],
  UNKNOWN: ["CONFIRMING", "INVESTIGATING", "ESCALATED", "CLOSED"],
  CONFLICTED: ["CONFIRMING", "INVESTIGATING", "ESCALATED"],
  STALE: ["CONFIRMING", "INVESTIGATING", "CLOSED"],
  DENIED: ["AUTHORIZATION_PENDING", "ESCALATED"],
  QUARANTINED: ["INVESTIGATING", "ESCALATED", "CLOSED"],
  ACTION_FAILED: [
    "INVESTIGATING",
    "AUTHORIZATION_PENDING",
    "ESCALATED",
    "VERIFYING",
  ],
  VERIFICATION_FAILED: [
    "INVESTIGATING",
    "AUTHORIZATION_PENDING",
    "ESCALATED",
  ],
  ESCALATED: ["INVESTIGATING", "AUTHORIZATION_PENDING", "CLOSED"],
};

export class SlayerPrimeEngine {
  readonly evidenceQuorum = new SlayerEvidenceQuorum();
  readonly actionExecutor: SlayerActionExecutor;

  private readonly eventBus: DurableEventBus;
  private readonly instanceId: string;
  private readonly incidentTtlMs: number;
  private readonly maxIncidents: number;
  private readonly maxEvidencePerIncident: number;

  private readonly incidents = new Map<string, SlayerIncident>();
  private readonly fingerprintIndex = new Map<string, string>();
  private readonly actionIntents = new Map<string, SlayerActionIntent>();
  private readonly receipts = new Map<string, SlayerEnforcementReceipt>();
  private unsubscribe?: () => void;
  private started = false;

  constructor(
    eventBus: DurableEventBus,
    leaseManager?: LeaseManager,
    options: SlayerPrimeOptions = {}
  ) {
    this.eventBus = eventBus;
    this.instanceId =
      options.instanceId ||
      "slayer-prime-" +
        randomUUID().replace(/-/g, "").slice(0, 8);
    this.incidentTtlMs = options.incidentTtlMs ?? 10 * 60_000;
    this.maxIncidents = options.maxIncidents ?? 1000;
    this.maxEvidencePerIncident = options.maxEvidencePerIncident ?? 64;

    const adapters =
      options.adapters ||
      (leaseManager ? [new LeaseRevokeEnforcementAdapter(leaseManager)] : []);

    this.actionExecutor = new SlayerActionExecutor({
      adapters,
      actionLeaseTtlMs: options.actionLeaseTtlMs,
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribe = this.eventBus.subscribe(
      "SLAYER_PRIME_OBSERVATION",
      async (event: any) => {
        const payload = event?.payload || event;
        if (!payload?.observation) return;

        await this.ingest({
          observation: payload.observation,
          sourceId: payload.sourceId,
          evidence: payload.evidence,
          relatedCaseId: payload.relatedCaseId,
        });
      }
    );
  }

  stop(): void {
    this.started = false;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  async ingest(input: SlayerPrimeObservationInput): Promise<SlayerIncident> {
    const observation = input.observation;
    const observedAtMs = new Date(observation.observedAt).getTime();
    const safeObservedAt = Number.isFinite(observedAtMs)
      ? observation.observedAt
      : new Date().toISOString();

    const fingerprint = this.fingerprint(
      observation.floorId,
      observation.target,
      observation.category
    );

    const existingId = this.fingerprintIndex.get(fingerprint);
    const existing = existingId ? this.incidents.get(existingId) : undefined;

    if (
      existing &&
      observedAtMs - new Date(existing.lastObservedAt).getTime() <=
        this.incidentTtlMs
    ) {
      const evidence = this.normalizeEvidence(input.evidence || []);
      const next: SlayerIncident = {
        ...existing,
        state: existing.state === "CLOSED" ? "INCIDENT_OPEN" : existing.state,
        lastObservedAt: safeObservedAt,
        observationIds: existing.observationIds.includes(
          observation.observationId
        )
          ? existing.observationIds
          : [...existing.observationIds, observation.observationId],
        evidence: this.mergeEvidence(existing.evidence, evidence),
        relatedCaseIds:
          input.relatedCaseId &&
          !existing.relatedCaseIds.includes(input.relatedCaseId)
            ? [...existing.relatedCaseIds, input.relatedCaseId]
            : existing.relatedCaseIds,
        severity: this.maxSeverity(existing.severity, observation.severity),
        notes: [
          ...existing.notes,
          "Observation " + observation.observationId + " merged into incident.",
        ].slice(-20),
      };

      this.incidents.set(existing.incidentId, next);
      await this.emit("SLAYER_INCIDENT_UPDATED", {
        incidentId: next.incidentId,
        state: next.state,
        fingerprint,
        observationId: observation.observationId,
      });
      return structuredClone(next);
    }

    const incidentId =
      "inc_" + randomUUID().replace(/-/g, "").slice(0, 12);

    const incident: SlayerIncident = {
      incidentId,
      fingerprint,
      state:
        observation.severity === "CRITICAL" || observation.severity === "HIGH"
          ? "INCIDENT_OPEN"
          : "CONFIRMING",
      severity: observation.severity,
      floorId: observation.floorId,
      targetId: observation.target,
      category: observation.category,
      firstObservedAt: safeObservedAt,
      lastObservedAt: safeObservedAt,
      observationIds: [observation.observationId],
      evidence: this.mergeEvidence([], input.evidence || []),
      relatedCaseIds: input.relatedCaseId ? [input.relatedCaseId] : [],
      actionIntentIds: [],
      notes: ["Incident created by Slayer Prime."],
    };

    this.incidents.set(incidentId, incident);
    this.fingerprintIndex.set(fingerprint, incidentId);
    this.trimIncidents();

    await this.emit("SLAYER_INCIDENT_OPENED", {
      incidentId,
      fingerprint,
      severity: incident.severity,
      floorId: incident.floorId,
      targetId: incident.targetId,
      category: incident.category,
    });

    return structuredClone(incident);
  }

  getIncident(incidentId: string): SlayerIncident | undefined {
    const incident = this.incidents.get(incidentId);
    return incident ? structuredClone(incident) : undefined;
  }

  getActiveIncidents(): SlayerIncident[] {
    return Array.from(this.incidents.values())
      .filter((incident) => incident.state !== "CLOSED")
      .map((incident) => structuredClone(incident));
  }

  async addEvidence(
    incidentId: string,
    evidence: SlayerPrimeEvidence
  ): Promise<SlayerIncident> {
    const incident = this.requireIncident(incidentId);
    const mergedEvidence = this.mergeEvidence(incident.evidence, [evidence]);

    const next: SlayerIncident = {
      ...incident,
      evidence: mergedEvidence,
      state:
        incident.state === "UNKNOWN" || incident.state === "CONFIRMING"
          ? "INVESTIGATING"
          : incident.state,
      notes: [
        ...incident.notes,
        "Evidence " + evidence.evidenceId + " added.",
      ].slice(-20),
    };

    this.incidents.set(incidentId, next);
    await this.emit("SLAYER_INCIDENT_UPDATED", {
      incidentId,
      state: next.state,
      evidenceId: evidence.evidenceId,
    });

    return structuredClone(next);
  }

  async planAction(
    incidentId: string,
    action: SlayerPrimeAction,
    scope: SlayerPrimeScope,
    targetId: string,
    proposedBy: string,
    parameters: Record<string, unknown> = {},
    ttlMs = 30_000
  ): Promise<{
    intent: SlayerActionIntent;
    quorum: EvidenceQuorumResult;
    incident: SlayerIncident;
  }> {
    const incident = this.requireIncident(incidentId);

    if (
      scope !== "FACTORY" &&
      targetId !== incident.targetId &&
      action !== "FLOOR_HALT" &&
      action !== "FACTORY_HALT"
    ) {
      throw new Error(
        "Action target must match the active incident target for scoped enforcement."
      );
    }

    const now = Date.now();
    const intent: SlayerActionIntent = {
      intentId: "intent_" + randomUUID().replace(/-/g, "").slice(0, 14),
      incidentId,
      action,
      scope,
      targetId,
      proposedBy,
      reason:
        "Slayer Prime response to " +
        incident.category +
        " on " +
        incident.targetId +
        ".",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      parameters,
    };

    const quorum = this.evidenceQuorum.evaluate(intent, incident.evidence);
    this.actionIntents.set(intent.intentId, intent);

    const nextState: SlayerPrimeIncidentState = quorum.eligible
      ? "ACTION_ELIGIBLE"
      : "INVESTIGATING";

    const nextIncident: SlayerIncident = {
      ...incident,
      state: nextState,
      suggestedAction: action,
      suggestedScope: scope,
      actionIntentIds: [...incident.actionIntentIds, intent.intentId],
      notes: [...incident.notes, quorum.rationale].slice(-20),
    };

    this.incidents.set(incidentId, nextIncident);

    await this.emit("SLAYER_ACTION_PLANNED", {
      intentId: intent.intentId,
      incidentId,
      action,
      scope,
      targetId,
      evidenceEligible: quorum.eligible,
      quorum: {
        presentClasses: quorum.presentClasses,
        missingClasses: quorum.missingClasses,
        independentClasses: quorum.independentClasses,
        effectiveTrustScore: quorum.effectiveTrustScore,
      },
    });

    return {
      intent: structuredClone(intent),
      quorum,
      incident: structuredClone(nextIncident),
    };
  }

  async executeAuthorizedAction(
    intentId: string,
    grant: SlayerAuthorizationGrant,
    holderId: string = this.instanceId
  ): Promise<SlayerEnforcementReceipt> {
    const intent = this.actionIntents.get(intentId);
    if (!intent) {
      throw new Error("Unknown Slayer action intent " + intentId);
    }

    const incident = this.requireIncident(intent.incidentId);
    const latestQuorum = this.evidenceQuorum.evaluate(intent, incident.evidence);

    if (!latestQuorum.eligible) {
      const now = new Date().toISOString();
      const receipt: SlayerEnforcementReceipt = {
        receiptId:
          "slayreceipt_" + randomUUID().replace(/-/g, "").slice(0, 16),
        intentId,
        incidentId: intent.incidentId,
        action: intent.action,
        scope: intent.scope,
        targetId: intent.targetId,
        status: "REJECTED",
        reason:
          "Evidence quorum lost before execution: " +
          latestQuorum.rationale,
        executionStartedAt: now,
        executionFinishedAt: now,
        details: {
          missingEvidenceClasses: latestQuorum.missingClasses,
          staleEvidenceIds: latestQuorum.staleEvidenceIds,
        },
      };

      this.receipts.set(receipt.receiptId, receipt);
      await this.emit("SLAYER_ACTION_REJECTED", receipt);
      return structuredClone(receipt);
    }

    const actionReceipt = await this.actionExecutor.execute(
      intent,
      grant,
      holderId
    );

    this.receipts.set(actionReceipt.receiptId, actionReceipt);

    let nextState: SlayerPrimeIncidentState = "ACTION_FAILED";
    if (actionReceipt.status === "VERIFIED") nextState = "CONTAINED";
    else if (actionReceipt.status === "STALE_ACTION") nextState = "STALE";
    else if (actionReceipt.status === "REJECTED") nextState = "DENIED";
    else if (actionReceipt.status === "VERIFICATION_FAILED") {
      nextState = "VERIFICATION_FAILED";
    }

    const updatedIncident = this.requireIncident(intent.incidentId);
    const finalIncident: SlayerIncident = {
      ...updatedIncident,
      state: nextState,
      notes: [
        ...updatedIncident.notes,
        actionReceipt.reason,
      ].slice(-20),
    };

    this.incidents.set(intent.incidentId, finalIncident);

    await this.emit(
      actionReceipt.status === "VERIFIED"
        ? "SLAYER_ENFORCEMENT_VERIFIED"
        : actionReceipt.status === "REJECTED"
        ? "SLAYER_ACTION_REJECTED"
        : "SLAYER_ACTION_EXECUTED",
      actionReceipt
    );

    return structuredClone(actionReceipt);
  }

  getReceipt(receiptId: string): SlayerEnforcementReceipt | undefined {
    const receipt = this.receipts.get(receiptId);
    return receipt ? structuredClone(receipt) : undefined;
  }

  getAllReceipts(): SlayerEnforcementReceipt[] {
    return Array.from(this.receipts.values()).map((receipt) =>
      structuredClone(receipt)
    );
  }

  canTransition(
    from: SlayerPrimeIncidentState,
    to: SlayerPrimeIncidentState
  ): boolean {
    return STATE_TRANSITIONS[from]?.includes(to) ?? false;
  }

  transitionIncident(
    incidentId: string,
    to: SlayerPrimeIncidentState,
    note?: string
  ): SlayerIncident {
    const incident = this.requireIncident(incidentId);
    if (!this.canTransition(incident.state, to)) {
      throw new Error(
        "Invalid Slayer Prime incident transition from " +
          incident.state +
          " to " +
          to
      );
    }

    const next: SlayerIncident = {
      ...incident,
      state: to,
      notes: note
        ? [...incident.notes, note].slice(-20)
        : incident.notes,
    };

    this.incidents.set(incidentId, next);
    return structuredClone(next);
  }

  private fingerprint(
    floorId: string,
    targetId: string,
    category: string
  ): string {
    const canonical = [
      floorId,
      targetId,
      category,
    ]
      .map((value) => value.trim().toLowerCase())
      .join("|");

    return createHash("sha256")
      .update(canonical)
      .digest("hex")
      .slice(0, 24);
  }

  private normalizeEvidence(
    evidence: SlayerPrimeEvidence[]
  ): SlayerPrimeEvidence[] {
    return evidence.map((item) => ({
      ...item,
      trustScore: Math.max(0, Math.min(1, item.trustScore)),
    }));
  }

  private mergeEvidence(
    existing: SlayerPrimeEvidence[],
    additions: SlayerPrimeEvidence[]
  ): SlayerPrimeEvidence[] {
    const byId = new Map(
      existing.map((item) => [item.evidenceId, item])
    );
    for (const item of this.normalizeEvidence(additions)) {
      byId.set(item.evidenceId, item);
    }
    return Array.from(byId.values()).slice(
      -this.maxEvidencePerIncident
    );
  }

  private trimIncidents(): void {
    if (this.incidents.size <= this.maxIncidents) return;

    const sorted = Array.from(this.incidents.values()).sort(
      (a, b) =>
        new Date(a.lastObservedAt).getTime() -
        new Date(b.lastObservedAt).getTime()
    );

    const removeCount = this.incidents.size - this.maxIncidents;
    for (const incident of sorted.slice(0, removeCount)) {
      this.incidents.delete(incident.incidentId);
      if (
        this.fingerprintIndex.get(incident.fingerprint) ===
        incident.incidentId
      ) {
        this.fingerprintIndex.delete(incident.fingerprint);
      }
    }
  }

  private maxSeverity(
    left: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    right: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  ): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
    const rank = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
    return rank[right] > rank[left] ? right : left;
  }

  private requireIncident(incidentId: string): SlayerIncident {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error("Slayer Prime incident " + incidentId + " not found");
    }
    return incident;
  }

  private async emit(
    topic:
      | "SLAYER_INCIDENT_OPENED"
      | "SLAYER_INCIDENT_UPDATED"
      | "SLAYER_ACTION_PLANNED"
      | "SLAYER_ACTION_REJECTED"
      | "SLAYER_ACTION_EXECUTED"
      | "SLAYER_ENFORCEMENT_VERIFIED",
    payload: Record<string, unknown>
  ): Promise<void> {
    const stableKey = String(
      payload.incidentId ||
        payload.intentId ||
        payload.receiptId ||
        randomUUID()
    );

    await this.eventBus.publish(topic, payload, {
      source: this.instanceId,
      idempotencyKey:
        "slayer-prime:" + topic + ":" + stableKey,
    });
  }
}
