/**
 * FactoryOS Wave 1 — Mission Collaboration Store
 *
 * Durable product-facing collaboration state. It intentionally sits beside
 * the execution kernel; it does not replace MissionManager, FGC, AEF, or F07.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { Db, Collection } from "mongodb";
import type { Mission } from "../contracts/MissionContracts";
import type { DurableEventBus } from "../events/DurableEventBus";
import type {
  AgentResponseMode,
  CollaborationActor,
  MissionRoom,
  MissionRoomCanvas,
  MissionRoomCanvasUpdate,
  MissionRoomMessage,
  MissionRoomMessageInput,
  MissionRoomParticipant,
  MissionRoomParticipantInput,
  MissionRoomSnapshot,
} from "./MissionCollaborationContracts";

interface CollaborationRepository {
  getRoom(missionId: string): Promise<MissionRoom | null>;
  saveRoom(room: MissionRoom): Promise<void>;
  listMessages(roomId: string, limit?: number, threadId?: string): Promise<MissionRoomMessage[]>;
  saveMessage(message: MissionRoomMessage): Promise<void>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function extractKnownMentions(body: string, participants: MissionRoomParticipant[]): string[] {
  const tokens = [...body.matchAll(/@([a-zA-Z0-9_-]+)/g)].map((match) => normalizeToken(match[1]));
  if (tokens.length === 0) return [];

  const resolved = new Set<string>();
  for (const participant of participants) {
    const id = normalizeToken(participant.participantId);
    const name = normalizeToken(participant.displayName);
    if (tokens.includes(id) || tokens.includes(name)) {
      resolved.add(participant.participantId);
    }
  }
  return [...resolved];
}

function buildCanvas(mission: Mission, previous?: MissionRoomCanvas): MissionRoomCanvas {
  return {
    goal: mission.goal,
    objective: mission.objective,
    constraints: [...mission.constraints],
    owner: mission.owner,
    status: mission.status,
    progressPercent: mission.progress?.percentComplete || 0,
    definitionOfDone: (mission.definitionOfDone || []).map((item) => ({
      id: item.id,
      description: item.description,
      satisfied: item.satisfied,
    })),
    workingNotes: previous?.workingNotes || "",
    decisions: previous?.decisions ? [...previous.decisions] : [],
    risks: previous?.risks ? [...previous.risks] : [],
    updatedAt: nowIso(),
  };
}

class InMemoryCollaborationRepository implements CollaborationRepository {
  private rooms = new Map<string, MissionRoom>();
  private messages = new Map<string, MissionRoomMessage[]>();

  async getRoom(missionId: string): Promise<MissionRoom | null> {
    const room = this.rooms.get(missionId);
    return room ? clone(room) : null;
  }

  async saveRoom(room: MissionRoom): Promise<void> {
    this.rooms.set(room.missionId, clone(room));
  }

  async listMessages(roomId: string, limit = 100, threadId?: string): Promise<MissionRoomMessage[]> {
    let messages = this.messages.get(roomId) || [];
    if (threadId !== undefined) {
      messages = messages.filter((m) => m.threadId === threadId);
    }
    return clone(messages.slice(-Math.max(1, Math.min(limit, 200))));
  }

  async saveMessage(message: MissionRoomMessage): Promise<void> {
    const existing = this.messages.get(message.roomId) || [];
    if (!existing.some((item) => item.messageId === message.messageId)) {
      existing.push(clone(message));
      this.messages.set(message.roomId, existing.slice(-500));
    }
  }
}

class DiskCollaborationRepository implements CollaborationRepository {
  constructor(private readonly baseDir: string) {
    fs.mkdirSync(path.join(baseDir, "mission_rooms", "messages"), { recursive: true });
  }

  private roomFile(missionId: string): string {
    return path.join(this.baseDir, "mission_rooms", missionId + ".json");
  }

  private messageDir(roomId: string): string {
    const dir = path.join(this.baseDir, "mission_rooms", "messages", roomId);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async getRoom(missionId: string): Promise<MissionRoom | null> {
    const file = this.roomFile(missionId);
    if (!fs.existsSync(file)) return null;
    try {
      return JSON.parse(fs.readFileSync(file, "utf8")) as MissionRoom;
    } catch {
      return null;
    }
  }

  async saveRoom(room: MissionRoom): Promise<void> {
    const file = this.roomFile(room.missionId);
    const tmp = file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(room, null, 2), "utf8");
    fs.renameSync(tmp, file);
  }

  async listMessages(roomId: string, limit = 100, threadId?: string): Promise<MissionRoomMessage[]> {
    const dir = this.messageDir(roomId);
    const files = fs.readdirSync(dir).filter((file) => file.endsWith(".json"));
    const rows: MissionRoomMessage[] = [];
    for (const file of files) {
      try {
        const item = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as MissionRoomMessage;
        if (threadId === undefined || item.threadId === threadId) rows.push(item);
      } catch {
        // Ignore a corrupt non-authoritative collaboration projection.
      }
    }
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return rows.slice(-Math.max(1, Math.min(limit, 200)));
  }

  async saveMessage(message: MissionRoomMessage): Promise<void> {
    const file = path.join(this.messageDir(message.roomId), message.messageId + ".json");
    fs.writeFileSync(file, JSON.stringify(message, null, 2), "utf8");
  }
}

class MongoCollaborationRepository implements CollaborationRepository {
  private readonly rooms: Collection<MissionRoom & { _id?: unknown }>;
  private readonly messages: Collection<MissionRoomMessage & { _id?: unknown }>;

  constructor(db: Db) {
    this.rooms = db.collection("mission_rooms");
    this.messages = db.collection("mission_room_messages");
  }

  async getRoom(missionId: string): Promise<MissionRoom | null> {
    const doc = await this.rooms.findOne({ missionId });
    if (!doc) return null;
    const { _id, ...rest } = doc;
    return clone(rest as MissionRoom);
  }

  async saveRoom(room: MissionRoom): Promise<void> {
    await this.rooms.replaceOne({ missionId: room.missionId }, clone(room), { upsert: true });
  }

  async listMessages(roomId: string, limit = 100, threadId?: string): Promise<MissionRoomMessage[]> {
    const query: Record<string, unknown> = { roomId };
    if (threadId !== undefined) query.threadId = threadId;
    const docs = await this.messages.find(query).sort({ createdAt: -1 }).limit(Math.max(1, Math.min(limit, 200))).toArray();
    return docs.reverse().map(({ _id, ...rest }) => rest as MissionRoomMessage);
  }

  async saveMessage(message: MissionRoomMessage): Promise<void> {
    await this.messages.replaceOne({ messageId: message.messageId }, clone(message), { upsert: true });
  }
}

export interface MissionCollaborationStoreOptions {
  readonly eventBus?: DurableEventBus;
  readonly workspaceId?: string;
  readonly mongoDb?: Db;
  readonly diskPath?: string;
}

export class MissionCollaborationStore {
  private readonly repository: CollaborationRepository;
  private readonly eventBus?: DurableEventBus;
  private readonly workspaceId: string;

  constructor(options: MissionCollaborationStoreOptions = {}) {
    this.eventBus = options.eventBus;
    this.workspaceId = options.workspaceId || "factoryos";
    if (options.mongoDb) {
      this.repository = new MongoCollaborationRepository(options.mongoDb);
    } else if (options.diskPath) {
      this.repository = new DiskCollaborationRepository(options.diskPath);
    } else {
      this.repository = new InMemoryCollaborationRepository();
    }
  }

  async getRoom(missionId: string): Promise<MissionRoom | null> {
    return this.repository.getRoom(missionId);
  }

  async ensureRoom(
    mission: Mission,
    actor: CollaborationActor,
    createInput: { name?: string; description?: string } = {},
  ): Promise<MissionRoom> {
    const existing = await this.repository.getRoom(mission.missionId);
    if (existing) {
      const projected = {
        ...existing,
        canvas: buildCanvas(mission, existing.canvas),
        updatedAt: nowIso(),
      };
      await this.repository.saveRoom(projected);
      return clone(projected);
    }

    const timestamp = nowIso();
    const manager: MissionRoomParticipant = {
      participantId: actor.actorId,
      displayName: actor.displayName,
      type: actor.type,
      role: "MANAGER",
      joinedAt: timestamp,
      addedBy: actor.actorId,
      active: true,
    };

    const room: MissionRoom = {
      roomId: `room_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
      missionId: mission.missionId,
      workspaceId: this.workspaceId,
      name: createInput.name?.trim() || mission.goal.slice(0, 72),
      description: createInput.description?.trim() || "Shared mission workspace for humans and FactoryOS agents.",
      ownerId: actor.actorId,
      createdAt: timestamp,
      updatedAt: timestamp,
      archived: false,
      version: 1,
      participants: [manager, ...this.defaultAgentParticipants(timestamp, actor.actorId)],
      canvas: buildCanvas(mission),
    };

    await this.repository.saveRoom(room);
    await this.publish("MISSION_ROOM_CREATED", {
      roomId: room.roomId,
      missionId: room.missionId,
      actorId: actor.actorId,
    });
    return clone(room);
  }

  private defaultAgentParticipants(joinedAt: string, addedBy: string): MissionRoomParticipant[] {
    const agents: Array<{
      id: string;
      name: string;
      specialization: string;
      responseMode: AgentResponseMode;
    }> = [
      { id: "overseer", name: "Overseer", specialization: "Factory command and mission orchestration", responseMode: "JOINS_CONVERSATION" },
      { id: "ascalon", name: "Ascalon", specialization: "Cognitive synthesis and bounded decision support", responseMode: "JOINS_CONVERSATION" },
      { id: "research-slayer", name: "Research Slayer", specialization: "Research, evidence discovery, and source triage", responseMode: "MENTION_ONLY" },
      { id: "creative-slayer", name: "Creative Slayer", specialization: "Creative direction and asset planning", responseMode: "MENTION_ONLY" },
      { id: "rendering-healer", name: "Rendering Healer", specialization: "F06/Fabric repair and bounded recovery", responseMode: "MENTION_ONLY" },
      { id: "validator", name: "Validator", specialization: "Independent verification and proof", responseMode: "MENTION_ONLY" },
    ];

    return agents.map((agent) => ({
      participantId: agent.id,
      displayName: agent.name,
      type: "AGENT",
      role: "MEMBER",
      responseMode: agent.responseMode,
      specialization: agent.specialization,
      joinedAt,
      addedBy,
      active: true,
    }));
  }

  canReadRoom(room: MissionRoom, actor: CollaborationActor): boolean {
    if (actor.workspaceRole === "OWNER" || actor.workspaceRole === "ADMIN") return true;
    return room.participants.some((p) => p.active && p.type === "HUMAN" && p.participantId === actor.actorId);
  }

  canManageRoom(room: MissionRoom, actor: CollaborationActor): boolean {
    if (actor.workspaceRole === "OWNER" || actor.workspaceRole === "ADMIN") return true;
    const participant = room.participants.find((p) => p.active && p.participantId === actor.actorId);
    return participant?.type === "HUMAN" && participant.role === "MANAGER";
  }

  async addParticipant(
    missionId: string,
    input: MissionRoomParticipantInput,
    actor: CollaborationActor,
  ): Promise<MissionRoom> {
    const room = await this.repository.getRoom(missionId);
    if (!room) throw new Error("Mission room does not exist.");
    if (!this.canManageRoom(room, actor)) throw new Error("Room management permission required.");

    const existing = room.participants.find((p) => p.participantId === input.participantId);
    if (existing) {
      const updated = {
        ...room,
        participants: room.participants.map((p) =>
          p.participantId === input.participantId ? { ...p, active: true } : p
        ),
        updatedAt: nowIso(),
        version: room.version + 1,
      };
      await this.repository.saveRoom(updated);
      return clone(updated);
    }

    const participant: MissionRoomParticipant = {
      participantId: input.participantId,
      displayName: input.displayName,
      type: input.type,
      role: "MEMBER",
      responseMode: input.responseMode,
      specialization: input.specialization,
      joinedAt: nowIso(),
      addedBy: actor.actorId,
      active: true,
    };

    const updated = {
      ...room,
      participants: [...room.participants, participant],
      updatedAt: nowIso(),
      version: room.version + 1,
    };
    await this.repository.saveRoom(updated);
    await this.publish("MISSION_ROOM_PARTICIPANT_ADDED", {
      roomId: updated.roomId,
      missionId,
      participantId: participant.participantId,
      participantType: participant.type,
      actorId: actor.actorId,
    });
    return clone(updated);
  }

  async appendMessage(
    mission: Mission,
    actor: CollaborationActor,
    input: MissionRoomMessageInput,
  ): Promise<MissionRoomMessage> {
    const room = await this.repository.getRoom(mission.missionId);
    if (!room) throw new Error("Mission room does not exist.");
    if (!this.canReadRoom(room, actor)) throw new Error("Mission room access denied.");

    const body = input.body.trim();
    if (!body) throw new Error("Message body cannot be empty.");
    if (body.length > 8000) throw new Error("Message exceeds the 8000 character collaboration limit.");

    const message: MissionRoomMessage = {
      messageId: `msg_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
      roomId: room.roomId,
      missionId: mission.missionId,
      authorId: actor.actorId,
      authorName: actor.displayName,
      authorType: actor.type,
      kind: input.kind || "MESSAGE",
      body,
      createdAt: nowIso(),
      threadId: input.threadId,
      taskId: input.taskId,
      mentions: extractKnownMentions(body, room.participants),
    };

    await this.repository.saveMessage(message);
    const updatedRoom = { ...room, updatedAt: message.createdAt, version: room.version + 1 };
    await this.repository.saveRoom(updatedRoom);

    await this.publish("MISSION_ROOM_MESSAGE", {
      roomId: room.roomId,
      missionId: mission.missionId,
      messageId: message.messageId,
      actorId: actor.actorId,
      mentions: message.mentions,
      threadId: message.threadId,
      taskId: message.taskId,
    });
    return clone(message);
  }

  async updateCanvas(
    mission: Mission,
    actor: CollaborationActor,
    update: MissionRoomCanvasUpdate,
  ): Promise<MissionRoom> {
    const room = await this.repository.getRoom(mission.missionId);
    if (!room) throw new Error("Mission room does not exist.");
    if (!this.canManageRoom(room, actor)) throw new Error("Room management permission required.");

    const updatedCanvas: MissionRoomCanvas = {
      ...room.canvas,
      workingNotes: update.workingNotes !== undefined ? update.workingNotes.slice(0, 10000) : room.canvas.workingNotes,
      decisions: update.decisions ? update.decisions.slice(0, 50).map((item) => item.slice(0, 1000)) : room.canvas.decisions,
      risks: update.risks ? update.risks.slice(0, 50).map((item) => item.slice(0, 1000)) : room.canvas.risks,
      updatedAt: nowIso(),
    };

    const updatedRoom = {
      ...room,
      canvas: updatedCanvas,
      updatedAt: updatedCanvas.updatedAt,
      version: room.version + 1,
    };
    await this.repository.saveRoom(updatedRoom);
    await this.publish("MISSION_ROOM_CANVAS_UPDATED", {
      roomId: room.roomId,
      missionId: mission.missionId,
      actorId: actor.actorId,
    });
    return clone(updatedRoom);
  }

  async getSnapshot(mission: Mission, actor: CollaborationActor, limit = 100): Promise<MissionRoomSnapshot> {
    const room = await this.repository.getRoom(mission.missionId);
    if (!room) {
      return {
        room: null,
        mission: clone(mission) as unknown as Record<string, unknown>,
        messages: [],
        tasks: (mission.tasks || []).map((task) => clone(task) as unknown as Record<string, unknown>),
      };
    }
    if (!this.canReadRoom(room, actor)) throw new Error("Mission room access denied.");

    return {
      room: clone(room),
      mission: clone(mission) as unknown as Record<string, unknown>,
      messages: await this.repository.listMessages(room.roomId, limit),
      tasks: (mission.tasks || []).map((task) => clone(task) as unknown as Record<string, unknown>),
    };
  }

  async getThread(mission: Mission, actor: CollaborationActor, threadId: string, limit = 100): Promise<MissionRoomMessage[]> {
    const room = await this.repository.getRoom(mission.missionId);
    if (!room) throw new Error("Mission room does not exist.");
    if (!this.canReadRoom(room, actor)) throw new Error("Mission room access denied.");
    return this.repository.listMessages(room.roomId, limit, threadId);
  }

  private async publish(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(type, payload, {
      source: "mission_collaboration_store",
      correlationId: String(payload.roomId || payload.missionId || randomUUID()),
    });
  }
}
