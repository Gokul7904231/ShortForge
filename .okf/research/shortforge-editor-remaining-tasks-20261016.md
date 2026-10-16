# ShortForge Editor — Remaining Tasks Register

**Audit date:** 16 October 2026  
**PR:** [#242 — feat(editor): wire dedicated ShortForge editing page](https://github.com/Gokul7904231/ShortForge/pull/242)  
**Branch:** feat/shortforge-editor-20261012  
**Latest inspected head:** 1fa812b97fde02179f4f94aa88e13ad7378a0cb0 (workflow evidence inspected from 13 October 2026)  
**Verdict:** PARTIALLY IMPLEMENTED — NOT PRODUCTION-READY.

This task register is evidence-based: the presence of a helper or a successful isolated test is not proof of end-to-end completion.

## 1. Executive verdict

The editor page, Edit entry points, CAS-backed source scaffolding, owner-authorized playback, basic trim/split/caption controls, timeline-preservation improvements and many targeted tests exist on the branch. But the product promise—edit one quiz question or scene and download a newly verified Short—is not yet fulfilled in the normal generation path.

Three top blockers:
1. **Real source assets:** EditorSourcePackage only succeeds when actual input media resolves. The standard generation path can carry placeholder image URLs such as /api/images/{jobId}_{index}.jpg; the builder correctly declines to package them and the editor falls back to one flattened MP4. Some template-specific LocalRenderIntent paths also need a faithful adapter.
2. **Quiz semantics:** the branch preserves several scene IDs, source versions, trims, caption metadata and transitions, but it does not yet provide a verified question-ID/index to scene/caption/audio binding with edit commands that rebuild the right dependent assets.
3. **Verified export:** Export remains locked. The complete server-authorized path through worker-side CAS staging, Treasury, F06, output CAS, physical media checks and exact-digest F07 verification is not wired end-to-end.

## 2. Current verified state

### Existing on branch
- Dedicated /factory/editor?jobId=... page; Edit links from generation completion and Media Library.
- Authenticated legacy MP4 import with owner/state checks, bounded source size, media probing and CAS copy.
- Owner-authorized byte-range playback with SHA-256 checks.
- Server-side CAS source resolution and source-composition identity checks before revision 0.
- Conditional EditorSourcePackage builder that validates real assets, copies inputs and composition into CAS, and can attach a package record to job history.
- Job-history hardening for persisted-owner merges, awaited editor-source writes and fail-closed persistence behavior.
- Basic clip movement, trim/split, transform/keyframe/effect/mask/transition controls, undo/redo and checkpoints.
- Revision-checked caption text/style commands and a caption inspector when source caption cues exist.
- F02 format to F03/F05 timeline composition-type propagation, plus preservation of supported scene/source IDs, source versions, trims, caption metadata and transition records.
- Research blueprint and Team Change Report.

### Latest inspected CI snapshot — 13 October 2026
| Check | Result |
|---|---|
| TypeCheck & Floor 01 contract tests | Pass |
| Floor 01 Python v2 tests | Pass |
| Security & dependency scan | Pass (not an adversarial application-security qualification) |
| Production container smoke | Pass |
| Editor → F06 → CAS → F07 physical-proof workflow | Pass |
| F05 validation | Pass |
| F02/F03 production gates | Pass |
| Team Change Gate / OKF Governance Gate | Pass |
| Full informational Vitest suite | **Fail: 60 files failed, 253 passed, 3 skipped; 55 tests failed, 1,465 passed, 9 skipped** |
| durable-editor.test.ts | **3 failures** involving persisted command/restart-safety and undo/redo history |

Focused new editor tests passed in that logged run (source-package, CAS tamper, trim/split, job-history source persistence, caption commands and TimelineIR metadata). The three durable-editor failures are directly relevant and remain blockers until fixed or conclusively shown to reproduce unchanged on main. Other Vitest failures span unrelated systems; do not assign blame to this PR without baseline comparison.

**Freshness:** I did not observe a newer current-head workflow set for 16 October. This is the latest verified evidence available for the inspected head, not a claim that CI was rerun today.

## 3. P0 — release and correctness blockers

### SFED-01 — Make source packages work in the normal generation path
**Status:** Partial; critical blocker.  
**Work:** Trace each supported generation mode from F02/F03/F04 through F05/F06 to the real bytes rendered. Emit stable asset IDs, source scene IDs, real media kinds, CAS digest, byte length, MIME, timing and rights/provenance. Replace placeholder URLs with resolved assets; explicitly record packaging fallback reasons. Add correct adapters for supported template-specific renderer paths or reject them visibly. Persist the immutable package reference on the authoritative owner-bound job before advertising it as editable.  
**Done when:** a generated quiz Short opens with the exact resolved original scenes/assets and verified digests for every supported mode; legacy or unsupported jobs are honestly labelled flattened-only. Test this with the real generation handoff, not only synthetic RenderIntent fixtures.

### SFED-02 — Close F05 → TimelineIR → CompositionIR fidelity gaps
**Status:** Partial.  
**Work:** Carry source media kind end-to-end rather than assuming all visuals are images. Produce real word-level caption cues from measured audio/alignment; do not guess timings from word counts. Preserve source trims/durations, versions, scene IDs, transitions and supported motion metadata. Make conversion deterministic and loss-aware; explicitly report unsupported fields. Test the real F05 payload through TypeScript upgrade and F06 lowering.  
**Done when:** every supported field is preserved in the saved package and render intent, unsupported fields are declared as loss, and physical output verifies transition, caption and timing behavior.

### SFED-03 — Add actual quiz-semantic edit operations
**Status:** Not implemented end-to-end.  
**Work:** Define explicit question ID/index to scene IDs, narration IDs, caption cue IDs, answer-reveal timing and text-bearing visual references. Add validated revisioned operations (e.g. update question/options/answer, replace a scene asset, update narration). Record the dependency set and preservation requirements. If question text is baked into an image, regenerate the scene through a qualified renderer/generator; changing metadata alone is not an edit to the video pixels.  
**Done when:** editing one question changes the intended output and preserves unrelated questions/scenes, with factual/answer correctness and timing tests.

### SFED-04 — Complete secure production export (keep UI locked until then)
**Status:** Not implemented end-to-end.  
**Work:** Add a server-controlled export operation loading the persisted document/head; bind the candidate to composition hash, expected revision and idempotency key. Stage all CAS source assets on the selected F06 worker and verify worker-side hashes. Apply server-authorized Treasury/economic admission plus required lease/fencing. Render with F06; commit output bytes to CAS; physically inspect/decode the MP4 and check duration, geometry, streams, sync and digest; require F07 verification for the exact output digest. Only then offer a private owner-authorized download. Handle cancellation, duplicate requests, retries, worker loss and orphan outputs. Publishing stays a separate explicit action.  
**Done when:** an edited revision yields a distinct immutable MP4 and hash, all real worker inputs were verified and the physical/F07 receipts agree. Until then, no enabled export/download path for edited output.

### SFED-05 — Fix editor revision/history tests and classify broad regression failures
**Status:** Blocking qualification.  
**Evidence:** Three failures in apps/web/factoryos/tests/durable-editor.test.ts around commands across restart, undo/redo navigation revisions and branching after undo; 55 test failures in the broad Vitest suite.  
**Work:** Run the three history tests individually on the PR head; record failed assertions and revision-store contents. Run the same cases against a clean current main baseline. Fix PR-caused history/idempotency regressions; test concurrent writers, duplicate command IDs, stale revisions, restart-safe undo/redo and checkpoint restore. Classify remaining broad-suite failures as baseline, regression, environment/dependency or unclassified; rerun after fixes.  
**Done when:** all editor-specific history tests pass; other failures have reproducible classification and an explicit merge policy.

### SFED-06 — Adversarial security and concurrency qualification
**Status:** Partial implementation; application-level security not proven.  
**Work:** Test unauthenticated/viewer/foreign-owner/deleted-job requests; package/composition tampering; stale revisions; source manifest/asset-set mismatch; SSRF, redirect-to-private-IP, unsafe scheme/host and path traversal; byte-range edge cases; CAS byte tampering; races across requests/instances; durable-store read/write/timeout failures. Run API/browser adversarial tests, not only dependency scanning.  
**Done when:** owner isolation, integrity, concurrency and failure-mode tests pass; untrusted media/source inputs fail closed; security claims in Team/OKF documentation match actual evidence.

### SFED-07 — Browser end-to-end and deployed smoke tests
**Status:** Not demonstrated by current evidence.  
**Work:** Add browser tests for both Edit entry points, loading/failure/fallback states, caption editing, trim/split, undo/redo, checkpoints, physical preview, refresh/resume and foreign-owner denial. Check mobile layout, keyboard/focus/labels, media byte-range loading and deployed session/CORS behavior. Confirm deployed configuration and that no stale UI exposes Export.  
**Done when:** current-head browser tests pass in CI and a deployed test environment with evidence of both happy and negative access paths.

## 4. P1 — make the native editor genuinely useful

### SFED-08 — Prove each exposed control is implemented by F06
The UI exposes transforms, keyframes, effects, masks, transitions, movement, trim and split. Accepted commands do not prove physical render behavior. Build an operation-to-render matrix and test IR mutation → intent lowering → physical output. Disable any unsupported control for renderer profiles that cannot honor it. Include combinations. **Done:** every enabled control has physical regression proof.

### SFED-09 — Dependency-aware minimal rerendering
Define cache identity from source hashes, semantic scene data, timings, narration/caption content, style/effects and renderer/profile version. Caption-style changes must not regenerate narration/assets; narration changes may invalidate word cues and dependent timing. Assert the exact dirty-node set and unchanged asset hashes. Keep ReMaker behind its admission gate. **Done:** targeted rebuild preserves unrelated assets and measured cost/time is truthful.

### SFED-10 — Verified scene-visual replacement
Add an asset picker/search/regeneration path that resolves real bytes to CAS, captures provenance/rights and replaces one stable scene ID. Handle media kind, crop, dimensions, duration/audio, retrieval failure and rollback. **Done:** one scene can be replaced and physically rendered while unrelated scenes/audio/captions pass preservation checks.

### SFED-11 — Audio and measured caption timing
Implement narration/voice selection or regeneration, music/SFX tracks, fades/ducking, audio alignment and word-cue editing. Use measured audio duration and real alignment, preserve human caption fixes, and ensure position/style metadata is physically honored or labelled unsupported. **Done:** output streams/captions meet explicit sync and readability criteria.

### SFED-12 — UX and revision lifecycle
Make edit/preview state and command receipts obvious; show autosave/checkpoint state; add revision history/diff/restore; bind scene selection to caption/audio/quiz fields only when metadata explicitly relates them. Verify drag semantics, shortcuts, responsive layout and large timelines. Tie preview frames to the relevant revision/hash. **Done:** creators can identify the current revision, pending changes and matching preview, with reliable history and accessible controls.

## 5. P2 — optional parity and platform capabilities

- **SFED-13: OpenTimelineIO interchange.** Versioned import/export, round-trip tests and explicit loss reports. CompositionIR remains canonical.
- **SFED-14: Advanced effects/browser acceleration.** WebCodecs/WebGPU only as capability-detected preview acceleration. Background removal, grading/LUTs and advanced effects require allowlists, performance budgets and render-parity tests.
- **SFED-15: Agentic edits/variants.** Bounded intent compiler with target ID, expected revision, preservation list, impact/cost, limits and approval. The model cannot mint grants/budgets or run arbitrary tools.
- **SFED-16: Third-party license/adaptor decision.** Review licenses before vendoring/dependency changes. Concat is AGPL-3.0-or-later; OpenCut planned APIs/headless/plugin behavior must not be assumed production-ready. Keep OTIO optional.
- **SFED-17: Provenance/rollout hardening.** Optional C2PA, telemetry/cost metrics, fault recovery, accessibility, staged rollout and CAS garbage collection after the P0 flow is stable. C2PA does not replace CAS/F07.

## 6. Recommended execution order

| Order | Tasks | Exit gate |
|---|---|---|
| 1 | SFED-05, SFED-06, SFED-07 | Editor history passes; broad failures classified; security and E2E added |
| 2 | SFED-01, SFED-02 | Real generation opens verified original composition and resolved source assets |
| 3 | SFED-03, SFED-11 | Quiz/audio commands have explicit targets and preservation tests |
| 4 | SFED-08, SFED-09, SFED-10 | Physical render effects and exact dirty-node/preservation proofs pass |
| 5 | SFED-04 | Worker staging + Treasury + F06 + CAS + physical checks + exact-digest F07 verification |
| 6 | SFED-12 through SFED-17 | Core path stable; advanced parity/AI features can be added safely |

## 7. Release acceptance checklist

- [ ] Both Edit entry points open the dedicated editor page.
- [ ] Supported generation modes open the persisted CAS-backed source composition/assets, not only a flattened MP4.
- [ ] Legacy/unsupported jobs clearly indicate flattened clip-level editing only.
- [ ] Question/scene/caption/audio relations use stable explicit IDs; none are inferred from list position.
- [ ] Caption, trim, split, transform, effect, mask and transition controls have physical render proof or are disabled where unsupported.
- [ ] Revision/restart, undo/redo, checkpoint/restore, stale revision and idempotency tests pass.
- [ ] Owner isolation, CAS integrity, SSRF/path/range attacks, durable-store failures and concurrent updates are tested.
- [ ] Full suite is green or remaining failures have a verified main baseline and approved merge policy; editor history tests pass.
- [ ] Inputs are staged and digest-verified on the selected F06 worker; Treasury admission is server-authorized/bounded.
- [ ] New MP4 is stored in CAS and independently probed/decoded with audio-video sync validation.
- [ ] F07 verifies the exact output digest before private owner-authorized download; publish remains separate.
- [ ] Browser E2E and deployed happy/negative-path smoke tests pass.
- [ ] Team/OKF status matches current-head evidence and does not claim security proven without adversarial tests.

## 8. Do not start yet

Do not start a full CapCut clone, vendor Concat wholesale, depend on unfinished OpenCut planned APIs, implement frame-level differential encoding, create a plugin marketplace or permit arbitrary scripts/shaders, or auto-publish edits. These widen scope while source fidelity, revision reliability and verified export remain unresolved.

## Bottom line

The highest-value next work is to fix the real-source package handoff for every supported generation mode; finish the F05-to-CompositionIR fidelity contract; implement question/scene-aware commands with preservation and dependency proofs; resolve the three durable-editor failures and classify broad regression failures; add adversarial browser/API tests; and wire worker-side staging, Treasury, F06, CAS and exact-digest F07 verification before enabling export.

**Until those gates pass, keep PR #242 in draft and keep export/download of edited output disabled.**
