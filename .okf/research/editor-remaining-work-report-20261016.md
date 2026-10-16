# ShortForge Editor — Remaining Work Report

**Audit date:** 16 October 2026  
**Repository:** https://github.com/Gokul7904231/ShortForge  
**Working PR:** https://github.com/Gokul7904231/ShortForge/pull/242  
**Branch:** \`feat/shortforge-editor-20261012\`  
**Audited branch commit:** \`ad9d68e7e42c4061903cb412cbbe9657062b4b13\`  
**Decision:** **NOT READY TO MERGE OR RELEASE** — the editor page and bounded editing controls exist, but the core generated-quiz-to-editable-source path is incomplete, safe export is not wired, and current-head CI was still running when this report was prepared.

## Executive conclusion

ShortForge has moved beyond a blank editor page. The branch contains a dedicated editor route, generation/library Edit entry points, a native Studio using CompositionIR and DurableEditor, a conditional CAS-backed source-package builder, owner-bound source import/playback, caption text/style commands, scene/clip navigation, trim/split controls, and regression tests.

The main gap is still **source truth**. The regular generation path can pass logical scene rows and placeholder paths such as \`/api/images/{jobId}_{index}.jpg\`, not the exact resolved media bytes. The source-package builder correctly refuses missing, unsupported, or unproven media and the editor falls back to a visibly labelled flattened MP4. That fallback is honest and useful, but it is not the requested scene-level quiz editor. The existing Python F05 TimelineIR also is not yet the portable, owner-bound CAS package consumed by the editor on every job path.

A second release blocker is **export**. The UI intentionally keeps Export locked. A production export endpoint must stage CAS inputs on the selected F06 worker, use server-authorized Treasury context, render and physically inspect the actual output, commit the output to CAS, and reconcile an independent F07 receipt before enabling download. Publishing remains separate.

A third concern is **qualification**. On the preceding audited commit (\`687b10bc699e88cabc0dd676ab9dfeb6874b6bc2\`), current workflows showed specific failures. Two editor TypeScript errors and one fixture-duration failure were addressed in subsequent commits now on the audited head. Fresh validation for \`ad9d68e\` was still pending. The F07 invariant suite had four failures, and the Lightning physical proof failed because its provider CLI lacked authentication. Those must be resolved or clearly proven to be unrelated baseline/configuration failures before merge.

## Status definitions

- **DONE (code):** implementation exists; this does not by itself mean end-to-end production qualification.
- **PARTIAL:** a bounded subset exists, with documented limitations.
- **BLOCKED:** a prerequisite or external test condition prevents acceptance.
- **NOT STARTED:** the capability is not wired in the audited code path.
- **VALIDATION PENDING:** a fix was committed, but a passing current-head check has not yet been observed.

## Prioritized remaining-work register

| ID | Priority | Task | Current status | Completion / acceptance evidence |
|---|---|---|---|---|
| SF-ED-001 | P0 | Re-run current-head strict TypeScript and focused editor gates | VALIDATION PENDING | CI on \`ad9d68e\` passes strict FactoryOS typecheck, source-package tests, editor command tests, and focused Editor Gate with no skipped assertion. |
| SF-ED-002 | P0 | Fix remaining editor-source package contract/test regressions | FIX APPLIED; VALIDATION PENDING | Optional provenance fields are type-guarded; a missing CompositionIR CAS URI fails closed; the provenance-order fixture's total duration covers all clips/audio; focused tests pass. |
| SF-ED-003 | P0 | Bind real generated scene assets into the source package | BLOCKED | For a real quiz job, each visual/audio source resolves to bytes with size, MIME, SHA-256, rights/provenance and stable scene ID. No placeholder \`/api/images/...\` source is accepted as a package. |
| SF-ED-004 | P0 | Package canonical F05 TimelineIR plus its assets in CAS | NOT COMPLETE | The exact F05 canonical timeline/fingerprint and all source blobs are portable, immutable, owner/job-bound, digest-verifiable, and linked from F06's persisted job manifest. Test across app instances. |
| SF-ED-005 | P0 | Preserve source metadata across all render paths | PARTIAL | Standard RenderIntent path has conditional packages; implement and test an accurate adapter for template-specific LocalRenderIntent too, or explicitly exclude that job type from the editor UI. |
| SF-ED-006 | P0 | Define quiz question -> scene/caption/visual identity contract | NOT COMPLETE | A versioned schema maps question index/ID to stable scene IDs, option/answer data, caption cue IDs, image/text layer semantics, provenance and dependency edges. Must distinguish separately rendered text from text baked into an image. |
| SF-ED-007 | P0 | Implement quiz-semantic editor operations | NOT STARTED | Typed, revision-checked commands update question/options/correct answer/explanation/answer reveal and preserve non-target quiz fields. Each command emits a precise changed-node receipt and passes idempotency/stale-revision tests. |
| SF-ED-008 | P0 | Implement single-scene visual replacement/regeneration | NOT STARTED | User selects a stable scene, source asset is regenerated/replaced, rights/digest are recorded, and only affected downstream nodes invalidate. Other scene visuals, narration, captions and timing remain unchanged unless dependencies require it. |
| SF-ED-009 | P0 | Wire safe edited export/download | NOT STARTED; EXPORT LOCKED | Authenticated export endpoint reads the trusted persisted composition, stages all CAS inputs to the selected F06 worker, verifies input hashes there, obtains Treasury admission server-side, executes F06, validates real MP4 bytes/codec/duration/sync, stores output CAS, obtains F07 receipt bound to exact output digest, and only then returns a short-lived download URL. |
| SF-ED-010 | P0 | Resolve failing F07 invariant suite | BLOCKED / INVESTIGATE | On the prior head, four \`f07-architectural-invariants\` assertions failed (expected ready/success states but observed false/\`POLICY_STALE\`). Identify stale evidence vs code defect, fix the cause, and rerun F07 suites plus Editor -> F06 -> CAS -> F07 proof. |
| SF-ED-011 | P0 | Fix/reclassify external Lightning proof failure | BLOCKED BY CREDENTIALS | Prior run failed with Lightning CLI “Authentication failed; please run lightning login.” Confirm repository secret/provider account setup and rerun. If unavailable, keep that proof unqualified; do not mark physical provider qualification green. |
| SF-ED-012 | P0 | Current-head API/browser security and E2E tests | NOT COMPLETE | Test owner A importing own job; B reading A's source; missing/processing/failed jobs; changed owner in persisted record; CAS tamper; range requests; stale revision; restore; source manifest absent; browser back/refresh; responsive page. No cross-user leak or fake success. |
| SF-ED-013 | P0 | Confirm durability on cold start and multi-instance use | PARTIAL / TESTED, NEED CURRENT CI | Source package and manifest survive fresh process/app instance, owner/status/video fields cannot be overwritten by editor metadata, persistence failure rolls back and fails closed, durable CAS package restores with digest checks. |
| SF-ED-014 | P1 | Make caption text/style changes visible in the physical output | PARTIAL | Studio and typed commands exist, but verify the render compiler lowers every accepted style field; actual preview/output reflects edits; no unsupported field silently reports success. |
| SF-ED-015 | P1 | Add measured word-level caption timing and safe retiming | NOT COMPLETE | F05/source contracts carry real word cue timestamps from measured audio; narration changes recompute affected cues and dependent timeline, not unrelated assets. Preserve manually corrected captions. |
| SF-ED-016 | P1 | Add narration edit/regeneration and audio controls | NOT STARTED | Replace/regenerate narration creates a new immutable audio asset, measures physical duration, checks A/V sync, updates only dependant captions/timing, and supports volume/fade/music mix through tested commands. |
| SF-ED-017 | P1 | Implement dependency graph and scoped re-render | PARTIAL DESIGN | Tests prove exact dirty-node sets for caption style, caption text, visual replacement and narration-duration change; cached node key includes full normalized inputs/source hashes/renderer version. |
| SF-ED-018 | P1 | Wire ReMaker only after production admission | BLOCKED | Current ReMaker validation was failing at TypeScript on the prior head. Re-run after fixes; require Guardian grants, revision/lease/fencing/idempotency, bounded attempts, preservation proofs and F07 re-verification. |
| SF-ED-019 | P1 | Complete source-package provenance and licensing checks | PARTIAL | Every source has exact byte hash, MIME, provider, URL, author, license, attribution flag and provenance kind. Unknown/incomplete rights do not become “verified”; show attribution as needed. |
| SF-ED-020 | P1 | Add recovery UX and draft lifecycle | PARTIAL | Autosave/checkpoint, undo/redo, restore, interrupted render recovery, draft vs released version, conflict messaging and revision history are browser-E2E proven. |
| SF-ED-021 | P2 | OpenTimelineIO import/export adapter | NOT STARTED | Round-trip test with explicit feature-loss report; CompositionIR remains canonical and unsupported quiz semantics/effects are never silently dropped. |
| SF-ED-022 | P2 | Advanced effects/performance | DEFERRED | Virtualize large timelines, add frame/audio waveform cache, WebCodecs/WebGPU preview acceleration, background removal/color grading only behind qualified capability and cost gates. |
| SF-ED-023 | P2 | AI editing assistant and variant generation | NOT STARTED | Natural-language request compiles into typed bounded proposed changes, previews impact/cost, asks approval, then executes through DurableEditor; LLM cannot grant permissions, budgets or publishing authority. |
| SF-ED-024 | P2 | External engine/dependency licensing decision | OPEN | No Concat/OpenCut code should be copied blindly. Concat is AGPL-3.0-or-later; OpenCut current rewrite advertises MIT and is still in progress. Record explicit legal decision before dependency/vendor changes. |

## What is already implemented (avoid rebuilding it)

| Area | Existing branch implementation | Remaining limitation |
|---|---|---|
| Entry point | Generation-ready “Edit Short” and Media Library “Edit” open \`/factory/editor?jobId=...\` | Browser E2E and production rollout are pending |
| Editor page | Dedicated page loads source/session and displays status, revision, warnings and checkpoint control | Export is deliberately disabled |
| Editor engine | Existing CompositionIR, DurableEditor, revision conflict checks, undo/redo/checkpoints/history and current Studio reused | Needs end-to-end source and release integration |
| Playback/security | Owner-authenticated source import/playback, byte-range support, real CAS SHA-256 verification | Adversarial API/browser tests and current-head checks still required |
| Legacy videos | MP4 physically checked and imported as one flattened clip with explicit limitation banner | Cannot support scene/question edits; no reverse engineering of the MP4 |
| Conditional source package | Source package stores canonical CompositionIR and source blobs in CAS when every RenderIntent dependency resolves and provenance validates | Normal generation path may still have placeholder visual URLs; Python F05 canonical file is not directly packaged for all job types |
| Timeline semantics | F02 format now flows through F03/F05; bridge and TypeScript adapter preserve scene IDs, asset versions, trims, captions' scene metadata and transitions where input exists | Word cues, truthful visual media-kind metadata and full canonical F05->CAS source package remain missing |
| Captions | Revision-checked text/style commands, inspector, changed-caption receipts and tests | Only separate caption cues are editable; changes need physical-render confirmation |
| Timeline controls | Scene/clip navigator, trim/split-at-playhead, movement, transforms, keyframes, masks/transitions | Test coverage and actual physical render semantics must be complete |
| Governance report | \`Team/reports/pr-242.json\`; Team Change and OKF Governance gates passed at earlier current branch heads | Rerun on the final commit before merge |

## Current CI evidence and interpretation

### Known results on the preceding audited commit

PR run set was associated with \`687b10bc699e88cabc0dd676ab9dfeb6874b6bc2\`:

- **Passed:** Team Change Gate, OKF Governance Gate, general CI job, Floor 02/03, Floor 04, Floor 05, Floor 06, Treasury Wave 4/5/6 and the True Eight-Floor Production Trajectory.
- **Failed Editor Focused Gate:** source package TypeScript issues and one test failure because the test's clips/audio totalled two seconds while the fixture canvas declared one second.
- **Failed TypeScript-dependent workflows:** Editor Runtime F06/F07 Physical Proof, Compute Pool, ReMaker Validation, Context Fabric Architecture and other governance/typecheck workflows, because \`EditorSourcePackage.ts\` had optional-provenance narrowing errors and a possibly undefined composition CAS URI.
- **Failed F07 pre-training validation:** four F07 architectural-invariant assertions expected true/READY but observed false/POLICY_STALE. These need an actual root-cause investigation and may reflect stale evidence, not simply editor code.
- **Failed Lightning physical proof:** the Lightning CLI was not authenticated (\`lightning login\`). This is a provider test setup blocker until credentials/account setup is fixed.

### Fixes now committed after that run

- Guard optional provenance \`sha256\` and \`mimeType\` before using them.
- Fail closed when the newly committed composition artifact has no CAS URI.
- Correct the provenance-order source-package test fixture to declare a two-second composition.
- These updates are on the audited branch head \`ad9d68e7e42c4061903cb412cbbe9657062b4b13\`.

**Fresh-current-head check status at report creation:** CI, Editor Focused Gate, Editor Runtime F06/F07 physical proof and related workflows had been queued/in progress. This report deliberately does not claim those runs passed. See [PR #242](https://github.com/Gokul7904231/ShortForge/pull/242) and its live checks for the newest conclusions.

## Merge/release gate checklist

Do not merge as production-complete until all P0 rows above are closed or explicitly scoped out. At minimum:

1. Fresh current-head CI and Editor Focused Gate green; no strict type errors; targeted editor tests pass.
2. Fresh F07 invariant and Editor -> F06 -> CAS -> F07 physical proof green.
3. A real non-template generated quiz is opened. The package contains actual scene media, stable scene IDs, separate caption cues and verifiable provenance (not placeholder URLs).
4. A scene-level visual edit and a semantic quiz text edit affect exactly the declared targets; protected questions/assets/timing remain unchanged where specified.
5. A new physical MP4 is rendered, validated, stored in CAS and has an F07 receipt whose digest exactly matches the downloaded bytes.
6. Cross-user authorization, range playback, stale revision, CAS tamper and cold-start persistence tests pass.
7. Export becomes enabled only through the trusted server-side pipeline; publish remains a separate explicit decision.
8. Any reused external editor code or dependency has a reviewed license record.

## Recommended execution order

**Batch 1 — stabilize current branch (P0):** rerun current-head gates; fix remaining TypeScript/focused test failures; investigate four F07 invariants; resolve Lightning credentials or mark that provider proof unqualified.

**Batch 2 — source truth (P0):** replace placeholder visual URLs with actual verified assets; directly package canonical F05 TimelineIR plus all assets into owner-bound CAS; propagate package ID/hash into job history for non-template and template paths; add end-to-end cold-start tests.

**Batch 3 — quiz editing (P0):** formalize question/scene/caption mapping; create typed semantic edit commands; regenerate/recompose affected visual/text layers; assert changed-node and preserve invariants.

**Batch 4 — authorized export (P0):** worker-side CAS staging and digest checks, Treasury authorization, F06 physical render, CAS output, F07 proof, then download. Keep the UI lock until done.

**Batch 5 — editor quality (P1/P2):** measured word cues/audio edits/dependency cache/ReMaker admission, UX recovery/accessibility/performance, OTIO interchange and AI edit assistant.

## Final decision

The codebase now has a meaningful native editor foundation, but the requested feature is not complete. The key distinction is between “a user can open an editor on a rendered MP4” and “a user can safely alter one original quiz scene and export a newly verified Short.” Today the first is partially implemented; the second remains blocked by source-asset/source-manifest linkage, quiz-semantic edit operations, authorized F06/Treasury/F07 export, and fresh current-head qualification.
