import fs from "fs";
import path from "path";
import crypto from "crypto";

export class VoiceCacheClass {
  private cacheDir: string;

  constructor() {
    this.cacheDir = path.resolve(process.cwd(), "data", "voice-cache");
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * Generates a strict SHA-256 hash based on the parameters to prevent stale cache entries.
   */
  getHash(params: {
    text: string;
    profileId: string;
    providerId: string;
    modelId: string;
    language: string;
    sampleRate: number;
    emotion: string;
    rendererVersion: string;
    voiceVersion: string;
    targetDurationMs?: number;
    timingMode?: string;
  }): string {
    const hashInput = [
      params.text,
      params.profileId,
      params.providerId,
      params.modelId,
      params.language,
      String(params.sampleRate),
      params.emotion,
      params.rendererVersion,
      params.voiceVersion,
      params.targetDurationMs == null ? "" : String(params.targetDurationMs),
      params.timingMode || ""
    ].join("|");
    return crypto.createHash("sha256").update(hashInput).digest("hex");
  }

  get(hash: string): Buffer | null {
    const cachePath = path.join(this.cacheDir, `${hash}.wav`);
    if (fs.existsSync(cachePath)) {
      try {
        const buffer = fs.readFileSync(cachePath);
        if (buffer && buffer.length > 0) {
          console.log(`[VoiceCache] CACHE HIT for hash: ${hash.slice(0, 8)}`);
          return buffer;
        }
      } catch {}
    }
    return null;
  }

  set(hash: string, buffer: Buffer) {
    const cachePath = path.join(this.cacheDir, `${hash}.wav`);
    fs.writeFileSync(cachePath, buffer);
    console.log(`[VoiceCache] CACHE WRITE complete for hash: ${hash.slice(0, 8)}`);
  }

  getCachePath(hash: string): string {
    return path.join(this.cacheDir, `${hash}.wav`);
  }
}

export const VoiceCache = new VoiceCacheClass();
export default VoiceCache;
