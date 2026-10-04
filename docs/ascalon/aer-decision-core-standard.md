# AER Decision Core Standard

**Status:** Architecture and implementation scaffold  
**Production status:** NOT ENABLED

## 1. Purpose

ShortForge has three distinct cognitive components:

1. **AER Runtime** — epistemic state, evidence, uncertainty, probes, budgets, and cognitive routing.
2. **AER Decision Core** — a compact, fast learned model for bounded typed decisions.
3. **Ascalon** — the fine-tuned deep-cognition model for planning, diagnosis, synthesis, research interpretation, and complex reasoning.

They must not be collapsed into one model.

## 2. Canonical relationship

~~~text
World / FactoryOS
      |
      v
 AER Runtime
      |
      +--------------------+
      |                    |
      v                    v
Deterministic        AER Decision Core
rules                CHOICE / SCORE / NOUL
      |                    |
      +----------+---------+
                 |
                 | when deeper cognition is justified
                 v
              Ascalon
                 |
                 v
             Proposal
                 |
                 v
Guardian / Runtime / F07
                 |
                 v
Verified outcome
                 |
                 v
            AER feedback
~~~

AER decides **how much cognition is justified**. It does not become an execution authority.

## 3. Typed decision standard

AER Decision Core uses the existing DecisionContracts primitives:

- **NOUL** — binary truth / yes-no probability.
- **CHOICE** — categorical selection over runtime-supplied options.
- **SCORE** — rubric-based scoring.

Every model result must carry typed output, uncertainty metadata, model identity/version, calibration status, and provenance binding. The model must never fabricate probability or confidence.

## 4. Dynamic questions

The model must accept questions and options/rubrics at runtime. It must not be trained as a fixed provider classifier.

The same checkpoint should be able to answer:

- compute-provider selection;
- worker selection;
- cognitive-mode routing;
- evidence sufficiency;
- probe selection;
- retry/failover;
- hypothesis ranking;
- escalation.

## 5. Batch inference

Preferred contract:

~~~text
one epistemic state
+
many typed questions
        |
        v
one model evaluation
~~~

The implementation should exploit shared encoding/context rather than performing independent autoregressive generation for every question.

## 6. Adaptive cognition

Target policy:

~~~text
AER
 |
 +--> deterministic answer
 |
 +--> AER-Core fast answer
 |       |
 |       +--> confident --> continue
 |       |
 |       +--> uncertain --> escalate
 |
 +--> Ascalon deep cognition
 |
 +--> human escalation
~~~

Additional cognition should be purchased only when uncertainty, expected value, deadline, cost, safety sensitivity, and capability availability justify it.

## 7. Ascalon relationship

Ascalon does **not** depend on AER-Core for every decision.

Ascalon receives an AER-produced epistemic context containing, where available:

- verified facts;
- evidence references;
- unknowns;
- contradictions;
- hypotheses;
- investigation history;
- recommended probes;
- impact;
- budgets;
- routing recommendation;
- fast typed-decision observations.

AER-Core is a fast triage/decision component, not Ascalon's brain. Ascalon may disagree with an AER-Core recommendation; disagreement must remain measurable and provenance-preserving.

## 8. Authority boundary

AER-Core is advisory. It cannot:

- grant capabilities;
- authorize execution;
- mint leases;
- change fencing;
- publish;
- certify F07;
- replace Guardian;
- redefine policy.

Typed output is a proposal, not authorization.

## 9. Abstention

Production AER-Core must support an explicit unresolved/abstain path.

When evidence is insufficient:

~~~text
UNKNOWN / PROBE / ESCALATE
~~~

is preferred over a synthetic confident answer.

## 10. Training separation

### AER Decision Core

Train on verified bounded decision examples:

- state + question + options/rubric;
- verified answer;
- defensible probability target;
- calibration labels;
- outcome;
- provenance.

Optimize for decision accuracy, calibration, latency, throughput, abstention quality, and schema validity.

### Ascalon

Train separately on verified trajectories, planning, diagnosis, tool/action proposals, structured generation, research interpretation, worker guidance, preference data, and verifiable outcomes.

Optimize for reasoning quality, task success, evidence grounding, structured output, authority compliance, and recovery quality.

## 11. AER-Bench

The benchmark should cover:

1. epistemic-state classification;
2. evidence sufficiency;
3. probe selection;
4. hypothesis ranking;
5. cognitive routing;
6. worker/provider routing;
7. failure classification;
8. recovery selection;
9. authority escalation;
10. stop/replan decisions.

Report separately:

- CHOICE accuracy and top-k accuracy;
- NOUL accuracy, Brier, ECE and AUROC where applicable;
- SCORE MAE and ordinal/QWK quality;
- abstention/selective accuracy;
- malformed-output rate;
- p50/p95 latency;
- throughput;
- memory.

Use immutable train/validation/test separation and a held-out production-like evaluation set.

## 12. Promotion

~~~text
train
  -> offline validation
  -> invariant tests
  -> calibration
  -> shadow replay
  -> held-out benchmark
  -> restricted canary
  -> governance review
  -> promotion
~~~

A higher benchmark score alone does not authorize deployment if authority, security, verification, replay, or calibration invariants regress.

## 13. Current implementation state

The repository already contains:

- typed DecisionContracts;
- deterministic decision adapter;
- JEV shadow adapter;
- GLiDE adapter;
- batch DecisionEngine;
- AER epistemic runtime;
- cognitive routing;
- Ascalon epistemic handoff.

This change adds the **AER Decision Core model boundary** without enabling it as production authority.

Next milestone: implement a real checkpoint/provider, then build AER-Bench and calibration/evaluation pipelines.

## 14. Non-negotiable principle

> AER Runtime coordinates epistemic state. AER Decision Core makes fast bounded typed decisions. Ascalon performs deep cognition. FactoryOS governance decides what can actually execute.
