import { NextResponse } from "next/server";
import path from "path";

import fs from "fs";
import { authorizeJobRequest } from "@/lib/auth/job-access";

// jobId is used in filesystem paths and in ownership lookups.
const JOB_ID_PATTERN = /^[a-zA-Z0-9_-]{1,80}$/;

function getThumbPath(jobId: string) {
  const root = process.cwd();
  
  // Use Turbopack ignore comments to prevent bundling these dynamic paths
  const baseDir1 = path.join(/*turbopackIgnore: true*/ root, "generated", "local-ai", "output", jobId);
  const baseDir2 = path.join(/*turbopackIgnore: true*/ root, "local-ai", "output", jobId);

  const checkDirs = [baseDir1, baseDir2];

  for (const baseDir of checkDirs) {
    const candidates = [
      path.join(/*turbopackIgnore: true*/ baseDir, "thumbnail.png"),
      path.join(/*turbopackIgnore: true*/ baseDir, "thumb.png"),
      path.join(/*turbopackIgnore: true*/ baseDir, "thumbnail.jpg"),
      path.join(/*turbopackIgnore: true*/ baseDir, "thumbnail.jpeg"),
      path.join(/*turbopackIgnore: true*/ baseDir, "thumbnail.webp"),
      path.join(/*turbopackIgnore: true*/ baseDir, "images", "thumbnail.png"),
      path.join(/*turbopackIgnore: true*/ baseDir, "outputs", "thumbnail.png"),
    ];

    for (const p of candidates) {
      if (fs.existsSync(p)) return p;
    }

    if (fs.existsSync(baseDir)) {
      const files = fs.readdirSync(baseDir);
      const byExt = files
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
        .map((f) => path.join(/*turbopackIgnore: true*/ baseDir, f));
      if (byExt.length) return byExt[0];
    }
  }

  // default fallback path
  return path.join(/*turbopackIgnore: true*/ baseDir1, "thumbnail.png");
}

function getContentType(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });
  if (!JOB_ID_PATTERN.test(jobId)) {
    return NextResponse.json({ error: "Thumbnail not found", jobId }, { status: 404 });
  }

  const access = await authorizeJobRequest(_req, jobId);
  if (access.status !== 200) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const thumbPath = getThumbPath(jobId);

  if (!fs.existsSync(thumbPath)) {
    return NextResponse.json({ error: "Thumbnail not found", jobId }, { status: 404 });
  }

  const stat = fs.statSync(thumbPath);
  const contentType = getContentType(thumbPath);

  // Simple streaming first (range requests later).
  const fileStream = fs.createReadStream(thumbPath);

  return new NextResponse(fileStream as any, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}

