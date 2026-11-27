# ShortForge 13-Layer Production Truth Register

**Status:** CANONICAL-ENGINEERING / TRUTH-REGISTER  
**Version:** 1.0.0  
**Date:** 2026-11-27  
**Authority:** `.okf/charter.md`  
**Purpose:** Map the generic “13 layers of a production AI app” framework onto what ShortForge **actually uses**, what is only partially implemented, what is targeted, and what must never be claimed without evidence.

---

## 0. Operating rule

**CLAIM ≤ EVIDENCE.**

This file is not a marketing document. It records the current engineering truth using this precedence:

```text
executable code + tests + physical artifacts
  > acceptance dossiers
  > .okf canonical contracts
  > README / architecture docs
  > old transcripts / aspirational plans
```

Status labels:

| Label | Meaning |
|---|---|
| `VERIFIED` | Confirmed by code, tests, or physical artifact evidence. |
| `PARTIAL` | Some implementation exists, but the production gate is not fully proven. |
| `DOCUMENTED` | Present in docs/contracts; code-level re-verification required. |
| `TARGET` | Intended design, not proven implementation. |
| `SUPERSEDED` | Old idea explicitly replaced by current charter/doctrine. |
| `N/A` | Not applicable to ShortForge’s current stack. |

**Hard rules:**

1. The 13 layers are **audit lenses**, not new governance sovereigns.
2. Do not add roles to the authority tree. The charter remains: Human Co-Leads → Overseer → factory-wide roles → per-floor Guardian structure → F07.
3. Do not replace ShortForge’s stack with the generic kit defaults. ShortForge is not a blank Vite/FastAPI/Postgres project.
4. Obsidian may be a **human cockpit / projection layer**, never the production system of record.
5. Silent degraded output is superseded. ShortForge fails closed: no unverified artifact ships.

---

## 1. Actual ShortForge stack snapshot

| Concern | Actual ShortForge implementation | Truth status |
|---|---|---|
| Control plane | Next.js App Router / React / TypeScript monorepo under `apps/web` | DOCUMENTED; re-verify exact versions from `apps/web/package.json` |
| Execution plane | FastAPI rendering services under `services/rendering-engine` (`main.py`, `basic_render_api.py`, workers) | VERIFIED |
| Canonical media script | `services/rendering-engine/scripts/create_short.py` | VERIFIED |
| Python floors | `services/pipeline/floor01_strategy` … `floor06_rendering` | VERIFIED structure; runtime parity needs audit |
| Governance knowledge | `.okf/` tree, charter, authority registry, hierarchy contracts | VERIFIED at P0 branch `0d6d0cf2` |
| Application state | Firestore | DOCUMENTED |
| Operational intelligence | MongoDB | DOCUMENTED + Treasurer contract |
| Local queue / authorization state | SQLite / better-sqlite3 WAL | DOCUMENTED |
| Artifact storage | SHA-256 CAS + Cloudinary | VERIFIED CAS pattern; fleet acceptance dossier |
| Render fleet | InstaBox physical nodes + ComputeRouter provider adapters | VERIFIED fleet acceptance |
| Composition schema | `TimelineIR.ts`, `CompositionIR.ts`, `MEDIA_TIMEBASE = 120_000` | VERIFIED schema exists |
| Actual shipping composition | PIL + FFmpeg via `create_short.py` | VERIFIED |
| Remotion | Claimed in docs, but no production render invocation evidenced in audited tree | TARGET / CLAIM GAP |
| Voice | edge-tts in shipping script; broader VoiceFabric / multi-provider architecture documented | PARTIAL |
| Subtitles | faster-whisper in shipping script; word-level alignment not fully proven | PARTIAL |
| Verification | RenderArtifactVerifier + F07 gates + Ed25519 release receipts | VERIFIED machinery; shipping-path bypass is the gap |

---

## 2. Actual repository structure

```text
ShortForge/
├── .okf/                              # Executable knowledge / governance constitution
│   ├── charter.md                     # CANONICAL-FOUNDING authority tree
│   ├── architecture/authority-registry.json
│   ├── hierarchy/                     # Role contracts
│   ├── rendering/                     # Render contracts
│   ├── artifacts/                     # Artifact / lineage / timeline contracts
│   └── production/13-layer-production-truth.md  # THIS FILE
│
├── apps/web/                          # Control plane
│   ├── app/api/                       # Route handlers
│   ├── factoryos/                     # Sovereign kernel / tests / compute / verification
│   ├── lib/                           # Auth, CAS, rendering queues, python-runner
│   ├── content-engines/               # Quiz / facts / story / etc.
│   └── components/                    # UI / Overseer / QuickGenerate
│
├── services/
│   ├── rendering-engine/              # FastAPI + canonical create_short.py
│   ├── pipeline/                      # Python floor implementations
│   └── instabox-agent/                # Physical worker agent
│
├── floors/                            # Legacy / compatibility floor namespace
├── factoryos/                         # Legacy internal fabric codename
├── hybrid-video/                      # Renderer packaging / legacy consolidation area
├── docs/                              # Acceptance / architecture / security dossiers
├── scripts/                           # Verification / soak / OKF tooling
├── testing/                           # Evidence / visual / situation graphs
└── tests/                             # Cross-cutting tests
```

