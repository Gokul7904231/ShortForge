# Botkeep deployment (self-hosted Node.js 22 release)

ShortForge's control plane (`apps/web`) has three production entry points today:

| Target | Build | Start |
|---|---|---|
| Cloudflare Workers (OpenNext) — canonical | `npm run deploy` | managed by Wrangler |
| Vercel | `next build` | managed by Vercel |
| Docker (Northflank) | `Dockerfile` | `npm start` → `next start` |
| **Botkeep (`shortforge-primary`)** | `npm run build:botkeep` | **`node start.mjs`** |

This document covers only the Botkeep path. It does not change any of the others: the
Botkeep behaviour lives behind `SHORTFORGE_BUILD_PROFILE=botkeep` in
`apps/web/next.config.mjs`, and `npm run build` / `npm run deploy` never set it.

## What the release is

A Next.js **standalone** server: a traced `node_modules`, the compiled server output,
client static assets, public assets, and the runtime data files the server reads by
path. It contains **no** `.env`, no credentials, no databases, no `.git`, no tests,
no developer knowledge base, and no local render state.

Layout (archive root, flat):

```
server.js                 # Next standalone entry (never run directly — see below)
start.mjs                 # launcher: port/host resolution, then imports server.js
package.json              # server manifest
package-lock.json         # lockfile the tree was installed from
node_modules/             # traced runtime dependencies only
.next/static/             # client JS/CSS
.next/server/             # compiled server routes
public/                   # static public assets
config/ prompts/ content-engines/ factoryos/skills/ lib/shortforge-skills/ factory/
                          # runtime data files read from the server cwd
RELEASE-INFO.json         # commit, node version, start command
```

## Build and package

Never install the full development tree on the worker. Build on CI:

1. **GitHub Actions → Botkeep Release → Run workflow** (or push a `botkeep-*` tag).
   The workflow runs `npm ci` on Node 22, typechecks, builds with the Botkeep
   profile, packages, verifies the extracted archive, and uploads
   `shortforge-botkeep-release`.

Locally (equivalent, from `apps/web`):

```bash
npm ci
npm run typecheck
npm run build:botkeep        # SHORTFORGE_BUILD_PROFILE=botkeep next build
npm run package:botkeep      # deterministic ZIP + manifest into ../../dist/botkeep
npm run verify:botkeep -- --zip ../../dist/botkeep/shortforge-botkeep-<sha12>.zip \
  --work /tmp/botkeep-verify --report ../../dist/botkeep/verify-report.json
```

`dist/` is gitignored. Release archives are workflow artifacts, not commits.

Outputs in `dist/botkeep/`: the `.zip`, its `.sha256`, `release-manifest.json`
(sizes, budget, secret scan, checksum, commit, workflow run), `release-inventory.json`
(every included path), `release-excluded.json` (exclusion class + reason), and
`verify-report.json`.

## Verified release

| Field | Value |
|---|---|
| Workflow run | `.github/workflows/botkeep-release.yml`, run `39011242802` — **success** |
| Trigger | `push` of tag `botkeep-20261017` on `feat/botkeep-release` |
| Source commit | `f2e730f3e4f227d17ad9782aa8d603ba59d91d5d`, `dirtyWorkingTree: false` |
| Archive | `shortforge-botkeep-f2e730f3e4f2.zip` |
| SHA-256 | `f328cd911a8c6d1be967ed96967f42af7b1d54064c828699fd063cc4214ace66` |
| Uncompressed | 394.30 MiB (413,457,083 B) of the 1,300 MiB budget — `WITHIN_BUDGET`, 905.7 MiB headroom |
| Compressed | 127.91 MiB |
| Files | 7,212 |
| Secret scan | 0 findings |
| Extracted-archive smoke test | 32 passed, 0 failed |

`workflow_dispatch` cannot trigger this workflow while it exists only on a feature
branch: GitHub only accepts a dispatch event when the workflow file is present on the
**default branch** (verified — the API answers `422 Workflow does not have
'workflow_dispatch' trigger`). Until the file reaches `main`, the release is triggered
by pushing a `botkeep-*` tag, which is the workflow's other documented trigger.

