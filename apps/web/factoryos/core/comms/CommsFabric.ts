/**
 * FactoryOS Comms Fabric v2
 *
 * A transport-neutral protocol shell around SituationRecord/DurableEventBus.
 * Communication is split into:
 *   1. Envelope: identity, correlation, causality, delivery semantics.
 *   2. Session: authenticated peer lifecycle + negotiated capabilities.
 *   3. Authorization: explicit sender/receiver/scope/action admission.
 *   4. Lanes: control, event, relay, stream.
 *
 * The semantic payload remains owned by existing contracts.
 */

export const COMMS_PROTOCOL_VERSION = "2.0.0";

export type CommsLane = "CONTROL" | "EVENT" | "RELAY" | "STREAM";
export type CommsInteraction = "ONE_WAY" | "REQUEST_RESPONSE" | "STREAM";
export type CommsDelivery =
  | "AT_MOST_ONCE"
  | "AT_LEAST_ONCE"
  | "EFFECTIVELY_ONCE";
export type CommsPriority = "LOW" | "NORMAL" | "HIGH" | "CRITICAL";

export type CommsMessageKind =
  | "SITUATION"
  | "COMMAND"
  | "QUERY"
  | "RESPONSE"
  | "ACK"
  | "NACK"
  | "HEARTBEAT"
  | "CAPABILITY"
  | "EVENT"
  | "INTERCOM_MESSAGE"
  | "CANCEL"
  | "RENEGOTIATE";

export type CommsDeliveryState =
  | "CREATED"
  | "ADMITTED"
  | "QUEUED"
  | "DISPATCHED"
  | "DELIVERED"
  | "ACKED"
  | "RETRYING"
  | "NACKED"
  | "EXPIRED"
  | "CANCELLED"
  | "DEAD_LETTERED";

export interface CommsPrincipal {
  readonly principalId: string;
  readonly kind: "HUMAN" | "OVERSEER" | "ASCALON" | "GUARDIAN" | "BDA" | "SLAYER" | "HEALER" | "WORKER" | "SYSTEM";
  readonly floorId?: string;
}

export interface CommsScope {
  readonly missionId: string;
  readonly floorId?: string;
  readonly channelId?: string;
  readonly allowedPrincipals?: string[];
}

export interface CommsCapability {
  readonly name:
    | "SITUATION_RECORD"
    | "COMMAND"
    | "QUERY"
    | "REQUEST_RESPONSE"
    | "INTERCOM_MESSAGE"
    | "STREAM"
    | "RELAY"
    | "CANCEL"
    | "HEARTBEAT"
    | "REPLAY"
    | "ACKS";
  readonly version: string;
  readonly enabled: boolean;
  readonly maxPayloadBytes?: number;
  readonly maxInflight?: number;
  readonly lanes: CommsLane[];
}

export interface CommsPeerHello {
  readonly protocolVersion: string;
  readonly principal: CommsPrincipal;
  readonly sessionId: string;
  readonly capabilities: readonly CommsCapability[];
  readonly supportedSchemaVersions: readonly string[];
  readonly sentAt: string;
}

export interface CommsEnvelopeMeta {
  readonly messageId: string;
  readonly messageKind: CommsMessageKind;
  readonly protocolVersion: string;
  readonly interaction: CommsInteraction;
  readonly lane: CommsLane;
  readonly delivery: CommsDelivery;
  readonly priority: CommsPriority;
  readonly createdAt: string;
  readonly expiresAt?: string;
  readonly source: CommsPrincipal;
  readonly target: CommsPrincipal | "BROADCAST";
  readonly scope: CommsScope;
  readonly correlationId: string;
  readonly causationId?: string;
  readonly replyTo?: string;
  readonly attempt: number;
  readonly schemaVersion: string;
  readonly contentType: "application/json";
  readonly contentDigestSha256: string;
}

export interface CommsEnvelope<TPayload> {
  readonly meta: CommsEnvelopeMeta;
  readonly payload: TPayload;
}

