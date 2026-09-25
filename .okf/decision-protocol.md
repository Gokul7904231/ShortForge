
# ShortForge / FactoryOS — Mandatory Architecture Decision Protocol

> Document Class: Root Decision Governance Protocol
> Status: LOCKED / MANDATORY
> Priority: TOP PRIORITY
> Purpose: Make complete .okf review a mandatory prerequisite for architecture, engineering, research-assimilation, model, worker, security, rendering, and self-improvement decisions.

## 1. Absolute rule

Before making any non-trivial ShortForge engineering or architecture decision, the current .okf knowledge system must be analysed from end to end.

This is the first decision gate.

No new repository, paper, model, framework, optimization, worker permission, architecture component, render engine, or workflow may be accepted merely because it appears useful.

The decision process begins with the current .okf.

## 2. Mandatory review order

The minimum review order is:

~~~
0. Entire current .okf tree
       |
1. Root index / source-of-truth order
       |
2. Architecture + principles + terminology
       |
3. Absolute hierarchy + locked decisions
       |
4. Security + worker permissions
       |
5. Intelligence + cognition
       |
6. Memory + research
       |
7. Rendering + artifacts
       |
8. Workflows + lifecycle
       |
9. Audits / forensic reality
       |
10. Repo mappings / external patterns
       |
11. Production-helper evidence
       |
12. Relevant executable implementation
       |
13. Relevant tests
       |
14. Decision classification
       |
15. Decision filing
~~~

The exact directory list must remain dynamic because .okf grows.

## 3. Full .okf means full .okf

A review is not complete when only the obvious files were read.

The review must account for:

- newly added files
- old audits
- historical decisions
- research mappings
- security rules
- workflow invariants
- rendering contracts
- cognitive documents
- memory rules
- terminology
- known current-vs-target gaps

The reviewer must not rely only on conversation memory.

## 4. Required extraction from .okf

For every decision, extract:

### Existing rules

What is already canonical?

### Existing implementation

What is actually implemented and tested?

### Existing target state

What is already planned but not implemented?

### Existing contradictions

Which documents, mappings, or code paths disagree?

### Existing reusable patterns

Which previously assimilated repository patterns already solve part of the problem?

### Relevant constraints

Which security, authority, licensing, provenance, latency, or verification rules constrain the proposal?

## 5. Repo-mapping rule

Repository mappings are not decorative research notes.

When a new decision touches an area covered by a repo mapping:

1. read the relevant mapping
2. extract adopted mechanisms
3. extract rejected mechanisms
4. inspect implementation locations named by the mapping
5. compare the new proposal against the existing assimilation
6. avoid re-inventing an already adopted pattern

Classification remains:

- already exists
- extends existing rule
- contradicts existing rule
- new capability
- experiment only

## 6. Engineering-stack priority

The currently selected media-engine stack must be considered before proposing an unrelated renderer:

### Primary programmatic composition foundation

Remotion

### Scene lifecycle / bounded repair pattern source

AgentTube

### Canonical ShortForge IR

TimelineIR

### Deterministic physical fallback

FFmpeg / existing RenderFabric

This does not mean every task must use Remotion. It means architecture decisions must explicitly explain why they use, extend, or bypass the selected stack.

## 7. Production-helper rule

production-helper is a routine validation station.

For changes involving:

- security
- worker permissions
- rendering
- callback convergence
- quotas
- production authentication
- remote workers
- external provider routing
- significant architecture changes

the decision / implementation workflow must consult production-helper evidence and run the appropriate available checks.

Its reports are evidence, not authority. They never override executable code or tests.

## 8. Decision record requirements

Every non-trivial decision must record:

1. Decision
2. Classification
3. Existing .okf rules considered
4. Relevant repo mappings
5. Affected hierarchy nodes
6. Affected workers / permissions
7. Affected contracts
8. Security impact
9. Performance impact
10. Verification plan
11. Implementation status
12. Rollback / rejection condition
13. Provenance
14. Date / revision

## 9. No silent architecture drift

If a proposal contradicts a locked decision:

- do not silently rewrite the old rule
- record the contradiction
- explain the evidence
- create an explicit architecture decision
- update all affected canonical documents after promotion

## 10. Current-vs-target discipline

Every architectural statement must remain tagged as one of:

IMPLEMENTED
PARTIALLY_IMPLEMENTED
SCAFFOLDED
PLACEHOLDER
EXPERIMENTAL
PLANNED

Do not promote a target to an implementation claim merely because it is documented.

## 11. Decision output standard

The final decision should answer:

~~~
What exists?
What does .okf already say?
What does code actually do?
What have repo mappings already taught us?
What is missing?
What should be added?
What must not change?
How will we verify it?
~~~

## 12. Emergency exception

An immediate operational safety action may occur before full documentation review when required to contain active damage.

Such an action must be followed by the full .okf review and decision filing before related architecture is extended further.

## 13. Non-negotiable priority

This protocol has higher process priority than convenience, speed of ideation, or novelty.

The factory should prefer a slower correct decision over a fast contradictory architecture decision.

## 14. Canonical entry point

This file is the mandatory starting point for future ShortForge architecture decisions.

Also consult:

- .okf/index.md
- .okf/hierarchy-map.md
- .okf/decisions.md
- .okf/security/worker-permissions.md
- .okf/engineering-stack.md
- .okf/production-helper.md
- .okf/devourer.md
