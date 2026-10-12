export interface MissionWorkSignal {
  readonly type: "MISSION_WORK_CHANGED";
  readonly eventId: string;
  readonly topic: string;
  readonly timestamp: string;
  readonly missionId: string;
  readonly taskId?: string;
}

const MISSION_WORK_TOPICS = new Set([
  "TASK_CREATED",
  "TASK_READY",
  "TASK_STARTED",
  "TASK_PROGRESS",
  "TASK_HEARTBEAT",
  "TASK_BLOCKED",
  "TASK_UNBLOCKED",
  "TASK_REVIEW_REQUESTED",
  "TASK_CHANGES_REQUESTED",
  "TASK_RETRYING",
  "TASK_RECLAIMED",
  "TASK_ARCHIVED",
  "TASK_COMPLETED",
  "TASK_FAILED",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Reduce a runtime event to a non-sensitive mission invalidation signal.
 * Never forwards raw payloads, logs, worker output, secrets, or hidden reasoning.
 */
export function projectMissionWorkSignal(
  rawEvent: unknown,
  expectedMissionId: string,
): MissionWorkSignal | null {
  if (!expectedMissionId.trim()) return null;
  const event = asRecord(rawEvent);
  if (!event) return null;
  const payload = asRecord(event.payload) ?? event;
  const topic = typeof event.topic === "string" ? event.topic : "";
  const missionId = typeof payload.missionId === "string"
    ? payload.missionId
    : typeof event.missionId === "string" ? event.missionId : "";
  const eventId = typeof event.eventId === "string" ? event.eventId : "";
  const timestamp = typeof event.timestamp === "string" ? event.timestamp : "";

  if (!MISSION_WORK_TOPICS.has(topic) || missionId !== expectedMissionId) return null;
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(eventId)) return null;
  if (!Number.isFinite(Date.parse(timestamp))) return null;

  const taskId = typeof payload.taskId === "string" &&
    payload.taskId.length > 0 &&
    payload.taskId.length <= 160 &&
    !/[\u0000-\u001F\u007F]/.test(payload.taskId)
      ? payload.taskId
      : undefined;

  return {
    type: "MISSION_WORK_CHANGED",
    eventId,
    topic,
    timestamp,
    missionId,
    ...(taskId ? { taskId } : {}),
  };
}

export interface MissionWorkReplayProjection {
  readonly resyncRequired: boolean;
  readonly latestEventId?: string;
  readonly signals: readonly MissionWorkSignal[];
}

/**
 * Project bounded in-process history into mission-safe signals after a browser cursor.
 * A missing cursor means the history was lost/rolled over; callers must refresh the
 * authoritative snapshot rather than pretending replay is complete.
 */
export function projectMissionWorkReplay(
  history: readonly unknown[],
  requestedCursor: string | undefined,
  expectedMissionId: string,
): MissionWorkReplayProjection {
  const last = history.length ? asRecord(history[history.length - 1]) : null;
  const latestEventId = typeof last?.eventId === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(last.eventId)
      ? last.eventId
      : undefined;

  if (!requestedCursor) {
    return { resyncRequired: false, latestEventId, signals: [] };
  }

  const cursorIndex = history.findIndex((rawEvent) => asRecord(rawEvent)?.eventId === requestedCursor);
  if (cursorIndex < 0) {
    return { resyncRequired: true, latestEventId, signals: [] };
  }

  const seen = new Set<string>();
  const signals: MissionWorkSignal[] = [];
  for (const rawEvent of history.slice(cursorIndex + 1)) {
    const signal = projectMissionWorkSignal(rawEvent, expectedMissionId);
    if (!signal || seen.has(signal.eventId)) continue;
    seen.add(signal.eventId);
    signals.push(signal);
  }
  return { resyncRequired: false, latestEventId, signals };
}
