# Floor 00 Final Audit — Analyst & Research Ingestion

> Audit status: FINAL PRE-F01 GATE
> Audit date: 2026-09-25
> Canonical floor: floor00_analyst
> Source of topology truth: apps/web/factoryos/core/hierarchy/FloorRegistry.ts
> Primary runtime: apps/web/factoryos/core/research/ResearchRuntime.ts

## 1. Audit objective

This audit reconciles the executable implementation, floor contracts, Ascalon ontology, .okf documentation, research provenance rules, Content Engine architecture, and regression tests for Floor 00 before work proceeds to Floor 01.

The audit deliberately distinguishes implemented runtime behavior, verified test behavior, compatibility/legacy behavior, and target architecture that is not yet fully wired.

## 2. Canonical F00 contract

| Item | Audited result |
|---|---|
| ID | floor00_analyst |
| Number | 0 |
| Canonical name | Analyst & Research Ingestion |
| Category | RESEARCH |
| Predecessors | None |
| Successor | floor01_strategy |
| Required input | topic |
| Outputs | analystReport, passport |
| Runtime owner | ResearchRuntime.ts |
| External access | ReachSubsystem / AgentReachAdapter |
| Evidence artifact | ResearchPassport |
| Downstream consumer | Floor 01 Strategy |

Machine-readable ontology, floor contract, and FloorRegistry now agree on these F00 fundamentals.

## 3. Canonical execution path

Mission Scope
  -> topic validation
  -> selected Content Engine research contract
  -> ResearchRuntime
  -> ReachSubsystem
  -> direct URL: Lightpanda
  -> query: configured SEARCH_API_URL
  -> usable EvidenceSource[]
  -> claim classification
  -> cryptographically signed ResearchPassport
  -> AnalystReport
  -> F01 dependency output

An empty topic is now a hard F00 input failure. There is no fallback to a synthetic topic.

## 4. Content Engine integration

F00 now accepts the selected Content Engine research contract.

Supported research contract information includes engine ID, data requirements, minimum source expectation, citation requirement, freshness policy, source policy, AgentReach profile, and audience context.

AgentReach remains an acquisition subsystem rather than an authority that invents engine requirements.

## 5. Reach audit

### PASS — no synthetic evidence
Reach does not manufacture placeholder URLs or synthetic source findings.

### PASS — direct retrieval failure is explicit
Direct browser retrieval can produce an explicit UNAVAILABLE source record. ResearchRuntime removes unavailable/unreachable records before treating them as evidence.

### PASS — query-provider absence is honest
Without a configured search provider, query acquisition returns no usable evidence.

### PARTIAL — generic query surface
AgentReach's public adapter still accepts a generic query/domain/maxSources interface. The Content Engine research contract is now passed into the F00 runtime, but the adapter has not yet been transformed into a fully engine-specific query planner.

This is a future boundary refinement, not a source-integrity failure.

## 6. ResearchPassport audit

### PASS — structured provenance
Passport records contain mission linkage, research question and intent, methodology, evidence sources, claims, unresolved issues, confidence, Reach/agent/floor provenance, timestamps, transformation steps, optional engine research context, and cryptographic integrity metadata.

### PASS — cryptographic integrity
Passport integrity uses SHA-256 content hash, HMAC-SHA256 MAC, and constant-time MAC comparison. Production now requires FACTORY_INTEGRITY_SECRET. Development/test environments may use the explicit development-only key.

### PASS — unavailable evidence exclusion
Unavailable/unreachable source records cannot silently become positive evidence.

### PASS — fidelity separation
Model claims remain MODEL_CLAIM / UNVERIFIED. Hook intelligence remains explicitly HEURISTIC_ESTIMATE.

### QUALIFIED — canonicalization terminology
The implementation uses a deterministic project canonicalization format named JCS-v1. The project no longer claims that this is a complete RFC 8785 implementation.

## 7. Claim verification audit

The F00 classifier now requires at least two meaningful shared normalized tokens before using its deterministic cross-source corroboration path.

This improves the previous one-token overlap behavior, but it is still a heuristic corroboration mechanism.

Therefore F00 is an evidence-ingestion and claim-classification floor, not a guarantee of expert-level factual truth.

Unverified claims remain explicitly labeled and unresolved issues are preserved.

## 8. Daily Slate audit

DailySlateGenerator is now correctly treated as a schedule-driven F00 slate utility.

Current guarantees: schedule-derived requested count; normalized-topic deduplication; HTTP(S) source requirement; ResearchPassport lineage requirement; saturation filtering; explicit unmet capacity; complete slate provenance digest.

DailySlateGenerator does not currently perform semantic embedding clustering, query channel history, calculate cross-channel trend velocity, or cryptographically verify the referenced ResearchPassport itself.

### Important implementation boundary

The current autonomous F00 task executor directly emits AnalystReport + ResearchPassport. It does not currently emit DailyContentSlate as its primary task result.

Therefore the Daily Slate is marked IMPLEMENTED / PARTIALLY WIRED rather than falsely documented as the direct F00 runtime output.

## 9. Ascalon ontology audit

F00 ontology is synchronized with current runtime: runtime owner -> ResearchRuntime.ts; expected input -> topic; outputs -> AnalystReport + ResearchPassport; current research subsystem locations documented; simulation role explicitly identifies injected Reach fixtures.

The F00 research capability now recognizes the RESEARCH_ANALYST runtime role in the Ascalon capability ontology.

## 10. F00 security boundary

Current F00 code does not grant render authority, publication authority, provider secrets, GPU authority, lease/fencing authority, Guardian bypass, or F07 bypass.

F00 remains an evidence acquisition / intelligence worker.

## 11. Documentation reconciliation

The following F00 documentation was updated to implementation-aligned language:

- .okf/research/trend-intelligence.md
- .okf/research/reach.md
- .okf/research/source-provenance.md
- .okf/architecture.md
- training/ascalon/ontology/floors.json
- training/ascalon/ontology/capabilities.json

Historical .okf/audits/factoryos-current-state.md is explicitly marked as superseded for current state.

## 12. Regression coverage added

F00 regression coverage now checks:

1. empty topic is rejected;
2. unavailable Reach records do not enter passport evidence;
3. research contract context is preserved;
4. DailySlate candidates without passport lineage are rejected;
5. schedule-driven slate sizing;
6. honest unmet capacity;
7. ResearchPassport integrity;
8. claim classification;
9. AgentReach empty-query semantics;
10. F00 topology and dependency invariants.

## 13. Remaining non-blocking architectural work

1. Fully engine-specific AgentReach query planning.
2. Direct production wiring of DailyContentSlate into scheduled F00 execution.
3. Semantic rather than token-overlap claim corroboration.
4. Full source-specific truth verification.
5. Per-floor typed ProductionSpec projections throughout every downstream worker.

These are architecture evolution items, not unresolved F00 source-integrity defects.

## 14. Pre-F01 gate

Floor 00 can be considered architecturally reconciled for the next floor when the latest CI run verifies TypeScript typecheck, the full Vitest suite, F00 modernization tests, ResearchPassport tests, and ProductionSpec integration tests.

Do not use a documentation-only PASS as the final gate. The CI result is the final executable verification signal.