**Ownership rule:** parallel coding agents may own disjoint paths, but shared files (`package.json`, `main.py`, route registries, CI workflows, charter registry) are changed only through an explicit wiring step.

---

## 3. The 13 layers mapped to ShortForge truth

### L01 — Frontend Foundations

**Generic question:** What does the user see and touch?

**ShortForge reality:**
- Next.js / React control plane and dashboard.
- Overseer command surface exists as text/command UX.
- QuickGenerateOverlay is a known god-component (`TECH_DEBT_AUDIT.md ARC-02`).
- Voice↔voice Overseer and waveform states are founding UX targets, not verified production features.

**Status:** `PARTIAL`

**Production gate:**
- No secrets in browser bundle.
- AI calls go through ShortForge backend, never directly to providers from the client.
- Streaming / polling states exist for long renders.
- Overseer answers from factory state, not invention.
- QuickGenerate decomposed into testable components.

---

### L02 — APIs & Backend Logic

**Generic question:** Where does trusted work happen?

**ShortForge reality:**
- Next.js route handlers for control plane.
- FastAPI render APIs (`:8080`, warm Basic `:8100`).
- `python-runner.ts` invokes canonical `create_short.py`.
- Zod validation at trust boundaries.
- Fenced InstaBox callback exists.
- **Gap:** `create_short.py` historically self-committed status and fabricated URLs, bypassing the trusted callback path.

**Status:** `PARTIAL`

**Production gate:**
- One commit path: worker → result.json + hash → fenced callback → verifier → CAS → control plane state.
- No worker-side Firestore `completed` writes.
- No synthetic `storage.factoryos.app/renders/...` completion URLs.
- Correct failure states: `FAILED`, `BLOCKED`, `AUTH_NOT_CONFIGURED`, never fake success.

---

### L03 — Database & Storage

**Generic question:** Where does data live?

**ShortForge reality:**
- Firestore: application state / users / video catalog.
- MongoDB: operational intelligence, treasury, missions, worker reports.
- SQLite: local queue / authorization state machine.
- CAS: immutable artifact bytes by SHA-256.
- Cloudinary: media distribution.
- No primary Postgres/pgvector stack in the audited production path.
- Obsidian, if used, is a human cockpit projection, not a backend database.

**Status:** `VERIFIED` pattern, `PARTIAL` durability proof.

**Production gate:**
- Files live in CAS/object storage, not DB rows.
- DB stores hashes/paths/metadata.
- CAS publish order: bytes durable → verified → pointer committed.
- Backups and restore drills must be evidenced before claiming recovery readiness.

---

### L04 — Auth & Permissions

**Generic question:** Who are you and what may you do?

**ShortForge reality:**
- Firebase Admin session verification / RBAC documented.
- Execution tokens for render jobs.
- Per-worker InstaBox HMAC secrets.
- Timing-safe callback authentication.
- Exact attempt fencing in callback route.
- Guardian capability authorization is charter law.

**Status:** `VERIFIED` for worker fencing; `DOCUMENTED` for app-wide RBAC.

**Production gate:**
- Identity/role/plan never trusted from request body.
- Worker callbacks require executionToken + workerId + jobId + executionId + attempt equality + expiry.
- Guardian capability and Treasurer economic approval are independent gates.
- Cross-user access tests must prove isolation.

---

### L05 — Hosting & Deployment

**Generic question:** How does code become a live service?

**ShortForge reality:**
- Vercel / Next.js control plane.
- Firebase hosting config present.
- box1 control-plane systemd service.
- InstaBox worker services.
- Docker renderer packaging.
- Vercel hobby guard / cron workaround documented.
- Preview/prod environment separation not fully proven in audit.

**Status:** `PARTIAL`

**Production gate:**
- Separate dev / preview / production secrets and data stores.
- Long renders never depend on short serverless request lifetimes.
- Rollback path documented and tested.
- Repo/workspace moved out of OneDrive sync path before flagship reliability claims.

---

### L06 — Cloud & Compute

