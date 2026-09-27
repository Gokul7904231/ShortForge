export class AudioPostProcessor {
  /**
   * Applies normalization, silence trimming, and fade-in/out to a raw WAV PCM buffer.
   * If the buffer is not a WAV format, it passes through untouched.
   */
  static processWav(buffer: Buffer, options: {
    targetLoudnessLUFS?: number; // Target RMS scale approximation
    silenceThreshold?: number;   // Amplitude threshold for silence (0.0 to 1.0)
    fadeMs?: number;             // Fade length in milliseconds
    trimSilence?: boolean;        // Preserve physical duration when false
  } = {}): Buffer {
    // 1. Verify WAV Header
    if (buffer.length < 12 || buffer.toString("utf8", 0, 4) !== "RIFF" || buffer.toString("utf8", 8, 12) !== "WAVE") {
      // Non-WAV formats (MP3, AAC) are returned as-is
      return buffer;
    }

    // Scan subchunks to find "fmt " and "data" chunks
    let offset = 12;
    let fmtOffset = -1;
    let dataOffset = -1;
    let dataSize = 0;

    while (offset + 8 <= buffer.length) {
      const chunkId = buffer.toString("utf8", offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === "fmt ") {
        fmtOffset = offset;
      } else if (chunkId === "data") {
        dataOffset = offset;
        dataSize = chunkSize;
        break;
      }

      offset += 8 + chunkSize;
    }

    if (fmtOffset === -1 || dataOffset === -1) {
      // Fallback: If we can't find the chunks, return buffer untouched
      console.warn("[AudioPostProcessor] Could not locate 'fmt ' or 'data' chunk in WAV buffer.");
      return buffer;
    }

    const numChannels = buffer.readUInt16LE(fmtOffset + 8 + 2);
    const sampleRate = buffer.readUInt32LE(fmtOffset + 8 + 4);
    const bitsPerSample = buffer.readUInt16LE(fmtOffset + 8 + 14);

    if (bitsPerSample !== 16) {
      // Only support 16-bit PCM for custom processing
      return buffer;
    }

    // 2. Extract PCM samples
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const pcmOffset = dataOffset + 8;

    // Clamp dataSize to actual bytes available in buffer to prevent 
    // extremely large loops from stream headers (e.g. pipe:1 writes 0xFFFFFFFF)
    const actualDataSize = Math.max(0, buffer.length - pcmOffset);
    const safeDataSize = Math.min(dataSize, actualDataSize);
    const samplesCount = Math.floor(safeDataSize / blockAlign);

    const samples: number[] = [];
    for (let i = 0; i < samplesCount * numChannels; i++) {
      const sampleOffset = pcmOffset + i * bytesPerSample;
      if (sampleOffset + 2 <= buffer.length) {
        samples.push(buffer.readInt16LE(sampleOffset) / 32768);
      }
    }

    if (samples.length === 0) return buffer;

    // 3. Silence Trimming (Start & End)
    if (options.trimSilence !== false) {
    const threshold = options.silenceThreshold ?? 0.015; // ~ -36dB
    let startFrame = 0;
    let endFrame = samplesCount - 1;

    // Scan from start
    for (let i = 0; i < samplesCount; i++) {
      let isSilent = true;
      for (let c = 0; c < numChannels; c++) {
        if (Math.abs(samples[i * numChannels + c]) > threshold) {
          isSilent = false;
          break;
        }
      }
      if (!isSilent) {
        startFrame = i;
        break;
      }
    }

    // Scan from end
    for (let i = samplesCount - 1; i >= startFrame; i--) {
      let isSilent = true;
      for (let c = 0; c < numChannels; c++) {
        if (Math.abs(samples[i * numChannels + c]) > threshold) {
          isSilent = false;
          break;
        }
      }
      if (!isSilent) {
        endFrame = i;
        break;
      }
    }

    }

    // Slice samples
    const trimmedSamplesCount = endFrame - startFrame + 1;
    const trimmedSamples = samples.slice(startFrame * numChannels, (endFrame + 1) * numChannels);

    // 4. Fade In / Fade Out
    const fadeMs = options.fadeMs ?? 20; // 20ms default
    const fadeSamplesCount = Math.min(Math.floor((fadeMs / 1000) * sampleRate), Math.floor(trimmedSamplesCount / 2));

    for (let i = 0; i < fadeSamplesCount; i++) {
      const weight = i / fadeSamplesCount;
      for (let c = 0; c < numChannels; c++) {
        trimmedSamples[i * numChannels + c] *= weight;
        trimmedSamples[(trimmedSamplesCount - 1 - i) * numChannels + c] *= weight;
      }
    }

    // 5. Loudness Normalization (LUFS/RMS scale approximation)
    let sumSquares = 0;
    for (const sample of trimmedSamples) {
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / trimmedSamples.length) || 0.0001;
    const targetLUFSMultiplier = 0.15; // Target around -16 LUFS / 15% RMS scale
    let scale = targetLUFSMultiplier / rms;

    // Peak limit to avoid digital clipping
    let maxVal = 0;
    for (const sample of trimmedSamples) {
      const val = Math.abs(sample * scale);
      if (val > maxVal) maxVal = val;
    }
    if (maxVal > 0.95) {
      scale = 0.95 / (maxVal / scale);
    }

    for (let i = 0; i < trimmedSamples.length; i++) {
      trimmedSamples[i] *= scale;
    }

    // 6. Rebuild WAV Buffer using a clean standard 44-byte header
    const outDataSize = trimmedSamplesCount * blockAlign;
    const headerSize = 44;
    const outBuffer = Buffer.alloc(headerSize + outDataSize);

    // Write standard 44-byte WAV header
    outBuffer.write("RIFF", 0, 4, "ascii");
    outBuffer.writeUInt32LE(headerSize + outDataSize - 8, 4); // File size - 8
    outBuffer.write("WAVE", 8, 4, "ascii");
    outBuffer.write("fmt ", 12, 4, "ascii");
    outBuffer.writeUInt32LE(16, 16); // Subchunk1Size
    outBuffer.writeUInt16LE(1, 20); // AudioFormat: 1 for PCM
    outBuffer.writeUInt16LE(numChannels, 22);
    outBuffer.writeUInt32LE(sampleRate, 24);
    outBuffer.writeUInt32LE(sampleRate * blockAlign, 28); // ByteRate
    outBuffer.writeUInt16LE(blockAlign, 32);
    outBuffer.writeUInt16LE(bitsPerSample, 34);
    outBuffer.write("data", 36, 4, "ascii");
    outBuffer.writeUInt32LE(outDataSize, 40);

    // Write samples back
    for (let i = 0; i < trimmedSamples.length; i++) {
      const sample16 = Math.max(-32768, Math.min(32767, Math.round(trimmedSamples[i] * 32768)));
      outBuffer.writeInt16LE(sample16, headerSize + i * bytesPerSample);
    }

    return outBuffer;
  }
}
export default AudioPostProcessor;
