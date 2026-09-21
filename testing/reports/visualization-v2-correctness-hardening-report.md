# FactoryOS Visualization V2 Correctness Hardening Report

**System**: FactoryOS / ShortForge  
**Component**: Visualization V2 Interaction & Presentation Engine  
**Pass**: Targeted Correctness Hardening Pass  
**Status**: COMPLETE — ALL HARDENING INVARIANTS ENFORCED & VERIFIED  

---

## 1. Scope

This targeted correctness hardening pass focused strictly on making the existing FactoryOS Visualization V2 interaction system semantically trustworthy under authoritative FactoryOS execution-truth rules. Per directives:
- No architectural rewrites or V3 redesigns.
- Read-only semantics: `MissionGraphIR`, `EvidenceGraphIR`, and `SituationRecord` remain authoritative and are never mutated.
- Strict adherence to the core law:
  > *"A visualization may expose truth. A visualization must never manufacture stronger truth than its source evidence supports."*

Hardening targets addressed:
1. Physical artifact truth (`ArtifactInspectionResolver.ts`)
2. Edge-specific evidence grounding (`EdgeExplanationResolver.ts`)
3. Verification derivation (`EdgeExplanationResolver.ts`)
4. Reconstructed vs. observed execution semantics (`EdgeExplanationResolver.ts`)
5. Deterministic interaction identity (`VisualizationInteractionResolver.ts`)
6. Fail-closed navigation (`VisualizationInteractionResolver.ts`)
7. Focus-subgraph truth propagation (`VisualizationInteractionResolver.ts`)
8. Evidence-node graph relationships & anti-orphan invariants (`VisualizationInteractionResolver.ts`, `buildFocusSubgraph`)
9. SituationRecord evidence identity preservation (`SituationInspectionResolver.ts`)
10. Cycle semantic grounding (`CyclePresentationPlanner.ts`)

---

## 2. Original Correctness Risks

Prior to this pass, the following epistemic vulnerabilities were identified:
- **Artifact Inspection**: Missing files or filesystem read failures could fall back to metadata (`byteLength > 0 && sha256`) and erroneously declare `PHYSICAL` proof.
- **Edge Grounding**: Evidence attached to endpoints (source or target nodes) was conflated with evidence proving the edge itself.
- **Verification Leakage**: Edges were marked `VERIFIED` merely because endpoint nodes or artifacts were verified, or because `edge.status === "VERIFIED"` without authoritative edge-level proof.
- **Execution Event Masquerading**: Status transitions on nodes (e.g. `status !== "PLANNED"`) fabricated synthetic sequence items marked as `OBSERVED` events rather than reconstructed state.
- **Non-Deterministic Interaction**: Interaction IDs relied on non-deterministic wall-clock timestamps (`Date.now()`), preventing reproducible test and audit traces.
- **Fail-Open Navigation**: `OPEN_GRAPH_VIEW` returned `resolved: true` even when view types were unsupported or subjects were unknown.
- **Focus Truth Inflation**: `FOCUS_SUBGRAPH` hardcoded `truthLevel: "VERIFIED"` upon structural projection success.
- **Orphan Evidence Nodes**: `FOCUS_SUBGRAPH` injected evidence nodes into presentation nodes without corresponding presentation edges, creating disconnected evidence islands.
- **SituationRecord Identity Loss**: Canonical evidence IDs were lossily converted or raw URIs were mislabeled as canonical IDs.
- **Heuristic Cycle Recovery**: Cycles inferred recovery relationships using string matching (`id.includes("recovery")`) and falsely branded cycle entry points as "root causes".

---

## 3. Changes Made