**Generic question:** What machines run the work?

**ShortForge reality:**
- ComputeRouter with heterogeneous providers.
- InstaBox 11-node physical fleet.
- Warm Basic render pool.
- GitHub Actions fallback.
- Kaggle / RunPod / Vast / AMD / Local / hosted sandbox adapters documented.
- Treasurer reserve/settle governs spend.
- Lightning was an earlier warm-renderer stepping stone, superseded by InstaBox fleet.

**Status:** `VERIFIED` fleet; `PARTIAL` unified routing.

**Production gate:**
- Every production render, including long quiz content, routes through the same fenced/verified path.
- No accidental duration clamp that forces real content around the gate.
- Provider qualification + golden canary per toolchain.
- Idle/expensive resources bounded by Treasurer.

---

### L07 — CI/CD & Version Control

**Generic question:** How are changes shipped safely?

**ShortForge reality:**
- GitHub Actions.
- Husky / commitlint.
- Vitest suites.
- P0 added `okf:authority` drift lock and charter-hash sync.
- Dual lockfile debt (`package-lock.json` + `pnpm-lock.yaml`) recorded in `TECH_DEBT_AUDIT.md PKG-01`.

**Status:** `PARTIAL`, improving to `VERIFIED` after P0 merge + CI enforcement.

**Production gate:**
- One package manager.
- Branch protection on main.
- Charter drift test required in CI.
- Media invariant tests required in CI.
- Secret scanning enabled.
- No AI-generated diff merged without evidence dossier.

---

### L08 — Security & RLS

**Generic question:** How is data and execution protected?

**ShortForge reality:**
- SSRF hardening exists for flag/background fetch path.
- Timing-safe worker auth.
- Capability sandboxes / least privilege documented.
- Per-worker secret isolation.
- Postgres RLS is `N/A` because ShortForge does not use Postgres as primary production DB.
- Equivalent control is server-side ownership scoping + RBAC + fenced worker identity.
- Gap: `_download_image()` for FLUX CDN lacked the same SSRF guard in audited script.

**Status:** `PARTIAL`

**Production gate:**
- Every user-owned query scoped by verified identity.
- Every external fetch SSRF-guarded, including redirect hops.
- No secrets in repo/logs.
- Prompt/tool injection boundaries enforced by Guardian/BDA contracts.
- Risky actions require explicit authorization.

---

### L09 — Rate Limiting & Quotas

**Generic question:** How is abuse and spend prevented?

**ShortForge reality:**
- Treasurer economic admission: QUOTE / RESERVE / SETTLE / RELEASE / FREEZE.
- User quota / token economy documented.
- Provider circuit breaking exists but threshold needs tightening.
- edge-tts retry loop exists in shipping script.
- Provider spend caps are manual/operator responsibilities unless evidenced otherwise.

**Status:** `PARTIAL`

**Production gate:**
- Rate limits per user/IP/worker.
- Daily quotas and token budgets enforced before spend.
- 429 + Retry-After semantics.
- Provider backoff bounded.
- Treasurer settlement requires verification receipt where marked verificationRequired.
- Hard spend caps/alerts configured and evidenced.

---

### L10 — Caching & CDN

**Generic question:** How is repeated work made cheap and fast?

**ShortForge reality:**
- Cloudinary media CDN.
- Image cache in `create_short.py`.
- CAS content-addressed reuse.
- Warm worker pools.
- Gap: image cache key was `sha256(prompt)` only; model/params/toolchain must be included.
- Provider prompt caching not verified.

**Status:** `PARTIAL`

**Production gate:**
- Cache keys include model + params + prompt version + toolchain where relevant.
- Personal answers never cached under shared keys.
- TTLs explicit.
- CAS dedup only trusted when toolchain determinism is proven.
- Cache hit/miss metrics exported.

---

### L11 — Load Balancing & Scaling

**Generic question:** What happens under load?

**ShortForge reality:**
- 11-node fleet concurrency benchmark: 11/11 passed, 35.65s, unique digests.
- Health/ready endpoints on warm renderer.
- Lease/heartbeat fencing.
- Control plane is effectively a monolith with distributed workers, not fully microservice-isolated floors.
- DB pooling / k6 launch tests not fully evidenced.

**Status:** `VERIFIED` fleet benchmark; `PARTIAL` product-scale proof.

**Production gate:**
- Stateless control-plane instances where scaled.
- DB connection budget documented.
- Autoscaling/worker concurrency has maximums.
- 200-video soak through unified path.
- Provider rate limits checked against launch targets.

---

### L12 — Error Tracking & Logs

**Generic question:** How do we know what happened?

