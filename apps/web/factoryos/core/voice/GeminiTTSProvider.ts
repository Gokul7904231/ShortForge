/**
 * FactoryOS Frontier v3 — Google Gemini TTS Voice Provider
 * Specialized VOICE_GENERATION provider implementing Gemini's Audio Profile + Scene + Director's Notes architecture.
 * Uses official Gemini 3.1 Flash TTS model: gemini-3.1-flash-tts-preview
 */

import { EvidenceFactory, EvidenceRecord } from "../contracts/EvidenceRecord";

export type VoiceProviderErrorCode =
  | "VOICE_AUTHENTICATION_FAILED"
  | "VOICE_PERMISSION_DENIED"
  | "VOICE_RATE_LIMITED"
  | "VOICE_PROVIDER_BAD_REQUEST"
  | "VOICE_PROVIDER_UNAVAILABLE"
  | "VOICE_PROVIDER_TIMEOUT"
  | "VOICE_PROVIDER_PROTOCOL_ERROR"
  | "VOICE_PROVIDER_MISSING_AUDIO"
  | "VOICE_PROVIDER_INVALID_AUDIO";

export class VoiceProviderError extends Error {
  readonly code: VoiceProviderErrorCode;
  readonly httpStatus?: number;
  readonly upstreamReason?: string;

  constructor(
    message: string,
    code: VoiceProviderErrorCode,
    httpStatus?: number,
    upstreamReason?: string
  ) {
    super(`[${code}] ${message}`);
    this.name = "VoiceProviderError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.upstreamReason = upstreamReason;
  }
}

export interface GeminiTTSOptions {
  transcript: string;
  voice?: string; // e.g. "Aoede", "Charon", "Fenrir", "Kore", "Puck"
  style?: "NATURAL" | "DRAMATIC" | "ENERGETIC" | "CALM" | "STORYTELLER";
  scene?: string;
  directorNotes?: string;
  speakerConfig?: {
    isMultiSpeaker?: boolean;
    speakers?: Array<{ name: string; voice: string }>;
  };
  outputFormat?: "audio/mp3" | "audio/wav";
  timeoutMs?: number;
}

export interface GeminiTTSResult {
  audioBuffer: Buffer;
  audioBase64: string;
  durationSeconds: number;
  mimeType: string;
  provider: "google_gemini_tts";
  model: string;
  voice: string;
  providerRequestId?: string;
  evidenceRecord: EvidenceRecord<{
    promptTokens?: number;
    latencyMs: number;
    directorNotesApplied: boolean;
    audioBytes: number;
  }>;
  evidence: {
    promptTokens?: number;
    latencyMs: number;
    directorNotesApplied: boolean;
    audioBytes: number;
  };
}

