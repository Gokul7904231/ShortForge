
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

## 15. Absolute top-priority rule

The complete current .okf tree is the highest-priority architectural input for every non-trivial decision. This applies even when a proposed change appears local, obvious, faster, or unrelated.

No architecture decision begins from external research, conversation memory, a new repository, a benchmark, or a model announcement. Those inputs are secondary until the current internal architecture has been reconstructed.

The only operational exception is active incident containment. After containment, the complete .okf review is mandatory before related architecture is extended.

## 16. End-to-end .okf sweep requirement

For each decision cycle, inventory the current .okf tree first, then review every applicable section from root to leaf:

1. root files
2. hierarchy
3. cognitive
4. intelligence
5. memory
6. research and every repo mapping relevant to the decision
7. rendering
8. artifacts
9. security
10. workflows
11. audits
12. production-helper contract and evidence
13. existing locked decisions

The sweep must explicitly extract:
- canonical rules
- implementation facts
- target designs
- contradictions
- security / permission constraints
- performance constraints
- verification requirements
- reusable repository mappings
- prior failure evidence
- unresolved blockers

A decision is incomplete until these have been considered.

## 17. Repo mappings are first-class engineering inputs

.okf/research/repo-mappings is part of the engineering knowledge base, not an optional appendix.

For a decision touching a mapped domain, the mapping must be reviewed before proposing a new mechanism. Extract both adopted and rejected mechanisms. Reuse compatible patterns where they already fit. Do not create a parallel abstraction without documenting why the existing mapping is insufficient.

Clean-room rule remains mandatory: patterns are assimilated, not blindly copied.

## 18. Production-helper is routine

production-helper/ is a normal engineering verification station. It is consulted according to the decision risk and affected surfaces.

At minimum, consider it for:
- worker permissions
- Guardian policy
- remote workers / callbacks
- rendering
- provider routing
- quotas
- authentication / authorization
- network egress
- filesystem boundaries
- production completion semantics
- significant architecture changes

Blocked or unproven helper results remain blocked or unproven. They never become implicit PASS states.

## 19. Decision sweep record

For important architecture decisions, record a compact sweep summary in the related decision record:

~~~text
OKF_SWEEP = COMPLETE | PARTIAL
ROOT_RULES = reviewed
HIERARCHY = reviewed
SECURITY = reviewed
COGNITION = reviewed
MEMORY = reviewed
RESEARCH_MAPPINGS = reviewed
RENDERING = reviewed
ARTIFACTS = reviewed
WORKFLOWS = reviewed
AUDITS = reviewed
PRODUCTION_HELPER = reviewed
IMPLEMENTATION = reviewed
TESTS = reviewed
CONTRADICTIONS = none | listed
~~~

OKF_SWEEP=PARTIAL is not sufficient for architecture promotion except under the explicit incident-containment exception.


## 20. Team Change Gate is mandatory

The Team workforce is the operational executor of the engineering decision protocol.

For every non-trivial repository change:

complete .okf sweep
→ TeamChangeIR
→ Forger routing
→ applicable Security Stack
→ implementation / tests
→ conflict report when needed
→ Team Change Report
→ authorized disposition

A Team workflow cannot replace the complete .okf sweep.

If a change contradicts an absolute .okf rule, the conflict must be preserved and escalated. Forgers must propose a bounded resolution; they cannot silently rewrite the rule.

