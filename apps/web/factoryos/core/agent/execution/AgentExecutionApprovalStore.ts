import * as fs from "node:fs";
import * as path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import type { ToolRiskLevel } from "../../contracts/PolicyContracts";
import type { ExecutionState } from "./AgentExecutionContracts";

export type AgentApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "EXPIRED"
  | "CANCELLED";

export interface AgentExecutionApprovalRequest {
  readonly approvalId: string;
  readonly executionId: string;
  readonly missionId: string;
  readonly runId: string;
  readonly floorId?: string;
  readonly stepId: string;
  readonly requestedByAgent: string;
  readonly reason: string;
  readonly riskLevel: ToolRiskLevel;
  readonly requestedStateVersion: number;
  readonly executionStateFingerprint: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly status: AgentApprovalStatus;
  readonly resolvedByUserId?: string;
  readonly resolvedAt?: string;
  readonly resolutionReason?: string;
}

export interface CreateAgentApprovalInput {
  readonly executionId: string;
  readonly missionId: string;
  readonly runId: string;
  readonly floorId?: string;
  readonly stepId: string;
  readonly requestedByAgent: string;
  readonly reason: string;
  readonly riskLevel: ToolRiskLevel;
  readonly requestedStateVersion: number;
  readonly executionStateFingerprint: string;
  readonly expiresAt: string;
}

export interface AgentExecutionApprovalStore {
  create(input: CreateAgentApprovalInput): AgentExecutionApprovalRequest;
  get(approvalId: string): AgentExecutionApprovalRequest | null;
  resolve(
    approvalId: string,
    decision: Extract<AgentApprovalStatus, "APPROVED" | "REJECTED" | "CANCELLED">,
    resolvedByUserId: string,
    resolutionReason?: string,
    now?: Date,
  ): AgentExecutionApprovalRequest;
  expirePending(now?: Date): AgentExecutionApprovalRequest[];
  listOpen(): AgentExecutionApprovalRequest[];
}

function canonicalize(value: unknown): string {
  return (
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ) ?? "null"
  );
}

function approvalRecordHash(
  request: AgentExecutionApprovalRequest,
  previousHash: string,
): string {
  return createHash("sha256")
    .update(previousHash + ":" + canonicalize(request), "utf8")
    .digest("hex");
}

function stableExecutionView(state: ExecutionState): Record<string, unknown> {
  return {
    executionId: state.executionId,
    missionId: state.missionId,
    runId: state.runId,
    floorId: state.floorId,
    phase: state.phase,
    stepId: state.stepId,
    stepAttempt: state.stepAttempt,
    stateVersion: state.stateVersion,
    status: state.status,
    facts: state.facts,
    sideEffectStatus: state.sideEffectStatus,
    idempotencyKey: state.idempotencyKey,
    leaseId: state.leaseId,
    fencingEpoch: state.fencingEpoch,
    authorizationGrantId: state.authorizationGrantId,
    evidenceRefs: state.evidenceRefs,
    artifactRefs: state.artifactRefs,
    lastOutcome: state.lastOutcome,
    lastError: state.lastError,
    humanApprovalState: state.humanApprovalState,
  };
}

export function executionStateFingerprint(state: ExecutionState): string {
  return createHash("sha256")
    .update(canonicalize(stableExecutionView(state)), "utf8")
    .digest("hex");
}

export class InMemoryAgentExecutionApprovalStore
  implements AgentExecutionApprovalStore
{
  private readonly requests = new Map<string, AgentExecutionApprovalRequest>();

  create(input: CreateAgentApprovalInput): AgentExecutionApprovalRequest {
    const now = new Date().toISOString();
    const request: AgentExecutionApprovalRequest = {
      approvalId: "approval_" + randomUUID().replace(/-/g, ""),
      ...input,
      status: "PENDING",
      createdAt: now,
    };
    this.requests.set(request.approvalId, structuredClone(request));
    return structuredClone(request);
  }

  get(approvalId: string): AgentExecutionApprovalRequest | null {
    const request = this.requests.get(approvalId);
    return request ? structuredClone(request) : null;
  }

  resolve(
    approvalId: string,
    decision: Extract<
      AgentApprovalStatus,
      "APPROVED" | "REJECTED" | "CANCELLED"
    >,
    resolvedByUserId: string,
    resolutionReason?: string,
    now = new Date(),
  ): AgentExecutionApprovalRequest {
    const current = this.requests.get(approvalId);
    if (!current) throw new Error("approval_request_not_found:" + approvalId);
    if (current.status !== "PENDING") {
      throw new Error(
        "approval_request_already_resolved:" +
          approvalId +
          ":" +
          current.status,
      );
    }

    if (new Date(current.expiresAt).getTime() <= now.getTime()) {
      const expired: AgentExecutionApprovalRequest = {
        ...current,
        status: "EXPIRED",
        resolvedAt: now.toISOString(),
        resolutionReason: "approval_expired_before_resolution",
      };
      this.requests.set(approvalId, structuredClone(expired));
      throw new Error("approval_request_expired:" + approvalId);
    }

    const resolved: AgentExecutionApprovalRequest = {
      ...current,
      status: decision,
      resolvedByUserId,
      resolvedAt: now.toISOString(),
      resolutionReason,
    };
    this.requests.set(approvalId, structuredClone(resolved));
    return structuredClone(resolved);
  }

  expirePending(now = new Date()): AgentExecutionApprovalRequest[] {
    const expired: AgentExecutionApprovalRequest[] = [];

    for (const current of this.requests.values()) {
      if (
        current.status === "PENDING" &&
        new Date(current.expiresAt).getTime() <= now.getTime()
      ) {
        const next: AgentExecutionApprovalRequest = {
          ...current,
          status: "EXPIRED",
          resolvedAt: now.toISOString(),
          resolutionReason: "approval_expired",
        };
        this.requests.set(current.approvalId, structuredClone(next));
        expired.push(structuredClone(next));
      }
    }

    return expired;
  }

  listOpen(): AgentExecutionApprovalRequest[] {
    return [...this.requests.values()]
      .filter((request) => request.status === "PENDING")
      .map((request) => structuredClone(request));
  }
}

