import { NextRequest, NextResponse } from "next/server";
import { CanvaConnectionManager } from "@/lib/canva/CanvaConnectionManager";
import { verifySession } from "@/lib/auth/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let userId = "creator";
    try {
      const { user } = await verifySession(req);
      if (user && user.uid) {
        userId = user.uid;
      }
    } catch {}

    await CanvaConnectionManager.disconnect(userId);
    return NextResponse.json({ success: true, message: "Canva connection disconnected successfully." });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to disconnect Canva." },
      { status: 500 }
    );
  }
}