The following components were hardened:
- `testing/graphs/visual/InteractionIR.ts`: Added additive truth fields: `reportedByteLength`, `reportedSha256`, `physicalByteLength`, `physicalSha256`, `hashMismatchDetected`, `sizeMismatchDetected`, `contextualEndpointEvidence`, `verificationStatus`, `unresolvedReferences`, and `source: "EXECUTION_EVENT" | "NODE_STATE" | "ARTIFACT_RECEIPT" | "UNKNOWN"`.
- `testing/graphs/visual/ArtifactInspectionResolver.ts`: Hardened filesystem resolution; prohibited metadata fallback to `PHYSICAL`; detected size/digest mismatches.
- `testing/graphs/visual/EdgeExplanationResolver.ts`: Separated direct edge proof from endpoint contextual evidence; classified state-derived steps as `RECONSTRUCTED`; prohibited endpoint verification propagation to edges.
- `testing/graphs/visual/CyclePresentationPlanner.ts`: Removed string-based recovery detection; grounded cycle evidence against real `EvidenceGraph`; classified cycle entry as `LOOP ENTRY` rather than `ROOT CAUSE`.
- `testing/graphs/visual/SituationInspectionResolver.ts`: Preserved exact canonical evidence IDs; isolated ungrounded URIs/paths as `UNRESOLVED_REFERENCE`.
- `testing/graphs/visual/VisualizationInteractionResolver.ts`: Enforced deterministic SHA-256 interaction hashing (no timestamps); implemented fail-closed validation for `OPEN_GRAPH_VIEW`; preserved authoritative subject truth in `FOCUS_SUBGRAPH`; created `EVIDENCE_SUPPORT` presentation edges for all displayed evidence nodes.

---

## 4. Artifact Truth Hardening

- **Filesystem Verification**: Files must exist on disk and pass `fs.statSync(path).isFile()` to attain `physicalExistenceProven = true`.
- **Authoritative Measurement**: `physicalByteLength` is read directly from `stat.size`. `physicalSha256` is calculated from raw file bytes using Node.js `crypto.createHash("sha256")`.
- **Mismatch Surfacing**: If reported metadata disagrees with physical file inspection, `mismatchDetected = true` is surfaced and `verificationStatus` drops to `FAILED`.
- **Metadata Fallback Prohibition**: If a file is missing or throws during inspection, `physicalExistenceProven` is strictly `false`, and truth level remains `UNKNOWN`. Valid-looking hash/byte metadata is marked `reportedByteLength`/`reportedSha256` but never upgrades truth to `PHYSICAL`.

---

## 5. Edge Evidence Hardening

- **Resolution Hierarchy**:
  1. Direct evidence attached to canonical edge (`supportedEdgeId` / `targetGraphEdgeId` / direct `edgeId`).
  2. Artifact transfer lineage explicitly proving transfer between producer and consumer.
  3. Producer/consumer lineage proof.
  4. Explicit verification records.
- **Contextual Isolation**: Evidence attached only to `from` or `to` nodes is explicitly sequestered under `contextualEndpointEvidence` and omitted from `evidenceRefs`.

---

## 6. Verification Semantics

- **Strict Boundary**: Verification of an artifact or endpoint does not verify the connecting graph edge.
- **Independent Status**: Added explicit `verificationStatus: "VERIFIED" | "FAILED" | "NOT_ESTABLISHED"`.
- **Authoritative Provenance**: Edges are only declared `VERIFIED` if backed by explicit edge verification records or authoritative verification receipts. Missing verification yields `NOT_ESTABLISHED` and truth level `ASSERTED`/`OBSERVED`/`UNKNOWN`.

---

## 7. Execution Truth Semantics

- **Reconstructed vs. Observed**: When sequence steps are derived from node execution states (`status: RUNNING | COMPLETED | FAILED`), they are explicitly tagged:
  - `truthLevel: "RECONSTRUCTED"`
  - `source: "NODE_STATE"`
- **Event-Grounded Steps**: Only steps substantiated by real execution events in runtime logs are marked:
  - `truthLevel: "OBSERVED"`
  - `source: "EXECUTION_EVENT"`
- **Zero Event Fabrication**: Planned steps remain `truthLevel: "ASSERTED"`, `source: "UNKNOWN"`.

---

## 8. Deterministic Interaction Identity

- **Formula**:
  $$\text{interactionId} = \text{sha256}(\text{stableSerialize}(\text{missionId}, \text{runId}, \text{sourceView}, \text{action}))$$
- **Clock Removal**: Removed `Date.now()` completely from interaction ID generation. The interaction ID is strictly reproducible across identical executions while distinct actions or subject targets produce unique cryptographic IDs.

---

## 9. Navigation Fail-Closed Behavior

