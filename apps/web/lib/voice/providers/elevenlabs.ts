import { VoiceProvider } from "../voice-provider";

export class ElevenLabsProvider implements VoiceProvider {
  id = "elevenlabs";
  name = "ElevenLabs Premium";
  version = "1.0.0";
  supportsStreaming = true;
  supportsSSML = false;
  supportsEmotion = true;
  supportsVoiceCloning = true;
  supportsLanguages = ["en", "es", "fr", "de", "it", "ja", "zh", "hi"];
  timingCapabilities = {
    exactDuration: false,
    speedControl: false,
    ssmlBreaks: false,
    wordTimestamps: false,
    sentenceTimestamps: false,
    characterTimestamps: false,
    phonemeTimestamps: false,
    postStretchSafe: true,
    pitchPreservingStretch: false,
    deterministicDuration: false,
  } as const;

  private apiKey = process.env.ELEVENLABS_API_KEY || "";

  async health(): Promise<{ online: boolean; latencyMs: number; error?: string; cpu?: number; memory?: number }> {
    const t0 = Date.now();
    if (!this.apiKey || this.apiKey.includes("YOUR_") || this.apiKey.includes("your_")) {
      return { online: false, latencyMs: 0, error: "API key missing or placeholder" };
    }
    try {
      const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
        method: "GET",
        headers: { "xi-api-key": this.apiKey },
        signal: AbortSignal.timeout(3000)
      });
      const latencyMs = Date.now() - t0;
      if (res.ok) {
        return { online: true, latencyMs, cpu: 1, memory: 20 };
      }
      return { online: false, latencyMs, error: `HTTP ${res.status}` };
    } catch (err: any) {
      return { online: false, latencyMs: Date.now() - t0, error: err.message };
    }
  }

  async benchmark(): Promise<{ latencyMs: number; coldStartMs: number; warmStartMs: number; wordsPerSec: number; rtf: number }> {
    const start = Date.now();
    try {
      await this.synthesize("Test", { voiceId: "21m00Tcm4TlvDq8ikWAM" });
      const duration = Date.now() - start;
      return {
        latencyMs: duration,
        coldStartMs: duration,
        warmStartMs: duration,
        wordsPerSec: 6.0,
        rtf: parseFloat((duration / 1200).toFixed(2))
      };
    } catch {
      return { latencyMs: 0, coldStartMs: 0, warmStartMs: 0, wordsPerSec: 0, rtf: 0 };
    }
  }

  async synthesize(text: string, options: {
    voiceId: string;
    modelId?: string;
    speed?: number;
  }): Promise<Buffer> {
    if (!this.apiKey) {
      throw new Error("ElevenLabs API Key is not configured.");
    }

    const voice = options.voiceId || "21m00Tcm4TlvDq8ikWAM";
    const model = options.modelId || "eleven_multilingual_v2";

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": this.apiKey
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!res.ok) {
      throw new Error(`ElevenLabs synthesis failed: HTTP ${res.status}`);
    }

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

export const elevenlabsProvider = new ElevenLabsProvider();
