# FactoryOS Frontier v2 — Overseer Productization Forensic Baseline Audit

**Audit Date**: August 2026  
**Auditor**: Principal Agent Systems & Frontend Architect  
**Objective**: Establish an authoritative forensic baseline for all Overseer Presence, UI, and real-time interaction components in FactoryOS Frontier v2.

---

## 1. Classification Methodology

Each component and subsystem is strictly classified into one of five categories:
- **ABSENT**: Not present in the repository; must be created.
- **IMPLEMENTED**: Code exists in codebase, but lacks full wiring or contract alignment.
- **WIRED**: Code is connected to surrounding systems, but unverified at runtime.
- **RUNTIME-VERIFIED**: Code is actively verified in automated test suites.
- **PRODUCTION-READY**: Feature-complete, resilient to edge cases, accessible, performant, and fully integrated into product routes.

---

## 2. Forensic Audit Matrix

| Component / Subsystem | Path / Location | Current Classification | Forensic Inspection Notes |
|---|---|---|---|
| **Overseer Page Route** | `app/(os)/overseer/page.tsx` | `WIRED` | Basic shell rendering `OverseerPresenceView`. Needs full product layout, responsive wrapper, and operational metrics HUD. |
| **Overseer Presence View** | `components/overseer/presence/OverseerPresenceView.tsx` | `WIRED` | Implements SSE subscription, conversational dispatch, and layout. Needs metric telemetry bar, activity timeline integration, and reduced-motion detection. |
| **Procedural Face Renderer** | `components/overseer/presence/OverseerFaceRenderer.tsx` | `RUNTIME-VERIFIED` | Canvas-based retina eye, gaze shift, brow rotation, pupil core, mouth aperture rendering. Performant 60 FPS rendering. |
| **Overseer Face Controller** | `components/overseer/presence/OverseerFace.tsx` | `RUNTIME-VERIFIED` | Integrates `OverseerAnimationController`, lerp interpolation, mouse gaze look. Needs randomized natural blink timing and breathing cycle. |
| **Expression Presets Engine** | `factoryos/core/overseer/presence/OverseerExpressionPresets.ts` | `RUNTIME-VERIFIED` | 17 presets (`IDLE`, `GREETING`, `LISTENING`, `OBSERVING`, `THINKING`, `DEEP_THINKING`, `CURIOUS`, `CONCERNED`, `WARNING`, `CRITICAL`, `RECOVERING`, `VERIFYING`, `SUCCESS`, `PROUD`, `WAITING`, `FAREWELL`, `SLEEP`). |
| **Affect & Intent Engine** | `factoryos/core/overseer/presence/OverseerAffectEngine.ts`, `OverseerIntentEngine.ts` | `RUNTIME-VERIFIED` | Evaluates WorldState, active cases, mission states into deterministic affect dimensions and prioritized intent stack. |
| **Attention Engine** | `factoryos/core/overseer/presence/OverseerAttentionController.ts` | `RUNTIME-VERIFIED` | Manages gaze attention target, priority, expiration, and spatial gaze coordinates. |
| **Visual Environment (Aura)** | `components/overseer/presence/OverseerAura.tsx` | `WIRED` | Radial gradient background reacting to intent, affect, and accentColor. |
| **Visual Environment (Particles)** | `components/overseer/presence/OverseerParticles.tsx` | `RUNTIME-VERIFIED` | Canvas-based particle simulation with convergence/radiation dynamics, effect levels 0–5, rAF loops. |
| **Status Sentence** | `components/overseer/presence/OverseerStatus.tsx` | `WIRED` | Displays `thoughtSummary` and intent badge. Grounded in authoritative state. |
| **Conversational Chat** | `components/overseer/presence/OverseerChat.tsx` | `WIRED` | User text entry, quick chips, message log, evidence citations, and HUD drawer disclosure triggers. |
| **Voice Interaction** | `components/overseer/presence/OverseerVoice.tsx` | `WIRED` | Web Speech API STT integration with toggle and speech state synchronization. |
| **Progressive Disclosure HUD** | `components/overseer/presence/OverseerProgressiveDisclosure.tsx` | `IMPLEMENTED` | Basic static mock for floors, missions, cases, decisions. Needs live binding to actual WorldState, MissionManager, and CaseManager. |
| **Activity Timeline** | `components/overseer/presence/OverseerActivity.tsx` | `ABSENT` | Human-friendly operational event timeline displaying real Slayer, Healer, Validator, and WorldState events. |
| **Operational HUD Metrics** | `components/overseer/presence/OverseerMetricsHUD.tsx` | `ABSENT` | Real-time operational summary metrics bar (Factory Health %, Missions, Active Cases, Workers, Floors). |
| **SSE Events Route** | `app/api/overseer/presence/events/route.ts` | `RUNTIME-VERIFIED` | Real-time SSE stream reading from `OverseerPresenceEngine`, supporting `Last-Event-ID` reconnection replay and 15s keepalives. |
| **Interaction API Route** | `app/api/overseer/presence/interact/route.ts` | `RUNTIME-VERIFIED` | Natural language query routing through `OverseerControlPlane`, `CaseManager`, `MissionManager`, with safe decision summaries and consciousness policies. |
| **Presence Rehydration** | `factoryos/core/overseer/presence/OverseerPresenceEngine.ts` | `RUNTIME-VERIFIED` | Reconstitutes affect, intent, and face state from authoritative WorldState, active missions, and active cases. |

---

## 3. Key Productization Action Items

1. **Build `OverseerMetricsHUD.tsx`**: Live metrics bar reflecting authoritative WorldState and mission telemetry.
2. **Build `OverseerActivity.tsx`**: Human-friendly operational event stream feed.
3. **Upgrade `OverseerProgressiveDisclosure.tsx`**: Replace placeholder mock data with live state fetch & props from `WorldState` / `MissionManager` / `CaseManager`.
4. **Enhance `OverseerFace.tsx`**: Implement randomized natural blinks (2–6s), micro-saccades, breathing oscillation, and speech modulation.
5. **Ensure Barge-in & Accessibility**: Hook speech synthesis cancel on mic activation and keyboard input; implement `prefers-reduced-motion` and ARIA attributes.
6. **Construct E2E Product Test Suite**: `factoryos/tests/overseer-product-presence-e2e.test.ts`.
