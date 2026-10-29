# Product Acceptance — Creator Journey (2026-10-29)

Agent 3: Product Design, UX and Acceptance QA. Branch `feat/product-acceptance-20261029`, based on `cf4cc2c9`.
No commit to `main`, no production job, no external publication. Work was done in the existing tree so
`node_modules` and `.env` could be reused; pre-existing uncommitted Agent 1/2 files were left untouched and uncommitted.

## 1. Method and evidence

| Item | Result |
|---|---|
| Spec Kit | `speckit-specify` loaded. No `.specify/` or `specs/` scaffolding exists in this repo, so artifacts are plain markdown under `docs/verification/`. Recorded as a limitation, not a pass. |
| Anti-Slop | Session override `during`. Core `antislop` + `antislop-ui` + `antislop-human` + `antislop-layoutmobile` + `antislop-copywriting` loaded before edits. |
| EGM | Installed as the full plugin at `~/.agents/plugins/elephant-goldfish-model` (a skills-only copy breaks `agents/`, `docs/`, `resources/`). A general subagent read `agents/comprehension.md`, returned `egm-comprehension`, and could not see a parent-only marker, so persona dispatch and fresh-context isolation are real. Reviews were still run as governed QA, not as Goldfish findings. |
| Design direction | No `DESIGN.md`. Direction was read from the existing UI: `#1677FF` primary, `#19C37D` success, zinc dark surfaces, `rounded-3xl` cards, light/dark pairs. No new palette, no redesign. |
| Runtime under test | `next dev` on `:3100`, local `.env`/`.env.local`, signed dev cookie for pages, `INTERNAL_API_SECRET_KEY` bearer for APIs. |
| Real render job | Not started. Starting one would enqueue a real job and needs owner approval. Marked BLOCKED wherever it applies. |

## 2. Journey trace

| Stage | What the creator does | What the system actually does now | Status |
|---|---|---|---|
| Login | `/login`, then `/dashboard` | Unauthenticated page requests redirect to `/login`; APIs return 401. Signed session is now signature-verified. | PASS |
| Generate | `Create Video` dialog | 4-step wizard posts to `/api/generate-video`. Invalid payload returns 400 before any job exists. | PASS (local) |
| Queue / progress | Poll `/api/job-status/[id]` | Unknown progress is `null`, never a fabricated 50%. Status copy is derived from real status. | PASS |
| Preview / download | Library card opens `/media/library/[videoId]` | Real `videoUrl` when recorded; specifications show `Not recorded` instead of invented 4.5 MB / 60 fps / 1080x1920. | PASS, legacy rows still unplayable (see risks) |
| Drive delivery | Library shows a delivery card | Delivery state comes from the worker's stored delivery receipt. `LOCAL_OUTBOX` is never labelled Google Drive. Connect card exists for Pro users. | PASS for state truth; genuine upload BLOCKED |
| Refresh / recovery | Reload library or status | Library now has an explicit error + retry path and keeps previous data out of the error state. Outbox receipt is the only delivery evidence. | PARTIAL (no live browser refresh test) |

## 3. What changed

