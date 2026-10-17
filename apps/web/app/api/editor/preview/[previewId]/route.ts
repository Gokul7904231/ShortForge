import { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { createHash } from "node:crypto";

import { verifyAuthAndRole } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import type { AdminUser } from "@/lib/auth/types";
import { readJobManifestAuthoritative } from "@/lib/jobs-history";
import { getEditorRuntime } from "@/lib/editor-runtime-server";
import { compileCompositionToRenderIntent } from "@/factoryos/core/editor/EditorRuntime";
import { ContentAddressedStore } from "@/factoryos/core/compute/cas/ContentAddressedStore";

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ previewId: string }> },
) {
  let user: AdminUser;
  try {
    user = await verifyAuthAndRole(_request, "VIEWER");
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unauthorized.", { status: 401 });
  }

  const { previewId } = await props.params;
  if (!/^preview_[a-f0-9]{24}$/.test(previewId)) {
    return new Response("Invalid preview id.", { status: 400 });
  }

  const compositionId = _request.nextUrl.searchParams.get("compositionId") || "";
  const sessionId = _request.nextUrl.searchParams.get("sessionId") || "";
  const timestampSeconds = Number(_request.nextUrl.searchParams.get("timestampSeconds"));
  if (
    !compositionId ||
    !sessionId ||
    !Number.isFinite(timestampSeconds) ||
    timestampSeconds < 0
  ) {
    return new Response("Preview authorization context is required.", { status: 400 });
  }

  try {
    const runtime = await getEditorRuntime();
    const document = await runtime.resume({
      sessionId,
      compositionId,
      revision: 0,
      mode: "EDIT",
      actor: { kind: "HUMAN", id: user.uid },
    });
    const extensions = document.composition.metadata.extensions || {};
    const ownerId = extensions.ownerId;
    const sourceJobId = extensions.sourceJobId;
    if (typeof ownerId !== "string" || (ownerId !== user.uid && !isAdminUser(user.role))) {
      return new Response("Preview not found.", { status: 404 });
    }
    if (typeof sourceJobId !== "string" || !sourceJobId) {
      return new Response("Preview source is not bound to a job.", { status: 403 });
    }

    const job = await readJobManifestAuthoritative(sourceJobId);
    if (
      !job ||
      (!job.editorSource && !job.editorSourcePackage) ||
      (job.userId !== user.uid && !isAdminUser(user.role)) ||
      (job.editorSourcePackage && job.editorSourcePackage.ownerId !== job.userId) ||
      (job.editorSource && job.editorSource.ownerId !== job.userId)
    ) {
      return new Response("Preview not found.", { status: 404 });
    }

    // A preview ID is derived from content and timestamp, so the ID itself is not a capability.
    // Bind every preview request to the source job's exact single-asset CAS digest.
    const allowedSourceHashes = job.editorSourcePackage
      ? new Set(job.editorSourcePackage.sourceAssetSha256s.map((sha) => sha.toLowerCase()))
      : new Set(job.editorSource ? [job.editorSource.sha256.toLowerCase()] : []);
    const sourceHashes = new Set<string>();
    const validateSource = (src: string | undefined) => {
      const match = typeof src === "string" ? /^cas:\/\/([a-f0-9]{64})$/i.exec(src) : null;
      if (!match) throw new Error("EDITOR_SOURCE_CAS_URI_REQUIRED");
      const sha = match[1]!.toLowerCase();
      if (!allowedSourceHashes.has(sha)) throw new Error("EDITOR_SOURCE_CAS_NOT_DECLARED");
      sourceHashes.add(sha);
    };
    for (const track of document.composition.tracks || []) {
      for (const clip of track.clips || []) {
        if (clip.kind === "VIDEO" || clip.kind === "IMAGE" || clip.kind === "MOTION_CANVAS") {
          validateSource(clip.src);
        }
      }
    }
    for (const audio of document.composition.audio || []) validateSource(audio.src);
    if (
      sourceHashes.size === 0 ||
      (!job.editorSourcePackage &&
        (sourceHashes.size !== 1 || !sourceHashes.has(job.editorSource!.sha256.toLowerCase())))
    ) {
      return new Response("Preview not found.", { status: 404 });
    }

    // Resolve/verify the composition's media before deriving a predictable preview id.
    const renderIntent = compileCompositionToRenderIntent(
      document.composition,
      document.revision,
      {
        width: document.composition.canvas.width,
        height: document.composition.canvas.height,
        fps: document.composition.canvas.frameRate.numerator / document.composition.canvas.frameRate.denominator,
        format: "MP4",
      },
      ContentAddressedStore.getInstance(),
    );
    const normalizedTimestamp = Math.max(
      0,
      Math.min(
        timestampSeconds,
        Math.max(0, renderIntent.durationSeconds - 1 / Math.max(1, renderIntent.fps)),
      ),
    );
    const expectedPreviewId = "preview_" + createHash("sha256")
      .update(renderIntent.sourceCompositionHashSha256 + ":" + normalizedTimestamp.toFixed(6), "utf8")
      .digest("hex")
      .slice(0, 24);
    if (expectedPreviewId !== previewId) {
      return new Response("Preview not found.", { status: 404 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Preview access failed.";
    const status = message.includes("FORBIDDEN") ? 403 : message.includes("NOT_FOUND") ? 404 : 422;
    return new Response(message, { status });
  }

  const file = path.join(process.cwd(), "data", "previews", "editor-runtime", previewId + ".png");
  if (!fs.existsSync(file)) {
    return new Response("Preview not found.", { status: 404 });
  }

  const body = fs.readFileSync(file);
  const headers = new Headers();
  headers.set("Content-Type", "image/png");
  headers.set("Cache-Control", "private, no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Security-Policy", "default-src 'none'; sandbox");
  headers.set("X-ShortForge-Preview", "deterministic-physical");

  return new Response(body, { status: 200, headers });
}
