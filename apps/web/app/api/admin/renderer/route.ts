import { NextResponse } from "next/server";
import { LocalRenderAdapter } from "@/factoryos/core/render/LocalRenderAdapter";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const adapter = LocalRenderAdapter.getInstance();
    const health = await adapter.healthCheck();

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      health
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to check renderer health"
    }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "doctor") {
      const adapter = LocalRenderAdapter.getInstance();
      const health = await adapter.healthCheck();
      return NextResponse.json({ success: true, health });
    }

    return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