**ShortForge reality:**
- Comms fabric / event contracts.
- MongoDB operational reports.
- Decision ledger / verification receipts.
- Render timings and worker metrics.
- Gap: shipping script uses print-style logging; Sentry/Langfuse-grade tracing not verified.
- F07 evidence exists, but content-quality telemetry is incomplete.

**Status:** `PARTIAL`

**Production gate:**
- Structured logs with correlationId/jobId/executionId/floorId.
- No secrets/PII in logs.
- Every render emits per-floor telemetry.
- Every LLM/provider call records cost/latency/status.
- Alerts on yield, escape rate, drift, loudness, spend, fleet health.

---

### L13 — Availability & Recovery

**Generic question:** How does the system survive failure?

**ShortForge reality:**
- Slayer investigates/classifies.
- Healer performs bounded recovery.
- ReMaker performs scoped reconstruction.
- Lease expiry / drain / undrain / daemon restart chaos recovery evidenced.
- CAS + last-known-good pattern documented.
- Gap: synthetic URL fallback violated fail-closed doctrine.
- Backups / restore drills / RPO / RTO not fully evidenced.

**Status:** `PARTIAL`

**Production gate:**
- No silent degraded shipping.
- Bounded retries and repair budgets.
- Restore drill evidenced.
- RPO/RTO written and tested.
- Incident runbook exists.
- Failed verification routes to DLQ/escalation, never publication.

---

## 4. ShortForge-specific production layers beyond the generic 13

The generic 13 layers are necessary but not sufficient for ShortForge. The factory also requires:

| Extra concern | Charter owner | Truth |
|---|---|---|
| Authority drift lock | Human Co-Leads + Overseer + CI | VERIFIED at P0 `0d6d0cf2` |
| Artifact physical integrity | Auditor + F07 | VERIFIED machinery; shipping-path wiring pending |
| Media determinism | Guardian F05/F06 + RenderFabric | PARTIAL; CompositionIR exists, executor must consume it |
| Economic admission | Treasurer | VERIFIED contract; enforcement coverage needs audit |
| Surgical reconstruction | ReMaker | DOCUMENTED / PARTIAL |
| Controlled improvement | Instructor + Devourer | TARGET / propose-only |
| Human cockpit | Human Co-Leads | Obsidian optional; never system of record |

These are **not new sovereign roles**. They are contracts/subsystems under the existing charter.

---

## 5. Phase mapping

| Phase | Layers primarily affected | Required outcome |
|---|---|---|
| P0 | L07, L08, governance | Charter enshrined, registry mirrored, drift CI green |
| P1 | L02, L04, L08, L13 | One fenced commit path; no self-commit/synthetic URLs |
| P2 | L03, L08, L12, L13 | Doctrine executable: loudness/drift/faststart/geometry gates |
| P3 | L06, L10, L11 | Boring deterministic media core; sample lattice; pinned toolchain |
| P4 | L06, L09, L12 | Prune/re-home accretions; every active role earns enforcement |
| P5 | L07, L11, L12, L13 | 200-video soak: yield ≥99.5%, escape=0, MTBF≥200 |
| P6 | L01, L07, L12 | Claim↔evidence honesty; README claims linked to tests/artifacts |

---

## 6. Audit protocol

When auditing ShortForge against this file:

1. **Read-only first.** No edits during audit.
2. For each layer, produce:
   ```text
   LAYER: Lxx
   STATUS: VERIFIED | PARTIAL | DOCUMENTED | TARGET | N/A
   EVIDENCE: file:line / command output / artifact hash
   GAP: concrete missing production gate
   FIX: bounded next action
   OWNER: existing charter role, not a new role
   ```
3. Do not award `VERIFIED` from README prose alone.
4. Do not treat old transcripts as current truth.
5. Any contradiction with `.okf/charter.md` is a defect.
6. Any new sovereign role requires Human Co-Lead charter amendment.

---

## 7. Wiring

Add to `.okf/index.md` under engineering/production references:

```markdown
- `production/13-layer-production-truth.md` — canonical 13-layer production truth register for ShortForge.
```

Add to `.okf/engineering-stack.md` a reference:

```markdown
For the production-readiness truth matrix, see `production/13-layer-production-truth.md`.
```

Do not modify the authority registry for this file. The 13 layers are audit lenses, not roles.

---

## 8. Final principle

ShortForge is not trying to become a generic 13-layer AI SaaS template.

ShortForge is a governed autonomous video factory. The 13 layers are the minimum production hygiene underneath that factory. The charter is the authority model. The media pipeline is the production capability. The evidence is the judge.

**The map is useful only if it matches the territory. This file exists to keep the map honest.**
