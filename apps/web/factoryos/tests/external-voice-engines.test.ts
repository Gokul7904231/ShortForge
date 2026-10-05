import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  AudexumTTSVoiceEngine,
  IBMWatsonTTSVoiceEngine,
  VoiceFabric,
  type VoiceProfile,
} from "../core/voice/VoiceFabric";

const PROFILE: VoiceProfile = {
  profileId: "test",
  name: "Test Voice",
  gender: "NEUTRAL",
  language: "en",
  pitch: 0,
  speed: 1,
  tone: "CALM",
  preferredEngine: "IBM_TTS",
};

function mockFfprobe(): void {
  VoiceFabric._spawnFn = () => {
    const proc = new EventEmitter() as any;
    proc.stdout = new EventEmitter();
    proc.stderr = new EventEmitter();
    queueMicrotask(() => {
      proc.stdout.emit(
        "data",
        Buffer.from(
          JSON.stringify({
            streams: [
              {
                codec_type: "audio",
                codec_name: "pcm_s16le",
                sample_rate: "24000",
                channels: 1,
                duration: "0.125",
              },
            ],
          }),
        ),
      );
      proc.emit("close", 0);
    });
    return proc;
  };
}

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "shortforge-audio-"));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  VoiceFabric._spawnFn = null;
});

describe("governed external TTS engines", () => {
  it("fails closed for IBM when URL or credential is absent", async () => {
    const engine = new IBMWatsonTTSVoiceEngine();
    await expect(engine.synthesize("hello", PROFILE)).rejects.toThrow(
      /IBM_TTS_URL and a live IBM credential are required/,
    );
  });

  it("uses IBM API-key authentication and the instance URL", async () => {
    vi.stubEnv("IBM_TTS_URL", "https://ibm.example.test/instances/tts");
    vi.stubEnv("IBM_TTS_API_KEY", "abcdefghijklmnopqrstuvwxyz");
    mockFfprobe();

    const payload = Buffer.from("riff-test-bytes");
    const fetchMock = vi.fn(
      async (_url: string | URL, init?: RequestInit) =>
        new Response(payload, {
          status: 200,
          headers: {
            "content-type": "audio/wav",
            "x-request-id": "ibm-req-1",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const dir = tempDir();
    try {
      const artifact = await new IBMWatsonTTSVoiceEngine().synthesize(
        "Hello ShortForge",
        PROFILE,
        dir,
      );

      const [url, init] = fetchMock.mock.calls[0]!;
      const auth = new Headers(init?.headers).get("Authorization");
      expect(String(url)).toContain(
        "https://ibm.example.test/instances/tts/v1/synthesize",
      );
      expect(String(url)).toContain("accept=audio%2Fwav");
      expect(auth).toMatch(/^Basic /);
      expect(init?.body).toBe(JSON.stringify({ text: "Hello ShortForge" }));
      expect(artifact.provider).toBe("IBM_TTS");
      expect(artifact.providerRequestId).toBe("ibm-req-1");
      expect(artifact.durationSource).toBe("PHYSICAL_FFPROBE");
      expect(artifact.qualityClass).toBe("PRIMARY");
      expect(artifact.isFallback).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prefers IBM IAM bearer auth when both credential forms exist", async () => {
    vi.stubEnv("IBM_TTS_URL", "https://ibm.example.test");
    vi.stubEnv("IBM_TTS_API_KEY", "abcdefghijklmnopqrstuvwxyz");
    vi.stubEnv("IBM_TTS_IAM_TOKEN", "iam-token-1234567890");
    mockFfprobe();

    const payload = Buffer.from("riff-test-bytes");
    const fetchMock = vi.fn(
      async (_url: string | URL, init?: RequestInit) =>
        new Response(payload, {
          status: 200,
          headers: { "content-type": "audio/wav" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const dir = tempDir();
    try {
      await new IBMWatsonTTSVoiceEngine().synthesize("hello", PROFILE, dir);
      const auth = new Headers(fetchMock.mock.calls[0]![1]?.headers).get(
        "Authorization",
      );
      expect(auth).toBe("Bearer iam-token-1234567890");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("fails closed when IBM returns non-audio content", async () => {
    vi.stubEnv("IBM_TTS_URL", "https://ibm.example.test");
    vi.stubEnv("IBM_TTS_API_KEY", "abcdefghijklmnopqrstuvwxyz");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "not audio" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    await expect(
      new IBMWatsonTTSVoiceEngine().synthesize("hello", PROFILE),
    ).rejects.toThrow(/non-audio content-type/);
  });

  it("uses Audexum bearer auth and preserves physical verification", async () => {
    vi.stubEnv("AUDEXUM_API_KEY", "audexum-live-key-123");
    vi.stubEnv("AUDEXUM_BASE_URL", "https://audexum.example.test/api");
    vi.stubEnv("AUDEXUM_VOICE_ID", "voice_test");
    vi.stubEnv("AUDEXUM_LANGUAGE", "en");
    mockFfprobe();

    const payload = Buffer.from("wav-or-mp3-test");
    const fetchMock = vi.fn(
      async (_url: string | URL, init?: RequestInit) =>
        new Response(payload, {
          status: 200,
          headers: {
            "content-type": "audio/wav",
            "request-id": "audexum-req-1",
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const dir = tempDir();
    try {
      const artifact = await new AudexumTTSVoiceEngine().synthesize(
        "Hello Audexum",
        PROFILE,
        dir,
      );
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toBe("https://audexum.example.test/api/synthesize");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer audexum-live-key-123",
      );
      expect(JSON.parse(String(init?.body))).toEqual({
        text: "Hello Audexum",
        voice: "voice_test",
        lang: "en",
        speed: 1,
        format: "wav",
      });
      expect(artifact.provider).toBe("AUDEXUM");
      expect(artifact.providerRequestId).toBe("audexum-req-1");
      expect(artifact.durationSource).toBe("PHYSICAL_FFPROBE");
      expect(artifact.byteLength).toBe(payload.byteLength);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects oversized Audexum text before network dispatch", async () => {
    vi.stubEnv("AUDEXUM_API_KEY", "audexum-live-key-123");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      new AudexumTTSVoiceEngine().synthesize("x".repeat(5001), PROFILE),
    ).rejects.toThrow(/5,000 characters/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