| File | Change |
|---|---|
| `apps/web/lib/delivery/outbox-record.ts` | New read-only receipt reader for `data/outbox/<jobId>_outbox.json`, jobId guarded by `^[a-zA-Z0-9_-]{8,64}$`. Absence means "not recorded", never "delivered". |
| `apps/web/lib/delivery/delivery-facts.ts` | Resolves delivery from the durable job document first and the worker outbox second, so a worker restart or container replacement does not erase a recorded upload. |
| `apps/web/lib/delivery/durable-delivery.ts` | Writes every delivery outcome (Drive, local outbox, failure, pending) into the job manifest. |
| `apps/web/lib/auth/job-access.ts` | Owner decision for job-scoped media: job manifest owner, or the jobs that reference a content-address hash. Unknown ownership fails closed for non-admins. |
| `apps/web/app/api/media/video/[jobId]/route.ts`, `apps/web/app/api/media/thumb/[jobId]/route.ts` | jobId boundary check plus owner authorization before any filesystem read. |
| `apps/web/factoryos/core/adapters/DriveDeliveryAdapter.ts` | Persists each delivery outcome into the job document; the outbox file remains a fallback. |
| `apps/web/lib/jobs-history.ts` | Job manifest type carries delivery method, verification, status, file id and artifact. |
| `apps/web/tests/media-video-ownership.test.ts`, `apps/web/tests/delivery-recovery.test.ts` | New evidence for media ownership and durable-receipt recovery. |
| `apps/web/lib/presentation/JobStatusProjection.ts` | Added `describeDelivery` with `DRIVE_DELIVERED / DRIVE_PENDING / OUTBOX_ONLY / DELIVERY_FAILED / NOT_RECORDED / NOT_READY`. |
| `apps/web/app/api/job-status/[id]/route.ts` | Returns `deliveryTarget`, `deliveryMethod`, `deliveryVerified`, `driveFileId`, `driveUrl`; progress fallback is `null`, not 50. |
| `apps/web/app/api/library/route.ts` | Removed fabricated `sizeMb 4.5`, `fps 60`, resolution, duration 45, `guardianPassed: true`, `groundingScore: 1.0`. Added `LOCAL_OUTBOX` delivery status. |
| `apps/web/app/api/library/[videoId]/route.ts` | Same metric truth; returns delivery method/verification and the receipt values. |
| `apps/web/app/(os)/media/library/page.tsx` | Error + retry state, honest delivery badges, "Duration not recorded", Drive connect/disconnect card. |
| `apps/web/app/(os)/media/library/[videoId]/page.tsx` | Delivery section from recorded facts; specs show "Not recorded"; Guardian card shows the stored summary or "Verification not recorded". |
| `apps/web/components/QuickGenerateOverlay.tsx` | READY copy no longer claims queueing for delivery; renders the real delivery state. Dialog has `role`, `aria-modal`, labelled title, labelled close, Escape to close. |
| `apps/web/lib/health-manager.ts` | Health is now local-storage + configuration only. Adds `ready`, `reachable`, `checks`; no fake uptime or latency. A key path that points at a missing file is reported as degraded. |
| `apps/web/app/api/health/route.ts`, `apps/web/app/health/route.ts` | Return 503 when reachable but not ready. |
| `apps/web/app/(os)/publishing/drive/page.tsx` | Fake `sync_001` / "How to Build AI SaaS" rows replaced with real `/api/library` records and honest empty/error/loading states. |
| `apps/web/lib/drive/DriveConnectionManager.ts` | Removed the hardcoded personal Gmail and invented `connectedAt`/`lastValidatedAt`; account email comes from `GOOGLE_DRIVE_ACCOUNT_EMAIL`. `status` no longer defaults to `CONNECTED` without a connection. |
| `apps/web/lib/core/RouteRegistry.ts` | Drive service-account operator APIs (`list/status/delete/cleanup/folders/upload`) are admin-only. Creator APIs (`connect/connection/callback`) stay open to signed-in users. |
| `apps/web/middleware.ts` | **Security fix:** `fos_` sessions were decoded without signature verification. Now HMAC-SHA256 verified with Web Crypto, fail closed when the secret is absent. Dev mock cookie path unchanged. |
| `apps/web/factoryos/tests/auth.test.ts` | Middleware tests await the now-async gate; new forged-token rejection test. |
| `apps/web/factoryos/tests/user-drive-connection.test.ts` | No longer asserts the hardcoded personal email; asserts the configured account email. |
| `apps/web/tests/product-acceptance.test.ts` | 11 focused tests: delivery projection, receipt traversal guard, health readiness. |

## 4. Smoke matrix

Commands were run against `http://localhost:3100` with `.env` loaded. `$SECRET` is `INTERNAL_API_SECRET_KEY`; it is never echoed.