export class GeminiTTSProvider {
  static readonly PREFERRED_MODEL = "gemini-3.1-flash-tts-preview";
  static readonly FALLBACK_MODELS = [
    "gemini-2.5-flash-preview-tts",
  ];

  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey?: string, baseUrl?: string) {
    this.apiKey = apiKey !== undefined ? apiKey : (process.env.GEMINI_API_KEY || "");
    this.baseUrl = baseUrl || "https://generativelanguage.googleapis.com";
  }

  /**
   * Synthesizes speech from transcript using real Gemini TTS audio generation.
   * Enforces AbortController timeout, structured semantic error mapping,
   * strict base64 validation, and physical payload integrity.
   */
  async synthesizeSpeech(options: GeminiTTSOptions): Promise<GeminiTTSResult> {
    const startTime = Date.now();
    const voice = options.voice || "Puck";
    const selectedModel = GeminiTTSProvider.PREFERRED_MODEL;

    if (!this.apiKey || this.apiKey.trim() === "") {
      throw new VoiceProviderError(
        "VOICE_GENERATION_UNAVAILABLE: GEMINI_API_KEY is not configured for speech synthesis.",
        "VOICE_AUTHENTICATION_FAILED"
      );
    }

    const directorPrompt = `[Audio Profile: High-clarity, Studio Master]
[Scene Description: ${options.scene || "Engaging Short-Form Social Video"}]
[Voice Style: ${options.style || "NATURAL"}]
[Voice Name: ${voice}]
[Director's Notes: ${options.directorNotes || "Enunciate clearly, maintain energetic hook pacing, seamless natural pauses"}]
[Transcript]: "${options.transcript}"`;

    const controller = new AbortController();
    const timeoutMs = options.timeoutMs ?? 15000;
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = `${this.baseUrl.replace(/\/$/, "")}/v1beta/models/${selectedModel}:generateContent?key=${this.apiKey}`;
      let res: Response;

      try {
        res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            contents: [{
              parts: [{ text: directorPrompt }]
            }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voice
                  }
                }
              }
            }
          })
        });
      } catch (fetchErr: any) {
        if (fetchErr.name === "AbortError" || controller.signal.aborted) {
          throw new VoiceProviderError(
            `Gemini TTS network request timed out after ${timeoutMs}ms`,
            "VOICE_PROVIDER_TIMEOUT"
          );
        }
        throw new VoiceProviderError(
          `Gemini TTS network transport failure: ${fetchErr.message}`,
          "VOICE_PROVIDER_UNAVAILABLE"
        );
      }

      const providerRequestId = res.headers?.get?.("x-goog-request-id") || res.headers?.get?.("x-request-id") || undefined;

      if (!res.ok) {
        let rawError = "";
        let parsedError: any = null;
        try {
          rawError = await res.text();
          parsedError = JSON.parse(rawError);
        } catch {}

        const status = res.status;
        const errMessage = parsedError?.error?.message || rawError || res.statusText;
        const reason = parsedError?.error?.details?.[0]?.reason || "";

        if (status === 400) {
          if (
            reason === "API_KEY_INVALID" ||
            errMessage.includes("API_KEY_INVALID") ||
            errMessage.includes("API key not valid") ||
            errMessage.includes("key not valid")
          ) {
            throw new VoiceProviderError(
              `Gemini TTS API key rejected as invalid: ${errMessage}`,
              "VOICE_AUTHENTICATION_FAILED",
              400,
              "API_KEY_INVALID"
            );
          }
          throw new VoiceProviderError(
            `Gemini TTS API returned HTTP 400 Bad Request: ${errMessage}`,
            "VOICE_PROVIDER_BAD_REQUEST",
            400
          );
        } else if (status === 401) {
          throw new VoiceProviderError(
            `Gemini TTS API returned HTTP 401 Unauthorized: ${errMessage}`,
            "VOICE_AUTHENTICATION_FAILED",
            401
          );
        } else if (status === 403) {
          throw new VoiceProviderError(
            `Gemini TTS API returned HTTP 403 Forbidden: ${errMessage}`,
            "VOICE_PERMISSION_DENIED",
            403
          );
        } else if (status === 429) {
          throw new VoiceProviderError(
            `Gemini TTS API returned HTTP 429 Rate Limit Exceeded: ${errMessage}`,
            "VOICE_RATE_LIMITED",
            429
          );
        } else if (status >= 500) {
          throw new VoiceProviderError(
            `Gemini TTS API returned HTTP ${status} Internal Error: ${errMessage}`,
            "VOICE_PROVIDER_UNAVAILABLE",
            status
          );
        } else {
          throw new VoiceProviderError(
            `Gemini TTS API returned HTTP ${status}: ${errMessage}`,
            "VOICE_PROVIDER_UNAVAILABLE",
            status
          );
        }
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new VoiceProviderError(
          "Gemini TTS responded with malformed JSON body",
          "VOICE_PROVIDER_PROTOCOL_ERROR"
        );
      }

      if (!data || typeof data !== "object") {
        throw new VoiceProviderError(
          "Gemini TTS responded with non-object JSON payload",
          "VOICE_PROVIDER_PROTOCOL_ERROR"
        );
      }

      if (!Array.isArray(data.candidates) || data.candidates.length === 0) {
        throw new VoiceProviderError(
          "Gemini TTS response missing candidates or returned empty candidates list",
          "VOICE_PROVIDER_MISSING_AUDIO"
        );
      }

      const candidate = data.candidates[0];
      const parts = candidate?.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) {
        throw new VoiceProviderError(
          "Gemini TTS candidate content contains no parts",
          "VOICE_PROVIDER_MISSING_AUDIO"
        );
      }

      const audioPart = parts.find((p: any) => p?.inlineData?.data);
      if (!audioPart || !audioPart.inlineData) {
        throw new VoiceProviderError(
          "Gemini TTS responded without audio payload (parts contained text only)",
          "VOICE_PROVIDER_MISSING_AUDIO"
        );
      }

      const audioBase64 = audioPart.inlineData.data;
      if (typeof audioBase64 !== "string" || audioBase64.trim().length === 0) {
        throw new VoiceProviderError(
          "Gemini TTS returned empty (zero-byte) audio payload",
          "VOICE_PROVIDER_MISSING_AUDIO"
        );
      }

      const sanitizedBase64 = audioBase64.replace(/\s+/g, "");
      // Strict base64 format check: only valid base64 alphabet and length multiple of 4
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(sanitizedBase64) || sanitizedBase64.length % 4 !== 0) {
        throw new VoiceProviderError(
          "Gemini TTS returned malformed base64 encoded audio payload",
          "VOICE_PROVIDER_INVALID_AUDIO"
        );
      }

      let audioBuffer: Buffer;
      try {
        audioBuffer = Buffer.from(sanitizedBase64, "base64");
      } catch {
        throw new VoiceProviderError(
          "Failed to decode base64 audio payload from Gemini TTS",
          "VOICE_PROVIDER_INVALID_AUDIO"
        );
      }

      if (audioBuffer.byteLength === 0) {
        throw new VoiceProviderError(
          "Decoded audio buffer from Gemini TTS has 0 bytes",
          "VOICE_PROVIDER_INVALID_AUDIO"
        );
      }

      const mimeType = audioPart.inlineData.mimeType || options.outputFormat || "audio/mp3";
      const latencyMs = Date.now() - startTime;

      const evidence = EvidenceFactory.create(
        "ARTIFACT",
        `GeminiTTSProvider:${selectedModel}`,
        "SUCCESS",
        {
          latencyMs,
          directorNotesApplied: Boolean(options.directorNotes),
          audioBytes: audioBuffer.byteLength,
        },
        {
          claims: [`Generated ${audioBuffer.byteLength} bytes of raw audio in ${latencyMs}ms`],
          metadata: {
            provider: "google_gemini_tts",
            model: selectedModel,
            latencyMs,
          }
        }
      );

      const wordCount = options.transcript.split(/\s+/).filter(Boolean).length;
      const estimatedDuration = Math.max(1.5, parseFloat((wordCount / 2.5).toFixed(2)));

      return {
        audioBuffer,
        audioBase64: sanitizedBase64,
        durationSeconds: estimatedDuration,
        mimeType,
        provider: "google_gemini_tts",
        model: selectedModel,
        voice,
        providerRequestId,
        evidenceRecord: evidence,
        evidence: evidence.data as any,
      };
    } finally {
      clearTimeout(timeoutTimer);
    }
  }

  static getAvailableVoices(): Array<{ id: string; name: string; gender: string; description: string }> {
    return [
      { id: "Puck", name: "Puck (Gemini)", gender: "Male", description: "Energetic, clear narrative tone for viral shorts" },
      { id: "Charon", name: "Charon (Gemini)", gender: "Male", description: "Deep, authoritative documentary voice" },
      { id: "Kore", name: "Kore (Gemini)", gender: "Female", description: "Warm, natural educator and presenter voice" },
      { id: "Aoede", name: "Aoede (Gemini)", gender: "Female", description: "Polished, expressive storytelling voice" },
      { id: "Fenrir", name: "Fenrir (Gemini)", gender: "Male", description: "Fast-paced, bold cinematic voice" },
    ];
  }
}
