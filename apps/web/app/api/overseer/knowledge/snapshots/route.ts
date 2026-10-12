import { NextRequest, NextResponse } from "next/server";
import { getFactoryOSController } from "@/lib/overseer/factoryos-runtime";
import { resolveCollaborationActor } from "@/lib/overseer/collaboration-auth";
import type { KnowledgeOSSnapshot, KnowledgeOSSnapshotScope } from "@/factoryos/core/knowledge/KnowledgeOSContracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ScopeResult =
  | { readonly ok: true; readonly scope: KnowledgeOSSnapshotScope }
  | { readonly ok: false };

function safeScopeId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 256 || /[\u0000-\u001F\u007F]/.test(trimmed)) return null;
  return trimmed;
}

function parseScope(scopeValue: unknown, missionValue: unknown, channelValue: unknown): ScopeResult {
  if (scopeValue === "GLOBAL") return { ok: true, scope: { scope: "GLOBAL" } };
  if (scopeValue === "MISSION") {
    const missionId = safeScopeId(missionValue);
    return missionId ? { ok: true, scope: { scope: "MISSION", missionId } } : { ok: false };
  }
  if (scopeValue === "CHANNEL") {
    const channelId = safeScopeId(channelValue);
    return channelId ? { ok: true, scope: { scope: "CHANNEL", channelId } } : { ok: false };
  }
  return { ok: false };
}

function requireKnowledgeAdmin(role?: string): void {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new Error("KNOWLEDGE_SNAPSHOT_ADMIN_REQUIRED");
  }
}

function snapshotSummary(snapshot: KnowledgeOSSnapshot) {
  return {
    sourceKind: snapshot.sourceKind,
    schemaVersion: snapshot.schemaVersion,
    selection: snapshot.selection,
    capturedAt: snapshot.capturedAt,
    contentDigest: snapshot.contentDigest,
    recordCount: snapshot.records.length,
    relationshipCount: snapshot.relationships.length,
    verificationStatus: "UNVERIFIED",
    // Hash integrity is not factual verification, authorization, or an F07 receipt.
  };
}

function statusForError(error: unknown): { status: number; message: string } {
  const message = error instanceof Error ? error.message : "";
  if (message === "UNAUTHORIZED") return { status: 401, message: "Unauthorized." };
  if (message === "KNOWLEDGE_SNAPSHOT_ADMIN_REQUIRED") return { status: 403, message: "Knowledge snapshot access requires workspace OWNER or ADMIN." };
  if (message === "KNOWLEDGEOS_SNAPSHOT_HISTORY_REVISION_NOT_FOUND") return { status: 404, message: "Snapshot revision was not found in the selected scope." };
  if (message.includes("INVALID") || message.includes("LIMIT_EXCEEDED") ||
      message.includes("SCOPE_MISMATCH") || message.includes("SOURCE_MISMATCH")) {
    return { status: 400, message: "Knowledge snapshot request failed validation." };
  }
  return { status: 500, message: "Knowledge snapshot operation failed." };
}

export async function GET(request: NextRequest) {
  try {
    const actor = await resolveCollaborationActor(request);
    requireKnowledgeAdmin(actor.workspaceRole);

    const params = request.nextUrl.searchParams;
    const parsedScope = parseScope(params.get("scope"), params.get("missionId"), params.get("channelId"));
    if (!parsedScope.ok) {
      return NextResponse.json({
        success: false,
        error: "scope must be GLOBAL, MISSION with missionId, or CHANNEL with channelId.",
      }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }

    const controller = await getFactoryOSController();
    const action = params.get("action") || "list";
    if (action === "list") {
      const rawLimit = params.get("limit");
      const limit = rawLimit === null ? 20 : Number(rawLimit);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        return NextResponse.json({ success: false, error: "limit must be an integer from 1 to 100." }, { status: 400 });
      }
      const snapshots = await controller.listKnowledgeStoreSnapshots(parsedScope.scope, limit);
      return NextResponse.json({
        success: true,
        data: snapshots.map(snapshotSummary),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "load") {
      const contentDigest = params.get("digest") || "";
      const snapshot = await controller.loadKnowledgeStoreSnapshot(parsedScope.scope, contentDigest);
      if (!snapshot) {
        return NextResponse.json({ success: false, error: "Snapshot revision was not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true, data: snapshot }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "diff") {
      const baseDigest = params.get("baseDigest") || "";
      const targetDigest = params.get("targetDigest") || "";
      const diff = await controller.diffKnowledgeStoreSnapshots(parsedScope.scope, baseDigest, targetDigest);
      return NextResponse.json({ success: true, data: diff }, { headers: { "Cache-Control": "no-store" } });
    }

    return NextResponse.json({ success: false, error: "action must be list, load, or diff." }, { status: 400 });
  } catch (error) {
    const failure = statusForError(error);
    return NextResponse.json({ success: false, error: failure.message }, {
      status: failure.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const actor = await resolveCollaborationActor(request);
    requireKnowledgeAdmin(actor.workspaceRole);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Request body must be an object." }, { status: 400 });
    }
    const input = body as Record<string, unknown>;
    if (input.operation !== "capture") {
      return NextResponse.json({ success: false, error: "operation must be capture." }, { status: 400 });
    }
    const parsedScope = parseScope(input.scope, input.missionId, input.channelId);
    if (!parsedScope.ok) {
      return NextResponse.json({
        success: false,
        error: "scope must be GLOBAL, MISSION with missionId, or CHANNEL with channelId.",
      }, { status: 400 });
    }

    const controller = await getFactoryOSController();
    const result = await controller.captureKnowledgeStoreSnapshot(parsedScope.scope);
    return NextResponse.json({
      success: true,
      data: {
        memoryId: result.memoryId,
        snapshot: snapshotSummary(result.snapshot),
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = statusForError(error);
    return NextResponse.json({ success: false, error: failure.message }, {
      status: failure.status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
