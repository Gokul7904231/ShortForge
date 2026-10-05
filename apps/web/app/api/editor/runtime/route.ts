import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRole } from "@/lib/auth/auth";
import { getEditorRuntime } from "@/lib/editor-runtime-server";
import type { CompositionIR } from "@/factoryos/core/timeline/CompositionIR";
import type { EditorCommand } from "@/factoryos/core/editor/EditorContracts";

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value) throw new Error(`EDITOR_${name.toUpperCase()}_REQUIRED`);
  return value;
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
      const session = {
        sessionId,
        compositionId: composition.compositionId,
        revision: 0,
        mode: "EDIT" as const,
        actor: { kind: "HUMAN" as const, id: user.uid },
      };
      const document = await runtime.open(session, composition);
      return NextResponse.json({ success: true, document, actor: session.actor });
    }

    const sessionId = requireString(body.sessionId, "sessionId");
    await runtime.resume({
      sessionId,
      compositionId: requireString(body.compositionId || request.nextUrl.searchParams.get("compositionId"), "compositionId"),
      revision: Number.isInteger(Number(body.expectedRevision)) ? Number(body.expectedRevision) : 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: user.uid },
    });

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