> **The current artifact is a structure/verification proof, not a configured release.**
> The `NEXT_PUBLIC_*` repository Variables the workflow reads are **not set** on the
> repository (only `LIGHTNING_TEAMSPACE` and the `OKF_*` keys exist), so this build
> inlined empty public configuration. Set the `NEXT_PUBLIC_*` Variables listed above and
> re-run the workflow before using an artifact for a real cutover.

### Reproducibility

The packager itself is deterministic (fixed entry order, fixed timestamps), so the same
input tree produces the same bytes. Two builds are **not** byte-identical, for reasons
that are understood rather than assumed:

- Next.js assigns a fresh random `BUILD_ID` per build, which renames
  `.next/static/<BUILD_ID>/` and the content-hashed client chunks (6 paths differ).
- Minified identifier mangling varies between runs — 16 server chunks differ by ~8 KiB
  in total (e.g. `ResponseCookies:()=>m` vs `ResponseCookies:()=>g`).
- The ZIP is only as reproducible as the tree it is given. Staging the tree on Windows
  with `core.autocrlf=true` rewrites text files to CRLF, adding exactly one byte per
  line: measured at 1,254 of 1,270 differing files, with `package-lock.json` differing
  by exactly its 19,076 line count. Build from a Linux checkout, as the workflow does.

The file set, the manifest, and the 32 verification checks reproduce exactly.

## Start command

From the extracted release directory:

```
node start.mjs
```

Do **not** run `node server.js` directly: it would bind to the container's `HOSTNAME`
and would not read `SERVER_PORT`.

Port and host resolution (`start.mjs`):

- port: `SERVER_PORT` → `PORT` → `3000` (local default only). An out-of-range or
  non-numeric value exits 1 instead of guessing.
- host: `BIND_HOST` → `0.0.0.0`. The container-provided `HOSTNAME` is deliberately
  ignored so the server is reachable from outside its own container.

Health check: `GET /api/health` (returns JSON; `status` may be `degraded` when
optional external providers are not configured — that is not a failed boot).

## Environment variables

**Build-time (inlined into the client bundle — must be set when the release is built,
not when it runs).** Set these as GitHub repository Variables before dispatching the
release workflow:

`NEXT_PUBLIC_APP_NAME`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_BASE_URL`,
`NEXT_PUBLIC_RENDER_ENGINE_URL`, `NEXT_PUBLIC_DRIVE_FOLDER_LABEL`,
`NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
`NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`,
`NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`.

Changing any of these requires a **rebuild**, not a restart.