interface JournalRecord {
  readonly request: AgentExecutionApprovalRequest;
  readonly previousHash: string;
  readonly hash: string;
}

export class DiskAgentExecutionApprovalStore
  implements AgentExecutionApprovalStore
{
  private readonly file: string;

  constructor(baseDir?: string) {
    const root =
      baseDir || path.join(process.cwd(), "data", "factoryos_state");
    const dir = path.join(root, "agent-execution");
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, "approvals.jsonl");
  }

  create(input: CreateAgentApprovalInput): AgentExecutionApprovalRequest {
    const request: AgentExecutionApprovalRequest = {
      approvalId: "approval_" + randomUUID().replace(/-/g, ""),
      ...input,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    };
    this.append(request);
    return structuredClone(request);
  }

  get(approvalId: string): AgentExecutionApprovalRequest | null {
    return (
      this.loadAll().find(
        (request) => request.approvalId === approvalId,
      ) || null
    );
  }

  resolve(
    approvalId: string,
    decision: Extract<
      AgentApprovalStatus,
      "APPROVED" | "REJECTED" | "CANCELLED"
    >,
    resolvedByUserId: string,
    resolutionReason?: string,
    now = new Date(),
  ): AgentExecutionApprovalRequest {
    const current = this.get(approvalId);
    if (!current) throw new Error("approval_request_not_found:" + approvalId);
    if (current.status !== "PENDING") {
      throw new Error(
        "approval_request_already_resolved:" +
          approvalId +
          ":" +
          current.status,
      );
    }

    if (new Date(current.expiresAt).getTime() <= now.getTime()) {
      const expired: AgentExecutionApprovalRequest = {
        ...current,
        status: "EXPIRED",
        resolvedAt: now.toISOString(),
        resolutionReason: "approval_expired_before_resolution",
      };
      this.append(expired);
      throw new Error("approval_request_expired:" + approvalId);
    }

    const resolved: AgentExecutionApprovalRequest = {
      ...current,
      status: decision,
      resolvedByUserId,
      resolvedAt: now.toISOString(),
      resolutionReason,
    };
    this.append(resolved);
    return structuredClone(resolved);
  }

  expirePending(now = new Date()): AgentExecutionApprovalRequest[] {
    const expired: AgentExecutionApprovalRequest[] = [];

    for (const current of this.listOpen()) {
      if (new Date(current.expiresAt).getTime() > now.getTime()) continue;

      const next: AgentExecutionApprovalRequest = {
        ...current,
        status: "EXPIRED",
        resolvedAt: now.toISOString(),
        resolutionReason: "approval_expired",
      };
      this.append(next);
      expired.push(next);
    }

    return expired;
  }

  listOpen(): AgentExecutionApprovalRequest[] {
    return this.loadAll()
      .filter((request) => request.status === "PENDING")
      .map((request) => structuredClone(request));
  }

  private append(request: AgentExecutionApprovalRequest): void {
    let previousHash = "GENESIS";

    if (fs.existsSync(this.file)) {
      const lines = fs
        .readFileSync(this.file, "utf8")
        .split("\n")
        .filter(Boolean);

      if (lines.length > 0) {
        const last = JSON.parse(lines[lines.length - 1]) as JournalRecord;
        previousHash = last.hash;
      }
    }

    const hash = approvalRecordHash(request, previousHash);
    const record: JournalRecord = { request, previousHash, hash };
    fs.appendFileSync(this.file, JSON.stringify(record) + "\n", "utf8");
  }

  private loadAll(): AgentExecutionApprovalRequest[] {
    if (!fs.existsSync(this.file)) return [];

    const lines = fs
      .readFileSync(this.file, "utf8")
      .split("\n")
      .filter(Boolean);

    const records: AgentExecutionApprovalRequest[] = [];
    let previousHash = "GENESIS";

    for (const line of lines) {
      try {
        const record = JSON.parse(line) as JournalRecord;
        const expected = approvalRecordHash(record.request, previousHash);

        if (
          record.previousHash !== previousHash ||
          record.hash !== expected
        ) {
          break;
        }

        records.push(record.request);
        previousHash = record.hash;
      } catch {
        break;
      }
    }

    const latest = new Map<string, AgentExecutionApprovalRequest>();
    for (const request of records) {
      latest.set(request.approvalId, request);
    }

    return [...latest.values()];
  }
}
