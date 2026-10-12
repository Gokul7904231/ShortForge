# THESIX — imp-completion Checkpoint

- Date: 2026-10-12
- Branch: `THESIX`
- Base commit: `9e3d7017f62625cea5258dabee926824cb43ab18`
- Checkpoint type: baseline / pre-implementation
- Status: `BASELINE_CAPTURED; IMPLEMENTATION NOT YET VERIFIED`

## Purpose

Track the six repository-inspired improvement workstreams on an isolated branch. This checkpoint is deliberately not a claim that the six improvements have been implemented.

## Baseline findings verified against the THESIX branch

1. **Archify patterns:** `.okf/research/repo-mappings/tt-a1i-archify.md` marks the clean-room graph/evidence/interaction IR patterns as adopted. It maps MissionGraphIR, EvidenceGraphIR, SituationGraphIR, InteractionIR, graph validation, evidence receipts, bounded repair, and last-good protection to existing ShortForge paths.
2. **Overseer / mission visibility:** `apps/web/components/overseer/presence/OverseerCommandSurface.tsx` already consumes authoritative presence/state APIs and SSE presence events; it resolves a primary mission from `stateData?.missions?.[0]?.missionId` and renders MissionRoomPanel. This is a starting point, not proof of an end-to-end live execution trace.
3. **Mission collaboration UI:** `apps/web/components/overseer/collaboration/MissionRoomPanel.tsx` polls mission-room/work/intercom endpoints. Its canvas currently stores collaboration notes, decisions, and risks; it is not yet proven to be an event-backed live production DAG.
4. **Modular skills:** `.agents/skills/` exists and already contains FactoryOS-oriented skills. Audit and extend existing conventions rather than cloning SwiftUI-specific content.
5. **Adaptive UI:** the Overseer has existing command, disclosure, collaboration, workforce, and fleet surfaces. Any generated/selected UI must remain presentation-only over validated server state and authorized action paths.
6. **Document intelligence:** `apps/web/factoryos/core/research/DocumentNormalizer.ts` is currently a minimal text-normalization boundary, not demonstrated full PDF parsing/OCR/visual-table extraction. `.okf/research/repo-mappings/microsoft-markitdown.md` says full multi-format integration was deferred. Lift remains an optional experiment behind this boundary.
7. **Hybrid repository retrieval:** no confirmed Lift or zvec-grep integration was found in the sampled branch. zvec-grep must be benchmarked against existing exact search before adoption.
8. **Video IR:** `apps/web/factoryos/core/timeline/TimelineIR.ts` is the canonical video-timeline contract. Do not introduce a competing IR for document extraction or mission visualization.

## Mandatory architecture constraints consulted

- `.okf/decision-protocol.md`: full current .okf sweep is mandatory before non-trivial implementation/architecture decisions; external repo patterns must be compared against existing mappings; statuses must distinguish implemented, partial, scaffolded, placeholder, experimental, and planned.
- `.okf/hierarchy-map.md`: Overseer is the sovereign control plane; Treasurer owns economic admission; Guardian owns capability/policy authorization; Slayer owns lease revocation/kill enforcement; Healer owns bounded remediation; workers execute only; F07 owns evidence-based verification.
- `.okf/security/worker-permissions.md`: no ambient worker authority; capability attenuation, authorization, lease/fencing, schema validation, and downstream verification remain mandatory.
- `.okf/production-helper.md`: significant architecture/provider/security/rendering changes require applicable tests and helper evidence; BLOCKED/UNPROVEN is not PASS.
- `.okf/research/repo-mappings/tt-a1i-archify.md`: clean-room adoption only; existing graph/evidence/interaction contracts should be reused.
- `.okf/research/repo-mappings/microsoft-markitdown.md`: document processing stays isolated; no untrusted document gets unrestricted filesystem/network access.

## Six workstreams and acceptance gates

| ID | Source | Planned ShortForge improvement | Acceptance evidence |
|---|---|---|---|
| S1 | Helix Foundry | Add only missing provenance/versioned evidence snapshot and relationship-query patterns to existing KnowledgeOS/Memory Fabric | Schema/contract tests; source-linked evidence; snapshot/diff tests; no parallel datastore |
| S2 | devdotfast/Whiteboard | Mission Canvas for actual task DAG, event timeline, dependencies, blockers, artifacts, and F07 receipts | Real mission ID; durable snapshot + reconnect/recovery; no fabricated progress; UI tests |
| S3 | SwiftUI-Agent-Skill | Improve existing modular skill authoring, selective references, evidence-grounded findings, bounded scope | Skill contract/lint tests; finding provenance; no unrelated edits |
| S4 | CopilotKit/OpenIntelligentUI | Task-appropriate validated UI presentations in Overseer | Schema validation; safe rendering; auth-bound actions; no false action-success claims |
| S5 | datalab-to/lift | Optional visual-document extraction adapter behind DocumentNormalizer | Benchmark against representative scanned PDFs/figures/tables; resource and license review; disabled by default until qualified |
| S6 | zvec-ai/zvec-grep | Evaluate hybrid exact/BM25/vector retrieval for Devourer/Reach research | Reproducible benchmark vs existing retrieval; index freshness, secret exclusion, provenance, and remote-data policy checks |

## Execution sequence

1. Complete the full current `.okf` inventory/sweep for the relevant domains and record contradictions/current-vs-target state.
2. Inspect implementation, tests, helper evidence, and relevant mappings for each workstream.
3. Implement in small independently testable slices on `THESIX`; do not add external runtime dependencies before a benchmark justifies them.
4. Run targeted tests, typecheck/build, applicable security scans, and production-helper checks.
5. Create a completion checkpoint named `imp-completion` only after reporting actual changed files, commit SHA, tests run, test results, and remaining blocked/unproven gates.

## Current verification status

- Branch existence: VERIFIED.
- Base commit identity: VERIFIED.
- Baseline source/mapping samples: VERIFIED.
- Full .okf sweep: NOT YET COMPLETE.
- Source implementation for these six improvements: NOT YET CLAIMED.
- Local typecheck/build/tests: NOT RUN by this checkpoint.
- Live mission/physical MP4/F07 proof: NOT RUN by this checkpoint.
- Production readiness: NOT CLAIMED.
