# Research: Trend Intelligence & Daily Content Slate Generation

> **Status**: CANONICAL / IMPLEMENTATION-ALIGNED  
> **Current implementation**: `apps/web/factoryos/core/research/DailySlateGenerator.ts` and `apps/web/factoryos/core/research/ResearchRuntime.ts`

## 1. Floor 00 responsibility

Floor 00 is the evidence-intake boundary of FactoryOS.

The production research path is:

```text
Mission / Engine Research Contract
        ↓
Floor 00 ResearchRuntime
        ↓
ReachSubsystem
        ↓
EvidenceSource[]
        ↓
Claim classification
        ↓
Cryptographically signed ResearchPassport
        ↓
AnalystReport
        ↓
Floor 01
```

`DailySlateGenerator` is a schedule-driven slate utility that can turn already researched candidates into a bounded `DailyContentSlate`. It is **not currently the direct executor used by the F00 task executor**.

## 2. What DailySlateGenerator actually guarantees

The current implementation:

- derives the requested candidate count from `ScheduleInstance.targetRequirements.requestedCount`;
- normalizes topic names and removes duplicate topic strings;
- requires syntactically valid HTTP(S) source URLs;
- requires a non-empty `passportId` lineage reference;
- rejects candidates with saturation above `0.8`;
- preserves supplied novelty/saturation values, otherwise applies bounded compatibility defaults;
- never fabricates candidates when capacity is insufficient;
- emits an explicit `unmetCapacity` / `unmetReason`;
- computes a SHA-256 provenance digest for the generated slate.

The generator does **not** currently:
- perform semantic embedding clustering;
- query channel history;
- calculate cross-channel trend velocity;
- cryptographically verify the referenced ResearchPassport itself.

Those are downstream/target capabilities, not current guarantees.

## 3. Schedule sizing invariant

Autonomous production quantity comes from `ScheduleInstance.targetRequirements.requestedCount`.

That is a **business production quantity**, distinct from the bounded external-source fan-out used by `ResearchRuntime`.

For production runs, the selected Content Engine's research contract may provide `minSources` and other research requirements. Standalone legacy research calls retain a small methodology-based fallback only for backward compatibility.

## 4. Current vs target

| Dimension | Current | Target |
|---|---|---|
| Schedule sizing | Implemented from ScheduleInstance | Predictive capacity allocation |
| Topic deduplication | Exact normalized-topic deduplication | Semantic angle/topic clustering |
| Saturation | Explicit candidate saturation filter | Cross-channel real-time saturation graph |
| Novelty | Supplied candidate score or bounded compatibility default | Measured against historical channel/content genome |
| Passport lineage | Required by DailySlateGenerator | Cryptographically verified before slate acceptance |
| Slate execution | Utility/tested contract | Directly wired into autonomous F00 scheduled execution |

## 5. Non-fabrication invariant

If F00 cannot obtain usable evidence, it must not invent sources, URLs, trends, or "observed" metrics.

The resulting ResearchPassport may contain an explicit `UNVERIFIED_ASSERTION`, but that is evidence of insufficient research, not a successful factual finding.

## 6. Content Engine relationship

A Content Engine may declare its research contract:

```text
Content Engine
  ↓
Research Contract
  ↓
F00 ResearchRuntime
  ↓
AgentReach / ReachSubsystem
  ↓
ResearchPassport
```

The Content Engine constrains what evidence F00 is supposed to acquire; AgentReach remains the external information acquisition boundary.
