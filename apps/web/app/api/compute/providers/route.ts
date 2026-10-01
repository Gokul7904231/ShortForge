import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/auth/auth";
import { listAvailableProviders } from "@/factoryos/core/compute/connections";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { user } = await verifySession(req);
    return NextResponse.json({
      success: true,
      role: user.role,
      providers: listAvailableProviders(user),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unauthorized",
      },
      { status: 401 },
    );
  }
}
