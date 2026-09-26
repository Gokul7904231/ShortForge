# AMD Render Worker — FactoryOS F06

## Purpose

The AMD integration is a real distributed render provider, not a local GPU flag.

The production path is:

```text
F05 LocalRenderIntent
  -> F06 RenderFabric
  -> ComputeGateway
  -> ComputeRouter
  -> AmdComputeProvider
  -> authenticated AMD worker
  -> factoryos-render
  -> physical MP4
  -> SHA-256
  -> AMD artifact download
  -> local CAS
  -> F07
```

The control plane never assumes an AMD GPU exists on its own machine.

## Worker API

The AMD host runs:

```text
services/rendering-engine/factoryos_amd_render_api.py
```

Authenticated endpoints:

- `GET /health` — liveness
- `GET /ready` — renderer/GPU/encoder readiness
- `GET /capabilities` — AMD capability evidence
- `POST /api/factoryos/render/inputs` — stage local input artifacts
- `POST /api/factoryos/render/jobs` — submit a render
- `GET /api/factoryos/render/jobs/:jobId` — poll status
- `GET /api/factoryos/render/jobs/:jobId/artifact` — download the verified MP4

The worker requires `AMD_WORKER_SECRET`.

## AMD host requirements

Use an AMD GPU that is supported by the installed ROCm/driver stack. AMD's current ROCm documentation provides the compatibility matrix and installation paths; verify the exact GPU/OS combination before installation. citeturn773576search2turn773576search4

For Linux, install the matching AMD driver/ROCm stack, then verify:

```bash
rocminfo
amd-smi version
```

AMD documents `rocminfo` and `amd-smi` as verification tools for a working installation. citeturn773576search5

The worker also expects an FFmpeg build with the selected video encoder. For GPU encoding, the default configuration uses:

```text
FACTORYOS_VIDEO_ENCODER=h264_vaapi
AMD_VAAPI_DEVICE=/dev/dri/renderD128
AMD_REQUIRE_GPU_ENCODE=true
```

Confirm that your FFmpeg exposes the selected encoder:

```bash
ffmpeg -hide_banner -encoders | grep h264_vaapi
ls -l /dev/dri/renderD*
```

For a non-GPU diagnostic test only, set `AMD_REQUIRE_GPU_ENCODE=false` and `AMD_VIDEO_ENCODER=libx264`. That proves the network/control-plane connection but does **not** prove AMD GPU video encoding.

## Install the renderer on the AMD host

From the ShortForge repository root:

```bash
cd ShortForge

python3 -m venv .venv
source .venv/bin/activate

pip install -U pip
pip install -e packages/factoryos-render
pip install fastapi uvicorn pydantic
```

Install the project's renderer dependencies as required by `packages/factoryos-render`.

## Configure the AMD worker

Create:

```text
services/rendering-engine/.env.amd
```

Example:

```dotenv
AMD_WORKER_SECRET=generate-a-long-random-secret
AMD_WORKER_ID=amd-worker-01
AMD_WORKER_HOST=0.0.0.0
AMD_WORKER_PORT=8101

AMD_RENDER_CONCURRENCY=1
AMD_RENDER_JOB_TIMEOUT_SECONDS=3600

AMD_GPU_MODEL=replace-with-real-gpu-model
AMD_GPU_VRAM_MB=replace-with-real-vram-mb
ROCM_VERSION=replace-with-installed-rocm-version

AMD_VIDEO_ENCODER=h264_vaapi
AMD_VAAPI_DEVICE=/dev/dri/renderD128
AMD_REQUIRE_GPU_ENCODE=true

AMD_RENDER_ARTIFACT_DIR=/opt/factoryos/amd-render-artifacts
AMD_RENDER_INPUT_DIR=/opt/factoryos/amd-render-inputs
AMD_MAX_INPUT_FILE_MB=250

# Absolute path of the ShortForge checkout on this host.
FACTORYOS_REPO_ROOT=/opt/shortforge
```

Do not commit the real secret.

## Start the worker

```bash
cd /opt/shortforge
source .venv/bin/activate

set -a
source services/rendering-engine/.env.amd
set +a

python services/rendering-engine/factoryos_amd_render_api.py
```

The service listens on port `8101` by default.

## Test the worker before connecting ShortForge

Health:

