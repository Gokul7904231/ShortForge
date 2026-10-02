/**
 * FactoryOS Wave 1 — Mission Collaboration Contracts
 *
 * Product layer only:
 * - shared human/agent collaboration
 * - mission-scoped threads
 * - room membership
 * - mission canvas projection
 *
 * This layer never authorizes physical execution. FGC/AEF/F07 remain authoritative.
 */

export type CollaborationParticipantType = "HUMAN" | "AGENT" | "SYSTEM";
export type RoomMemberRole = "MANAGER" | "MEMBER";
export type AgentResponseMode = "JOINS_CONVERSATION" | "MENTION_ONLY";
export type RoomMessageKind = "MESSAGE" | "HANDOFF" | "STATUS" | "SYSTEM";

export interface CollaborationActor {
  readonly actorId: string;
  readonly displayName: string;
  readonly type: CollaborationParticipantType;
  readonly workspaceRole?: "VIEWER" | "EDITOR" | "ADMIN" | "OWNER";
}

export interface MissionRoomParticipant {
  readonly participantId: string;
  readonly displayName: string;
  readonly type: CollaborationParticipantType;
  readonly role: RoomMemberRole;
  readonly responseMode?: AgentResponseMode;
  readonly specialization?: string;
  readonly joinedAt: string;
  readonly addedBy: string;
  readonly active: boolean;
}

export interface MissionRoomCanvas {
  readonly goal: string;
  readonly objective: string;
  readonly constraints: string[];
  readonly owner: string;
  readonly status: string;
  readonly progressPercent: number;
  readonly definitionOfDone: Array<{
    id: string;
    description: string;
    satisfied: boolean;
  }>;
  readonly workingNotes: string;
  readonly decisions: string[];
  readonly risks: string[];
  readonly updatedAt: string;
}

export interface MissionRoom {
  readonly roomId: string;
  readonly missionId: string;
  readonly workspaceId: string;
  name: string;
  description: string;
  readonly ownerId: string;
  readonly createdAt: string;
  updatedAt: string;
  archived: boolean;
  version: number;
  participants: MissionRoomParticipant[];
  canvas: MissionRoomCanvas;
}

export interface MissionRoomMessage {
  readonly messageId: string;
  readonly roomId: string;
  readonly missionId: string;
  readonly authorId: string;
  readonly authorName: string;
  readonly authorType: CollaborationParticipantType;
  readonly kind: RoomMessageKind;
  readonly body: string;
  readonly createdAt: string;
  readonly threadId?: string;
  readonly taskId?: string;
  readonly mentions: string[];
  readonly metadata?: Record<string, unknown>;
}

export interface MissionRoomSnapshot {
  readonly room: MissionRoom | null;
  readonly mission: Record<string, unknown> | null;
  readonly messages: MissionRoomMessage[];
  readonly tasks: Array<Record<string, unknown>>;
}

export interface MissionRoomCreateInput {
  readonly name?: string;
  readonly description?: string;
}

export interface MissionRoomMessageInput {
  readonly body: string;
  readonly threadId?: string;
  readonly taskId?: string;
  readonly kind?: RoomMessageKind;
}

export interface MissionRoomParticipantInput {
  readonly participantId: string;
  readonly displayName: string;
  readonly type: CollaborationParticipantType;
  readonly responseMode?: AgentResponseMode;
  readonly specialization?: string;
}

export interface MissionRoomCanvasUpdate {
  readonly workingNotes?: string;
  readonly decisions?: string[];
  readonly risks?: string[];
}
