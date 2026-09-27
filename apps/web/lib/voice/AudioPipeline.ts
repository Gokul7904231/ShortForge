import fs from "fs";
import path from "path";
import crypto from "crypto";
import { FFmpegService } from "../core/FFmpegService";
import { MediaInspector, AudioMetadata } from "../core/MediaInspector";
import { AudioPostProcessor } from "./audio-processor";
import { VoiceCache } from "./voice-cache";
import { CheckpointDB } from "../core/CheckpointDB";

export type AudioFormat = "wav" | "mp3" | "ogg" | "flac" | "aac" | "unknown";

export class AudioPipelineClass {
  
  /**
   * Main entry point to process a raw synthesis buffer into a validated, canonical WAV asset.
   */
  async process(params: {
    rawBuffer: Buffer;
    cacheHash: string;
    jobId: string;
    outputPath: string;
    providerId: string;
    providerName: string;
    providerVersion: string;
    speedMultiplier?: number;
    preserveDurationForTiming?: boolean;
    allowSilence?: boolean;
  }): Promise<{ audioBuffer: Buffer; cacheHit: boolean; metadata: AudioMetadata }> {
    
    // 1. Check Cache first
    let audioBuffer = VoiceCache.get(params.cacheHash);
    if (audioBuffer) {
      console.log(`[AudioPipeline] Cache hit for hash: ${params.cacheHash.slice(0, 8)}`);
      
      // Save cache hit file to target path
      this.writeToDisk(params.outputPath, audioBuffer);
      
      // Perform validation check to extract duration/channels
      const metadata = await this.stepValidate(audioBuffer);
      
      return { audioBuffer, cacheHit: true, metadata };
    }

    console.log(`[AudioPipeline] Processing raw voice buffer (size: ${params.rawBuffer.length} bytes)...`);

    // 2. Step: Inspect
    const format = this.stepInspect(params.rawBuffer);
    if (format === "unknown") {
      const sample = params.rawBuffer.slice(0, 100).toString("utf8");
      throw new Error(
        `[AudioPipeline] Rejected audio stream: Unknown or corrupted media container headers. Size: ${params.rawBuffer.length} bytes. Sample: "${sample}"`
      );
    }
    console.log(`[AudioPipeline] Step 1 (Inspect) -> Detected format: ${format.toUpperCase()}`);

    // 3. Step: Decode / Convert to Canonical WAV
    console.log(`[AudioPipeline] Step 2 (Decode/Convert) -> Canonicalizing to PCM Mono 44.1kHz WAV...`);
    const canonicalWav = await this.stepDecode(params.rawBuffer, params.speedMultiplier || 1.0);

    // 4. Step: Normalize & Trim
    console.log(`[AudioPipeline] Step 3 (Normalize/Post-process) -> Applying LUFS/RMS scaling and silence trim...`);
    const normalizedWav = this.stepNormalize(canonicalWav, Boolean(params.preserveDurationForTiming));

    // 5. Step: Validate
    console.log(`[AudioPipeline] Step 4 (Validate) -> Querying ffprobe for stream verification...`);
    const metadata = await this.stepValidate(normalizedWav);
    if (!metadata.isValid) {
      throw new Error(`[AudioPipeline] ffprobe validation failed: Output WAV has invalid streams or 0 duration.`);
    }
    
    // Enforce canonical WAV constraints
    if (metadata.channels !== 1 || metadata.sampleRate !== 44100 || metadata.codec !== "pcm_s16le") {
      throw new Error(
        `[AudioPipeline] ffprobe validation failed: Expected mono pcm_s16le @ 44.1kHz. Got ${metadata.channels} channels, ${metadata.sampleRate}Hz, ${metadata.codec}.`
      );
    }
    console.log(
      `[AudioPipeline] Stream verified: duration=${metadata.duration.toFixed(2)}s, codec=${metadata.codec}, rate=${metadata.sampleRate}Hz`
    );

    // Verify non-silent content
    const hasAudibleContent = this.verifyRms(normalizedWav, 0.005);
    if (!hasAudibleContent && !params.allowSilence) {
      throw new Error(`[AudioPipeline] Content validation failed: Output WAV contains only silence (RMS below 0.005).`);
    }

    // 6. Save to disk and update cache
    this.writeToDisk(params.outputPath, normalizedWav);
    VoiceCache.set(params.cacheHash, normalizedWav);

    // 7. Step: Register Asset
    console.log(`[AudioPipeline] Step 5 (Register) -> Inserting into CheckpointDB...`);
    this.stepRegister({
      jobId: params.jobId,
      outputPath: params.outputPath,
      buffer: normalizedWav,
      cacheHash: params.cacheHash,
      duration: metadata.duration,
      providerId: params.providerId,
      providerName: params.providerName,
      providerVersion: params.providerVersion,
      allowSilence: params.allowSilence
    });

    return { audioBuffer: normalizedWav, cacheHit: false, metadata };
  }