| # | Case | Command | Result | Verdict |
|---|---|---|---|---|
| 1 | Unauthenticated page | `curl -i /dashboard` | 307 to `/login` | PASS |
| 2 | Unauthenticated API | `curl -i /api/library` | 401 | PASS |
| 3 | Unauthenticated generate | `curl -X POST /api/generate-video -d '{}'` | 401 | PASS |
| 4 | Invalid payload, authenticated | `curl -X POST -H "Authorization: Bearer $SECRET" -d '{}' /api/generate-video` | 400, no job created | PASS |
| 5 | Health reachability vs readiness | `curl -i /api/health` | 503, `status=degraded`, `ready=false`, `reachable=true`, `checks=local-storage-and-configuration`, only `youtube-publisher` failing in this env | PASS |
| 6 | `/health` alias | `curl -i /health` | 503, same payload | PASS |
| 7 | Unknown job | `curl -H "Authorization: Bearer $SECRET" /api/job-status/job_doesnotexist01` | 404 | PASS |
| 8 | Invalid execution token on claim | `POST /api/rendering/claim` with `executionToken:"invalid"` | 401 | PASS |
| 9 | Invalid callback payload/token | `POST /api/rendering/callback` with bad token | 400 (schema rejects before token check) | PASS (fails closed) |
| 10 | Renderer failure paths | `render-dispatch-fail-closed-security`, `render-worker-fail-closed` | 82 tests in the fail-closed batch pass | PASS |
| 11 | Duplicate callback | `basic-fastapi-idempotency`, `http-callback-authoritative-gate` | pass | PASS |
| 12 | Missing / corrupt / hash-mismatched artifact | `real-artifact-pipeline`, `f07-physical-truth` | pass | PASS |
| 13 | F07 rejection | `f07-physical-truth`, `f07-architectural-invariants` | pass, including "no fake production success" | PASS |
| 14 | Drive disconnected | `user-drive-connection` test 01; library mapping | `DRIVE_NOT_CONNECTED`, no admin fallback; UI shows local outbox / not delivered | PASS |
| 15 | Genuine Drive upload | not executed | No connected per-user Drive; connect is Pro-gated and needs owner OAuth consent | BLOCKED |
| 16 | Dispatch not configured | not executed | Needs a valid payload, which would enqueue a real production job | BLOCKED |
| 17 | Forged session, before fix | `curl -H 'Cookie: __session=fos_<forged-owner-payload>.deadbeef' /publishing/drive` | 200, and `/api/drive/list` 200 | FAIL before fix |
| 18 | Forged session, after fix | same request | 307 on pages, 403 on `/api/drive/list` | PASS after fix |
| 19 | Signed OWNER page | minted HMAC token | `/publishing/drive` 200 | PASS |
| 20 | Signed BASIC page | minted HMAC token | `/publishing/drive` 307, `/dashboard` 200 | PASS |
| 21 | Dialog keyboard | code + typecheck | Escape handler, `role="dialog"`, `aria-modal`, `aria-labelledby`, labelled close | PASS (static); focus trap NOT VERIFIED |
| 22 | Mobile reflow | code review | 1-column grids, `sm:`/`lg:` breakpoints, card stacks, `overflow-x-auto` table | NOT VERIFIED visually |
| 23 | Screenshots | desktop browser tool | `browser.tabs.open` / `navigate` timed out twice, tab stayed loading | BLOCKED |

## 5. Test outcomes (exact)

| Command | Result |
|---|---|
| `npx vitest run tests/product-acceptance.test.ts factoryos/tests/auth.test.ts factoryos/tests/user-drive-connection.test.ts --config vitest.config.ts` | 3 files, **37 tests passed** on the first commit; `product-acceptance` has since grown to 12 |
| `npx vitest run tests/media-video-ownership.test.ts tests/delivery-recovery.test.ts tests/product-acceptance.test.ts --config vitest.config.ts` | 3 files, **24 tests passed** (ownership video + thumb, durable receipt recovery, delivery projection, health readiness) |
| `npx vitest run render-dispatch-fail-closed-security render-worker-fail-closed http-callback-authoritative-gate basic-fastapi-idempotency basic-fastapi-security f07-physical-truth f07-architectural-invariants real-artifact-pipeline` | 8 files, **82 tests passed** |
| `npx vitest run creator-flow user-drive-connection delivery-fabric chaos-recovery product-acceptance` | 5 files, **35 tests passed** (`product-acceptance` has since grown to 11) |
| `npm run factoryos:typecheck` | pass (strict) |
| `npx tsc --noEmit` | 3 errors, all pre-existing: 2 in `factoryos/core/compute/notebooks/ColabNotebookAdapter.ts` (`NODE_ENV` on `ProcessEnv`, lines 739 and 754) and 1 in `.next/types/validator.ts` for `app/(os)/factory/editor/page.tsx`, which commit `061b4d06a` on `main` truncated to 22 lines with no default export. None in touched files. |
| `npx eslint <touched files>` | 0 errors; 1 pre-existing `react-hooks/exhaustive-deps` warning on `loadLibrary`. |

Mocked or fail-closed suites prove contracts, not a live render. They are labelled as such.

## 6. Accessibility and mobile

Fixed:
- Dialog semantics and keyboard dismissal; close button has an accessible name.
- Delivery state is a text label, not colour only.
- Library and delivery table have explicit loading, error, empty and retry states.
- Drive connection message uses `aria-live="polite"`.

Still open / not verified:
- No focus trap and no focus restoration on close; focus is not moved into the dialog.
- Contrast of 9–11 px secondary text on dark surfaces was not measured (no working browser session).
- `prefers-reduced-motion` was not tested for the shimmer and fade animations.
- Mobile layouts were reviewed in code only; no device or emulator render.

## 7. Anti-Slop Delivery Gate

| Gate | Result |
|---|---|
| No generic redesign or new design system | Pass: existing tokens, radii, spacing reused. |
| No invented metrics, testimonials or claims | Pass: removed 4.5 MB, 60 fps, 1080x1920, duration 45, 100% grounding, Guardian PASS, fake sync rows, fake uptime/latency. |
| No fake progress, health, upload or file status | Pass: unknown progress `null`; readiness is explicit; delivery comes only from a stored receipt. |
| `LOCAL_OUTBOX` never labelled Drive | Pass: distinct badge and copy in list, detail and Quick Generate. |
| Copy is plain, specific, no hype | Pass: labels state what was recorded and what was not. |
| Every async surface has loading/error/empty | Pass on library, detail, delivery table, drive card. |
| Accessibility basics present | Partial: semantics and labels yes; focus trap and measured contrast no. |

