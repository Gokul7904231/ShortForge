import { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import { verifyAuthAndRole } from "@/lib/auth/auth";

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ previewId: string }> },
) {
  try {
    await verifyAuthAndRole(_request, "VIEWER");
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Unauthorized.", { status: 401 });
  }

  const { previewId } = await props.params;
  if (!/^preview_[a-f0-9]{24}$/.test(previewId)) {
    return new Response("Invalid preview id.", { status: 400 });
  }

  const file = path.join(
    process.cwd(),
    "apps",
    "web",
    "data",
    "previews",
    "editor-runtime",
    `${previewId}.png`,
  );
  if (!fs.existsSync(file)) {
    return new Response("Preview not found.", { status: 404 });
  }

  const body = fs.readFileSync(file);

  const headers = new Headers();
  headers.set("Content-Type", "image/png");
  headers.set("Cache-Control", "private, max-age=60");
  headers.set("X-ShortForge-Preview", "deterministic-physical");

  return new Response(body, {
    status: 200,
    headers,
  });
}
