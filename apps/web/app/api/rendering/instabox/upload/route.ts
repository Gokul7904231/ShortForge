import { NextRequest, NextResponse } from "next/server";
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { InstaBoxFleetRegistry } from "@/factoryos/core/compute/instabox/InstaBoxFleetRegistry";
import { ContentAddressedStore } from "@/factoryos/core/compute/cas/ContentAddressedStore";

export async function POST(request: NextRequest) {
  let tempFilePath: string | null = null;
  try {
    const registry = InstaBoxFleetRegistry.getInstance();

    // 1. Authenticate worker
    const authHeader = request.headers.get("authorization") || "";
    const customHeader = request.headers.get("x-instabox-secret") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "") || customHeader;
    const workerId = request.headers.get("x-instabox-worker-id") || "";

    if (!token || !registry.authenticateWorker(token, workerId)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Invalid InstaBox worker credentials." },
        { status: 401 },
      );
    }
    const executionToken = request.headers.get("x-execution-token") || "";
    const expectedSha256 = (request.headers.get("x-artifact-sha256") || "").toLowerCase().trim();
    const expectedByteLengthStr = request.headers.get("x-artifact-byte-length");
    const expectedByteLength = expectedByteLengthStr ? parseInt(expectedByteLengthStr, 10) : undefined;

    if (!workerId || !executionToken || !expectedSha256) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing required headers: x-instabox-worker-id, x-execution-token, and x-artifact-sha256.",
        },
        { status: 400 },
      );
    }

    // 2. Validate active lease
    const record = registry.getNodeRecordByWorkerId(workerId);
    const lease = record?.activeLease;
    if (!lease || lease.executionToken !== executionToken) {
      return NextResponse.json(
        { success: false, error: "Upload rejected: invalid or expired execution lease." },
        { status: 409 },
      );
    }

    // 3. Receive and stream bytes directly to disk with bounded memory
    if (!request.body) {
      return NextResponse.json(
        { success: false, error: "Upload rejected: empty request body." },
        { status: 400 },
      );
    }

    const tempDir = path.join(process.cwd(), "data", "cas_storage", "tmp");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    tempFilePath = path.join(tempDir, `upload_${lease.jobId}_${Date.now()}.mp4`);
    const fileWriteStream = fs.createWriteStream(tempFilePath);
    const hash = crypto.createHash("sha256");

    let totalBytesReceived = 0;
    const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500 MB bound

    const reader = request.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          totalBytesReceived += value.length;
          if (totalBytesReceived > MAX_UPLOAD_BYTES) {
            fileWriteStream.close();
            throw new Error(`Upload payload exceeds maximum allowable limit (${MAX_UPLOAD_BYTES} bytes).`);
          }
          hash.update(value);
          if (!fileWriteStream.write(Buffer.from(value))) {
            await new Promise((r) => fileWriteStream.once("drain", r));
          }
        }
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        fileWriteStream.end(() => resolve());
        fileWriteStream.on("error", reject);
      });
    }

    if (totalBytesReceived === 0) {
      return NextResponse.json(
        { success: false, error: "Upload rejected: 0 bytes received." },
        { status: 400 },
      );
    }

    if (expectedByteLength !== undefined && totalBytesReceived !== expectedByteLength) {
      return NextResponse.json(
        {
          success: false,
          error: `Byte-length mismatch: expected ${expectedByteLength}, received ${totalBytesReceived}.`,
        },
        { status: 422 },
      );
    }

    // 4. Compute physical SHA-256 over received bytes
    const actualSha256 = hash.digest("hex");
    if (actualSha256 !== expectedSha256) {
      return NextResponse.json(
        {
          success: false,
          error: `SHA-256 mismatch: declared=${expectedSha256}, calculated=${actualSha256}.`,
        },
        { status: 422 },
      );
    }

    // 5. Commit staged temporary file to CAS
    const cas = ContentAddressedStore.getInstance();
    const artifactRef = await cas.putFile(tempFilePath, "output_mp4", "video/mp4", {
      jobId: lease.jobId,
      executionId: lease.executionId,
      workerId,
      provider: "INSTABOX",
      uploadedAt: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      artifactId: artifactRef.artifactId,
      sha256: artifactRef.sha256,
      byteLength: artifactRef.byteLength,
      casUri: artifactRef.uri,
      durableUri: artifactRef.uri,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Internal server error" },
      { status: 500 },
    );
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {}
    }
  }
}
