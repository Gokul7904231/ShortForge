import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { ContentAddressedStore } from "@/factoryos/core/compute/cas/ContentAddressedStore";
import { getEditorRuntime } from "@/lib/editor-runtime-server";
import type { CompositionIR } from "@/factoryos/core/timeline/CompositionIR";
import type { EditorCommand } from "@/factoryos/core/editor/EditorContracts";

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`EDITOR_${name.toUpperCase()}_REQUIRED`);
  return value;
}

function assertCompositionOwner(document: EditorDocument, user: { uid: string; role: string }) {
  const ownerId = document.composition.metadata.extensions?.ownerId;
  if (typeof ownerId !== "string" || (ownerId !== user.uid && !isAdminUser(user.role))) {
    throw new Error("EDITOR_COMPOSITION_FORBIDDEN");
  }
}

/** Browser-originated compositions may reference only verified CAS media, never filesystem paths or arbitrary URLs. */
function assertCompositionSourcesOwned(
  composition: CompositionIR,
  user: { uid: string; role: string },
) {
  const isAdmin = isAdminUser(user.role);
  const cas = ContentAddressedStore.getInstance();
  const validateSource = (src: string | undefined, required: boolean, label: string) => {
    if (!src) {
      if (required) throw new Error("EDITOR_SOURCE_CAS_URI_REQUIRED:" + label);
      return;
    }
    const match = /^cas:\/\/([a-f0-9]{64})$/i.exec(src);
    if (!match) throw new Error("EDITOR_SOURCE_CAS_URI_REQUIRED:" + label);
    const ref = cas.getByHash(match[1]!.toLowerCase());
    if (!ref || !ref.uri || !fs.existsSync(ref.uri)) throw new Error("EDITOR_SOURCE_CAS_NOT_FOUND:" + label);
    if (!isAdmin && ref.metadata?.importedBy !== user.uid) {
      throw new Error("EDITOR_SOURCE_CAS_FORBIDDEN:" + label);
    }
  };

  for (const track of composition.tracks || []) {
    for (const clip of track.clips || []) {
      const requiresSource = clip.kind === "VIDEO" || clip.kind === "IMAGE" || clip.kind === "MOTION_CANVAS";
      validateSource(clip.src, requiresSource, clip.id || track.id);
    }
  }
  for (const audio of composition.audio || []) {
    validateSource(audio.src, true, audio.id);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuthAndRole(request, "VIEWER");
    const compositionId = requireString(request.nextUrl.searchParams.get("compositionId"), "compositionId");
    const sessionId = requireString(request.nextUrl.searchParams.get("sessionId"), "sessionId");
    const runtime = await getEditorRuntime();
    const document = await runtime.resume({
      sessionId,
      compositionId,
      revision: 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: user.uid },
    });
    assertCompositionOwner(document, user);
    assertCompositionSourcesOwned(document.composition, user);

    return NextResponse.json({
      success: true,
      document,
      actor: { kind: "HUMAN", id: user.uid },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("NOT_FOUND") ? 404 : message.includes("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuthAndRole(request, "EDITOR");
    const body = await request.json();
    const operation = requireString(body.operation, "operation");
    const runtime = await getEditorRuntime();

    if (operation === "open") {
      const composition = body.composition as CompositionIR;
      const sessionId = requireString(body.sessionId, "sessionId");
      if (!composition || typeof composition.compositionId !== "string") {
        throw new Error("EDITOR_COMPOSITION_REQUIRED");
      }
      const declaredOwner = composition.metadata?.extensions?.ownerId;
      if (typeof declaredOwner === "string" && declaredOwner !== user.uid && !isAdminUser(user.role)) {
        throw new Error("EDITOR_COMPOSITION_FORBIDDEN");
      }
      assertCompositionSourcesOwned(composition, user);
      const ownedComposition: CompositionIR = {
        ...composition,
        metadata: {
          ...composition.metadata,
          extensions: { ...(composition.metadata?.extensions || {}), ownerId: user.uid },
        },
      };
      const session = {
        sessionId,
        compositionId: ownedComposition.compositionId,
        revision: 0,
        mode: "EDIT" as const,
        actor: { kind: "HUMAN" as const, id: user.uid },
      };
      const document = await runtime.open(session, ownedComposition);
      assertCompositionOwner(document, user);
      assertCompositionSourcesOwned(document.composition, user);
      return NextResponse.json({ success: true, document, actor: session.actor });
    }

    const sessionId = requireString(body.sessionId, "sessionId");
    const resumedDocument = await runtime.resume({
      sessionId,
      compositionId: requireString(body.compositionId || request.nextUrl.searchParams.get("compositionId"), "compositionId"),
      revision: Number.isInteger(Number(body.expectedRevision)) ? Number(body.expectedRevision) : 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: user.uid },
    });
    assertCompositionOwner(resumedDocument, user);
    assertCompositionSourcesOwned(resumedDocument.composition, user);

    switch (operation) {
      case "apply": {
        const expectedRevision = Number(body.expectedRevision);
        const command = body.command as EditorCommand;
        const receipt = await runtime.apply({
          commandId:
            typeof body.commandId === "string" && body.commandId
              ? body.commandId
              : crypto.randomUUID(),
          sessionId,
          actor: { kind: "HUMAN", id: user.uid },
          expectedRevision,
          command,
        });
        return NextResponse.json({ success: receipt.accepted, receipt });
      }
      case "undo":
        return NextResponse.json({ success: true, receipt: await runtime.undo(sessionId) });
      case "redo":
        return NextResponse.json({ success: true, receipt: await runtime.redo(sessionId) });
      case "checkpoint":
        return NextResponse.json({
          success: true,
          checkpoint: await runtime.checkpoint(
            sessionId,
            typeof body.reason === "string" ? body.reason : undefined,
          ),
        });
      case "restore":
        return NextResponse.json({
          success: true,
          receipt: await runtime.restore(sessionId, requireString(body.checkpointId, "checkpointId")),
        });
      case "preview": {
        const preview = await runtime.preview(
          sessionId,
          typeof body.timestampSeconds === "number" ? body.timestampSeconds : 0,
        );
        return NextResponse.json({
          success: true,
          preview: {
            ...preview,
            previewUrl: `/api/editor/preview/${preview.previewId}`,
          },
        });
      }
      case "history":
        return NextResponse.json({ success: true, history: await runtime.listHistory(sessionId) });
      case "operations":
        return NextResponse.json({ success: true, operations: await runtime.listOperations(sessionId) });
      case "checkpoints":
        return NextResponse.json({ success: true, checkpoints: await runtime.listCheckpoints(sessionId) });
      default:
        throw new Error(`EDITOR_OPERATION_UNSUPPORTED:${operation}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("READ_ONLY") || message.includes("FORBIDDEN") ? 403 : message.includes("NOT_FOUND") ? 404 : 400;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
