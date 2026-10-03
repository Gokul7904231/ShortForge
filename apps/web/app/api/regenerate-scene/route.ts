import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { LLMProvider } from "../../../ai/provider";
import { regenerateSceneAgent } from "../../../agents/scene-agent";

import { verifySession, verifyWritePermission } from "../../../lib/auth/auth";
import { prepareTreasuryModelContext } from "../../../lib/treasury-model-context";

export async function POST(req: Request) {
  try {
    const { user } = await verifySession(req);
    verifyWritePermission(user);

    const body = await req.json();

    const topic = String(body?.topic ?? "").trim();
    const style = typeof body?.style === "string" ? body.style : undefined;
    const provider = body?.provider as LLMProvider | undefined;

    const sceneId = String(body?.sceneId ?? "").trim();
    const currentScene = String(body?.currentScene ?? "").trim();

    const previousScene = typeof body?.previousScene === "string" ? body.previousScene : "";
    const nextScene = typeof body?.nextScene === "string" ? body.nextScene : "";

    const currentImagePrompt = String(body?.currentImagePrompt ?? "").trim();
    const previousImagePrompt =
      typeof body?.previousImagePrompt === "string" ? body.previousImagePrompt : "";
    const nextImagePrompt = typeof body?.nextImagePrompt === "string" ? body.nextImagePrompt : "";

    if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });
    if (!sceneId) return NextResponse.json({ error: "Missing/invalid sceneId" }, { status: 400 });

    if (!currentScene) return NextResponse.json({ error: "Missing currentScene" }, { status: 400 });
    if (!currentImagePrompt) return NextResponse.json({ error: "Missing currentImagePrompt" }, { status: 400 });

    const treasuryModel = await prepareTreasuryModelContext({
      command: "Regenerate Scene: " + topic,
      missionId: "mis_regen_scene_" + user.uid,
      taskId: "scene-regeneration-api-" + randomUUID(),
      floorId: "floor03_asset_realization",
      preferredProviderId: provider,
      subtask: "scene_regeneration",
      maxRetries: 0,
    });

    const result = await regenerateSceneAgent({
      sceneId,
      topic,
      style,
      currentScene,
      previousScene,
      nextScene,
      currentImagePrompt,
      previousImagePrompt,
      nextImagePrompt,
      provider,
      treasuryContext: treasuryModel.context,
    });

    return NextResponse.json(result);
  } catch (err: any) {
    const isForbidden = err.message?.includes("Forbidden") || err.message?.includes("Read-only access");
    const status = err.status || (isForbidden ? 403 : err.message?.includes("missing or expired") ? 401 : 500);
    return NextResponse.json(
      { error: err?.message ?? "Failed to regenerate scene" },
      { status }
    );
  }
}

