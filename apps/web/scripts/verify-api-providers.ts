/**
 * API provider verification harness.
 *
 * Safe default:
 *   - validates configured credentials only;
 *   - never provisions compute.
 *
 * Live mode:
 *   SHORTFORGE_LIVE_API_PROBE=1
 *   SHORTFORGE_API_PROVIDER=DAYTONA
 *   SHORTFORGE_RENDER_PROBE_IMAGE=<container image>
 *
 * Live probes provision real cloud resources and terminate them when the
 * provider's API surface permits. Use a throwaway/probe image and a bounded
 * timeout. No worker-plane integration is performed.
 */

import {
  type ApiProviderType,
  ProviderApiRegistry,
} from "../factoryos/core/compute/api";
import { DaytonaProviderControl } from "../factoryos/core/compute/api/providers/DaytonaProviderControl";

const registry = new ProviderApiRegistry();
registry.register(new DaytonaProviderControl());

async function main(): Promise<void> {
  const providerArg = String(process.env.SHORTFORGE_API_PROVIDER || "").toUpperCase() as ApiProviderType | "";
  const live = process.env.SHORTFORGE_LIVE_API_PROBE === "1";

  const validation = await registry.validateAll();
  for (const [provider, result] of Object.entries(validation)) {
    console.log(JSON.stringify({
      provider,
      configured: result.configured,
      authenticated: result.authenticated,
      reachable: result.providerReachable,
      missingKeys: result.missingKeys,
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
    }));
  }

  if (!live) {
    console.log("SAFE_MODE: no provider resource was created.");
    return;
  }

  if (!providerArg) {
    throw new Error("SHORTFORGE_API_PROVIDER is required in live probe mode.");
  }
  const adapter = registry.get(providerArg);
  if (!adapter) throw new Error(`Unknown API provider: ${providerArg}`);
  const credential = validation[providerArg];
  if (!credential?.authenticated) {
    throw new Error(`${providerArg} is not authenticated; refusing live provisioning.`);
  }
  if (!process.env.SHORTFORGE_RENDER_PROBE_GPU) {
    throw new Error(
      "SHORTFORGE_RENDER_PROBE_GPU is required so the live probe cannot silently fall back to CPU compute.",
    );
  }

  if (!process.env.SHORTFORGE_RENDER_PROBE_IMAGE) {
    throw new Error("SHORTFORGE_RENDER_PROBE_IMAGE is required for this provider.");
  }

  const result = await registry.renderProbe(providerArg, {
    image: process.env.SHORTFORGE_RENDER_PROBE_IMAGE,
    gpuType: process.env.SHORTFORGE_RENDER_PROBE_GPU,
    gpuCount: Number(process.env.SHORTFORGE_RENDER_PROBE_GPU_COUNT || 1),
    cpuCores: Number(process.env.SHORTFORGE_RENDER_PROBE_CPU || 2),
    memoryMb: Number(process.env.SHORTFORGE_RENDER_PROBE_MEMORY_MB || 4096),
    diskGb: Number(process.env.SHORTFORGE_RENDER_PROBE_DISK_GB || 20),
    timeoutMs: Number(process.env.SHORTFORGE_RENDER_PROBE_TIMEOUT_MS || 300000),
    outputPath: process.env.SHORTFORGE_RENDER_PROBE_OUTPUT || "/tmp/shortforge-api-probe.mp4",
    renderCommand:
      process.env.SHORTFORGE_RENDER_PROBE_COMMAND ||
      "ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=black:s=320x568:r=30:d=1 -f lavfi -i anullsrc=r=44100:cl=mono:d=1 -shortest -c:v libx264 -pix_fmt yuv420p -c:a aac /tmp/shortforge-api-probe.mp4",
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