- **Validation Gate**: `OPEN_GRAPH_VIEW` checks:
  1. `viewType` against supported views (`MISSION_OVERVIEW`, `EVIDENCE_FORENSIC`, `SLAYER_FORENSIC`, `OVERSEER_OPERATIONAL`, `DELTA_DIFF`).
  2. `subjectId` existence in `MissionGraphIR` or `EvidenceGraphIR`.
- **Failure Mode**: On invalid view or unknown subject, returns `resolved: false`, `truthLevel: "UNKNOWN"`, diagnostic message, and **does not** push onto `navigationState`.

---

## 10. Focus-Subgraph Truth Propagation

- **Truth Level Continuity**: `FOCUS_SUBGRAPH` adopts the subject node's authoritative truth level (`VERIFIED`, `OBSERVED`, or `UNKNOWN`).
- **Separation of Resolution & Truth**: Successful generation sets `resolved: true`, but never upgrades subject truth to `VERIFIED`.

---

## 11. Evidence Graph Relationship Integrity

- **No Orphan Islands**: When evidence nodes are added to a focus canvas, a synthetic supporting presentation edge (`type: "EVIDENCE_SUPPORT"`) is injected connecting the focal node to the evidence node.
- **Schema Compliance**: Every presentation edge in `PresentationIR.edges` points to valid nodes in `PresentationIR.nodes`. Unrelated evidence nodes are not injected into the graph canvas.

---

## 12. SituationRecord Evidence Identity

- **Exact Identity**: Canonical evidence IDs (`ev_...`) are preserved verbatim in `canonicalEvidenceIds`.
- **Raw URI Isolation**: Unmapped URIs/paths are placed in `unresolvedReferences`, preventing spurious promotion to canonical IDs while preserving debugging context.

---

## 13. Cycle Semantics

- **No Heuristic Recovery Matching**: Stripped `id.includes("recovery")`. Edges must explicitly have `metadata.isRecoveryEdge === true` or canonical recovery relationship types.
- **Non-Inference of Causality**: Cycle entry nodes are categorized as `LOOP ENTRY` or `RETRY CANDIDATE`. They are never mislabeled as `ROOT CAUSE`.
- **Grounded Evidence**: Cycle evidence references are extracted from real `EvidenceGraphIR` edges and evidence nodes.

---

## 14. New Correctness Test Suite (`testing/tests/graph-interaction-correctness.test.ts`)

Consists of 39 targeted assertions across 10 invariant groups:
- **Group A (A1–A6)**: Artifact Physical Truth (missing files, directory paths, real files, hash mismatches, recalculated digests, size mismatches) -> **6/6 PASSED**
- **Group B (B1–B5)**: Edge Evidence Grounding (source only, target only, direct edge, artifact lineage, zero edge proof) -> **5/5 PASSED**
- **Group C (C1–C4)**: Verification Semantics (verified artifact unverified edge, dual verified endpoints, explicit verification, unverified edge) -> **4/4 PASSED**
- **Group D (D1–D4)**: Execution Truth (node state reconstructed, execution event observed, planned asserted, no event fabrication) -> **4/4 PASSED**
- **Group E (E1)**: Deterministic Interaction Identity (identical inputs yield identical IDs, distinct targets yield distinct IDs, no time entropy) -> **1/1 PASSED**
- **Group F (F1–F4)**: Fail-Closed Navigation (valid view, invalid view, unknown subject, valid view + subject push) -> **4/4 PASSED**
- **Group G (G1–G4)**: Focus-Subgraph Truth (UNKNOWN preserved, OBSERVED preserved, VERIFIED preserved, resolution vs. truth separation) -> **4/4 PASSED**
- **Group H (H1–H3)**: Evidence Graph Integrity (supporting edges created, unrelated evidence pruned, zero dangling endpoints) -> **3/3 PASSED**
- **Group I (I1–I4)**: SituationRecord Evidence Identity (canonical preserved, raw path isolated, URI mapped to evidence ID, unmapped marked UNRESOLVED) -> **4/4 PASSED**
- **Group J (J1–J4)**: Cycle Semantics (cycle detected, zero ungrounded recovery claims, explicit recovery recognized, no root-cause fabrication) -> **4/4 PASSED**

**Result**: **39/39 PASSED** (100% success rate).

---

