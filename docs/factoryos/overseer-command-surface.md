# FactoryOS Frontier v2 — Overseer Command Surface V2 Specification

## 1. Executive Summary
FactoryOS Frontier v2 elevates the Overseer interface from a generic chatbot placed below the dashboard into a **First-Class Autonomous Command Surface**.

The Command Surface directly reflects the core philosophy:
```
FactoryOS Brain
       ↓
Overseer Reasoning
       ↓
Operational State / Intent / Attention
       ↓
Overseer Presence
       ↓
User Command Surface
```

---

## 2. Core Architecture & Layers

```
+-------------------------------------------------------------------------+
| FACTORYOS // OVERSEER                                      ● WATCHING   |
+-------------------------------------------------------------------------+
|                                                                         |
|                          EXPRESSIVE LIVING FACE                         |
|                         (Procedural Canvas + Mouth)                     |
|                                                                         |
|                       "I'm watching Floor 03."                          |
|                                                                         |
+-------------------------------------------------------------------------+
| CURRENT FACTORY STATE                                                   |
|   Factory Health: 98.4% | Missions: 1 Active | Cases: 0 Open            |
|   Workers: 4 / 4 Healthy | Floors: 4 / 4 Online                         |
+-------------------------------------------------------------------------+
| CURRENT FOCUS (OverseerFocusCard)                                       |
|   Target: Floor 03 — Rendering & Asset Realization                      |
|   Severity: HIGH | Confidence: 91% | Status: Active Watch               |
|   Reason: GPU socket degradation detected                               |
|   Actions: [Inspect] [Explain] [Evidence]                               |
+-------------------------------------------------------------------------+
| LATEST INTELLIGENCE / RESPONSE CARD (OverseerResponseCard)              |
|   Root Cause: GPU socket timeout                                        |
|   Detector: Rendering Slayer | Healer: Rendering Healer                 |
|   Verification: Validator PASSED | Current State: ONLINE                |
|   Actions Taken: ✓ Dispatched Healer ✓ Recycled Socket                  |
+-------------------------------------------------------------------------+
| OPERATIONAL ACTIVITY TIMELINE (OverseerOperationalTimeline)             |
|   18:06:12  OBSERVE     Floor 03 degradation detected                   |
|   18:06:13  INVESTIGATE Rendering Slayer opened investigation           |
|   18:06:14  THINK       Cognitive runtime evaluating possible causes    |
|   18:06:15  REPAIR      Rendering Healer dispatched                     |
|   18:06:18  VERIFY      Validator passed                                |
|   18:06:18  SUCCESS     Floor 03 restored                               |
+-------------------------------------------------------------------------+
| COMMAND SURFACE COMPOSER                                                |
|   [CHAT] [OPERATE] [RESEARCH] [CREATE] [MONITOR] [AUTOPILOT]            |
|   [Make Quiz Short] [Inspect Factory] [Operate] [Research Trends]       |
|   [+ Context ▾] Ask Overseer...                           🎤   →        |
+-------------------------------------------------------------------------+
| CONVERSATION & AUDIT DRAWER (OverseerConversationDrawer - Slide-over)   |
|   • Pinned Insights | Recent Sessions | Search Filter | Log Export      |
+-------------------------------------------------------------------------+
```

---

## 3. Component Reference

| Component | Responsibility |
| :--- | :--- |
| [`OverseerCommandSurface.tsx`](gen-v/components/overseer/presence/OverseerCommandSurface.tsx) | Master Command Surface orchestrator binding presence, metrics, focus, timeline, and composer. |
| [`OverseerFocusCard.tsx`](gen-v/components/overseer/presence/OverseerFocusCard.tsx) | Displays real-time attention target, severity, reason, confidence score, and context actions. |
| [`OverseerOperationalTimeline.tsx`](gen-v/components/overseer/presence/OverseerOperationalTimeline.tsx) | Event-driven operational activity stream replacing the legacy chat transcript. |
| [`OverseerResponseCard.tsx`](gen-v/components/overseer/presence/OverseerResponseCard.tsx) | Structured insight card with root cause, detector, healer, validator status, and proof evidence. |
| [`OverseerCommandComposer.tsx`](gen-v/components/overseer/presence/OverseerCommandComposer.tsx) | Context-aware command bar (`+ Context`) with speech synthesis, voice barge-in, and keyboard handling. |
| [`OverseerModeBar.tsx`](gen-v/components/overseer/presence/OverseerModeBar.tsx) | Segmented mode switcher: `CHAT`, `OPERATE`, `RESEARCH`, `CREATE`, `MONITOR`, `AUTOPILOT`. |
| [`OverseerQuickActions.tsx`](gen-v/components/overseer/presence/OverseerQuickActions.tsx) | State-aware dynamic quick action pills adjusting to anomalies, active missions, and modes. |
| [`OverseerConversationDrawer.tsx`](gen-v/components/overseer/presence/OverseerConversationDrawer.tsx) | Searchable slide-over drawer with pinned and recent conversation logs. |

---

## 4. Key Behavioral Invariants

1. **No Giant Central Chat**: Secondary conversation history is housed within the searchable `OverseerConversationDrawer`.
2. **Authoritative Focus & Gaze**: Attention target coordinates map directly to procedural eye parameters (`gazeX`, `gazeY`, `openness`, `browAngle`).
3. **Truth Gate & Validator Invariants**: Overseer face and UI will never indicate `SUCCESS` or triumph without independent `Validator` confirmation.
4. **Natural Quiz Short Pipeline**: Natural language commands like *"Make me a quiz short about Space"* parse topic and duration $\to$ create structured quiz payload $\to$ instantiate persistent `Mission` $\to$ dispatch task DAG to floor swarms.
5. **Agent-Reach & GStack Routing**: External research and engineering code inspection execute through backend adapters with structured evidence citations.
6. **Dark Theme Coherence**: Coherent industrial palette (`#0A84FF`, `#19BFFF`, `#07111F`, `#0B1220`, `#101827`, emerald, amber, crimson) persisted across all layers.
