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
until it is explicitly deleted. In particular, extracting over an existing full
checkout leaves the old `node_modules/`, `.next/`, `data/`, and `src` tree in place,
and the old files keep consuming the storage quota.

Where the release is extracted determines what `node start.mjs` serves, so the
contract is: **the release directory is the application directory.** Either replace
the application directory's contents wholesale, or point the workload's start
command at the new release directory.

### Cleanup / replacement checklist

Do these on Botkeep, in this order, only after the artifact has passed verification.
Every step that deletes is marked, and nothing here touches `/data`.

1. [ ] Record the current state first: running commit/version, start command, and the
       output of the volume audit, so a rollback target exists.
2. [ ] Back up outside the workload: `/data` (databases, CAS/render state), the
       Botkeep Environment variable set, and any file the operator added by hand.
       `/.git` is not needed for a release and is not a backup of `/data`.
3. [ ] Verify the artifact before upload: `sha256sum -c shortforge-botkeep-<sha12>.zip.sha256`
       and compare against the `sha256` in `release-manifest.json`.
4. [ ] Confirm the environment configuration still holds every Runtime variable listed
       above. Environment settings are Botkeep-managed and are **not** part of the
       archive, so they should survive untouched — verify rather than assume.
5. [ ] Keep `/data` exactly as it is. Do not delete, move, or overwrite it, and do not
       copy the release's (absent) `data/` over it.
6. [ ] **Delete** the old application tree that the release replaces — the previous
       `apps/web/node_modules` (≈2.0 GiB on the current workload), the old `.next`,
       and the old source checkout. This is the step that actually reclaims storage;
       the upload alone reclaims none.
7. [ ] **Delete** `/.npm/_cacache` (≈0.57 GiB) — a build cache with no runtime role.
       Do not run `npm install` on the workload.
8. [ ] Keep or re-create `.factoryos_render_cache/` only if the checkpoints are wanted;
       it is safe to remove.
9. [ ] Set the start command to `node start.mjs` in the release directory and set the
       Botkeep port. Do not hard-code a port in the archive; it reads `SERVER_PORT`.
10. [ ] Start, then check `GET /api/health`, `GET /login`, and one static
        `/_next/static/...` asset. Confirm the log shows no
        `Cannot find module` / `ERR_MODULE_NOT_FOUND`.
11. [ ] Re-run the volume audit and compare against the budget below. If storage did
        not drop, step 6 or 7 did not happen.

Do not delete `/data`, `.git` (if it is still a rollback asset the operator wants), or
any Botkeep-managed configuration as part of a release swap.

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
