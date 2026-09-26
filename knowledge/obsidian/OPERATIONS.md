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


## LIVE RUNTIME MEMORY FABRIC

The Obsidian-compatible vault is now connected to the existing FactoryOS memory boundary through the Live Memory Fabric.

Runtime topology:

    DurableEventBus ───────────────┐
                                   ├──> Memory Fabric Ledger
    MongoDB operational changes ───┘          │
                                              ├──> raw observations
                                              ├──> candidate memories
                                              ├──> gated promotion
                                              └──> bounded agent / Ascalon projection

### MongoDB role

MongoDB remains operational truth for cases, missions, decisions, memories, leases, DAGs, world-state snapshots and reputation records. The new memory_fabric_events and memory_fabric_offsets collections are an ingestion ledger/checkpoint mechanism, not a replacement for those stores.

### Ingestion modes

1. MONGO_CHANGE_STREAM: preferred when the MongoDB deployment supports database change streams.
2. MONGO_RECONCILIATION: bounded periodic reconciliation remains active even with change streams, providing a safety net for missed notifications and restart gaps.
3. EVENT_ONLY: runtime-event integration remains available when MongoDB is not connected.
4. DISABLED: explicit opt-out.

Change-stream failures degrade to reconciliation rather than stopping FactoryOS execution.

### Lifecycle

    OBSERVATION
        ↓
    CANDIDATE
        ↓
    CORRELATED
        ↓
    VERIFIED
        ↓
    PROMOTED
        ↓
    ACTIVE
        ↓
    SUPERSEDED
        ↓
    ARCHIVED

Runtime observations are never automatically treated as verified facts. Promotion requires explicit verification/evidence metadata and still passes through the existing MemoryWriter policy boundary.

### Vault layout

    knowledge/obsidian/raw/runtime/
    knowledge/obsidian/candidates/
    knowledge/obsidian/generated/ascalon/

Raw runtime observations are sanitized and hash-addressed. Candidate memories link back to their raw observations. Generated Ascalon projection is a bounded read model and is never runtime authority.

### Configuration

Development/local:

    MEMORY_FABRIC_ENABLED=true
    MEMORY_FABRIC_VAULT_PATH=<repo>/knowledge
    MEMORY_FABRIC_RECONCILIATION_MS=60000

Production is fail-closed unless an explicit vault path is configured. Set MEMORY_FABRIC_ENABLED=false to disable the bridge.

### Agent access

Use the bounded projection service rather than reading arbitrary vault files:

    npm run obsidian:project-agent -- "renderer lease recovery"
    npm run obsidian:project-ascalon

The Ascalon projection requires verified active memories and training_eligible: true. Verification does not automatically grant training eligibility.

### Failure handling

Memory Fabric errors are recorded in the ledger and quarantined. Event subscribers do not get authority to alter runtime state. The controller execution loop remains independent from filesystem synchronization and Obsidian availability.

### Reconciliation rule

The bridge uses deterministic content hashes and unique source keys. Re-processing an unchanged Mongo document is idempotent and does not create another memory document.

## HISTORICAL BACKFILL

Live change streams and periodic reconciliation cover new and changed operational records. A one-time historical import is explicit so a large repository startup does not unexpectedly scan the complete database.

    MEMORY_FABRIC_VAULT_PATH=<repo>/knowledge
    MEMORY_FABRIC_BACKFILL_LIMIT=5000
    npm run obsidian:backfill-memory

The backfill is idempotent through deterministic source keys and the MongoDB ledger. It materializes sanitized observations and high-signal candidate memories, but does not grant verification or training eligibility.


## DISTRIBUTED WRITES AND CONTRADICTIONS

When MongoDB is available, the Memory Fabric uses a short-lived writer lease so concurrent FactoryOS instances do not mutate the same knowledge vault simultaneously.

Conflict groups are conservative: more than one active memory in the same group is marked CONTRADICTORY and excluded from projection. A verified promotion with the same conflict group may supersede prior active memory through the existing supersession path.

## OBSIDIAN AS A LIVE CLIENT

Agent projections reload the Markdown vault before reading. This means changes made through Obsidian are visible without restarting FactoryOS, while projection eligibility still requires the normal verification, lifecycle, quality and provenance rules.