```bash
curl http://AMD_HOST:8101/health
```

Readiness:

```bash
curl -i http://AMD_HOST:8101/ready
```

Capabilities:

```bash
curl \
  -H "Authorization: Bearer $AMD_WORKER_SECRET" \
  http://AMD_HOST:8101/capabilities
```

The capability response must report:

```json
{
  "gpuVendor": "AMD",
  "gpuCount": 1,
  "ffmpegAvailable": true,
  "videoEncoder": "h264_vaapi",
  "ready": true
}
```

The exact GPU model and VRAM come from the values configured on the worker.

## Connect the ShortForge control plane

On the FactoryOS web/control-plane environment configure:

```dotenv
AMD_WORKER_URL=http://AMD_HOST:8101
AMD_WORKER_SECRET=<same-secret-as-worker>
AMD_WORKER_ID=amd-worker-01
AMD_WORKER_MAX_JOB_SECONDS=3600
AMD_WORKER_POLL_MS=1000
AMD_MAX_INPUT_FILE_MB=250
```

The provider is registered automatically by `ComputeGateway`.

With AMD configured and healthy, ComputeRouter may evaluate it alongside the other qualified providers.

## First connection test

Run the focused provider tests:

```bash
cd apps/web
npm test -- amd-compute-provider.test.ts
```

Then run the FactoryOS render suites:

```bash
npm test -- factoryos
```

For a live AMD smoke test, first make sure the worker reports `/ready -> 200`, then invoke a short F06 render with the provider constraint:

```text
preferredProviderType = AMD
```

A successful live test must produce all of these:

1. AMD worker accepted the job.
2. AMD worker generated a physical MP4.
3. Worker computed SHA-256 over that MP4.
4. Control plane downloaded the physical bytes.
5. Local CAS stored the artifact under the same SHA-256.
6. The ComputeReceipt is `COMPLETED` with one output artifact.
7. F07 verifies the resulting artifact.

## Important production boundary

Local media inputs are staged to the AMD worker through the authenticated input endpoint before render. This is necessary because F04/F05 artifacts may exist only on the control-plane filesystem.

The worker deletes staged input files after the render completes, while the final MP4 remains available for the artifact download.

## What must be true before calling AMD production-ready

```text
/ready = 200
+
real AMD GPU evidence
+
selected FFmpeg encoder available
+
real physical MP4
+
SHA-256 matches on worker and control plane
+
CAS verification passes
+
F07 verification passes
```

A configured URL or secret alone is never treated as proof that AMD compute is available.


## Live MI300X evidence — 2026-09-26

The AMD Developer Cloud worker at the recorded MI300X host was exercised directly.

Observed evidence:
- `/ready` returned HTTP 200 and reported AMD GPU detection, renderer importability, encoder availability, and a present VAAPI device.
- `/health` returned HTTP 200 for worker `amd-worker-01`.
- Authenticated `/capabilities` reported `AMD_Instinct_MI300X_VF`, ROCm `10.0.0`, one GPU, and configured encoder `libx264`.
- FFmpeg exposed `h264_vaapi`, but the active Mesa `radeonsi` VAAPI driver exposed H.264 only through `VAEntrypointVLD` (decode), with no H.264 encode entrypoint.
- A direct `h264_vaapi` encode proof therefore failed and produced a zero-byte file.
- A production worker render using the configured `libx264` encoder succeeded:
  - duration: 2.0 seconds
  - resolution: 1080x1920
  - fps: 30
  - codec: H.264
  - physical artifact size: 52,675 bytes
  - worker SHA-256: `f58c6531af68dda10e4e27721b80ceb3c36fd471d0b14e532ae7c9955930c1b8`
  - downloaded artifact SHA-256 matched the worker receipt exactly.

Qualification interpretation:

`AMD-hosted distributed rendering = PROVEN`.

`AMD GPU H.264 video encoding = NOT PROVEN` on this guest media stack.

The successful render is therefore classified as an AMD-hosted persistent render worker using CPU `libx264` encoding. The system must not describe this worker as hardware-video-encoding-qualified until the worker media stack exposes and successfully exercises a real hardware encoder.

The remaining system-level admission gate is the canonical control-plane live path:

`RenderFabric -> ComputeGateway -> ComputeRouter -> AmdComputeProvider -> AMD worker -> CAS -> F07`.

