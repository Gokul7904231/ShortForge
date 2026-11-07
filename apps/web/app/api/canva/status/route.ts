import { NextRequest, NextResponse } from "next/server";
import { CanvaConnectionManager } from "@/lib/canva/CanvaConnectionManager";
import { verifySession } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    let userId = "creator";
    try {
      const { user } = await verifySession(req);
      if (user && user.uid) {
        userId = user.uid;
      }
    } catch {}

    const status = await CanvaConnectionManager.getSanitizedStatus(userId);
    return NextResponse.json({ success: true, ...status });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, connected: false, error: err.message },
      { status: 500 }
    );
  }
}
