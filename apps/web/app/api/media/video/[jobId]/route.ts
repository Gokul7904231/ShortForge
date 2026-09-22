import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { TempManager } from "@/lib/core/TempManager";

async function getVideoPath(jobId: string): Promise<string | null> {
  const root = process.cwd();
  
  // 1. Check our standard dynamic workflow engine output location first
  const tempPath = path.join(TempManager.getTempDir(jobId), "final_video.mp4");
  if (fs.existsSync(tempPath)) return tempPath;

  // 2. Check local engine directories
  const baseDir1 = path.join(/*turbopackIgnore: true*/ root, "generated", "local-ai", "output", jobId);
  const baseDir2 = path.join(/*turbopackIgnore: true*/ root, "local-ai", "output", jobId);

  const checkDirs = [baseDir1, baseDir2];

  for (const baseDir of checkDirs) {
    const finalMp4 = path.join(/*turbopackIgnore: true*/ baseDir, "final.mp4");
    if (fs.existsSync(finalMp4)) return finalMp4;

    const possible = ["final/final.mp4", "outputs/final/final.mp4", "output/final.mp4"];
    for (const rel of possible) {
      const p = path.join(/*turbopackIgnore: true*/ baseDir, rel);
      if (fs.existsSync(p)) return p;
    }
  }

  // 3. Check authoritative Job Manifest (FactoryOS & Compute Fabric renders)
  try {
    const { readJobManifest } = await import("@/lib/jobs-history");
    const manifest = await readJobManifest(jobId);
    if (manifest?.localVideoPath && fs.existsSync(manifest.localVideoPath)) {
      return manifest.localVideoPath;
    }
    if (manifest?.videoUrl && !manifest.videoUrl.startsWith("http") && !manifest.videoUrl.startsWith("/api") && fs.existsSync(manifest.videoUrl)) {
      return manifest.videoUrl;
    }
    if (manifest?.artifactSha256) {
      const shard = manifest.artifactSha256.substring(0, 2);
      const possibleCas = [
        path.join(root, "data", "cas_storage", shard, `${manifest.artifactSha256}.mp4`),
        path.join(root, "data", "cas_storage", shard, manifest.artifactSha256),
        path.join(root, "apps", "web", "data", "cas_storage", shard, `${manifest.artifactSha256}.mp4`),
      ];
      for (const p of possibleCas) {
        if (fs.existsSync(p)) return p;
      }
    }
  } catch {}

  // 4. Check CAS storage directly by hash
  const cleanHash = jobId.replace(/^cas_/, "");
  if (/^[a-f0-9]{64}$/i.test(cleanHash)) {
    const shard = cleanHash.substring(0, 2);
    const possibleCas = [
      path.join(root, "data", "cas_storage", shard, `${cleanHash}.mp4`),
      path.join(root, "data", "cas_storage", shard, cleanHash),
      path.join(root, "apps", "web", "data", "cas_storage", shard, `${cleanHash}.mp4`),
    ];
    for (const p of possibleCas) {
      if (fs.existsSync(p)) return p;
    }
  }

  // 5. Check FactoryOS render cache checkpoints
  try {
    const checkpointDirs = [
      path.join(root, ".factoryos_render_cache", "checkpoints"),
      path.join(root, "apps", "web", ".factoryos_render_cache", "checkpoints"),
    ];
    for (const cpDir of checkpointDirs) {
      if (fs.existsSync(cpDir)) {
        const files = fs.readdirSync(cpDir);
        const matching = files.find(f => f.includes(jobId) && f.endsWith(".json"));
        if (matching) {
          const cpData = JSON.parse(fs.readFileSync(path.join(cpDir, matching), "utf-8"));
          if (cpData.output_path && fs.existsSync(cpData.output_path)) {
            return cpData.output_path;
          }
        }
      }
    }
  } catch {}

  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  if (!jobId) return NextResponse.json({ error: "Missing jobId" }, { status: 400 });

  const videoPath = await getVideoPath(jobId);
  if (!videoPath || !fs.existsSync(videoPath)) {
    return NextResponse.json(
      { error: "Video not found", jobId },
      { status: 404 }
    );
  }

  const stat = fs.statSync(videoPath);
  const contentType = "video/mp4";

  const range = _req.headers.get("range");
  if (!range) {
    const fileStream = fs.createReadStream(videoPath);
    return new NextResponse(fileStream as any, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Content-Disposition": "inline",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  }

  const parts = range.replace(/bytes=/, "").split("-");
  const start = parseInt(parts[0], 10);
  const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;

  if (start >= stat.size || end >= stat.size) {
    return new NextResponse(null, {
      status: 416,
      headers: {
        "Content-Range": `bytes */${stat.size}`,
      },
    });
  }

  const chunksize = (end - start) + 1;
  const fileStream = fs.createReadStream(videoPath, { start, end });

  return new NextResponse(fileStream as any, {
    status: 206,
    headers: {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": String(chunksize),
      "Content-Type": contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "no-cache",
    },
  });
}

