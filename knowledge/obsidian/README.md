---
id: shortforge-obsidian-integration
type: Architecture
title: ShortForge Obsidian Memory Fabric
status: stable
sf_id: shortforge-obsidian-integration
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
created_at: 2026-09-26T00:00:00Z
updated_at: 2026-09-26T00:00:00Z
tags:
  - obsidian
  - memory
  - architecture
  - ascalon
---

# ShortForge Obsidian Memory Fabric

## Purpose

Use Obsidian as the human/agent knowledge IDE for ShortForge while keeping governance, runtime, and verification boundaries outside the vault.

## Capability map

| Obsidian capability | ShortForge use |
|---|---|
| Markdown vault | Durable, portable engineering knowledge |
| Properties | Typed epistemic, lifecycle, provenance and verification metadata |
| Wikilinks/backlinks | Connect floors, agents, contracts, decisions and evidence |
| Graph view | Explore architecture and dependency relationships |
| Bases | Dashboards for decisions, evidence, conflicts, research and training |
| Canvas | Visual architecture and memory-flow reasoning |
| Templates | Deterministic creation of memory records |
| Search / Quick Switcher | Fast bounded retrieval |
| Core plugins | Backlinks, Canvas, Graph, Properties, Search, Templates, Workspaces, Sync |
| Web Clipper | Capture research sources into raw memory |
| Web Clipper Interpreter | Optional source summarization/extraction before compilation |
| CLI | Scriptable search/read/create/diff operations |
| Headless Sync | Server/agent synchronization for CI and automation |
| Git | Reviewable history and rollback of knowledge |
| Publish | Optional publication of a deliberately exported public subset |
| Community plugins | Optional, audited extensions only; never required for correctness |

## Authority boundary

~~~text
.okf
 ↓
canonical contracts
 ↓
implemented runtime
 ↓
measured evidence
 ↓
Team Change Gate
 ↓
Obsidian derived knowledge
 ↓
Ascalon context projection
~~~

Obsidian notes may summarize authoritative evidence, but they do not upgrade an unverified claim into truth.

## Memory layers

1. raw/ — source material; agents treat this as immutable.
2. knowledge/ — compiled, linked domain knowledge.
3. decisions/ — architecture and governance decisions.
4. evidence/ — verification receipts and source references.
5. conflicts/ — explicit contradictions and resolutions.
6. training/ — training candidates that passed eligibility checks.
7. obsidian/ — vault instructions, templates, dashboards and integrations.

## Operations

- INGEST source material.
- COMPILE verified concepts and relations.
- QUERY retrieve bounded context.
- PROJECT create compact Ascalon/agent context.
- LINT detect stale, contradictory, orphaned or evidence-poor knowledge.

See [[MEMORY_SCHEMA]], [[OPERATIONS]], and [[SECURITY]].

## ShortForge Knowledge Graph

Use `ShortForge Knowledge Graph` as the relation-navigation surface over the vault. It visualizes Obsidian links plus ShortForge semantic relation properties without becoming a memory-authority or mutation surface.
