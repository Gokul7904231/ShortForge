# Intelligence: Distributed Observability & Trace Context Architecture

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/observability/TraceContext.ts`

---

## 1. Architectural Philosophy: End-to-End Traced Agency

Autonomous systems operating multi-floor pipelines cannot be debugged with isolated log lines. A failure in Floor 06 (rendering) is often the consequence of a subtle timestamp misalignment in Floor 02 (scripting) or an ambiguous visual prompt in Floor 03 (asset realization).

FactoryOS implements a unified **Distributed Trace Context Hierarchy** that links every operational action back to the originating schedule and mission. Every log statement, tool execution, model prompt, memory lookup, and generated media artifact carries a cryptographically unique, lineage-preserving trace identifier.

```
┌────────────────────────────────────────────────────────┐
│                        Schedule                        │
│                   (Daily Schedule ID)                  │
└───────────────────────────┬────────────────────────────┘
                            │ Instantiates
                            ▼
┌────────────────────────────────────────────────────────┐
│                    ScheduleInstance                    │
│             (Date, Target Quotas, Run ID)              │
└───────────────────────────┬────────────────────────────┘
                            │ Dispatches
                            ▼
┌────────────────────────────────────────────────────────┐
│                        Mission                         │
│               (Mission ID, Trace Root ID)              │
└───────────────────────────┬────────────────────────────┘
                            │ Orchestrates
                            ▼
┌────────────────────────────────────────────────────────┐
│                      Floor Task                        │
│              (Floor ID, Floor Run Span ID)             │
└───────────────────────────┬────────────────────────────┘
                            │ Spawns
                            ▼
┌────────────────────────────────────────────────────────┐
│                     Agent Session                      │
│               (Agent ID, Session Span ID)              │
└───────────────────────────┬────────────────────────────┘
                            │ Invokes
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Skill Execution                     │
│                (Skill ID, Action Span)                 │
└───────────────────────────┬────────────────────────────┘
                            │ Emits
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Artifact / Receipt                   │
│          (SHA-256 Digest, Lineage Trace Record)        │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Trace Model** | Strongly typed `TraceContext` in `TraceContext.ts` | Fully compliant W3C TraceContext standard with OpenTelemetry exporter |
| **Span Propagation** | Explicit context passing via `AgentSkillExecutionContext` | Asynchronous Local Storage (Node.js `AsyncLocalStorage`) automatic propagation |
| **Log Correlation** | Structured JSON logging with trace metadata enrichment | Distributed log indexing (Grafana Loki / ClickHouse) with millisecond search |
| **Artifact Lineage** | Explicit parent hash tracking in artifact manifests | Graph-based lineage visualization with interactive playback and diffing |
| **Anomaly Detection** | Threshold-based rule checks in Floor 07 verification | Real-time automated trace anomaly detection using unsupervised clustering |

---

## 3. Core Trace Contracts

Defined in `TraceContext.ts`:

```typescript
export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly missionId: string;
  readonly floorId?: FloorId;
  readonly agentId?: string;
  readonly metadata?: Record<string, string | number | boolean>;
}

export function createRootTraceContext(missionId: string, metadata?: Record<string, string | number | boolean>): TraceContext;
export function createChildSpan(parent: TraceContext, floorId?: FloorId, agentId?: string, metadata?: Record<string, string | number | boolean>): TraceContext;
```

---

## 4. Operational Lineage Invariants

1. **Root Immutability**: The `traceId` and `missionId` created at mission initiation never change throughout the lifecycle of that mission, across all floors, retries, and healer repairs.
2. **Strict Hierarchy**: When a floor task spawns an agent, the agent's span becomes a child of the floor span. When an agent invokes a skill, the skill's span becomes a child of the agent session.
3. **Artifact Attribution**: Every created artifact (script file, audio wav, video mp4, timeline json) stores the current `TraceContext` in its metadata manifest.
4. **Error Transparency**: When an exception occurs, the error record captures the exact `spanId`, `floorId`, and `agentId` at the point of failure, enabling instant pinpointing of degraded components.
