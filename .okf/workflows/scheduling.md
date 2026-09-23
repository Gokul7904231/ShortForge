# Workflows: Scheduling & Production Intake Architecture

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/schedule/ScheduleContracts.ts` & `apps/web/factoryos/core/production/AutonomousScheduler.ts`

---

## 1. Architectural Philosophy: The Single Scheduler Invariant

In autonomous media operations, a common architectural defect is the emergence of competing, uncoordinated schedulers (e.g., a background cron triggering research, an independent job scheduler kicking off renders, and a manual dashboard queuing scripts). This leads to quota contention, duplicate missions, untracked compute spend, and uncoordinated state.

FactoryOS strictly enforces a **Single Scheduler Architecture**:
$$\text{Schedule} \longrightarrow \text{ScheduleInstance} \longrightarrow \text{Mission} \longrightarrow \text{Overseer} \longrightarrow \text{AgentRuntime} \longrightarrow \text{F00} \rightarrow \dots$$

There is exactly one scheduler in FactoryOS: the `AutonomousScheduler`. It is the sole authority responsible for initiating production slates, evaluating daily requirements, instantiating missions, and submitting them to the `Overseer` control plane.

```
┌────────────────────────────────────────────────────────┐
│                        Schedule                        │
│     (Cron Expression, Channel ID, Target Quotas)       │
└───────────────────────────┬────────────────────────────┘
                            │ Evaluates Trigger
                            ▼
┌────────────────────────────────────────────────────────┐
│                  AutonomousScheduler                   │
│  ├── Idempotency Check (Prevent duplicate daily runs)  │
│  ├── Evaluate ScheduleTargetRequirements               │
│  └── Construct ScheduleInstance                        │
└───────────────────────────┬────────────────────────────┘
                            │ Instantiates & Dispatches
                            ▼
┌────────────────────────────────────────────────────────┐
│                        Mission                         │
│       (Mission ID, Schedule Reference, Trace Root)     │
└───────────────────────────┬────────────────────────────┘
                            │ Submits
                            ▼
┌────────────────────────────────────────────────────────┐
│                  Overseer Control Plane                │
│    (Instantiates Canonical 8-Floor Production DAG)     │
└───────────────────────────┬────────────────────────────┘
                            │ Starts Pipeline
                            ▼
┌────────────────────────────────────────────────────────┐
│              Floor 00 Market Analyst & Research        │
│   (Derives Research Capacity Dynamically from Target)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Scheduler Flow** | Single control plane path in `AutonomousScheduler.ts` (`Schedule` -> `ScheduleInstance` -> `Mission` -> `Overseer`) | Distributed high-availability scheduler with Raft-consensus leader election |
| **Capacity Sizing** | Dynamic capacity derived from `ScheduleTargetRequirements` (zero hardcoded constants) | Predictive capacity autoscaling balancing historical audience watch times |
| **Idempotency** | Date-keyed and channel-keyed run prevention in memory/DB | Distributed distributed lock (Redis Redlock / DB unique constraint) |
| **Slate Generation** | `DailySlateGenerator.ts` matching target video count to verified research topics | Real-time trend spike reactive scheduling with automated queue preemption |
| **Overseer Submission** | Direct programmatic dispatch to `Overseer` orchestrator | Event-driven persistent message queue (Kafka / RabbitMQ) with at-least-once delivery |

---

## 3. Core Schedule Contracts

Defined in `ScheduleContracts.ts`:

```typescript
export interface ScheduleTargetRequirements {
  readonly targetVideoCount: number;
  readonly targetDurationRange: { readonly minSeconds: number; readonly maxSeconds: number };
  readonly targetGenres: readonly string[];
  readonly targetNiches: readonly string[];
  readonly priority: 'NORMAL' | 'HIGH' | 'EXPEDITED';
}

export interface Schedule {
  readonly id: string;
  readonly channelId: string;
  readonly cronExpression: string;
  readonly timezone: string;
  readonly requirements: ScheduleTargetRequirements;
  readonly enabled: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ScheduleInstance {
  readonly id: string;
  readonly scheduleId: string;
  readonly scheduledForDate: string; // YYYY-MM-DD
  readonly status: 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  readonly missionIds: readonly string[];
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly failureReason?: string;
}
```

---

## 4. Elimination of Hardcoded Research Capacities

A core requirement of Project Ascalon and the architecture modernization was the elimination of hardcoded research quotas in Floor 00 (such as `maxSources = 5` or `videoCount = 5`).

Under the modernized architecture:
1. The `ScheduleTargetRequirements` specifies the exact required output (`targetVideoCount`).
2. Floor 00 dynamically calculates its research capacity:
   $$\text{requiredTopics} = \text{targetVideoCount} \times \text{BUFFER\_FACTOR}$$
3. If research tools fail or insufficient verified evidence is found, `DailySlateGenerator` honestly reports an **unmet capacity deficit** rather than fabricating fictitious topics to fill an arbitrary quota.