**Runtime (Botkeep Environment configuration — never baked into the archive).**
The release boots with only these set, and they are what the verifier passes:

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_ORIGIN`, `CONTROL_PLANE_URL`,
`INTERNAL_API_SECRET_KEY`, `SESSION_SECRET_KEY`.

Everything else the application understands is documented in
`apps/web/.env.example` and `apps/web/.env.render.production.example`
(`FIREBASE_*` service account, `CLOUDINARY_*`, `GEMINI_API_KEY`, `GROQ_API_KEY`,
`OPENROUTER_API_KEY`, `MONGODB_URI`, `RENDER_WORKER_URL`, `RENDER_WORKER_SECRET`,
`CRON_SECRET`, …). Set them in Botkeep's Environment configuration; do not ship them
inside the archive.

`APP_ORIGIN` must be the public origin the workload is served from — host-derived
origins are rejected by design.

## Filesystem requirements

The server writes mutable state relative to its working directory and needs it to be
writable:

- `data/` — SQLite queues/state (`data/queues.db`, `data/shortfactory.db`,
  `data/factoryos_state/*.db`). Created on first boot. **This is bot state, not
  release content** — never restore it from a release archive, and it is not part of
  the archive.
- `.factoryos_render_cache/` — render/checkpoint cache. Optional; absence is treated
  as "empty cache".

The release tree itself is read-only apart from those paths.

## Replacement semantics

Uploading/extracting a release does **not** remove files that are already on the
workload. Extraction is additive; anything left over from a previous install stays
until it is explicitly deleted, and the old files keep consuming the storage quota.

Where the release is extracted determines what `node start.mjs` serves, so the
contract is: **the release directory is the application directory.** Either replace
the application directory's contents wholesale, or point the workload's start
command at the new release directory.

## What is actually live today (measured 2026-10-17)

The live workload does **not** run this release. It is a full source checkout that
builds itself at startup:

| Fact | Value |
|---|---|
| Workload | `shortforge-primary` — one **Application** workload, Node.js 22 |
| Source | GitHub `Gokul7904231/ShortForge`, branch `deploy/botkeep-primary` |
| Start command | `npm start` → `node scripts/botkeep-start.mjs` |
| Storage allocation | 2,048 MiB |
| Measured usage | ≈ 2,734 MiB (**already ≈ 686 MiB over allocation**) |
| — `apps/web/node_modules` | ≈ 2,050 MiB |
| — npm cache (reported as `/.npm`) | ≈ 568 MiB |
| — `.git` | ≈ 27 MiB |
| — `apps/web/.next` | ≈ 1.1 MiB |
| — `/data` | ≈ 0.33 MiB |
| File access | SFTP only (WinSCP). **No shell, no `sha256sum`, no `unzip` on the box.** |

`scripts/botkeep-start.mjs` (root `package.json` + launcher) exists only on
`deploy/botkeep-primary`, not on the branch this release was built from. It runs
`npm ci --prefix apps/web` and `npm run build --prefix apps/web` on the workload
(gated by `.botkeep-runtime/build-state.json`), then `next start` on
`0.0.0.0:$SERVER_PORT|$PORT|3000`. That on-box install is what produced the 2.6 GiB
tree this release replaces.

### Transition storage arithmetic

A strict 2,048 MiB quota cannot hold the old tree and the release at once:

| Step | Delta | Running total |
|---|---|---|
| Today | — | 2,734 MiB |
| Delete npm cache + `.git` + old `.next` | −596 MiB | 2,138 MiB |
| Upload release (134 MiB zip) | +134 MiB | 2,272 MiB |
| Extract release (397 MiB tree) | +397 MiB | 2,669 MiB |

Reclaiming the cache is not enough. The old `apps/web/node_modules` must go before or
during the swap. Choose one:

- **Option A — keep rollback, ask Botkeep support to raise the allocation** to ≈
  3,500 MiB for the window, do the swap, then lower it back. Nothing has to be deleted
  before the new release is proven.
- **Option B — no support dependency, accept a rebuild-to-rollback.** Delete the old
  `node_modules` first (step 6). Rollback then means deleting the release directory,
  restoring the start command to `npm start`, and letting the old launcher re-run
  `npm ci` + `next build` on the box (~10–20 min, needs network and ≈2 GiB, which is
  free again once the release is gone).

Because the workload is already over its allocation, check whether writes are
actually refused before choosing; if they are not, Option A's headroom is already
available de facto.

### Replacement checklist

Tags: **[WinSCP]** = safe with the temporary SFTP credentials · **[Botkeep UI]** =
workload settings in the Botkeep dashboard · **[Local PC]** = operator machine ·
**[support]** = needs Botkeep support, the UI cannot express it.

**Phase 0 — record and back up**

1. **[Botkeep UI]** Record, verbatim, the current Start command, the Node.js version,
   the Source (repo + branch), the port/HTTP routing, and every Environment value.
   Screenshot or paste into an out-of-band note. Keep secrets out of the repo.
2. **[WinSCP]** Download the **entire `/data` directory** to the operator machine and
   keep it. This is the only real rollback asset — databases, CAS/render state.
   `/.git` is not a backup of `/data`.
3. **[WinSCP]** Confirm writable space with a small test upload, to decide Option A
   vs Option B above.

**Phase 1 — verify the artifact (before anything touches the workload)**

4. **[Local PC]** `Get-FileHash .\shortforge-botkeep-<sha12>.zip -Algorithm SHA256`
   and compare it to the `.zip.sha256` sidecar **and** to `archive.sha256` in
   `release-manifest.json`. All three must match.
5. **[Local PC]** In `release-manifest.json` confirm `status: WITHIN_BUDGET`,
   `dirtyWorkingTree: false`, the expected `commit`, `secretScan.findings` empty, and
   the `verify-report.json` counts (`passed`, `failed: 0`).
6. **[Local PC]** Extract the zip locally. It must contain `server.js`, `start.mjs`,
   `node_modules/`, `.next/`, `public/`, `RELEASE-INFO.json`, and must contain **no**
   `.env`, `data/`, or `.git`.

**Phase 2 — install without losing the old tree (Option A) or after reclaiming (Option B)**

7. **[support]** Confirm the workload's start command can be changed to an arbitrary
   command **and** that an uploaded directory outside the git checkout survives a
   restart/redeploy. If either is false, stop — this release path cannot be deployed
   without a Botkeep change.
8. **[WinSCP]** Upload the **extracted tree** (7,212 files) to a new directory, e.g.
   `/apps/release-<sha12>/`. WinSCP cannot unzip remotely, so extract on the local
   machine first. (Alternative: **[support]** extracts the uploaded zip server-side.)
   Upload the `.zip`, `.sha256`, and `release-manifest.json` alongside it as the
   deployment record.
9. **[WinSCP]** Option B only: **delete** `apps/web/node_modules` (≈2,050 MiB), then
   optionally the npm cache and `apps/web/.next`. Nothing else. Delete `.git` only if
   it is not the intended rollback asset.

**Phase 3 — cut over**

10. **[Botkeep UI]** Set the start command to `node start.mjs` with the release
    directory as the working directory, and set the port via the `SERVER_PORT`
    environment value. Do not hard-code a port in the archive.
11. **[Botkeep UI]** Confirm every Runtime variable from the list above is still set.
    Environment settings are Botkeep-managed and are not part of the archive, so they
    should survive — verify rather than assume. Restart the workload.

**Phase 4 — post-deployment checks**

12. **[Local PC]** `GET /api/health` → JSON (`status` may be `degraded` while optional
    providers are unconfigured; that is not a failed boot). `GET /login` → 200 HTML.
    One `/_next/static/...` asset → 200 with a JS/CSS content type.
13. **[Botkeep UI]** Console/log output: no `Cannot find module` /
    `ERR_MODULE_NOT_FOUND`, and the log shows `start.mjs` binding the requested port
    (`start.mjs` refuses an out-of-range port instead of guessing).
14. **[Botkeep UI]** Re-run the volume audit. Expect ≈ 650 MiB (release + `/data`), not
    ≈ 2,700 MiB. If storage did not drop, step 9 did not happen.
15. **[WinSCP]** Rollback, if any check fails: stop the workload, restore the start
    command from step 1, restore `/data` from step 2 if it was touched, then either
    delete the release directory (Option B — the old launcher rebuilds itself) or
    let the restored tree run (Option A).

**Never delete as part of a release swap:** `/data`, any `.env*` file, the Botkeep
Environment configuration, the workload's HTTP routing/domain settings, or
`.botkeep-runtime` while the old launcher is still the rollback path.

## Verification gates

A release is deployable only when all of these hold for the same archive:

| Gate | Where |
|---|---|
| `npm run typecheck` passes | workflow step (Next ignores TS errors during build) |
| Build + package exit 0 | packager exits 2 on secret-scan findings, 3 over budget |
| Uncompressed size ≤ budget (default 1300 MiB) | `release-manifest.json` → `status: WITHIN_BUDGET` |
| No secret-scan findings | `release-manifest.json` → `secretScan.findings` is empty |
| Archive extracts in a fresh dir with no `.env`/`data`/`.git`/tests | `verify-report.json` |
| `better-sqlite3`, `sharp`, `onnxruntime-node` load from the extracted tree | `verify-report.json` |
| `node start.mjs` binds the requested port and serves `/api/health`, `/login`, static chunks/CSS, and a public asset | `verify-report.json` |
| Protected APIs stay fail-closed | `verify-report.json` |

`WITHIN_BUDGET` alone is a size statement, not a deployment approval.
