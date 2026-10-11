# Botkeep deployment branch

This branch is a Botkeep-compatible entry point for the ShortForge **Next.js web application**. It leaves `main` unchanged and keeps the complete repository checkout, including sibling directories.

## Botkeep setup

1. Create one Application workload.
2. Select **Node.js 22**.
3. Source: **GitHub**.
4. Repository: `Gokul7904231/ShortForge`.
5. Branch: `deploy/botkeep-primary`.
6. Start command: `npm start`.
7. Configure the workload's HTTP routing/domain in Botkeep.

The root `package.json` now supplies the start script, so Botkeep does not need a project-root selector to discover the application entry point. `scripts/botkeep-start.mjs` installs the locked dependencies for `apps/web` when needed, builds when the web source changes, and starts Next.js bound to `0.0.0.0` using `SERVER_PORT` (falling back to `PORT`, then `3000`).

## Important scope boundary

This is a **web/API staging deployment**, not proof that the complete video-rendering pipeline is production-ready on Botkeep. ShortForge's local render adapter launches Python's `factoryos_render` package, and the repository's CI installs FFmpeg/FFprobe and the Python renderer explicitly. Botkeep's runtime documentation warns not to assume system-package installation or root access. A Node-only workload may therefore serve the web app while local render operations remain unavailable.

Before declaring the renderer production-ready, run a live renderer health check and a small physical MP4 render. If Botkeep cannot supply Python and FFmpeg reliably, keep rendering on a separate supported worker/provider and use this workload for the web/control plane.

## Secrets and operating limits

- Store credentials only in Botkeep's Environment/Secrets settings. Do not commit `.env` files.
- Use the web app's existing environment contract; add only the credentials and URLs required for the features you enable.
- Start with this single workload and watch memory, CPU, storage, and Console output during the first build.
- The first build runs during startup. Later starts reuse the build only when the source and dependency fingerprints match.
- If the first build exceeds Botkeep's resource limits, do not repeatedly restart it; move the build to CI and deploy a prebuilt artifact instead.

## Verification status

- Repository branch and root entry point prepared.
- Build is separately checked by the `Botkeep web build` GitHub Actions workflow.
- A successful GitHub build does not replace the live Botkeep startup, HTTP health, secrets, or physical-render checks.
