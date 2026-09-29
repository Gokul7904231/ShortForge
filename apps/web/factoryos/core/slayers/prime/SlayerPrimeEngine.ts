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
  InMemorySlayerPrimeStateStore,
  type SlayerPrimeLeadershipLease,
  type SlayerPrimeStateStore,
} from "./SlayerPrimeStateStore";
import {
  SlayerEvidenceQuorum,
  type EvidenceQuorumResult,
} from "./SlayerEvidenceQuorum";
import {
  SlayerActionExecutor,
  LeaseRevokeEnforcementAdapter,
} from "./SlayerActionExecutor";

const STATE_TRANSITIONS: Record<SlayerPrimeIncidentState, SlayerPrimeIncidentState[]> = {
  OBSERVED: ["ANOMALOUS", "INCIDENT_OPEN", "STALE", "UNKNOWN"],
  ANOMALOUS: ["CONFIRMING", "INCIDENT_OPEN", "INVESTIGATING", "UNKNOWN"],
  CONFIRMING: ["INCIDENT_OPEN", "UNKNOWN", "CONFLICTED"],
  INCIDENT_OPEN: ["INVESTIGATING", "CORRELATED", "ACTION_ELIGIBLE", "AUTHORIZATION_PENDING", "ESCALATED", "CONFLICTED"],
  INVESTIGATING: ["CORRELATED", "ACTION_ELIGIBLE", "UNKNOWN", "CONFLICTED", "ESCALATED"],
  CORRELATED: ["ACTION_ELIGIBLE", "INVESTIGATING", "ESCALATED"],
  ACTION_ELIGIBLE: ["AUTHORIZATION_PENDING", "AUTHORIZED", "DENIED", "STALE", "ESCALATED"],
  AUTHORIZATION_PENDING: ["AUTHORIZED", "DENIED", "STALE", "ESCALATED"],
  AUTHORIZED: ["ACTION_RESERVED", "DENIED", "STALE"],
  ACTION_RESERVED: ["CONTAINING", "ACTION_FAILED", "STALE"],
  CONTAINING: ["CONTAINED", "ACTION_FAILED", "VERIFICATION_FAILED", "ESCALATED"],
  CONTAINED: ["HANDOFF", "VERIFYING", "CLOSED"],
  HANDOFF: ["VERIFYING", "CLOSED", "ESCALATED"],
  VERIFYING: ["CLOSED", "VERIFICATION_FAILED", "ESCALATED"],
  CLOSED: [],
  UNKNOWN: ["CONFIRMING", "INVESTIGATING", "ESCALATED", "CLOSED"],
  CONFLICTED: ["CONFIRMING", "INVESTIGATING", "ESCALATED"],
  STALE: ["CONFIRMING", "INVESTIGATING", "CLOSED"],
  DENIED: ["AUTHORIZATION_PENDING", "ESCALATED"],
  QUARANTINED: ["INVESTIGATING", "ESCALATED", "CLOSED"],
  ACTION_FAILED: ["INVESTIGATING", "AUTHORIZATION_PENDING", "ESCALATED", "VERIFYING"],
  VERIFICATION_FAILED: ["INVESTIGATING", "AUTHORIZATION_PENDING", "ESCALATED"],
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
  private readonly stateStore: SlayerPrimeStateStore;
  private readonly leadershipLeaseTtlMs: number;
  private readonly leadershipRenewIntervalMs: number;

  private readonly incidents = new Map<string, SlayerIncident>();
  private readonly fingerprintIndex = new Map<string, string>();
  private readonly actionIntents = new Map<string, SlayerActionIntent>();
  private readonly receipts = new Map<string, SlayerEnforcementReceipt>();
  private leadership: SlayerPrimeLeadershipLease | null = null;
  private unsubscribe?: () => void;
  private leadershipTimer: NodeJS.Timeout | null = null;
  private started = false;
  private readyPromise: Promise<void> = Promise.resolve();

  constructor(eventBus: DurableEventBus, leaseManager?: LeaseManager, options: SlayerPrimeOptions = {}) {
    this.eventBus = eventBus;
    this.instanceId = options.instanceId || "slayer-prime-" + randomUUID().replace(/-/g, "").slice(0, 8);
    this.incidentTtlMs = options.incidentTtlMs ?? 10 * 60_000;
    this.maxIncidents = options.maxIncidents ?? 1000;
    this.maxEvidencePerIncident = options.maxEvidencePerIncident ?? 64;
    this.stateStore = options.stateStore || new InMemorySlayerPrimeStateStore();
    this.leadershipLeaseTtlMs = options.leadershipLeaseTtlMs ?? 15_000;
    this.leadershipRenewIntervalMs = options.leadershipRenewIntervalMs ?? 5_000;

    const adapters = options.adapters || (leaseManager ? [new LeaseRevokeEnforcementAdapter(leaseManager)] : []);
    this.actionExecutor = new SlayerActionExecutor({
      adapters,
      actionLeaseTtlMs: options.actionLeaseTtlMs,
      leadershipGuard: this.stateStore,
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribe = this.eventBus.subscribe("SLAYER_PRIME_OBSERVATION", async (event: any) => {
      await this.readyPromise;
      const payload = event?.payload || event;
      if (!payload?.observation || !(await this.isCurrentLeader())) return;
      await this.ingest({
        observation: payload.observation,
        sourceId: payload.sourceId,
        evidence: payload.evidence,
        relatedCaseId: payload.relatedCaseId,
      });
    });

    this.readyPromise = this.recoverAndAcquireLeadership();
    this.leadershipTimer = setInterval(() => {
      this.maintainLeadership().catch(() => {
        this.leadership = null;
      });
    }, this.leadershipRenewIntervalMs);
  }

  stop(): void {
    this.started = false;
    if (this.leadershipTimer) {
      clearInterval(this.leadershipTimer);
      this.leadershipTimer = null;
    }
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    const lease = this.leadership;
    this.leadership = null;
    if (lease) void this.stateStore.releaseLeadership(lease);
  }

  isLeader(): boolean {
    return this.leadership !== null;
  }

  getInstanceId(): string {
    return this.instanceId;
  }

  getLeadership(): SlayerPrimeLeadershipLease | null {
    return this.leadership ? structuredClone(this.leadership) : null;
  }

  async ingest(input: SlayerPrimeObservationInput): Promise<SlayerIncident> {
    await this.readyPromise;
    await this.requireLeader();

    const observation = input.observation;
    const parsedObservedAt = new Date(observation.observedAt).getTime();
    const safeObservedAt = Number.isFinite(parsedObservedAt)
      ? observation.observedAt
      : new Date().toISOString();

    const fingerprint = this.fingerprint(observation.floorId, observation.target, observation.category);
    const existingId = this.fingerprintIndex.get(fingerprint);
    const existing = existingId ? this.incidents.get(existingId) : undefined;

    if (
      existing &&
      parsedObservedAt >= new Date(existing.lastObservedAt).getTime() - 1_000 &&
      parsedObservedAt - new Date(existing.lastObservedAt).getTime() <= this.incidentTtlMs
    ) {
      const next: SlayerIncident = {
        ...existing,
        state: existing.state === "CLOSED" ? "INCIDENT_OPEN" : existing.state,
        lastObservedAt: safeObservedAt,
        observationIds: existing.observationIds.includes(observation.observationId)
          ? existing.observationIds
          : [...existing.observationIds, observation.observationId],
        evidence: this.mergeEvidence(existing.evidence, input.evidence || []),
        relatedCaseIds:
          input.relatedCaseId && !existing.relatedCaseIds.includes(input.relatedCaseId)
            ? [...existing.relatedCaseIds, input.relatedCaseId]
            : existing.relatedCaseIds,
        severity: this.maxSeverity(existing.severity, observation.severity),
        notes: [...existing.notes, "Observation " + observation.observationId + " merged into incident."].slice(-20),
      };
      this.incidents.set(existing.incidentId, next);
      await this.persistIncident(next);
      await this.emit("SLAYER_INCIDENT_UPDATED", {
        incidentId: next.incidentId,
        state: next.state,
        fingerprint,
        observationId: observation.observationId,
      });
      return structuredClone(next);
    }

    const incident: SlayerIncident = {
      incidentId: "inc_" + randomUUID().replace(/-/g, "").slice(0, 12),
      fingerprint,
      state: observation.severity === "CRITICAL" || observation.severity === "HIGH" ? "INCIDENT_OPEN" : "CONFIRMING",
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
      notes: ["Incident created by Slayer Prime leader " + this.instanceId + "."],
    };

    this.incidents.set(incident.incidentId, incident);
    this.fingerprintIndex.set(fingerprint, incident.incidentId);
    await this.persistIncident(incident);
    this.trimIncidents();

    await this.emit("SLAYER_INCIDENT_OPENED", {
      incidentId: incident.incidentId,
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

  async addEvidence(incidentId: string, evidence: SlayerPrimeEvidence): Promise<SlayerIncident> {
    await this.readyPromise;
    await this.requireLeader();
    const incident = this.requireIncident(incidentId);
    const next: SlayerIncident = {
      ...incident,
      evidence: this.mergeEvidence(incident.evidence, [evidence]),
      state: incident.state === "UNKNOWN" || incident.state === "CONFIRMING" ? "INVESTIGATING" : incident.state,
      notes: [...incident.notes, "Evidence " + evidence.evidenceId + " added."].slice(-20),
    };
    this.incidents.set(incidentId, next);
    await this.persistIncident(next);
    await this.emit("SLAYER_INCIDENT_UPDATED", { incidentId, state: next.state, evidenceId: evidence.evidenceId });
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
  ): Promise<{ intent: SlayerActionIntent; quorum: EvidenceQuorumResult; incident: SlayerIncident }> {
    await this.readyPromise;
    await this.requireLeader();
    const incident = this.requireIncident(incidentId);

    if (
      scope !== "FACTORY" &&
      targetId !== incident.targetId &&
      action !== "FLOOR_HALT" &&
      action !== "FACTORY_HALT"
    ) {
      throw new Error("Action target must match the active incident target for scoped enforcement.");
    }

    let normalizedParameters = { ...parameters };
    if (action === "REVOKE_LEASE" && this.leaseTaskId(normalizedParameters)) {
      const taskId = String(normalizedParameters.taskId);
      const leaseManager = this.extractLeaseManager();
      const current = leaseManager ? await leaseManager.getLease(taskId) : null;
      if (current) {
        normalizedParameters = {
          ...normalizedParameters,
          ownerAgentId: normalizedParameters.ownerAgentId || current.ownerAgentId,
          ...(current.fencingToken !== undefined
            ? { expectedLeaseFencingToken: current.fencingToken }
            : {}),
        };
      }
    }

    const now = Date.now();
    const dedupeKey = this.actionDedupeKey(
      incident,
      action,
      scope,
      targetId,
      normalizedParameters,
      Math.floor(now / Math.max(1_000, ttlMs))
    );

    const candidate: SlayerActionIntent = {
      intentId: "intent_" + randomUUID().replace(/-/g, "").slice(0, 14),
      dedupeKey,
      incidentId,
      action,
      scope,
      targetId,
      proposedBy,
      reason: "Slayer Prime response to " + incident.category + " on " + incident.targetId + ".",
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ttlMs).toISOString(),
      parameters: normalizedParameters,
    };

    const persisted = await this.stateStore.createIntentIfAbsent(candidate);
    const intent = persisted.intent;
    this.actionIntents.set(intent.intentId, intent);

    const quorum = this.evidenceQuorum.evaluate(intent, incident.evidence);
    const actionIntentIds = incident.actionIntentIds.includes(intent.intentId)
      ? incident.actionIntentIds
      : [...incident.actionIntentIds, intent.intentId];

    const nextIncident: SlayerIncident = {
      ...incident,
      state: quorum.eligible ? "ACTION_ELIGIBLE" : "INVESTIGATING",
      suggestedAction: action,
      suggestedScope: scope,
      actionIntentIds,
      notes: [
        ...incident.notes,
        persisted.created
          ? quorum.rationale
          : "Existing deduplicated intent reused: " + intent.intentId,
      ].slice(-20),
    };

    this.incidents.set(incidentId, nextIncident);
    await this.persistIncident(nextIncident);
    await this.emit("SLAYER_ACTION_PLANNED", {
      intentId: intent.intentId,
      incidentId,
      action,
      scope,
      targetId,
      evidenceEligible: quorum.eligible,
      deduplicated: !persisted.created,
      quorum: {
        presentClasses: quorum.presentClasses,
        missingClasses: quorum.missingClasses,
        independentClasses: quorum.independentClasses,
        effectiveTrustScore: quorum.effectiveTrustScore,
      },
    });

    return { intent: structuredClone(intent), quorum, incident: structuredClone(nextIncident) };
  }

  async executeAuthorizedAction(
    intentId: string,
    grant: SlayerAuthorizationGrant,
    holderId = this.instanceId
  ): Promise<SlayerEnforcementReceipt> {
    await this.readyPromise;
    const leadership = await this.requireLeader();
    const intent = this.actionIntents.get(intentId);
    if (!intent) throw new Error("Unknown Slayer action intent " + intentId);

    const incident = this.requireIncident(intent.incidentId);
    const evidenceIds = new Set(incident.evidence.map((item) => item.evidenceId));
    const missingGrantEvidence = grant.evidenceRefs.filter((id) => !evidenceIds.has(id));

    if (missingGrantEvidence.length > 0) {
      return this.writeRejectedReceipt(intent, "Authorization references evidence not present in the active incident.", {
        missingGrantEvidence,
      });
    }

    const latestQuorum = this.evidenceQuorum.evaluate(intent, incident.evidence);
    if (!latestQuorum.eligible) {
      return this.writeRejectedReceipt(
        intent,
        "Evidence quorum lost before execution: " + latestQuorum.rationale,
        { missingEvidenceClasses: latestQuorum.missingClasses, staleEvidenceIds: latestQuorum.staleEvidenceIds }
      );
    }

    const actionReceipt = await this.actionExecutor.execute(intent, grant, holderId, leadership.epoch);
    await this.stateStore.upsertReceipt(actionReceipt);
    this.receipts.set(actionReceipt.receiptId, actionReceipt);

    let nextState: SlayerPrimeIncidentState = "ACTION_FAILED";
    if (actionReceipt.status === "VERIFIED") nextState = "CONTAINED";
    else if (actionReceipt.status === "STALE_ACTION") nextState = "STALE";
    else if (actionReceipt.status === "REJECTED") nextState = "DENIED";
    else if (actionReceipt.status === "VERIFICATION_FAILED") nextState = "VERIFICATION_FAILED";

    const updated = this.requireIncident(intent.incidentId);
    const finalIncident: SlayerIncident = {
      ...updated,
      state: nextState,
      notes: [...updated.notes, actionReceipt.reason].slice(-20),
    };
    this.incidents.set(intent.incidentId, finalIncident);
    await this.persistIncident(finalIncident);

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
    return Array.from(this.receipts.values()).map((receipt) => structuredClone(receipt));
  }

  canTransition(from: SlayerPrimeIncidentState, to: SlayerPrimeIncidentState): boolean {
    return STATE_TRANSITIONS[from]?.includes(to) ?? false;
  }

  transitionIncident(incidentId: string, to: SlayerPrimeIncidentState, note?: string): SlayerIncident {
    const incident = this.requireIncident(incidentId);
    if (!this.canTransition(incident.state, to)) {
      throw new Error("Invalid Slayer Prime incident transition from " + incident.state + " to " + to);
    }
    const next = {
      ...incident,
      state: to,
      notes: note ? [...incident.notes, note].slice(-20) : incident.notes,
    };
    this.incidents.set(incidentId, next);
    void this.persistIncident(next);
    return structuredClone(next);
  }

  private async recoverAndAcquireLeadership(): Promise<void> {
    const snapshot = await this.stateStore.load();
    this.incidents.clear();
    this.fingerprintIndex.clear();
    this.actionIntents.clear();
    this.receipts.clear();

    for (const incident of snapshot.incidents) {
      this.incidents.set(incident.incidentId, incident);
      this.fingerprintIndex.set(incident.fingerprint, incident.incidentId);
    }
    for (const intent of snapshot.intents) this.actionIntents.set(intent.intentId, intent);
    for (const receipt of snapshot.receipts) this.receipts.set(receipt.receiptId, receipt);

    this.leadership = await this.stateStore.acquireLeadership(
      this.instanceId,
      this.leadershipLeaseTtlMs
    );
  }

  private async maintainLeadership(): Promise<void> {
    if (!this.started) return;
    try {
      if (this.leadership) {
        const renewed = await this.stateStore.renewLeadership(
          this.leadership,
          this.leadershipLeaseTtlMs
        );
        if (renewed) {
          this.leadership = renewed;
          return;
        }
        this.leadership = null;
      }
      this.leadership = await this.stateStore.acquireLeadership(
        this.instanceId,
        this.leadershipLeaseTtlMs
      );
    } catch {
      this.leadership = null;
    }
  }

  private async isCurrentLeader(): Promise<boolean> {
    if (!this.leadership) return false;
    const current = await this.stateStore.isLeadershipCurrent(
      this.instanceId,
      this.leadership.epoch
    );
    if (!current) {
      this.leadership = null;
      return false;
    }
    return true;
  }

  private async requireLeader(): Promise<SlayerPrimeLeadershipLease> {
    if (!(await this.isCurrentLeader())) {
      throw new Error("Slayer Prime replica is not the current enforcement leader.");
    }
    return this.leadership!;
  }

  private async persistIncident(incident: SlayerIncident): Promise<void> {
    await this.stateStore.upsertIncident(incident);
    await this.stateStore.appendJournal({
      eventType: "INCIDENT_UPSERTED",
      occurredAt: new Date().toISOString(),
      holderId: this.instanceId,
      incidentId: incident.incidentId,
      epoch: this.leadership?.epoch,
    });
  }

  private async writeRejectedReceipt(
    intent: SlayerActionIntent,
    reason: string,
    details: Record<string, unknown>
  ): Promise<SlayerEnforcementReceipt> {
    const now = new Date().toISOString();
    const receipt: SlayerEnforcementReceipt = {
      receiptId: "slayreceipt_" + randomUUID().replace(/-/g, "").slice(0, 16),
      intentId: intent.intentId,
      incidentId: intent.incidentId,
      action: intent.action,
      scope: intent.scope,
      targetId: intent.targetId,
      status: "REJECTED",
      reason,
      executionStartedAt: now,
      executionFinishedAt: now,
      details,
    };
    this.receipts.set(receipt.receiptId, receipt);
    await this.stateStore.upsertReceipt(receipt);
    return structuredClone(receipt);
  }

  private actionDedupeKey(
    incident: SlayerIncident,
    action: SlayerPrimeAction,
    scope: SlayerPrimeScope,
    targetId: string,
    parameters: Record<string, unknown>,
    timeBucket: number
  ): string {
    const canonical = JSON.stringify({
      incidentId: incident.incidentId,
      action,
      scope,
      targetId,
      parameters: this.sortObject(parameters),
      timeBucket,
    });
    return createHash("sha256").update(canonical).digest("hex");
  }

  private sortObject(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sortObject(item));
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, this.sortObject(item)])
    );
  }

  private leaseTaskId(parameters: Record<string, unknown>): string | null {
    return parameters.taskId ? String(parameters.taskId) : null;
  }

  private extractLeaseManager(): LeaseManager | undefined {
    const adapter = this.actionExecutorAdapter();
    return adapter instanceof LeaseRevokeEnforcementAdapter ? this.readPrivateLeaseManager(adapter) : undefined;
  }

  private actionExecutorAdapter(): unknown {
    return (this.actionExecutor as unknown as { adapters?: unknown[] }).adapters?.[0];
  }

  private readPrivateLeaseManager(adapter: LeaseRevokeEnforcementAdapter): LeaseManager | undefined {
    return (adapter as unknown as { leaseManager?: LeaseManager }).leaseManager;
  }

  private fingerprint(floorId: string, targetId: string, category: string): string {
    return createHash("sha256")
      .update([floorId, targetId, category].map((value) => value.trim().toLowerCase()).join("|"))
      .digest("hex")
      .slice(0, 24);
  }

  private normalizeEvidence(evidence: SlayerPrimeEvidence[]): SlayerPrimeEvidence[] {
    return evidence.map((item) => ({
      ...item,
      trustScore: Math.max(0, Math.min(1, item.trustScore)),
    }));
  }

  private mergeEvidence(existing: SlayerPrimeEvidence[], additions: SlayerPrimeEvidence[]): SlayerPrimeEvidence[] {
    const byId = new Map(existing.map((item) => [item.evidenceId, item]));
    for (const item of this.normalizeEvidence(additions)) byId.set(item.evidenceId, item);
    return Array.from(byId.values()).slice(-this.maxEvidencePerIncident);
  }

  private trimIncidents(): void {
    if (this.incidents.size <= this.maxIncidents) return;
    const sorted = Array.from(this.incidents.values()).sort(
      (a, b) => new Date(a.lastObservedAt).getTime() - new Date(b.lastObservedAt).getTime()
    );
    for (const incident of sorted.slice(0, this.incidents.size - this.maxIncidents)) {
      this.incidents.delete(incident.incidentId);
      if (this.fingerprintIndex.get(incident.fingerprint) === incident.incidentId) {
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
    if (!incident) throw new Error("Slayer Prime incident " + incidentId + " not found");
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
    payload: Record<string, unknown> | SlayerEnforcementReceipt
  ): Promise<void> {
    const stableKey = String(
      (payload as Record<string, unknown>).incidentId ||
      (payload as Record<string, unknown>).intentId ||
      (payload as Record<string, unknown>).receiptId ||
      randomUUID()
    );
    await this.eventBus.publish(topic, payload as Record<string, unknown>, {
      source: this.instanceId,
      idempotencyKey: "slayer-prime:" + topic + ":" + stableKey,
    });
  }
}