## 8. Top 3 blockers

1. **No proven end-to-end generation in a production configuration.** Dispatch is not configured and a real job needs owner approval, so the render, F07 and delivery chain is only proven by local fail-closed suites. The creator journey cannot be signed off as working in production from this branch.
2. **Per-user Drive delivery is still unproven.** Connecting Drive requires Pro capability plus owner OAuth consent, so a genuine upload was not executed. The receipt is now persisted into the job document (with the outbox file as fallback), which removes the worker-restart failure mode, but durable Firestore writes need real Firebase credentials to be proven. `saveJobManifest` falls back to the in-process store when Firebase is absent.
3. **Resolved in this branch:** the cross-tenant media read. `GET /api/media/video/[jobId]` and `/api/media/thumb/[jobId]` now check ownership (manifest owner, or jobs referencing a content hash) and fail closed for unowned artifacts; covered by `tests/media-video-ownership.test.ts`.

## 9. Residual risks

- Legacy library rows store absolute Windows paths in `videoUrl` and lack resolution/fps; the UI is now honest, but those videos still will not play in a browser.
- `/api/delivery` and `DeliveryManager` still fabricate `gdrive_file_*` IDs and `signed_auth_token_*` URLs on a legacy path. The creator UI no longer uses them, but the contract is still fake. Owner decision needed.
- Quick Generate still sends `delivery: { target: "GOOGLE_DRIVE", allowFallback: false }`, which the server schema ignores. Harmless today, misleading to the next reader.
- Health checks configuration and SQLite only. External reachability is explicitly not probed; `/api/render-engine-health` remains the live probe.
- The outbox receipt reader assumes a local filesystem. The job document is now read first, so this is a fallback only.
- `app/(os)/factory/editor/page.tsx` is truncated on `main` (commit `061b4d06a`, 897 bytes, no default export), so `tsc --noEmit` and the CI typecheck fail before this branch's changes. Out of scope here; needs an owner decision to restore the page.
- Full `factoryos:test` was not rerun in this iteration; the targeted acceptance suites above are the evidence. A prior full run had 113 failures, mostly outside the touched surfaces.
- No screenshot or device evidence because the desktop browser tool timed out.
- `next build` passed on `9f64f664a` (109 routes) but was not rerun after the durable-delivery additions. Full `factoryos:test` was not run this iteration.

## 10. Safe repro

```bash
cd apps/web
npm run dev -- --port 3100

# Readiness vs reachability
curl -i http://localhost:3100/api/health
curl -i http://localhost:3100/health

# Auth boundaries
curl -i http://localhost:3100/api/library
curl -i -X POST -H "Content-Type: application/json" -d '{}' http://localhost:3100/api/generate-video

# Authenticated, non-mutating
curl -i -H "Authorization: Bearer $INTERNAL_API_SECRET_KEY" "http://localhost:3100/api/library?limit=1"
curl -i -H "Authorization: Bearer $INTERNAL_API_SECRET_KEY" http://localhost:3100/api/job-status/job_doesnotexist01

# Fail-closed callback
curl -i -X POST -H "Content-Type: application/json" \
  -d '{"jobId":"job_doesnotexist01","executionToken":"invalid"}' \
  http://localhost:3100/api/rendering/claim

# Delivery truth tests
npx vitest run tests/product-acceptance.test.ts --config vitest.config.ts
```

Signed-page checks require a valid `fos_` cookie; it can be minted with the session secret and should be treated as a credential. Do not paste it into tickets.

## 11. PR

Branch: `feat/product-acceptance-20261029`. No push and no remote PR were made, because the brief requires owner approval for publication.

Suggested title: `feature: creator journey truth fixes and delivery acceptance`

Suggested body:
- Replace fabricated library, health, progress and delivery values with recorded facts.
- Surface delivery receipts, including the distinction between a local outbox copy and a Google Drive upload.
- Add a creator-facing Drive connect/disconnect card.
- Verify `fos_` session signatures in middleware and gate Drive operator APIs to admins.
- Add focused acceptance tests for delivery projection, receipt reading and health readiness.

## 12. Screenshots

BLOCKED. The desktop browser tool accepted the tab but `navigate` and `tabs.open` timed out with the tab stuck loading, twice. Text repro and HTTP/page evidence above are the substitute. Do not treat this report as visual sign-off.
