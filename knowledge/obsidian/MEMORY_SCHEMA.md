---
id: shortforge-obsidian-memory-schema
type: Reference
title: ShortForge Memory Schema
status: stable
sf_id: shortforge-obsidian-memory-schema
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
created_at: 2026-09-26T00:00:00Z
updated_at: 2026-09-26T00:00:00Z
tags:
  - obsidian
  - schema
  - memory
---

# ShortForge Memory Schema

Every durable memory note should use YAML frontmatter.

## Required properties

~~~yaml
---
id: unique-kebab-id
type: Claim | Decision | Evidence | Research | Incident | Experiment | Architecture | Reference
title: Human readable title
status: draft | stable | deprecated
sf_lifecycle: candidate | active | superseded | archived
sf_epistemic_state: observed | sourced | inferred | hypothesized
sf_verification_state: unverified | verified | disputed
created_at: 2026-09-26T00:00:00Z
updated_at: 2026-09-26T00:00:00Z
---
~~~

## ShortForge extensions

Use these when applicable:

~~~yaml
authority: okf | repository | runtime | ci | human | agent
training_eligible: false
supersedes: "[[memory-id]]"
superseded_by: "[[memory-id]]"
source_refs:
  - https://github.com/...
evidence_refs:
  - "[[evidence-id]]"
domain: F03 | F05 | F06 | ...
confidence_class: verified | provisional | exploratory
stale_after: 2027-09-26T00:00:00Z
~~~

## Epistemic rules

- hypothesized never means verified.
- disputed cannot be training-eligible.
- training_eligible: true requires sf_verification_state: verified and at least one evidence/source reference.
- A superseded decision remains preserved for historical reasoning.
- Raw source notes are never silently overwritten by compilation.

## Source precedence

1. .okf / canonical law
2. repository implementation and contracts
3. measured CI/runtime evidence
4. accepted Team decisions
5. compiled Obsidian synthesis
6. hypotheses / exploratory research

A lower layer may summarize a higher layer, never redefine it.

## Semantic relation metadata

Durable knowledge notes may declare explicit graph relations without changing the authority model:

~~~yaml
sf_relations:
  - relation: feeds
    target: "[[F03 AssetPlanIR]]"
  - relation: verified_by
    target: "[[F03 Verification Receipt]]"
~~~

Supported relation names are extensible. The graph treats relation names as semantic labels and does not infer authority from them. Normal Obsidian wikilinks remain valid and are displayed as `links_to` when no explicit semantic relation exists.
