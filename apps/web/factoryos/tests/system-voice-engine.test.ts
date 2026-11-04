import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import { VoiceFabric, assertPrimaryAudioArtifact } from "../core/voice/VoiceFabric";

describe("SystemVoiceEngine Integration", () => {
  it("synthesizes genuine audible speech as a PRIMARY artifact with physical ffprobe validation", async () => {
    const fabric = new VoiceFabric();
    const artifact = await fabric.synthesize(
      "ShortForge host primary voice synthesis operational and verified.",
      "profile_host_narrator"
    );

    expect(artifact.success).toBe(true);
    expect(artifact.qualityClass).toBe("PRIMARY");
    expect(artifact.isFallback).toBe(false);
    expect(artifact.provider).toBe("SYSTEM");
    expect(artifact.durationSeconds).toBeGreaterThan(1.0);
    expect(artifact.byteLength).toBeGreaterThan(10000);
    expect(fs.existsSync(artifact.localPath)).toBe(true);

    assertPrimaryAudioArtifact(artifact);
  });
});
