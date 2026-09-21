import { NextRequest, NextResponse } from "next/server";
import { VoiceFabric } from "@/factoryos/core/voice/VoiceFabric";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const engineId = searchParams.get("engine") || "GEMINI";

    const fabric = new VoiceFabric();
    const profile = fabric.getProfile("profile_narrator_dramatic");
    const preflight = await fabric.preflight({
      ...profile,
      preferredEngine: engineId as any,
    });

    const isConfigured = preflight.status === "CONFIGURED";

    return NextResponse.json(
      {
        success: isConfigured,
        engineId,
        preflight,
        status: preflight.status,
      },
      { status: isConfigured ? 200 : 409 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message, status: "UNAVAILABLE" },
      { status: 500 }
    );
  }
}
