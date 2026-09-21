# Intelligence: Execution Strategy & Thinking Modes

> **Status**: OPERATIONAL  
> **Engine**: `ThinkingController.ts`  

---

## 1. Overseer Cognitive Modes
The Overseer switches operational thinking modes based on command intent and system health:

- **REFLEX (< 100ms)**: Direct deterministic query handling without planning overhead (e.g. retrieving floor status or worker heartbeats).
- **DELIBERATE (100ms – 1s)**: Standard mission execution. Assembles the 7-floor DAG, calculates parallel task allocations, and initiates execution.
- **DEEP (1s – 5s)**: High-complexity evaluation. Applied during anomaly analysis, competitor trend synthesis, or custom engine construction.
- **AUTONOMOUS**: Continuous loop mode. Runs supervisory triage, watchdog sweeps, and proactive self-healing in the background.
