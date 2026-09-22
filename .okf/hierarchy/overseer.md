# Hierarchy: The Overseer (`OverseerControlPlane.ts`)

> **Tier**: Supreme Operational Authority (Level 0)  
> **Instance Count**: Exactly ONE per Factory Cluster  
> **Location**: `apps/web/factoryos/core/overseer/OverseerControlPlane.ts`  

---

## 1. Responsibilities

1. **Strategic Ingestion**: Ingests user video generation requests, scheduled cron sweeps, and administrative commands.
2. **Cognitive Assessment**: Leverages the `ThinkingController` to determine operational mode:
   - `reflex`: Immediate tool execution (< 100ms)
   - `deliberate`: Standard multi-floor generation DAG execution
   - `deep`: Complex research, prompt evolution, or forensic analysis
   - `autonomous`: Continuous background loop monitoring and factory maintenance
3. **DAG Generation & Scheduling**: Generates the 7-floor dependency graph (`generateTaskNodesForGoal`) and dispatches it through `TaskDAGExecutor`.
4. **Presence Telemetry**: Streams live agent thoughts, floor metrics, and mission progress to the Next.js frontend via `OverseerPresenceEngine`.
5. **Decision Ledger Audit**: Records every high-level decision with rationale snapshot for non-repudiation.
