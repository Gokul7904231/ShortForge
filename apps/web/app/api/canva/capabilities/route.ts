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

    const connection = await CanvaConnectionManager.getConnection(userId);
    if (!connection) {
      return NextResponse.json({
        success: true,
        connected: false,
        capabilities: {
          canAutofill: false,
          canExport: false,
          canReadDesigns: false,
          canWriteAssets: false,
          subscriptionTier: "pro_lite",
          note: "Canva account not connected. Pro Lite subscription detected in environment.",
        },
      });
    }

    // Refresh capability probe if requested
    let caps = connection.capabilities;
    const refresh = req.nextUrl.searchParams.get("refresh") === "true";
    if (!caps || refresh) {
      caps = await CanvaConnectionManager.probeUserCapabilities(connection.accessToken);
      await CanvaConnectionManager.saveConnection(userId, {
        accessToken: connection.accessToken,
        refreshToken: connection.refreshToken,
        expiresIn: Math.max(60, Math.floor((connection.expiresAt - Date.now()) / 1000)),
        scope: connection.scope,
        userProfile: connection.userProfile,
        capabilities: caps,
      });
    }

    return NextResponse.json({
      success: true,
      connected: true,
      capabilities: caps,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
