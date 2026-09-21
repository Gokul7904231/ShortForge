import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { execSync } from "node:child_process";
import type { PhysicalArtifactRecord, ArtifactKind } from "../contracts/artifact.contract";

export class ArtifactObserver {
  public static inspectPhysicalFile(
    localPath: string,
    kind: ArtifactKind,
    producerFloor: string,
    consumerFloor?: string
  ): PhysicalArtifactRecord {
    const exists = fs.existsSync(localPath);
    if (!exists) {
      return {
        id: `art_missing_${Math.random().toString(36).substring(2, 8)}`,
        kind,
        localPath,
        byteLength: 0,
        sha256: "",
        existsPhysically: false,
        producerFloor,
        consumerFloor,
      };
    }

    const stat = fs.statSync(localPath);
    const buffer = fs.readFileSync(localPath);
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");

    let formatDetails: Record<string, unknown> | undefined;

    if (kind === "MP4_VIDEO") {
      try {
        const cmd = `ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,duration:format=duration,size -of json "${localPath}"`;
        const out = execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
        formatDetails = JSON.parse(out);
      } catch (err: any) {
        formatDetails = { ffprobeError: err?.message };
      }
    } else if (kind === "WAV_AUDIO") {
      try {
        // Read 44-byte RIFF header
        const riff = buffer.toString("ascii", 0, 4);
        const wave = buffer.toString("ascii", 8, 12);
        const sampleRate = buffer.readUInt32LE(24);
        const byteRate = buffer.readUInt32LE(28);
        const durationSeconds = byteRate > 0 ? (stat.size - 44) / byteRate : 0;

        formatDetails = {
          isRiffWave: riff === "RIFF" && wave === "WAVE",
          sampleRate,
          durationSeconds: Math.round(durationSeconds * 10) / 10,
        };
      } catch (e: any) {
        formatDetails = { audioParseError: e?.message };
      }
    }

    return {
      id: `art_${crypto.createHash("md5").update(localPath).digest("hex").substring(0, 10)}`,
      kind,
      localPath,
      byteLength: stat.size,
      sha256,
      existsPhysically: true,
      producerFloor,
      consumerFloor,
      formatDetails,
      verifiedAt: new Date().toISOString(),
    };
  }
}
