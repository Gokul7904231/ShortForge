# Devourer — Controlled Cognitive Self-Improvement Program

> Status: PLANNED / EXPERIMENTAL PROGRAM
> Purpose: continuous improvement of the ShortForge Cognitive Model and factory architecture.

## 1. Mission

Devourer is the program that continuously studies new engineering and AI patterns and turns validated knowledge into measurable improvements.

> Devour knowledge broadly; promote improvements narrowly.

Devourer is controlled self-improvement, not uncontrolled self-modification.

## 2. Improvement loop

~~~
AgentReach / GitHub / papers / issues / benchmarks
                    ↓
                Discover
                    ↓
             Classify source
                    ↓
             Capture evidence
                    ↓
              Research IR
                    ↓
           Compare with .okf
                    ↓
        Identify useful pattern
                    ↓
 ArchitectureProposal / LearningCandidate
                    ↓
                 Prototype
                    ↓
              Run benchmarks
                    ↓
              Security checks
                    ↓
            Ascalon evaluation
                    ↓
            Canary / isolated test
                    ↓
             Promote or Reject
                    ↓
           Record the decision
~~~

## 3. .okf review order

Before creating or changing an architecture rule, Devourer reviews:

1. .okf/index.md
2. .okf/architecture.md
3. .okf/principles.md
4. .okf/terminology.md
5. .okf/hierarchy/
6. .okf/intelligence/
7. .okf/memory/
8. .okf/research/
9. .okf/cognitive/

It must identify whether the idea already exists, extends a rule, contradicts a rule, belongs in a new capability, or is only experimental.

## 4. New repository ingestion

~~~
Repo
 ↓
Repository identity
 ↓
README / docs / important source paths
 ↓
Implementation evidence
 ↓
Known limitations
 ↓
Benchmark / test evidence
 ↓
FactoryOS mapping
 ↓
Decision
~~~

A repository is not adopted merely because it is popular.

## 5. Research IR minimum

~~~json
{
  "source": {},
  "retrievedAt": "...",
  "revision": "...",
  "evidence": [],
  "claim": "...",
  "factoryMapping": "...",
  "benefitHypothesis": "...",
  "risk": [],
  "compatibility": {},
  "decision": "adopt|adapt|reference|reject",
  "confidence": 0.0,
  "validationPlan": [],
  "artifacts": []
}
~~~

## 6. Model improvement candidates

Devourer may prepare:

- SFT examples
- DPO preference pairs
- RLVR trajectories
- failure-repair pairs
- worker-contract examples
- decision examples
- template-design examples
- architecture-analysis examples

Only verified real trajectories enter the trusted training set.

## 7. Candidate model gate

A candidate model must pass:

1. schema and contract tests
2. provenance/factuality checks
3. regression suite
4. worker-behavior suite
5. decision-quality benchmark
6. latency/resource benchmark
7. security and boundary tests
8. held-out evaluation
9. canary execution
10. rollback verification

Only then may a candidate become the active model.

## 8. No direct self-rewrite

The production cognitive model cannot silently replace its own weights, prompts, tools, safety policies, or authority boundaries.

Devourer can propose, train, benchmark, compare, stage, canary, and recommend promotion.

Promotion remains an explicit controlled state transition.

## 9. Architecture evolution

Devourer creates ArchitectureProposal records for:

- faster orchestration
- better worker contracts
- improved memory
- better verification
- stronger template compilation
- safer recovery
- cheaper or faster provider paths
- useful new GitHub research patterns
- simplification opportunities

Each proposal includes evidence, expected benefit, affected contracts, tests required, and rollback plan.

## 10. Improvement ledger

~~~
proposal
→ evidence
→ experiment
→ benchmark
→ decision
→ resulting version
→ observed outcome
~~~

Devourer itself is therefore auditable.


## Mandatory full-.okf review

Every Devourer cycle begins with a complete end-to-end review of the current .okf tree using .okf/decision-protocol.md.

Repository research is interpreted only after internal architecture reconstruction, current implementation inspection, current test inspection, existing repo-mapping extraction, and production-helper evidence review.

## Current engineering-stack priority

For rendering and media-engine improvements, compare candidates against TimelineIR, Remotion, AgentTube-derived scene lifecycle patterns, RenderFabric, and FFmpeg fallback.

A candidate that simply duplicates an existing stack capability should not create a new architecture node.


## 12. Mandatory .okf Decision Sweep

Every Devourer cycle must begin with the complete current `.okf` review defined by `.okf/decision-protocol.md`.

The cycle must compare external discoveries against existing:

- authority hierarchy
- worker permission contract
- cognitive contracts
- memory rules
- rendering stack
- artifact rules
- workflows
- security invariants
- audits
- repository mappings
- production-helper evidence

Only after that comparison may a discovery become a Devourer candidate.


## 13. Root Devourer Governance

The root `.okf/devourer.md` is the canonical governance charter for promotion, permissions, production-helper evidence, and authority boundaries. This cognitive document remains the design-home for Devourer reasoning and improvement methods.