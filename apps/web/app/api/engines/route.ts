import { NextResponse } from "next/server";
import { EngineRegistry } from "@/lib/core/EngineRegistry";
import { EngineDiscovery } from "@/lib/core/EngineDiscovery";
import { WorkflowLoader } from "@/content-engines/_loader";
import { verifySession } from "@/lib/auth/auth";
import { can } from "@/lib/auth/capability-policy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    let userContext: { uid?: string; role?: string } = { role: "USER" };
    try {
      const { user } = await verifySession(req);
      if (user) {
        userContext = { uid: user.uid, role: user.role };
      }
    } catch {}

    const engines = await EngineRegistry.getAllEngines();

    return NextResponse.json({
      success: true,
      engines: engines.map((e) => ({
        id: e.engineId,
        name: e.name,
        description: e.description,
        version: e.manifestVersion,
        renderProfile: e.generationConfig.renderProfile,
        category: e.category,
        status: e.status.toLowerCase(),
        visibility: e.visibility,
        ownerId: e.ownerId,
        totalRenders: 0,
        lastRun: "Never",
        avgScore: 0,
        retention: e.defaults.retentionPolicy || "72 hours",
        autoPublish: [],
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { user } = await verifySession(req);
    if (!user || !can(user, "ENGINE_MANAGEMENT")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Engine management requires Pro or Admin tier." },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      name,
      description,
      workflow,
      voice,
      prompt,
      sceneRules,
      category,
      configuration,
      contracts,
    } = body;
    if (!name || !name.trim()) {
      return NextResponse.json({ success: false, error: "Engine name is required." }, { status: 400 });
    }

    const created = await EngineRegistry.createEngine(
      {
        name,
        description,
        category: category || "OTHER",
        generationConfig: {
          renderProfile: workflow === "fast-facts" ? "FAST_SHORTS" : "FAST_QUIZ",
          workflow: workflow || "custom-workflow",
        },
        prompt,
        sceneRules,
        configuration,
        contracts,
      },
      { uid: user.uid, role: user.role }
    );

    return NextResponse.json({ success: true, id: created.engineId });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { user } = await verifySession(req);
    if (!user || !can(user, "ENGINE_MANAGEMENT")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized. Engine management requires Pro or Admin tier." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
    }
    EngineDiscovery.deleteDynamicEngine(id);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