export interface CommsAuthorizationContext {
  readonly principal: CommsPrincipal;
  readonly allowedMissionIds: readonly string[];
  readonly allowedFloorIds?: readonly string[];
  readonly allowedLanes: readonly CommsLane[];
  readonly allowedKinds: readonly CommsMessageKind[];
  readonly allowBroadcast: boolean;
  readonly allowedTargetPrincipals?: readonly string[];
}

export interface CommsDeliveryReceipt {
  readonly messageId: string;
  readonly state: CommsDeliveryState;
  readonly acceptedAt: string;
  readonly deliveredAt?: string;
  readonly ackedAt?: string;
  readonly consumerId?: string;
  readonly attempt: number;
  readonly retryable: boolean;
  readonly reason?: string;
  readonly correlationId: string;
  readonly causationId?: string;
}

export interface CommsSessionState {
  readonly sessionId: string;
  readonly local: CommsPrincipal;
  readonly remote: CommsPrincipal;
  readonly protocolVersion: string;
  readonly establishedAt: string;
  readonly lastHeartbeatAt: string;
  readonly heartbeatIntervalMs: number;
  readonly deadAfterMs: number;
  readonly capabilities: readonly CommsCapability[];
  readonly state: "NEGOTIATING" | "READY" | "DEGRADED" | "CLOSING" | "CLOSED";
  readonly lastKnownGoodConfigDigest?: string;
}

export interface CommsAdmissionDecision {
  readonly admitted: boolean;
  readonly reasonCode:
    | "AUTHORIZED"
    | "UNAUTHORIZED_PRINCIPAL"
    | "MISSION_SCOPE_DENIED"
    | "FLOOR_SCOPE_DENIED"
    | "LANE_DENIED"
    | "KIND_DENIED"
    | "BROADCAST_DENIED"
    | "CAPABILITY_UNSUPPORTED"
    | "SCHEMA_UNSUPPORTED"
    | "TTL_EXPIRED"
    | "PAYLOAD_TOO_LARGE"
    | "TARGET_SCOPE_DENIED";
  readonly policyVersion: string;
}

/**
 * Pure authorization gate. It is intentionally independent from transport.
 */
