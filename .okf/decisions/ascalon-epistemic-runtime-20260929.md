# Ascalon Epistemic Runtime — Architectural Decision

> **Date:** 2026-09-29
> **Classification:** extends existing rule + new capability
> **Status:** LOCKED DESIGN DIRECTION / IMPLEMENTATION NOT YET CLAIMED
> **Scope:** ShortForge Cognitive Layer, Ascalon, uncertainty management, evidence orchestration, cognitive routing

## Decision

Introduce the **Ascalon Epistemic Runtime (AER)** as a proposed cognitive infrastructure layer that manages the epistemic state surrounding production problems before deep Ascalon reasoning is invoked.

AER shall answer:

- what is known;
- what is inferred;
- what is unknown;
- what conflicts;
- what hypotheses remain;
- what evidence is missing;
- what probe is most useful next;
- whether deterministic, fast, deep, specialist, or human cognition is warranted;
- what impact a problem may have;
- what was predicted previously and what actually happened.

AER shall provide Ascalon a compact, provenance-backed **EpistemicContext** containing state, uncertainty, evidence, hypotheses, investigation history, recommended probes, impact, budgets, and cognitive routing.

## Why

ShortForge already has typed decisions, confidence semantics, deterministic-first evaluation, shadow model infrastructure, provenance, replay, Guardian authorization, physical verification, and Ascalon training governance.

The architectural gap is not another choice model. It is a structured layer that determines **the state of knowledge and the best next epistemic operation**.

## Authority

AER is advisory cognition infrastructure.

It cannot:

- grant capability;
- mint or extend leases;
- modify fencing;
- bypass Guardian;
- declare F07 success;
- publish;
- modify production contracts;
- rewrite Ascalon weights.

Physical and deterministic evidence remain authoritative.

## Latency rule

AER shall be fast by default:

1. deterministic measurements first;
2. fast/micro cognition second;
3. deep Ascalon cognition only when uncertainty and impact justify the cost.

Every AER invocation must have bounded deadlines and budgets. Timeout or model unavailability produces `UNRESOLVED` or a governed fallback, never a fabricated answer.

## Confidence rule

AER must preserve the existing distinction between model probability, epistemic confidence, calibration, and provenance.

Confidence controls investigation/routing; it does not create authority or physical truth.

## Probe rule

AER may propose probes. Probe execution remains subject to capability authorization and the existing worker/runtime boundaries.

## Learning rule

AER may record prediction -> probe -> outcome relationships. Devourer may use the resulting evidence to propose training/evaluation improvements. Production model promotion remains governed by existing Ascalon training and evaluation gates.

## Implementation boundary

The first implementation must be shadow-only and must reuse existing:

- WorldState;
- ContextCompiler;
- DecisionContracts / DecisionEngine;
- Capability Registry;
- Guardian / Slayer / Healer;
- F07 physical verification;
- DecisionLedger / Ascalon trajectory governance.

No second scheduler or authority plane is introduced.

## Validation requirements

Before production influence:

- contract tests;
- deterministic-first tests;
- fail-closed timeout tests;
- contradiction handling tests;
- adversarial evidence tests;
- shadow replay;
- probe usefulness evaluation;
- calibration evaluation;
- latency/cost measurement;
- security review;
- canary evidence.

## Non-goals

AER is not a generic agent, chatbot wrapper, second workflow engine, confidence oracle, release gate, or autonomous self-rewriter.

## Canonical principle

> **AER manages epistemic state. Ascalon performs deep cognition over that state. FactoryOS performs authorized execution. F07 and physical evidence determine reality.**
