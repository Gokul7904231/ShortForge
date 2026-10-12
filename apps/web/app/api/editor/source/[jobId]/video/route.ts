import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import { verifyAuthAndRole } from "@/lib/auth/auth";
import { isAdminUser } from "@/lib/auth/roles";
import { readJobManifest } from "@/lib/jobs-history";
import { ContentAddressedStore } from "@/factoryos/core/compute/cas/ContentAddressedStore";
import { ArtifactResolver } from "@/factoryos/core/rendering/ArtifactResolver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Authenticated byte-range streaming for editor source assets.
 *
 * The generic media route predates editor ownership checks. The editor uses
 * this route so job IDs are not sufficient to read another creator's source.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const user = await verifyAuthAndRole(request, "VIEWER");
    const { jobId } = await params;
    if (!jobId || !/^[a-zA-Z0-9_-]{1,128}$/.test(jobId)) {
      return NextResponse.json({ error: "Invalid job identifier." }, { status: 400 });
    }

    const job = await readJobManifest(jobId);
    const source = job?.editorSource;
    if (!job || job.status !== "completed" || !source) {
      return NextResponse.json({ error: "Editor source not found." }, { status: 404 });
    }
    if (job.userId !== user.uid && !isAdminUser(user.role)) {
      return NextResponse.json({ error: "Editor source not found." }, { status: 404 });
    }
    if (
      source.ownerId !== job.userId ||
      source.sourceKind !== "FLATTENED_MP4" ||
      !/^[a-f0-9]{64}$/i.test(source.sha256)
    ) {
      return NextResponse.json({ error: "Editor source ownership record is invalid." }, { status: 403 });
    }

    const cas = ContentAddressedStore.getInstance();
    const artifact = cas.getByHash(source.sha256.toLowerCase());
    if (!artifact?.uri || artifact.sha256 !== source.sha256.toLowerCase() || !fs.existsSync(artifact.uri)) {
      return NextResponse.json({ error: "Editor source bytes are unavailable." }, { status: 404 });
    }

    const stat = fs.statSync(artifact.uri);
    if (
      !stat.isFile() ||
      stat.size <= 0 ||
      stat.size > ArtifactResolver.MAX_DOWNLOAD_BYTES ||
      stat.size !== source.byteLength
    ) {
      return NextResponse.json({ error: "Editor source byte length failed validation." }, { status: 422 });
    }

    // Verify the real bytes before serving. A CAS file path/filename alone is not proof.
    const actualSha256 = await ContentAddressedStore.computeFileSha256(artifact.uri);
    if (actualSha256 !== source.sha256.toLowerCase()) {
      return NextResponse.json({ error: "Editor source integrity check failed." }, { status: 422 });
    }

    const headers = {
      "Content-Type": "video/mp4",
      "Accept-Ranges": "bytes",
      "Content-Disposition": "inline",
      "Content-Length": String(stat.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "ETag": '"' + actualSha256 + '"',
    };

    const range = request.headers.get("range");
    if (!range) {
      return new NextResponse(fs.createReadStream(artifact.uri) as any, {
        status: 200,
        headers,
      });
    }

    // Support one standard byte range (including suffix ranges); fail closed on malformed/multipart requests.
    const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!match || (!match[1] && !match[2])) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          "Content-Range": "bytes */" + stat.size,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
        },
      });
    }

    let start: number;
    let end: number;
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        return new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": "bytes */" + stat.size, "Accept-Ranges": "bytes" },
        });
      }
      start = Math.max(0, stat.size - suffixLength);
      end = stat.size - 1;
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : stat.size - 1;
    }

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      start >= stat.size ||
      end >= stat.size
    ) {
      return new NextResponse(null, {
        status: 416,
        headers: { "Content-Range": "bytes */" + stat.size, "Accept-Ranges": "bytes" },
      });
    }

    const chunkSize = end - start + 1;
    return new NextResponse(fs.createReadStream(artifact.uri, { start, end }) as any, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(chunkSize),
        "Content-Range": "bytes " + start + "-" + end + "/" + stat.size,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message.includes("FORBIDDEN") ? 403 : message.includes("Unauthorized") || message.includes("Session") ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
