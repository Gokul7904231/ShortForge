# ShortForge / FactoryOS — Obsidian Memory Fabric

Status: IMPLEMENTED AS REPOSITORY-SIDE KNOWLEDGE INTEGRATION
Date: 2026-09-26

## Decision

ShortForge adopts Obsidian as the knowledge IDE and cognitive memory interface for the existing durable knowledge/ vault.

It does not become:
- the FactoryOS runtime database;
- an authority plane;
- a replacement for .okf;
- a replacement for CI evidence;
- a replacement for KnowledgeOS or runtime memory stores.

## Why this fit is strong

The repository already exposes an Obsidian-compatible durable knowledge vault with YAML frontmatter and explicit provenance. Existing KnowledgeOS also separates Source, Claim, Evidence, Topic, Channel and Performance domains and requires verification before promotion.

The new integration adds a first-class Obsidian operating model:
- typed properties;
- wikilink-oriented relationships;
- Bases dashboards;
- Canvas architecture surface;
- Templates;
- Web Clipper capture templates;
- CLI/headless runbooks;
- repository-side memory linting;
- bounded memory projection tooling.

## Capability coverage

| Capability | State | Boundary |
|---|---|---|
| Markdown vault | Implemented | knowledge/ |
| YAML Properties | Implemented | Memory schema |
| Wikilinks / backlinks | Implemented by conventions | Knowledge notes |
| Graph | Enabled by linked note design | Human exploration |
| Bases | Implemented | knowledge/obsidian/dashboards/*.base |
| Canvas | Implemented | knowledge/obsidian/canvases/ |
| Templates | Implemented | knowledge/obsidian/templates/ |
| Web Clipper | Implemented | knowledge/obsidian/clipper/ |
| CLI | Documented | developer workstation |
| Headless Sync | Documented | controlled automation host |
| Git | Required | repository history |
| Community plugins | Governed, optional | audit before enablement |
| Publish | Optional export boundary | never raw/private by default |

## Memory lifecycle

~~~text
SOURCE
 ↓
INGEST
 ↓
VERIFY / PROVENANCE
 ↓
COMPILE
 ↓
LINK
 ↓
QUERY
 ↓
PROJECT
 ↓
LINT
~~~

## Ascalon boundary

Only a bounded projection containing appropriate authority, verification and provenance metadata should be supplied to Ascalon.

The projection must preserve:
- original claim;
- source/evidence references;
- epistemic status;
- verification status;
- lifecycle/supersession state;
- contradiction state.

The Obsidian vault itself is not a training authority.

## Rollback

Remove knowledge/obsidian/, knowledge/README.md, knowledge/.obsidian/snippets/shortforge-memory.css, tools/obsidian/, and this document plus the corresponding .okf decision entry. Existing knowledge/ and runtime memory systems remain valid.


## Live MongoDB + Runtime Integration — 2026-09-26

The Memory Fabric is now operationally connected to the existing FactoryOS runtime boundary.

### Canonical path

    FactoryOS runtime events
             │
             ├── DurableEventBus
             │
             └── MongoDB operational collections
                        │
                        ▼
              MemoryFabricBridge
                        │
                        ▼
              MemoryFabricLedger
                        │
                ┌───────┴────────┐
                ▼                ▼
          raw observations   candidates
                │                │
                └───────┬────────┘
                        ▼
                 MemoryWriter gate
                        │
                        ▼
                 active knowledge
                   /          \
             Obsidian       projection services
                               │
                         Ascalon bounded view

### Authority

- MongoDB operational collections remain runtime persistence.
- Memory Fabric ledger is ingestion/checkpoint state only.
- knowledge/ remains the derived cognitive memory surface.
- .okf remains governance truth.
- MemoryWriter remains the durable promotion gate.
- Ascalon receives bounded verified projections and cannot modify runtime authority.

### Temporal and contradiction handling

Every live memory record can carry:
- occurrence time and valid-from time;
- validity/staleness metadata;
- deterministic quality state and score;
- provenance and source hash;
- conflict-group identity;
- supersession relationships.

When a verified memory is promoted with a conflict group, prior active memories in that group are marked superseded instead of silently overwritten.

### Automatic maintenance

The controller starts and stops the bridge with FactoryOS lifecycle. The autonomous cycle also performs a non-blocking memory drain. MongoDB change streams are the low-latency path where available; bounded reconciliation remains active as a correctness backstop.

### Security and evidence

The bridge recursively redacts credential-like fields and re-applies MemoryWriter secret sanitization before materializing Markdown. Raw runtime data is never marked verified. Training eligibility remains a separate explicit field.

### Operational outcome

This changes the prior architecture from a mostly repository-side Obsidian knowledge surface into a live Memory Fabric client boundary:

    operational evidence
        → ingest
        → compile
        → verify
        → promote
        → project
        → bounded agent / Ascalon context

Obsidian is still not the runtime database, not the control plane, and not the authority source.
