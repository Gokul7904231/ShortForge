# Repository Mapping: CopilotKit / OpenIntelligentUI

- Repository: https://github.com/CopilotKit/OpenIntelligentUI
- Reviewed ref: main
- Reviewed commit: f6e4388b26a64b9a0714943b08a1ce622b924eec
- License reported by GitHub: MIT
- Review date: 2026-10-12
- Assimilation mode: PATTERN_EXTRACTION / RESEARCH_ONLY
- ShortForge status: NO GENERAL GENERATIVE-UI RUNTIME IMPLEMENTED.

## Problem and useful mechanism

OpenIntelligentUI explores agent-produced interactive UI, including sandboxed presentation and a bridge for user-selected values to become structured follow-up input. The transferable idea is adaptive, task-specific presentation while retaining a constrained boundary between rendered content, user intent, and privileged host actions.

## Existing ShortForge implementation and authority

- OverseerCommandSurface.tsx, MissionRoomPanel.tsx, and LiveMissionCanvas.tsx are explicit React surfaces.
- InteractionIR and existing authorized API routes are the relevant typed interaction/action boundaries.
- The current Live Mission Canvas is task-specific and read-only; it is not a generated HTML/JavaScript system.

## Patterns considered

- Candidate: choose among a small, server-approved set of UI primitives based on validated task output.
- Candidate: validate every presentation payload against a strict schema and keep action arguments typed and user-visible.
- Candidate: sandbox any future dynamic rendering with a narrow host bridge, explicit origin/lifecycle control, and strict resource budgets.
- Rejected: evaluating model-supplied JavaScript in the host page, arbitrary generated HTML with ambient APIs, model-selected privileged tool names, unvalidated action arguments, or reporting an action as successful before the host confirms it.

## Status and verification required

**RESEARCH_ONLY.** Only explicit task-specific UI exists on THESIX; no broad generative UI runtime was implemented. Before enabling a dynamic renderer, perform a threat model, sandbox escape review, schema-fuzzing, CSP/origin tests, untrusted-content/XSS tests, action-authorization tests, accessibility checks, and performance budgets. User interaction must enter the existing tool/action contract and be reauthorized server-side.

Reject the design if sandbox safety depends only on prompt instructions or if presentation content can call APIs or mutate state outside the typed host bridge.

## Security, privacy, performance, and licensing

Agent output is untrusted data, not executable authority. Isolate rendering from credentials and host state, sanitize links and media, constrain payload size and execution time, preserve CSP, and log only the minimum needed telemetry. MIT license metadata was confirmed; no code or assets were copied.

## Provenance

Reviewed repository metadata and README at the immutable commit above. Upstream: https://github.com/CopilotKit/OpenIntelligentUI. No dynamic-UI security testing was run for ShortForge.
