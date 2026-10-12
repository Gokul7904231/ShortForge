# Repository Mapping: devdotfast / Whiteboard

- Repository: https://github.com/devdotfast/whiteboard
- Reviewed ref: main
- Reviewed commit: 2ddf3eb6c13d97b1d04a932c21de9a92029adaf9
- Review date: 2026-10-12
- Code license reported by GitHub: MIT
- Assimilation mode: PATTERN_EXTRACTION / CLEAN-ROOM UI
- ShortForge status: PARTIALLY IMPLEMENTED PATTERN; no Whiteboard code or package is integrated.

## Problem and useful mechanism

Whiteboard is an agent-aware software review canvas that can connect requirements, implementation traces, decisions, and evidence. Its useful lesson for ShortForge is that a canvas should show grounded work and inspectable relationships, not merely a decorative graph or manually authored project notes.

## Existing ShortForge implementation and authority

- apps/web/components/overseer/collaboration/LiveMissionCanvas.tsx reads the existing mission work-board endpoint and displays persisted task status, dependencies, ownership/capability metadata, blockers, artifact/evidence identifiers, and recorded activity.
- apps/web/app/api/overseer/missions/[missionId]/work/route.ts is the authenticated work-board API boundary.
- apps/web/factoryos/core/work/MissionWorkManager.ts is the existing task/snapshot source.
- MissionGraphIR / EvidenceGraphIR and their validation/provenance patterns remain canonical; .okf/research/repo-mappings/tt-a1i-archify.md applies.

The current Live Mission Canvas is a read-only polling slice with overlapping-request prevention, stale-response cancellation, abort-on-unmount/mission-change, a typed read-response guard (`mission-work-client.ts`), and a schema-approved metric-grid presentation. It is not a Whiteboard port and does not yet establish a replayable event stream or prove live physical render/F07 completion.

## Patterns considered

- Adopted as a design direction: render the actual task DAG; expose status changes, blockers, dependency edges, owners, artifact/evidence links, and timestamps from authoritative state.
- Adopted in part on THESIX: read-only LiveMissionCanvas UI and an Overseer entry point.
- Still required: real mission acceptance tests, stale-data/reconnect behavior, explicit empty/error states, accessible interaction, and evidence-linked F07 outcome when available.
- Rejected: copying Whiteboard UI/components, vendored editor code, prompts, assets, or its trace model; using fabricated progress or hidden model reasoning as UI state; replacing canonical mission/evidence IR.

## Status and verification required

**PARTIALLY_IMPLEMENTED (ShortForge presentation slice).** Targeted contract tests were added for snapshot parsing and safe authorization/error messages. CI is configured to run these tests and TypeScript checks on `THESIX`; the final result must be read from GitHub Actions before calling this verified. Browser acceptance still requires a real mission ID, work-board authorization, refresh/recovery from persisted snapshots, no unauthorized mission disclosure, and evidence-linked F07 outcome. A successful network request alone is not proof of physical completion.

Reject/roll back any UI path that invents state, bypasses the API permission checks, leaks hidden reasoning/secrets, or adds a competing graph source of truth.

## Security, performance, and licensing

Keep the component read-only unless separately authorized typed actions are designed. Polling frequency and rendering cost should be measured before scale-out; event streaming/replay is a future improvement, not claimed as implemented. MIT is the upstream license; no source code or assets were copied.

## Provenance

Reviewed repository metadata and README at the immutable commit above. Upstream: https://github.com/devdotfast/whiteboard. ShortForge test/build/browser execution is UNPROVEN for this slice.
