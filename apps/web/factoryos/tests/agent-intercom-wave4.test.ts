import { describe, expect, it } from "vitest";
import { AgentIntercomStore } from "../core/comms/AgentIntercomStore";
import type { AgentIntercomAuth } from "../core/comms/AgentIntercomContracts";
import type { CommsCapability, CommsPeerHello, CommsPrincipal } from "../core/comms/CommsFabric";
import { DurableEventBus } from "../core/events/DurableEventBus";

const messageCapabilities: CommsCapability[] = [
  { name: "INTERCOM_MESSAGE", version: "1.0.0", enabled: true, lanes: ["EVENT"], maxPayloadBytes: 32000, maxInflight: 8 },
  { name: "SITUATION_RECORD", version: "1.0.0", enabled: true, lanes: ["EVENT"], maxPayloadBytes: 32000, maxInflight: 8 },
  { name: "COMMAND", version: "1.0.0", enabled: true, lanes: ["CONTROL"], maxPayloadBytes: 32000, maxInflight: 8 },
  { name: "REQUEST_RESPONSE", version: "1.0.0", enabled: true, lanes: ["CONTROL"], maxPayloadBytes: 32000, maxInflight: 8 },
];

const human: CommsPrincipal = { principalId: "alice", kind: "HUMAN" };
const agent: CommsPrincipal = { principalId: "worker_research", kind: "WORKER" };
const auth: AgentIntercomAuth = {
  principal: human,
  allowedMissionIds: ["mission_1"],
  allowedLanes: ["EVENT", "CONTROL"],
  allowedKinds: ["MESSAGE", "DELEGATION_REQUEST", "DELEGATION_RESPONSE"],
  allowedCapabilities: messageCapabilities,
  allowedTargetPrincipals: ["worker_research", "bob"],
  allowBroadcast: false,
};

function store() {
  return new AgentIntercomStore({
    workspaceId: "workspace_test",
    eventBus: new DurableEventBus(),
  });
}

describe("Wave 4 Agent Intercom & Delegation", () => {
  it("sends a mission-scoped message with durable delivery lifecycle", async () => {
    const s = store();

    const sent = await s.send(auth, {
      missionId: "mission_1",
      target: agent,
      text: "Check the latest evidence.",
      correlationId: "corr_1",
      idempotencyKey: "msg-check-1",
    });

    expect(sent.deliveryState).toBe("DISPATCHED");
    expect(sent.envelope.meta.lane).toBe("EVENT");
    expect(sent.envelope.meta.messageKind).toBe("INTERCOM_MESSAGE");

    const delivered = await s.deliver(sent.intercomId, "worker_research");
    const acked = await s.ack(delivered.intercomId, "worker_research");

    expect(acked.deliveryState).toBe("ACKED");

    const replay = await s.replay("mission_1");
    expect(replay.items.map((item) => item.intercomId)).toContain(sent.intercomId);
  });

  it("deduplicates repeated idempotent sends", async () => {
    const s = store();

    const first = await s.send(auth, {
      missionId: "mission_1",
      target: agent,
      text: "Exactly once request",
      idempotencyKey: "same-send",
    });
    const second = await s.send(auth, {
      missionId: "mission_1",
      target: agent,
      text: "Exactly once request",
      idempotencyKey: "same-send",
    });

    expect(second.intercomId).toBe(first.intercomId);
  });

  it("creates a delegation request without executing it", async () => {
    const s = store();

    const delegation = await s.createDelegation(auth, {
      missionId: "mission_1",
      target: agent,
      objective: "Research three authoritative sources.",
      requiredCapability: "CAP_RESEARCH_EXEC",
    });

    expect(delegation.state).toBe("REQUESTED");
    expect(delegation.target.principalId).toBe("worker_research");

    const messages = await s.replay("mission_1");
    const request = messages.items.find((item) => item.envelope.payload.delegationId === delegation.delegationId);
    expect(request?.envelope.meta.messageKind).toBe("COMMAND");
    expect(request?.deliveryState).toBe("DISPATCHED");
  });

  it("accepts a delegation only from its target and preserves correlation", async () => {
    const s = store();

    const delegation = await s.createDelegation(auth, {
      missionId: "mission_1",
      target: agent,
      objective: "Produce a research handoff.",
      correlationId: "delegation-corr",
    });

    const targetAuth: AgentIntercomAuth = {
      principal: agent,
      allowedMissionIds: ["mission_1"],
      allowedLanes: ["CONTROL", "EVENT"],
      allowedKinds: ["MESSAGE", "DELEGATION_REQUEST", "DELEGATION_RESPONSE"],
      allowedCapabilities: messageCapabilities,
      allowedTargetPrincipals: ["alice"],
      allowBroadcast: false,
    };

    await expect(
      s.respondDelegation(auth, delegation.delegationId, "ACCEPT"),
    ).rejects.toThrow("DELEGATION_TARGET_UNAUTHORIZED");

    const accepted = await s.respondDelegation(targetAuth, delegation.delegationId, "ACCEPT", "I can take it.");
    expect(accepted.state).toBe("ACCEPTED");

    const page = await s.replay("mission_1");
    const response = page.items.find((item) => item.envelope.payload.kind === "MESSAGE" && item.envelope.meta.correlationId === "delegation-corr");
    expect(response).toBeDefined();
  });

  it("rejects target escape and protocol/schema mismatches", async () => {
    const s = store();

    await expect(
      s.send(auth, {
        missionId: "mission_1",
        target: { principalId: "outsider", kind: "WORKER" },
        text: "Nope",
      }),
    ).rejects.toThrow("INTERCOM_ADMISSION_DENIED:TARGET_SCOPE_DENIED");

    const remoteHello: CommsPeerHello = {
      protocolVersion: "999.0.0",
      principal: agent,
      sessionId: "remote-session",
      capabilities: messageCapabilities,
      supportedSchemaVersions: ["1.0.0"],
      sentAt: new Date().toISOString(),
    };

    await expect(
      s.openSession("mission_1", human, remoteHello, messageCapabilities),
    ).rejects.toThrow("INTERCOM_PROTOCOL_VERSION_MISMATCH");
  });

  it("negotiates a session and degrades stale peers", async () => {
    const s = store();

    const remoteHello: CommsPeerHello = {
      protocolVersion: "2.0.0",
      principal: agent,
      sessionId: "remote-session-2",
      capabilities: messageCapabilities,
      supportedSchemaVersions: ["1.0.0"],
      sentAt: new Date().toISOString(),
    };

    const session = await s.openSession("mission_1", human, remoteHello, messageCapabilities, ["1.0.0"], 1000, 2000);
    expect(session.state.state).toBe("READY");
    expect(session.missionId).toBe("mission_1");
    expect(session.state.capabilities.length).toBe(3);

    const changed = await s.degradeStaleSessions(Date.now() + 3000);
    expect(changed).toBe(1);
    const sessions = await s.listSessions("mission_1");
    expect(sessions[0].state.state).toBe("DEGRADED");
  });

  it("bounds retry and records dead-letter state", async () => {
    const s = store();

    const sent = await s.send(auth, {
      missionId: "mission_1",
      target: agent,
      text: "Retry this",
      maxAttempts: 1,
    });

    const delivered = await s.deliver(sent.intercomId, "worker_research");
    const terminal = await s.nack(delivered.intercomId, "worker_research", true, "consumer unavailable");

    expect(terminal.deliveryState).toBe("DEAD_LETTERED");
  });
});
