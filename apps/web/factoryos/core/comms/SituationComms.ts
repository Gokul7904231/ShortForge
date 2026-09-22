/**
 * FactoryOS v1 — Situation Record Distributed Comms Layer
 * Integrates SituationRecord (TEXT + GRAPH IR + EVIDENCE) into the authoritative FactoryOS
 * DurableEventBus transport, guaranteeing lossless distributed agent-to-agent handoffs,
 * strict truth level preservation, semantic idempotency, and non-destructive conflict tracking.
 */

import { randomUUID } from "node:crypto";
import type { DurableEventBus } from "../events/DurableEventBus";
import type { EventEnvelope } from "../contracts/EventContracts";
import type {
  SituationRecord,
  SituationGraphIR,
  SituationGraphNode,
  SituationGraphEdge,
  SituationEvidenceRef,
} from "../../../../../testing/model/SituationRecord";
import type { TruthLevel } from "../../../../../testing/contracts/execution.contract";

export interface SituationValidationResult {
  readonly valid: boolean;
  readonly errors: string[];
}

export interface SituationIntegrityResult {
  readonly match: boolean;
  readonly discrepancies: string[];
}

export interface SituationConflict {
  readonly conflictId: string;
  readonly missionId: string;
  readonly subject: string;
  readonly recordA: SituationRecord;
  readonly recordB: SituationRecord;
  readonly detectedAt: string;
  readonly reason: string;
}

export interface SituationMessagePayload {
  readonly record: string; // Serialized SituationRecord
  readonly situationId: string;
  readonly missionId: string;
  readonly runId?: string;
  readonly sender: SituationRecord["sender"];
  readonly recipients: string[];
  [key: string]: unknown;
}

const VALID_NODE_TYPES = new Set([
  "FLOOR",
  "ARTIFACT",
  "DECISION",
  "FAILURE",
  "RECOVERY",
  "DELIVERY",
  "UI_STATE",
  "VERIFICATION",
]);


const VALID_EDGE_TYPES = new Set([
  "PLANNED_DEPENDENCY",
  "EXECUTION_SEQUENCE",
  "ARTIFACT_PRODUCED",
  "ARTIFACT_CONSUMED",
  "VERIFICATION",
  "RECOVERY",
  "ESCALATION",
  "EVIDENCE_SUPPORT",
  "UI_ACTION",
]);

const VALID_TRUTH_LEVELS = new Set<TruthLevel>([
  "PHYSICAL",
  "OBSERVED",
  "VERIFIED",
  "ASSERTED",
  "INFERRED",
  "UNKNOWN",
  "RECONSTRUCTED",
]);

const VALID_RECORD_TYPES = new Set([
  "STATUS",
  "FAILURE",
  "RECOVERY",
  "DECISION",
  "HANDOFF",
  "VERIFICATION",
  "DELIVERY",
  "INVESTIGATION",
  "ESCALATION",
]);

const VALID_PRIORITIES = new Set(["LOW", "NORMAL", "HIGH", "CRITICAL"]);