export function admitComms(
  envelope: CommsEnvelope<unknown>,
  auth: CommsAuthorizationContext,
  capabilities: readonly CommsCapability[],
  nowMs = Date.now(),
): CommsAdmissionDecision {
  const now = new Date(nowMs).getTime();
  if (envelope.meta.expiresAt && Date.parse(envelope.meta.expiresAt) <= now) {
    return { admitted: false, reasonCode: "TTL_EXPIRED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (envelope.meta.protocolVersion !== COMMS_PROTOCOL_VERSION) {
    return { admitted: false, reasonCode: "SCHEMA_UNSUPPORTED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (envelope.meta.source.principalId !== auth.principal.principalId) {
    return { admitted: false, reasonCode: "UNAUTHORIZED_PRINCIPAL", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (!auth.allowedMissionIds.includes(envelope.meta.scope.missionId)) {
    return { admitted: false, reasonCode: "MISSION_SCOPE_DENIED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (
    envelope.meta.scope.floorId &&
    auth.allowedFloorIds &&
    !auth.allowedFloorIds.includes(envelope.meta.scope.floorId)
  ) {
    return { admitted: false, reasonCode: "FLOOR_SCOPE_DENIED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (
    envelope.meta.scope.allowedPrincipals?.length &&
    !envelope.meta.scope.allowedPrincipals.includes(envelope.meta.source.principalId)
  ) {
    return { admitted: false, reasonCode: "TARGET_SCOPE_DENIED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (
    envelope.meta.target !== "BROADCAST" &&
    auth.allowedTargetPrincipals &&
    !auth.allowedTargetPrincipals.includes(envelope.meta.target.principalId)
  ) {
    return { admitted: false, reasonCode: "TARGET_SCOPE_DENIED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (!auth.allowedLanes.includes(envelope.meta.lane)) {
    return { admitted: false, reasonCode: "LANE_DENIED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (!auth.allowedKinds.includes(envelope.meta.messageKind)) {
    return { admitted: false, reasonCode: "KIND_DENIED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  if (envelope.meta.target === "BROADCAST" && !auth.allowBroadcast) {
    return { admitted: false, reasonCode: "BROADCAST_DENIED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  const negotiatedSchema = capabilities.some((c) => c.enabled && c.lanes.includes(envelope.meta.lane) && (c.maxPayloadBytes === undefined || Buffer.byteLength(JSON.stringify(envelope.payload), "utf8") <= c.maxPayloadBytes));
  if (!negotiatedSchema) {
    return { admitted: false, reasonCode: "PAYLOAD_TOO_LARGE", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  const capability = capabilities.find((c) =>
    c.enabled &&
    c.name === capabilityForKind(envelope.meta.messageKind) &&
    c.lanes.includes(envelope.meta.lane),
  );

  if (!capability) {
    return { admitted: false, reasonCode: "CAPABILITY_UNSUPPORTED", policyVersion: COMMS_PROTOCOL_VERSION };
  }

  return { admitted: true, reasonCode: "AUTHORIZED", policyVersion: COMMS_PROTOCOL_VERSION };
}

export function capabilityForKind(kind: CommsMessageKind): CommsCapability["name"] {
  switch (kind) {
    case "SITUATION":
      return "SITUATION_RECORD";
    case "COMMAND":
      return "COMMAND";
    case "QUERY":
      return "QUERY";
    case "RESPONSE":
      return "REQUEST_RESPONSE";
    case "HEARTBEAT":
      return "HEARTBEAT";
    case "CANCEL":
      return "CANCEL";
    case "ACK":
    case "NACK":
      return "ACKS";
    case "CAPABILITY":
    case "RENEGOTIATE":
      return "HEARTBEAT";
    case "EVENT":
      return "SITUATION_RECORD";
    case "INTERCOM_MESSAGE":
      return "INTERCOM_MESSAGE";
  }
}

export function nextDeliveryState(
  current: CommsDeliveryState,
  event: "admit" | "queue" | "dispatch" | "deliver" | "ack" | "nack" | "retry" | "expire" | "cancel" | "dead_letter",
): CommsDeliveryState {
  const transitions: Record<CommsDeliveryState, Partial<Record<typeof event, CommsDeliveryState>>> = {
    CREATED: { admit: "ADMITTED", expire: "EXPIRED", cancel: "CANCELLED" },
    ADMITTED: { queue: "QUEUED", dispatch: "DISPATCHED", expire: "EXPIRED", cancel: "CANCELLED" },
    QUEUED: { dispatch: "DISPATCHED", expire: "EXPIRED", cancel: "CANCELLED" },
    DISPATCHED: { deliver: "DELIVERED", retry: "RETRYING", nack: "NACKED", expire: "EXPIRED", cancel: "CANCELLED" },
    DELIVERED: { ack: "ACKED", nack: "NACKED", retry: "RETRYING", expire: "EXPIRED" },
    RETRYING: { dispatch: "DISPATCHED", expire: "EXPIRED", cancel: "CANCELLED", dead_letter: "DEAD_LETTERED" },
    NACKED: { retry: "RETRYING", dead_letter: "DEAD_LETTERED", expire: "EXPIRED" },
    ACKED: {},
    EXPIRED: {},
    CANCELLED: {},
    DEAD_LETTERED: {},
  };

  const next = transitions[current][event];
  if (!next) {
    throw new Error(`Invalid comms delivery transition: ${current} + ${event}`);
  }
  return next;
}

export function shouldRetry(
  delivery: CommsDeliveryState,
  attempt: number,
  maxAttempts: number,
  retryable: boolean,
): boolean {
  return retryable && (delivery === "NACKED" || delivery === "RETRYING") && attempt < maxAttempts;
}
