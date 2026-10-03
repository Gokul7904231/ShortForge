import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { enhanceAgent } from "../../../agents/enhance-agent";
import { LLMProvider } from "../../../ai/provider";
import { ScriptSchema } from "../../../lib/schema";

import { verifySession, verifyWritePermission } from "../../../lib/auth/auth";
import { prepareTreasuryModelContext } from "../../../lib/treasury-model-context";

export async function POST(req: Request) {
  try {
    const { user } = await verifySession(req);
    verifyWritePermission(user);

    const body = await req.json();

    const draft = String(body?.draft ?? "").trim();
    const provider = body?.provider as LLMProvider | undefined;

    if (!draft) return NextResponse.json({ error: "Missing draft" }, { status: 400 });

    const treasuryModel = await prepareTreasuryModelContext({
      command: "Enhance Script",
      missionId: "mis_enhance_" + user.uid,
      taskId: "enhance-api-" + randomUUID(),
      floorId: "floor02_scripting",
      preferredProviderId: provider,
      subtask: "script_enhancement",
      maxRetries: 0,
    });

    const raw = await enhanceAgent({
      draft,
      provider,
      treasuryContext: treasuryModel.context,
    });

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return NextResponse.json(
        { error: "AI response malformed" },
        { status: 422 }
      );
    }

    const parsed = ScriptSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "AI response malformed", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    return NextResponse.json({ enhanced: parsed.data });

  } catch (err: any) {
    const isForbidden = err.message?.includes("Forbidden") || err.message?.includes("Read-only access");
    const status = err.status || (isForbidden ? 403 : err.message?.includes("missing or expired") ? 401 : 500);
    return NextResponse.json(
      { error: err?.message ?? "Failed to enhance draft" },
      { status }
    );
  }
}



