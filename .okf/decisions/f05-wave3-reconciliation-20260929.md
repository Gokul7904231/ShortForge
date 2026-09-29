# Floor 05 Wave 3 reconciliation — 2026-09-29

## Scope

Reconcile closed PR #35 onto current `main` without replaying unrelated historical drift.

## Promoted capabilities

- Guardian authorization evidence is injected at the WorkerRunner boundary and validated by F05 before execution.
- TimelineBrain remains proposal-only cognition.
- F05 exposes only `CAP_TIMELINE_COMPILE`; it does not receive `CAP_RENDER_DISPATCH`, publishing, or F07 authority.
- Local deterministic TimelineIR JSON evidence is generated and fingerprinted.
- Render-input identity binds the canonical TimelineIR fingerprint.
- Explicit F02 `on_screen_text` is preserved through F03 as `caption_text` and compiled into F05 subtitles.
- WebVTT sidecar generation and validation are part of F05 evidence.
- Crash journal records the Guardian authorization decision and canonical TimelineIR fingerprint.

## Source-of-truth reconciliation

Current `main` contracts and later runtime work remain authoritative. The stale branch's unrelated historical edits are not replayed wholesale.

## Promotion boundary

F05 remains the temporal composition boundary. F06 retains distributed production rendering; F07 retains final verification/release authority.

## Source

Original PR: #35
Original branch: `feat/floor05-pretraining-hardening-wave3-20260927`
Reconciliation branch: `reconcile/f05-wave3-20260929`
