import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import {
  computeConnectionStore,
  validateNotebookConnection,
  validateSandboxConnection,
} from "@/factoryos/core/compute/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const { user } = await verifySession(req);
    const { connectionId } = await params;
    const connection = await computeConnectionStore.getForUser(user.uid, connectionId);

    if (!connection) {
      return errorResponse(new Error("COMPUTE_CONNECTION_NOT_FOUND"), 404);
    }

    if (connection.providerFamily === "NOTEBOOK") {
      const result = await validateNotebookConnection(user.uid, connectionId);
      return NextResponse.json({ success: true, result });
    }

    if (connection.providerFamily === "SANDBOX") {
      const result = await validateSandboxConnection(user.uid, connectionId);
      return NextResponse.json({ success: true, result });
    }

    return errorResponse(
      new Error("COMPUTE_CONNECTION_VALIDATION_NOT_IMPLEMENTED:" + connection.providerId),
      409,
    );
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const { user } = await verifySession(req);
    const { connectionId } = await params;
    const deleted = await computeConnectionStore.deleteForUser(user.uid, connectionId);

    if (!deleted) {
      return errorResponse(new Error("COMPUTE_CONNECTION_NOT_FOUND"), 404);
    }

    return NextResponse.json({ success: true, connectionId });
  } catch (error) {
    return errorResponse(error, 400);
  }
}