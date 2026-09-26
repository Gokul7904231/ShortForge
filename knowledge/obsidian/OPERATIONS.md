---
id: shortforge-obsidian-operations
type: Reference
title: ShortForge Memory Operations
status: stable
sf_id: shortforge-obsidian-operations
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
created_at: 2026-09-26T00:00:00Z
updated_at: 2026-09-26T00:00:00Z
tags:
  - obsidian
  - operations
  - agents
---

# ShortForge Memory Operations

## INGEST

Capture a source without rewriting the source.

Examples:
- GitHub PR / commit / issue
- research paper
- external repository
- CI result
- incident
- architecture discussion

Target folders:

~~~text
raw/github/
raw/research/
raw/ci/
raw/incidents/
raw/external-repos/
~~~

## COMPILE

The compiler extracts:
- entities
- claims
- relationships
- decisions
- evidence references
- contradictions
- supersession relationships

Compilation writes only to derived knowledge folders.

## QUERY

Use the narrowest useful context:
- exact IDs and links first;
- lexical search next;
- property/Bases filtering next;
- graph relationships for multi-hop questions;
- bounded evidence capsules before LLM invocation.

## PROJECT

For Ascalon or another agent:

~~~text
candidate memory
 → authority filter
 → verification filter
 → freshness filter
 → contradiction filter
 → token bound
 → context capsule
~~~

Never project raw unverified material as authoritative evidence.

## LINT

Lint for:
- missing required metadata
- duplicate IDs
- broken internal links
- secrets / credential patterns
- stale claims
- contradictory active memories
- orphaned important notes
- training-eligible records without verification
- superseded decisions still presented as current

## Daily maintenance

Use Obsidian Daily Notes only for transient operator notes. Promote durable knowledge through the typed memory workflow rather than treating daily notes as permanent truth.

## Release discipline

Knowledge changes are versioned through Git. Non-trivial architectural memory changes follow the Team Change Gate.
