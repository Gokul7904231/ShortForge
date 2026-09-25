import { describe, expect, it } from "vitest";
import { RenderFabric } from "../core/fabric/RenderFabric";
import type { LocalRenderIntent } from "../core/render/LocalRenderAdapter";

const LIVE_AMD = process.env.RUN_LIVE_AMD === "1";

describe.skipIf(!LIVE_AMD)("AMD live render smoke", () => {
  it(
    "renders a physical MP4 through F06 RenderFabric -> ComputeRouter -> AMD",
    async () => {
      const secret = process.env.AMD_WORKER_SECRET;
      const url = process.env.AMD_WORKER_URL;

      expect(url, "AMD_WORKER_URL is required").toBeTruthy();
      expect(secret, "AMD_WORKER_SECRET is required").toBeTruthy();

      const jobId = "job_amd_live_" + Date.now();
      const missionId = "mission_amd_live_" + Date.now();

      const localRenderIntent: LocalRenderIntent = {
        project_id: missionId,
        title: "FactoryOS AMD live smoke",
        output_path: "",
        scenes: [
          {
            scene_id: "scene_01",
            template_id: "facts.rapid-facts.v1",
            narration_text: "FactoryOS AMD render smoke test.",
            duration_seconds: 2,
            shots: [
              {
                id: "shot_01",
                recipe_id: "KINETIC_HOOK",
                start_seconds: 0,
                duration_seconds: 2,
                props: {
                  headline: "AMD LIVE TEST",
                  background_type: "DEEP_INDIGO",
                },
              },
            ],
          },
        ],
        output: {
          width: 1080,
          height: 1920,
          fps: 30,
          video_codec: "h264",
          audio_codec: "aac",
        },
      };

      const intent = {
        intentId: "intent_" + jobId,
        jobId,
        missionId,
        compositionType: "FACTS_SHORTS" as const,
        durationSeconds: 2,
        fps: 30,
        resolution: { width: 1080, height: 1920 },
        tracks: {
          visualAssets: [],
          audioTracks: [],
          captions: [],
        },
        preferredCompiler: "FFMPEG" as const,
        constraints: {
          hardwareAccel: true,
        },
        createdAt: new Date().toISOString(),
      };

      const fabric = new RenderFabric();
      const result = await fabric.executeRender(intent, {
        localRenderIntent,
        preferredProviderType: "AMD",
      });

      expect(result.success).toBe(true);
      expect(result.compilerUsed).toBe("FFMPEG");
      expect(result.receipt.status).toBe("COMPLETED");
      expect(result.receipt.providerType).toBe("AMD");
      expect(result.artifact).toBeDefined();
      expect(result.artifact?.sha256).toHaveLength(64);
      expect(result.artifact?.byteLength).toBeGreaterThan(1024);
      expect(result.artifact?.location.kind).toBe("LOCAL");
    },
    180_000
  );
});
