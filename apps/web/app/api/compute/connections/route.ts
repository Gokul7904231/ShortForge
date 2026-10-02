import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { computeConnectionService } from "@/factoryos/core/compute/connections";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : "Unknown error";
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await verifySession(req);
    const result = await computeConnectionService.list(user);
    return NextResponse.json({
      success: true,
      role: user.role,
      ...result,
    });
  } catch (error) {
    return errorResponse(error, 401);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user } = await verifySession(req);
    const body = (await req.json()) as {
      providerId?: string;
      displayName?: string;
      credentials?: Record<string, string>;
      metadata?: Record<string, string>;
      externalAccountId?: string;
    };

    if (!body.providerId || !body.credentials) {
      return errorResponse(new Error("COMPUTE_CONNECTION_INPUT_INVALID"), 400);
    }

    const connection = await computeConnectionService.create(user, {
      providerId: body.providerId,
      displayName: body.displayName,
      credentials: body.credentials,
      metadata: body.metadata,
      externalAccountId: body.externalAccountId,
    });

    return NextResponse.json(
      { success: true, connection },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status =
      message.includes("FORBIDDEN") ? 403 :
      message.includes("MISSING") || message.includes("INVALID") || message.includes("UNSUPPORTED") ? 400 :
      500;
    return errorResponse(error, status);
  }
}