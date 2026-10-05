import { NextRequest } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";

export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ previewId: string }> },
) {
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
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=60",
      "X-ShortForge-Preview: deterministic-physical",
    },
  });
}
