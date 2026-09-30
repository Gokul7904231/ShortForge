import {
  admitComms,
  nextDeliveryState,
  shouldRetry,
  type CommsAuthorizationContext,
  type CommsCapability,
  type CommsEnvelope,
} from "./CommsFabric";

const capabilities: CommsCapability[] = [
  { name: "SITUATION_RECORD", version: "1.0.0", enabled: true, lanes: ["EVENT"] },
  { name: "COMMAND", version: "1.0.0", enabled: true, lanes: ["CONTROL"] },
  { name: "QUERY", version: "1.0.0", enabled: true, lanes: ["CONTROL"] },
  { name: "REQUEST_RESPONSE", version: "1.0.0", enabled: true, lanes: ["CONTROL", "RELAY"] },
  { name: "HEARTBEAT", version: "1.0.0", enabled: true, lanes: ["CONTROL"] },
  { name: "ACKS", version: "1.0.0", enabled: true, lanes: ["CONTROL"] },
];

const auth: CommsAuthorizationContext = {
  principal: { principalId: "worker-1", kind: "WORKER", floorId: "F03" },
  allowedMissionIds: ["m1"],
  allowedFloorIds: ["F03"],
  allowedLanes: ["CONTROL", "EVENT"],
  allowedKinds: ["SITUATION", "COMMAND", "QUERY", "RESPONSE", "ACK", "NACK", "HEARTBEAT"],
  allowBroadcast: false,
};

function envelope(overrides: Partial<CommsEnvelope<unknown>["meta"]> = {}): CommsEnvelope<unknown> {
  return {
    meta: {
      messageId: "msg-1",
      messageKind: "SITUATION",
      protocolVersion: "2.0.0",
      interaction: "ONE_WAY",
      lane: "EVENT",
      delivery: "EFFECTIVELY_ONCE",
      priority: "NORMAL",
      createdAt: new Date().toISOString(),
      source: { principalId: "worker-1", kind: "WORKER", floorId: "F03" },
      target: { principalId: "guardian-3", kind: "GUARDIAN", floorId: "F03" },
      scope: { missionId: "m1", floorId: "F03" },
      correlationId: "corr-1",
      attempt: 1,
      schemaVersion: "1.0.0",
      contentType: "application/json",
      contentDigestSha256: "sha256:test",
      ...overrides,
    },
    payload: { ok: true },
  };
}

test("Comms admission accepts a scoped authorized message", () => {
  expect(admitComms(envelope(), auth, capabilities).admitted).toBe(true);
});

test("Comms admission rejects wrong mission scope", () => {
  expect(
    admitComms(
      envelope({ scope: { missionId: "other", floorId: "F03" } }),
      auth,
      capabilities,
    ).reasonCode,
  ).toBe("MISSION_SCOPE_DENIED");
});

test("Comms admission rejects an unauthorized source principal", () => {
  expect(
    admitComms(
      envelope({ source: { principalId: "rogue", kind: "WORKER", floorId: "F03" } }),
      auth,
      capabilities,
    ).reasonCode,
  ).toBe("UNAUTHORIZED_PRINCIPAL");
});

test("Comms admission rejects broadcast when policy does not allow it", () => {
  expect(admitComms(envelope({ target: "BROADCAST" }), auth, capabilities).reasonCode).toBe("BROADCAST_DENIED");
});

test("Comms admission rejects unsupported lane/capability combinations", () => {
  expect(admitComms(envelope({ lane: "RELAY" }), auth, capabilities).reasonCode).toBe("LANE_DENIED");
});

test("Comms admission expires messages before dispatch", () => {
  expect(
    admitComms(
      envelope({ expiresAt: new Date(0).toISOString() }),
      auth,
      capabilities,
      Date.now(),
    ).reasonCode,
  ).toBe("TTL_EXPIRED");
});

test("Delivery state machine is monotonic and explicit", () => {
  expect(nextDeliveryState("CREATED", "admit")).toBe("ADMITTED");
  expect(nextDeliveryState("ADMITTED", "queue")).toBe("QUEUED");
  expect(nextDeliveryState("QUEUED", "dispatch")).toBe("DISPATCHED");
  expect(nextDeliveryState("DISPATCHED", "deliver")).toBe("DELIVERED");
  expect(nextDeliveryState("DELIVERED", "ack")).toBe("ACKED");
  expect(() => nextDeliveryState("ACKED", "retry")).toThrow();
});

test("Retry gate is bounded and requires retryable failure", () => {
  expect(shouldRetry("NACKED", 1, 3, true)).toBe(true);
  expect(shouldRetry("NACKED", 3, 3, true)).toBe(false);
  expect(shouldRetry("NACKED", 1, 3, false)).toBe(false);
});
