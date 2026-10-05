import fs from "node:fs/promises";
import path from "node:path";
import {
  getKaggleWanRendererProfile,
  KAGGLE_WAN_RENDER_PROFILES,
} from "../factoryos/core/compute/notebooks/KaggleRendererProfiles";

const repoRoot = path.resolve(process.cwd(), "../..");
const templateDir = path.join(
  repoRoot,
  "tools",
  "kaggle",
  "shortforge-wan-dual-t4",
);

async function main() {
  const metadataPath = path.join(templateDir, "kernel-metadata.json");
  const workerPath = path.join(templateDir, "worker.py");

  const [metadataRaw] = await Promise.all([
    fs.readFile(metadataPath, "utf8"),
    fs.access(workerPath),
  ]);

  const metadata = JSON.parse(metadataRaw) as Record<string, unknown>;
  if (metadata.code_file !== "worker.py") {
    throw new Error(
      "Kaggle template must declare worker.py as its code_file.",
    );
  }

  for (const [profileName, profile] of Object.entries(
    KAGGLE_WAN_RENDER_PROFILES,
  )) {
    const resolved = getKaggleWanRendererProfile(profileName);
    if (resolved.profile !== profile.profile) {
      throw new Error("Profile resolution mismatch: " + profileName);
    }
    if (resolved.requireDualT4 && resolved.renderer === "wan2.1" && !resolved.modelId) {
      throw new Error("Dual-T4 Wan profile has no model ID: " + profileName);
    }
  }

  console.log(
    JSON.stringify(
      {
        status: "PASS",
        templateDir,
        entrypoint: "worker.py",
        profiles: Object.values(KAGGLE_WAN_RENDER_PROFILES).map((profile) => ({
          profile: profile.profile,
          renderer: profile.renderer,
          modelId: profile.modelId,
          requireDualT4: profile.requireDualT4,
          target: `${profile.nativeWidth}x${profile.nativeHeight} @ ${profile.fps}fps`,
          frames: profile.numFrames,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