  /**
   * Inspects magic bytes at the beginning of the buffer to identify format
   */
  stepInspect(buffer: Buffer): AudioFormat {
    if (buffer.length < 4) return "unknown";

    // WAV: "RIFF" ... "WAVE"
    if (buffer.toString("utf8", 0, 4) === "RIFF" && buffer.toString("utf8", 8, 12) === "WAVE") {
      return "wav";
    }
    // OGG: "OggS"
    if (buffer.toString("utf8", 0, 4) === "OggS") {
      return "ogg";
    }
    // FLAC: "fLaC"
    if (buffer.toString("utf8", 0, 4) === "fLaC") {
      return "flac";
    }
    // MP3 with ID3 header
    if (buffer.toString("utf8", 0, 3) === "ID3") {
      return "mp3";
    }
    // MP3 frame sync (without ID3)
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
      return "mp3";
    }
    // AAC (ADTS) frame sync
    if (buffer[0] === 0xff && (buffer[1] & 0xf0) === 0xf0) {
      return "aac";
    }
    // MP4/M4A ftyp check
    if (buffer.length >= 8 && buffer.toString("utf8", 4, 8) === "ftyp") {
      return "aac";
    }

    return "unknown";
  }

  /**
   * Spawns an async FFmpeg process to convert input stream to Canonical WAV buffer
   */
  async stepDecode(buffer: Buffer, speedMultiplier = 1.0): Promise<Buffer> {
    const args = ["-i", "pipe:0"];
    
    // Speed multiplier support: apply atempo filter if not 1.0 (last resort speed fallback)
    if (speedMultiplier !== 1.0) {
      args.push("-filter:a", `atempo=${speedMultiplier.toFixed(4)}`);
    }

    args.push(
      "-f", "wav",
      "-ar", "44100",
      "-ac", "1",
      "-acodec", "pcm_s16le",
      "pipe:1"
    );

    try {
      const result = await FFmpegService.runFFmpeg(args, {
        inputBuffer: buffer,
        timeoutMs: 30000
      });
      return result.stdout;
    } catch (err: any) {
      throw new Error(`[AudioPipeline] FFmpeg conversion failed during decoding: ${err.message}`);
    }
  }

  /**
   * Applies normalization, silence trimming, and fades to WAV buffer
   */
  stepNormalize(buffer: Buffer, preserveDuration = false): Buffer {
    return AudioPostProcessor.processWav(buffer, {
      silenceThreshold: 0.012, // -38dB
      fadeMs: preserveDuration ? 0 : 25,
      trimSilence: !preserveDuration
    });
  }

  /**
   * Validates metadata using ffprobe
   */
  async stepValidate(buffer: Buffer): Promise<AudioMetadata> {
    return MediaInspector.inspectAudio(buffer);
  }

  /**
   * Registers final processed audio asset in the checkpoint store database
   */
  stepRegister(params: {
    jobId: string;
    outputPath: string;
    buffer: Buffer;
    cacheHash: string;
    duration: number;
    providerId: string;
    providerName: string;
    providerVersion: string;
    allowSilence?: boolean;
  }): void {
    const assetRecord = {
      id: `asset_voice_${params.jobId}`,
      type: "audio",
      provider: params.providerId,
      prompt_hash: params.cacheHash,
      resolution: "n/a",
      sha256: crypto.createHash("sha256").update(params.buffer).digest("hex"),
      job_id: params.jobId,
      mime_type: "audio/wav",
      duration: parseFloat(params.duration.toFixed(2)),
      checksum: params.cacheHash,
      cache_status: "miss",
      version: params.providerVersion,
      source: params.providerName,
      audio_quality: params.allowSilence ? "DEGRADED_SILENT" : "NORMAL",
      path: params.outputPath
    };

    CheckpointDB.registerAsset(assetRecord);
  }

  private writeToDisk(outputPath: string, buffer: Buffer): void {
    const finalOutputDir = path.dirname(outputPath);
    if (!fs.existsSync(finalOutputDir)) {
      fs.mkdirSync(finalOutputDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, buffer);
  }

  verifyRms(buffer: Buffer, threshold = 0.005): boolean {
    if (buffer.length < 44) return false;
    let offset = 12;
    let dataOffset = -1;
    let dataSize = 0;
    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString("utf8", offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);
      if (chunkId === "data") {
        dataOffset = offset;
        dataSize = chunkSize;
        break;
      }
      offset += 8 + chunkSize;
    }
    if (dataOffset === -1) return false;
    const pcmOffset = dataOffset + 8;
    const actualDataSize = Math.max(0, buffer.length - pcmOffset);
    const safeDataSize = Math.min(dataSize, actualDataSize);
    const numSamples = Math.floor(safeDataSize / 2); // 16-bit PCM
    if (numSamples === 0) return false;

    let sumSquares = 0;
    for (let i = 0; i < numSamples; i++) {
      const sampleVal = buffer.readInt16LE(pcmOffset + i * 2) / 32768;
      sumSquares += sampleVal * sampleVal;
    }
    const rms = Math.sqrt(sumSquares / numSamples);
    console.log(`[AudioPipeline] Verified RMS: ${rms.toFixed(5)} (Threshold: ${threshold})`);
    return rms >= threshold;
  }
}

export const AudioPipeline = new AudioPipelineClass();
export default AudioPipeline;