const SECRET_PATTERNS = [
  /bearer\s+[A-Za-z0-9_\-\.]{20,}/i,
  /basic\s+[A-Za-z0-9+/=]{20,}/i,
  /(?:api[_-]?key|secret|password|passwd|auth[_-]?token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
  /cookie:\s*[^;\r\n]+session/i,
];

/**
 * Validates a SituationRecord to ensure it strictly conforms to contracts
 * and contains zero secret leakage or malformed structures.
 */
export function validateSituationRecord(record: unknown): SituationValidationResult {
  const errors: string[] = [];

  if (!record || typeof record !== "object") {
    return { valid: false, errors: ["SituationRecord must be a non-null object"] };
  }

  const rec = record as Record<string, unknown>;

  // Identity & Provenance
  if (typeof rec.id !== "string" || rec.id.trim().length === 0) {
    errors.push("Missing or empty situation record id");
  }
  if (typeof rec.missionId !== "string" || rec.missionId.trim().length === 0) {
    errors.push("Missing or empty missionId");
  }

  // Sender
  if (!rec.sender || typeof rec.sender !== "object") {
    errors.push("Missing or invalid sender object");
  } else {
    const sender = rec.sender as Record<string, unknown>;
    if (typeof sender.agentId !== "string" || sender.agentId.trim().length === 0) {
      errors.push("Missing or empty sender.agentId");
    }
    if (typeof sender.role !== "string" || sender.role.trim().length === 0) {
      errors.push("Missing or empty sender.role");
    }
  }

  // Recipients
  if (!Array.isArray(rec.recipients) || rec.recipients.length === 0) {
    errors.push("Recipients must be a non-empty array of agent IDs or '*'");
  } else {
    for (const r of rec.recipients) {
      if (typeof r !== "string" || r.trim().length === 0) {
        errors.push("Recipient entries must be non-empty strings");
      }
    }
  }

  // Record Type & Priority
  if (typeof rec.type !== "string" || !VALID_RECORD_TYPES.has(rec.type)) {
    errors.push(`Invalid record type: ${String(rec.type)}`);
  }
  if (typeof rec.priority !== "string" || !VALID_PRIORITIES.has(rec.priority)) {
    errors.push(`Invalid priority: ${String(rec.priority)}`);
  }

  // Text
  if (typeof rec.text !== "string") {
    errors.push("Text must be a string");
  } else {
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(rec.text)) {
        errors.push("Text contains potential unredacted credential or secret");
        break;
      }
    }
  }

  // Graph IR
  if (!rec.graph || typeof rec.graph !== "object") {
    errors.push("Missing or invalid graph object");
  } else {
    const graph = rec.graph as Record<string, unknown>;
    if (typeof graph.schemaVersion !== "string" || graph.schemaVersion.trim().length === 0) {
      errors.push("Graph missing schemaVersion");
    }

    if (!Array.isArray(graph.nodes)) {
      errors.push("Graph nodes must be an array");
    } else {
      for (const node of graph.nodes) {
        if (!node || typeof node !== "object") {
          errors.push("Graph node must be a non-null object");
          continue;
        }
        if (typeof node.id !== "string" || node.id.trim().length === 0) {
          errors.push("Graph node missing id");
        }
        if (typeof node.label !== "string") {
          errors.push("Graph node missing label");
        } else {
          for (const pattern of SECRET_PATTERNS) {
            if (pattern.test(node.label)) {
              errors.push(`Node '${node.id}' label contains unredacted credential or secret`);
              break;
            }
          }
        }
        if (typeof node.type !== "string" || !VALID_NODE_TYPES.has(node.type)) {
          errors.push(`Node '${node.id}' has invalid type: ${String(node.type)}`);
        }
      }
    }

    if (!Array.isArray(graph.edges)) {
      errors.push("Graph edges must be an array");
    } else {
      for (const edge of graph.edges) {
        if (!edge || typeof edge !== "object") {
          errors.push("Graph edge must be a non-null object");
          continue;
        }
        if (typeof edge.id !== "string" || edge.id.trim().length === 0) {
          errors.push("Graph edge missing id");
        }
        if (typeof edge.from !== "string" || typeof edge.to !== "string") {
          errors.push(`Graph edge '${edge.id}' missing from or to endpoint`);
        }
        if (typeof edge.type !== "string" || !VALID_EDGE_TYPES.has(edge.type)) {
          errors.push(`Graph edge '${edge.id}' has invalid type: ${String(edge.type)}`);
        }
      }
    }

    if (!Array.isArray(graph.focus)) {
      errors.push("Graph focus must be an array");
    }
    if (!Array.isArray(graph.emphasis)) {
      errors.push("Graph emphasis must be an array");
    }
  }

  // Evidence References
  if (!Array.isArray(rec.evidence)) {
    errors.push("Evidence must be an array of references");
  } else {
    for (const ev of rec.evidence) {
      if (!ev || typeof ev !== "object") {
        errors.push("Evidence item must be a non-null object");
        continue;
      }
      if (typeof ev.evidenceId !== "string" || ev.evidenceId.trim().length === 0) {
        errors.push("Evidence reference missing evidenceId");
      }
      if (typeof ev.truthLevel !== "string" || !VALID_TRUTH_LEVELS.has(ev.truthLevel as TruthLevel)) {
        errors.push(`Evidence reference '${ev.evidenceId}' has invalid truthLevel: ${String(ev.truthLevel)}`);
      }
      if (typeof ev.description !== "string") {
        errors.push(`Evidence reference '${ev.evidenceId}' missing description`);
      }
    }
  }

  // Creation timestamp
  if (typeof rec.createdAt !== "string" || isNaN(Date.parse(rec.createdAt))) {
    errors.push("Missing or invalid createdAt ISO timestamp");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Serializes a SituationRecord to a JSON string.
 */
export function serializeSituationRecord(record: SituationRecord): string {
  const validation = validateSituationRecord(record);
  if (!validation.valid) {
    throw new Error(`Cannot serialize invalid SituationRecord: ${validation.errors.join("; ")}`);
  }
  return JSON.stringify(record);
}

/**
 * Deserializes and validates a SituationRecord from JSON string.
 */
export function deserializeSituationRecord(serialized: string): SituationRecord {
  if (typeof serialized !== "string" || serialized.trim().length === 0) {
    throw new Error("Cannot deserialize empty or non-string payload");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch (e) {
    throw new Error(`Failed to parse SituationRecord JSON: ${e instanceof Error ? e.message : String(e)}`);
  }

  const validation = validateSituationRecord(parsed);
  if (!validation.valid) {
    throw new Error(`Deserialized SituationRecord failed validation: ${validation.errors.join("; ")}`);
  }

  return parsed as SituationRecord;
}

/**
 * Compares two SituationRecords for lossless semantic equivalence.
 * Ignores transport-level wrapping or transient transmission metadata.
 */
export function checkSituationRecordIntegrity(
  original: SituationRecord,
  received: SituationRecord
): SituationIntegrityResult {
  const discrepancies: string[] = [];

  // Identity & Provenance
  if (original.id !== received.id) {
    discrepancies.push(`ID mismatch: original '${original.id}' vs received '${received.id}'`);
  }
  if (original.missionId !== received.missionId) {
    discrepancies.push(`missionId mismatch: '${original.missionId}' vs '${received.missionId}'`);
  }
  if (original.runId !== received.runId) {
    discrepancies.push(`runId mismatch: '${original.runId}' vs '${received.runId}'`);
  }
  if (original.sender.agentId !== received.sender.agentId) {
    discrepancies.push(`sender.agentId mismatch: '${original.sender.agentId}' vs '${received.sender.agentId}'`);
  }
  if (original.sender.role !== received.sender.role) {
    discrepancies.push(`sender.role mismatch: '${original.sender.role}' vs '${received.sender.role}'`);
  }
  if (original.sender.floorId !== received.sender.floorId) {
    discrepancies.push(`sender.floorId mismatch: '${original.sender.floorId}' vs '${received.sender.floorId}'`);
  }

  // Recipients
  const origRec = [...original.recipients].sort();
  const recvRec = [...received.recipients].sort();
  if (origRec.length !== recvRec.length || !origRec.every((r, i) => r === recvRec[i])) {
    discrepancies.push(`Recipients mismatch: [${origRec.join(", ")}] vs [${recvRec.join(", ")}]`);
  }

  // Semantic metadata
  if (original.type !== received.type) {
    discrepancies.push(`Type mismatch: '${original.type}' vs '${received.type}'`);
  }
  if (original.priority !== received.priority) {
    discrepancies.push(`Priority mismatch: '${original.priority}' vs '${received.priority}'`);
  }
  if (original.text !== received.text) {
    discrepancies.push(`Text content mismatch`);
  }

  // Graph nodes
  if (original.graph.nodes.length !== received.graph.nodes.length) {
    discrepancies.push(`Graph nodes count mismatch: ${original.graph.nodes.length} vs ${received.graph.nodes.length}`);
  } else {
    const origNodes = new Map(original.graph.nodes.map((n) => [n.id, n]));
    for (const rNode of received.graph.nodes) {
      const oNode = origNodes.get(rNode.id);
      if (!oNode) {
        discrepancies.push(`Received graph contains unknown node '${rNode.id}'`);
      } else {
        if (oNode.type !== rNode.type) discrepancies.push(`Node '${rNode.id}' type mismatch: ${oNode.type} vs ${rNode.type}`);
        if (oNode.label !== rNode.label) discrepancies.push(`Node '${rNode.id}' label mismatch: ${oNode.label} vs ${rNode.label}`);
        if (oNode.status !== rNode.status) discrepancies.push(`Node '${rNode.id}' status mismatch: ${oNode.status} vs ${rNode.status}`);
      }
    }
  }

  // Graph edges
  if (original.graph.edges.length !== received.graph.edges.length) {
    discrepancies.push(`Graph edges count mismatch: ${original.graph.edges.length} vs ${received.graph.edges.length}`);
  } else {
    const origEdges = new Map(original.graph.edges.map((e) => [e.id, e]));
    for (const rEdge of received.graph.edges) {
      const oEdge = origEdges.get(rEdge.id);
      if (!oEdge) {
        discrepancies.push(`Received graph contains unknown edge '${rEdge.id}'`);
      } else {
        if (oEdge.from !== rEdge.from || oEdge.to !== rEdge.to) {
          discrepancies.push(`Edge '${rEdge.id}' endpoints mismatch: ${oEdge.from}->${oEdge.to} vs ${rEdge.from}->${rEdge.to}`);
        }
        if (oEdge.type !== rEdge.type) {
          discrepancies.push(`Edge '${rEdge.id}' type mismatch: ${oEdge.type} vs ${rEdge.type}`);
        }
      }
    }
  }

  // Graph focus & emphasis
  if (original.graph.focus.length !== received.graph.focus.length || !original.graph.focus.every((f, i) => f === received.graph.focus[i])) {
    discrepancies.push(`Graph focus mismatch`);
  }
  if (original.graph.emphasis.length !== received.graph.emphasis.length) {
    discrepancies.push(`Graph emphasis count mismatch`);
  }

  // Evidence references & Truth levels
  if (original.evidence.length !== received.evidence.length) {
    discrepancies.push(`Evidence count mismatch: ${original.evidence.length} vs ${received.evidence.length}`);
  } else {
    const origEv = new Map(original.evidence.map((e) => [e.evidenceId, e]));
    for (const rEv of received.evidence) {
      const oEv = origEv.get(rEv.evidenceId);
      if (!oEv) {
        discrepancies.push(`Received unknown evidence reference '${rEv.evidenceId}'`);
      } else {
        if (oEv.truthLevel !== rEv.truthLevel) {
          discrepancies.push(`Evidence '${rEv.evidenceId}' truthLevel corrupted: ${oEv.truthLevel} -> ${rEv.truthLevel}`);
        }
        if (oEv.type !== rEv.type) {
          discrepancies.push(`Evidence '${rEv.evidenceId}' type mismatch: ${oEv.type} vs ${rEv.type}`);
        }
        if (oEv.digest !== rEv.digest) {
          discrepancies.push(`Evidence '${rEv.evidenceId}' digest mismatch`);
        }
      }
    }
  }

  return {
    match: discrepancies.length === 0,
    discrepancies,
  };
}

/**
 * Detects conflicts between situation claims for the same mission without destructive overwrite.
 */
export class SituationConflictLedger {
  private claimsBySubject: Map<string, SituationRecord[]> = new Map();
  private conflicts: SituationConflict[] = [];

  public evaluateRecord(record: SituationRecord): SituationConflict | null {
    // Check nodes for claims about floor status
    for (const node of record.graph.nodes) {
      if (node.type === "FLOOR" && node.status) {
        const subject = `${record.missionId}:${node.id}:STATUS`;
        const priorRecords = this.claimsBySubject.get(subject) || [];

        for (const prior of priorRecords) {
          const priorNode = prior.graph.nodes.find((n) => n.id === node.id);
          if (priorNode && priorNode.status && priorNode.status !== node.status) {
            // Conflicting claims detected!
            const conflict: SituationConflict = {
              conflictId: `conf_${randomUUID().replace(/-/g, "").substring(0, 12)}`,
              missionId: record.missionId,
              subject,
              recordA: prior,
              recordB: record,
              detectedAt: new Date().toISOString(),
              reason: `Sender '${prior.sender.agentId}' asserted '${priorNode.status}', while sender '${record.sender.agentId}' asserted '${node.status}' for '${node.id}'`,
            };
            this.conflicts.push(conflict);
            this.claimsBySubject.set(subject, [...priorRecords, record]);
            return conflict;
          }
        }

        this.claimsBySubject.set(subject, [...priorRecords, record]);
      }
    }
    return null;
  }

  public getConflicts(missionId?: string): SituationConflict[] {
    if (missionId) {
      return this.conflicts.filter((c) => c.missionId === missionId);
    }
    return [...this.conflicts];
  }

  public clear(): void {
    this.claimsBySubject.clear();
    this.conflicts = [];
  }
}

/**
 * SituationCommsClient: The authoritative client integrating SituationRecord into FactoryOS Comms.
 * Built strictly on top of FactoryOS's DurableEventBus.
 */
export class SituationCommsClient {
  private eventBus: DurableEventBus;
  private conflictLedger: SituationConflictLedger = new SituationConflictLedger();
  private processedSituationIds: Set<string> = new Set();
  private deliveredRecords: SituationRecord[] = [];

  constructor(eventBus: DurableEventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Transmits a SituationRecord over the FactoryOS DurableEventBus.
   * Guarantees fail-closed validation, canonical serialization, and idempotent delivery.
   */
  public async send(
    record: SituationRecord,
    options: { correlationId?: string; source?: string } = {}
  ): Promise<EventEnvelope<SituationMessagePayload>> {
    // 1. Strict Fail-Closed Validation
    const validation = validateSituationRecord(record);
    if (!validation.valid) {
      throw new Error(`SituationRecord rejected by Comms validator: ${validation.errors.join("; ")}`);
    }

    // 2. Canonical Serialization
    const serialized = serializeSituationRecord(record);

    const payload: SituationMessagePayload = {
      record: serialized,
      situationId: record.id,
      missionId: record.missionId,
      runId: record.runId,
      sender: record.sender,
      recipients: [...record.recipients],
    };

    // 3. Publish to authoritative DurableEventBus using record.id as idempotency key
    return await this.eventBus.publish<SituationMessagePayload>(
      "SITUATION_RECORD_DISPATCHED",
      payload,
      {
        correlationId: options.correlationId || record.missionId,
        source: options.source || record.sender.agentId,
        idempotencyKey: `sit_${record.id}`,
      }
    );
  }

  /**
   * Subscribes an agent to receive addressed SituationRecords.
   * Filters by recipient, enforces semantic idempotency, validates deserialization,
   * detects conflicting claims without silent overwrite, and hands off to the agent.
   */
  public receive(
    agentId: string,
    handler: (record: SituationRecord, envelope: EventEnvelope<SituationMessagePayload>) => Promise<void> | void
  ): () => void {
    return this.eventBus.subscribe<SituationMessagePayload>(
      "SITUATION_RECORD_DISPATCHED",
      async (envelope) => {
        const payload = envelope.payload;
        if (!payload || !payload.recipients) return;

        // Recipient routing check
        const isTarget = payload.recipients.includes(agentId) || payload.recipients.includes("*");
        if (!isTarget) return;

        // Deserialization & Reconstitution
        const reconstituted = deserializeSituationRecord(payload.record);

        // Semantic Idempotency Check: if this exact situationRecordId has already been delivered,
        // do not create uncontrolled duplicated semantic state.
        if (this.processedSituationIds.has(reconstituted.id)) {
          // Idempotent delivery acknowledgement without redundant processing
          return;
        }
        this.processedSituationIds.add(reconstituted.id);

        // Conflict Detection: check against historical claims
        const conflict = this.conflictLedger.evaluateRecord(reconstituted);
        if (conflict) {
          // Disclose conflict on the bus for higher-level reconciliation without silent overwrite
          await this.eventBus.publish("SITUATION_RECORD_CONFLICT", {
            conflictId: conflict.conflictId,
            missionId: conflict.missionId,
            subject: conflict.subject,
            reason: conflict.reason,
            recordAId: conflict.recordA.id,
            recordBId: conflict.recordB.id,
          });
        }

        this.deliveredRecords.push(reconstituted);

        // Deliver to receiver agent
        await handler(reconstituted, envelope);
      }
    );
  }

  public getConflicts(missionId?: string): SituationConflict[] {
    return this.conflictLedger.getConflicts(missionId);
  }

  public getDeliveredRecords(): SituationRecord[] {
    return [...this.deliveredRecords];
  }

  public clear(): void {
    this.processedSituationIds.clear();
    this.deliveredRecords = [];
    this.conflictLedger.clear();
  }
}
