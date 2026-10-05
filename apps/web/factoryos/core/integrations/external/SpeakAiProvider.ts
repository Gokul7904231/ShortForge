import { randomUUID } from "node:crypto";
import type { VideoTranscript, VideoTranscriptSegment } from "./VideoResearchContracts";

export interface SpeakAiMediaStatus {
  readonly providerId: "SPEAK_AI";
  readonly mediaId: string;
  readonly state: string;
  readonly processingProgress?: number;
  readonly requestId: string;
  readonly retrievedAt: string;
}

function retryable(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

async function parseJsonResponse(
  response: Response,
  operation: string,
): Promise<{ payload: any; requestId: string }> {
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      "Speak AI " +
        operation +
        " returned HTTP " +
        response.status +
        (body ? ": " + body.slice(0, 400) : ""),
    );
  }
  try {
    return {
      payload: JSON.parse(body),
      requestId:
        typeof JSON.parse(body)?.data?.requestId === "string"
          ? JSON.parse(body).data.requestId
          : "speak_" + randomUUID().slice(0, 10),
    };
  } catch {
    throw new Error("Speak AI returned malformed JSON.");
  }
}

function normalizeSegments(value: unknown): VideoTranscriptSegment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((segment) => {
    if (!segment || typeof segment !== "object") return [];
    const item = segment as Record<string, unknown>;
    const text =
      typeof item.text === "string"
        ? item.text.trim()
        : typeof item.content === "string"
          ? item.content.trim()
          : "";
    if (!text) return [];

    const start = Number(item.start ?? item.startTime ?? item.startSeconds ?? 0);
    const duration = Number(
      item.duration ?? item.durationSeconds ?? item.length ?? 0,
    );

    return [{
      startSeconds: Number.isFinite(start) && start >= 0 ? start : 0,
      durationSeconds:
        Number.isFinite(duration) && duration >= 0 ? duration : 0,
      text,
    }];
  });
}

export class SpeakAiProvider {
  readonly id = "SPEAK_AI" as const;

  private accessToken = "";
  private refreshToken = "";
  private accessTokenExpiresAt = 0;

  private apiKey(): string {
    return process.env.SPEAK_AI_API_KEY?.trim() || "";
  }

  private baseUrl(): string {
    return (
      process.env.SPEAK_AI_BASE_URL?.trim() ||
      "https://api.speakai.co/v1"
    ).replace(/\/+$/, "");
  }

  private async authenticate(): Promise<void> {
    const apiKey = this.apiKey();
    if (!apiKey) throw new Error("SPEAK_AI_API_KEY is not configured.");
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt) return;

    if (this.refreshToken) {
      try {
        const response = await fetch(
          this.baseUrl() + "/auth/refreshToken",
          {
            method: "POST",
            headers: {
              "x-speakai-key": apiKey,
              "x-access-token": this.accessToken,
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({ refreshToken: this.refreshToken }),
            signal: AbortSignal.timeout(15_000),
          },
        );

        if (response.ok) {
          const payload = await response.json();
          const data = payload?.data;
          if (
            typeof data?.accessToken === "string" &&
            typeof data?.refreshToken === "string"
          ) {
            this.accessToken = data.accessToken;
            this.refreshToken = data.refreshToken;
            this.accessTokenExpiresAt = Date.now() + 75 * 60_000;
            return;
          }
        }
      } catch {
        // Fall through to fresh authentication.
      }
    }

    const response = await fetch(
      this.baseUrl() + "/auth/accessToken",
      {
        method: "POST",
        headers: {
          "x-speakai-key": apiKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      throw new Error(
        "Speak AI authentication returned HTTP " +
          response.status +
          ".",
      );
    }

    const payload = await response.json();
    const data = payload?.data;
    if (
      typeof data?.accessToken !== "string" ||
      typeof data?.refreshToken !== "string"
    ) {
      throw new Error("Speak AI authentication response is missing token fields.");
    }

    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.accessTokenExpiresAt = Date.now() + 75 * 60_000;
  }

  private headers(): Record<string, string> {
    const apiKey = this.apiKey();
    if (!apiKey || !this.accessToken) {
      throw new Error("Speak AI authentication has not been established.");
    }
    return {
      "x-speakai-key": apiKey,
      "x-access-token": this.accessToken,
      Accept: "application/json",
    };
  }

  async status(mediaId: string): Promise<SpeakAiMediaStatus> {
    if (!mediaId.trim()) throw new Error("Speak AI mediaId is required.");
    await this.authenticate();

    const response = await fetch(
      this.baseUrl() + "/media/status/" + encodeURIComponent(mediaId),
      {
        headers: this.headers(),
        signal: AbortSignal.timeout(15_000),
      },
    );

    if (!response.ok) {
      throw new Error(
        "Speak AI status returned HTTP " +
          response.status +
          ".",
      );
    }

    const payload = await response.json();
    const data = payload?.data ?? payload;
    return {
      providerId: this.id,
      mediaId,
      state:
        typeof data?.state === "string"
          ? data.state
          : typeof data?.status === "string"
            ? data.status
            : "UNKNOWN",
      processingProgress:
        Number.isFinite(Number(data?.processingProgress))
          ? Number(data.processingProgress)
          : undefined,
      requestId:
        typeof payload?.requestId === "string"
          ? payload.requestId
          : "speak_status_" + randomUUID().slice(0, 10),
      retrievedAt: new Date().toISOString(),
    };
  }

  async transcript(mediaId: string): Promise<VideoTranscript> {
    if (!mediaId.trim()) throw new Error("Speak AI mediaId is required.");
    await this.authenticate();

    const response = await fetch(
      this.baseUrl() + "/media/transcript/" + encodeURIComponent(mediaId),
      {
        headers: this.headers(),
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      const retry =
        response.status === 429 || response.status >= 500;
      const error = new Error(
        "Speak AI transcript returned HTTP " +
          response.status +
          (body ? ": " + body.slice(0, 400) : ""),
      );
      Object.assign(error, { isRetryable: retry });
      throw error;
    }

    let payload: any;
    try {
      payload = await response.json();
    } catch {
      throw new Error("Speak AI transcript returned malformed JSON.");
    }

    const data = payload?.data ?? payload;
    const transcriptRoot =
      Array.isArray(data?.transcript)
        ? data.transcript
        : Array.isArray(data?.segments)
          ? data.segments
          : [];

    const segments = normalizeSegments(transcriptRoot);
    if (!segments.length) {
      throw new Error(
        "Speak AI transcript response did not contain timestamped transcript segments.",
      );
    }

    const language =
      typeof data?.language === "string" ? data.language : "unknown";

    return {
      providerId: this.id,
      videoId:
        typeof data?.metadata?.videoId === "string"
          ? data.metadata.videoId
          : "",
      sourceUrl:
        typeof data?.metadata?.sourceUrl === "string"
          ? data.metadata.sourceUrl
          : "",
      language,
      sourceKind: "SPEECH_TO_TEXT",
      autoGenerated:
        typeof data?.is_generated === "boolean"
          ? data.is_generated
          : undefined,
      segments,
      text: segments.map((segment) => segment.text).join(" ").trim(),
      providerRequestId:
        typeof payload?.requestId === "string"
          ? payload.requestId
          : "speak_transcript_" + randomUUID().slice(0, 10),
      retrievedAt: new Date().toISOString(),
    };
  }
}