## 15. Regression Results

1. **V2 Graph Interaction Suite** (`testing/tests/graph-interaction.test.ts`):
   - Tests A through T: **20/20 PASSED** (0 failures, 0 regressions).
2. **Full FactoryOS Test Suite** (`npm run test:all` via `testing/cli/test.ts`):
   - Hardening Regression Suite: **PASSED**
   - Browser Evidence V1 Suite: **PASSED**
   - SituationRecord Comms Suite (Tests A -> L): **PASSED**
   - Live SituationRecord Handoff Proof (`situation-record-comms-001`): **PASSED**
   - Graph Presentation Suite (Archify & Diagram-Design Principles): **PASSED**
   - Graph Rendering & Visual Verification Suite: **PASSED**
   - Graph Diff & Visual Delta Suite: **PASSED**
   - Visualization V2 Interaction Suite (Tests A -> T): **PASSED**
   - Visualization V2 Correctness Hardening Suite (Tests A1 -> J4): **PASSED**
   - Visual Demonstrations (Demo 1 & Demo 2): **PASSED**
   - Canonical Golden Mission Suite (`golden-short-001`): **PASSED (Exit: 0)**

---

## 16. Live Chrome Result

- **Connection**: Chrome DevTools Protocol connected via `ChromeDevToolsClient` to `http://127.0.0.1:9222`.
- **Browser State**: Real Chrome instance `Chrome/152.0.7977.76` operational.
- **Visual Evidence**: Rendered SVG visualizations into live HTML hosts and captured real CDP screenshots.
- **Blocked State Invariant**: When Chrome port is unavailable, execution safely degrades to `BLOCKED_BROWSER` mode with zero fabricated screenshots, events, or console logs.

---

## 17. Remaining UNKNOWN States

The following states remain legitimately classified as `UNKNOWN` in accordance with FactoryOS truth laws:
- Artifacts whose physical paths cannot be verified on disk.
- Edges connecting nodes where no direct transmission evidence, network log, or artifact receipt exists.
- Untraced raw file paths in `SituationRecord` that do not correlate to canonical `EvidenceGraph` nodes.

---

## 18. Remaining BLOCKED States

- Live Google Drive uploads in test environments when `ownerId` is unauthenticated (safely redirected to `LOCAL_OUTBOX`).
- Gemini TTS remote synthesis when external credentials are not supplied (gracefully falling back to verified local synthesis mocks while logging API auth state).
- Headless browser capture when Chrome daemon is terminated (correctly transitions to `BLOCKED_BROWSER`).

---

## 19. Files Changed

1. `testing/graphs/visual/InteractionIR.ts` (Extended data types for truth/metadata separation)
2. `testing/graphs/visual/ArtifactInspectionResolver.ts` (Hardened physical truth & hash mismatch checks)
3. `testing/graphs/visual/EdgeExplanationResolver.ts` (Separated contextual evidence & reconstructed steps)
4. `testing/graphs/visual/CyclePresentationPlanner.ts` (Removed heuristic recovery matching & non-causal cycle labels)
5. `testing/graphs/visual/SituationInspectionResolver.ts` (Preserved canonical identity & ungrounded paths)
6. `testing/graphs/visual/VisualizationInteractionResolver.ts` (Deterministic IDs, fail-closed navigation, focus truth, presentation edges)
7. `testing/tests/graph-interaction-correctness.test.ts` (NEW: 39 correctness tests A1-J4)
8. `testing/cli/test.ts` (Integrated correctness suite into canonical test runner)

---

## 20. Exact Commands Executed

```bash
# 1. Run new correctness hardening test suite
npx tsx testing/tests/graph-interaction-correctness.test.ts

# 2. Run existing V2 interaction test suite
npx tsx testing/tests/graph-interaction.test.ts

# 3. Run full FactoryOS regression test suite
npm run test:all
```

---

## 21. Final Correctness Verdict

**VERDICT: VERIFIED**

Every displayed claim is mathematically bounded by its underlying evidence. Resolution status (`resolved: true`) is strictly decoupled from epistemic truth level (`VERIFIED`, `OBSERVED`, `RECONSTRUCTED`, `ASSERTED`, `UNKNOWN`). Zero synthetic truth is manufactured.
