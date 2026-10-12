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

The Live Mission Canvas remains read-only and uses overlapping-request prevention, stale-response cancellation, abort-on-unmount/mission-change, a typed read-response guard (mission-work-client.ts), and schema-approved adaptive metrics. A mission-scoped SSE endpoint now projects only allow-listed task-event metadata and supports Last-Event-ID replay from the existing event bus's bounded in-process history; the client refreshes the authoritative snapshot on work signals/resync and retains four-second polling as fallback. This is not a Whiteboard port, and the in-memory event bus does not prove durable cross-process replay or a real physical render/F07 completion.

## Patterns considered

- Adopted as a design direction: render the actual task DAG; expose status changes, blockers, dependency edges, owners, artifact/evidence links, and timestamps from authoritative state.
- Adopted in part on THESIX: read-only LiveMissionCanvas UI and an Overseer entry point.
- Still required: browser and reconnect/resync acceptance against a real authorized mission, accessible interaction inspection, cross-instance/distributed replay semantics if required, and evidence-linked F07 outcome.
- Rejected: copying Whiteboard UI/components, vendored editor code, prompts, assets, or its trace model; using fabricated progress or hidden model reasoning as UI state; replacing canonical mission/evidence IR.

## Status and verification required

**PARTIALLY_IMPLEMENTED (presentation + bounded event-invalidation slice).** Targeted tests cover snapshot shape/auth errors and safe mission-event projection, including mission scoping and payload minimization. The SSE route reuses the existing auth/room permission boundary and authoritative snapshot endpoint; the event stream is an invalidation signal, not a state source. Latest-code CI and real browser acceptance must still be checked before verification claims. Required runtime proof remains a real mission ID, authorization/membership denial checks, reconnect/resync, polling fallback, artifact/evidence linkage, and independent F07 outcome. A connected SSE stream or successful snapshot response alone is not proof of physical completion.

Reject/roll back any UI path that invents state, bypasses the API permission checks, leaks hidden reasoning/secrets, or adds a competing graph source of truth.

## Security, performance, and licensing

Keep the component read-only unless separately authorized typed actions are designed. The SSE stream is scoped to the mission and exposes only bounded event metadata, with polling fallback; its event history is in-process and bounded, so do not represent it as a durable distributed log. Measure polling/event load and rendering cost before scale-out. MIT is the upstream license; no source code or assets were copied.

## Provenance

Reviewed repository metadata and README at the immutable commit above. Upstream: https://github.com/devdotfast/whiteboard. ShortForge test/build/browser execution is UNPROVEN for this slice.
