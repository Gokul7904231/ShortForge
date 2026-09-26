---
id: shortforge-obsidian-vault-readme
type: Reference
title: ShortForge Obsidian Memory Vault
status: stable
sf_id: shortforge-obsidian-vault-readme
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
created_at: 2026-09-26T00:00:00Z
updated_at: 2026-09-26T00:00:00Z
tags:
  - obsidian
  - memory
  - factoryos
---

# ShortForge Obsidian Memory Vault

This directory is the Obsidian vault boundary for durable engineering knowledge.

It complements, but never replaces:

- .okf/ — governance and authority.
- runtime contracts and code — executable truth.
- CI / verification evidence — measured truth.
- Team/ — development-time workflow and change governance.
- Ascalon — bounded cognition over verified projections.

Open this knowledge/ directory as an Obsidian vault.

## Core model

~~~text
RAW SOURCES
    ↓
INGEST
    ↓
COMPILE
    ↓
LINKED KNOWLEDGE
    ↓
QUERY / PROJECT
    ↓
LINT
~~~

The vault is plain Markdown + YAML frontmatter so it remains usable from Git, editors, scripts, CI and agents even when Obsidian is not running.

## Start here

- [[index]] — existing durable knowledge map.
- [[obsidian/README]] — integration architecture and capability matrix.
- [[obsidian/MEMORY_SCHEMA]] — memory contract.
- [[obsidian/OPERATIONS]] — agent workflow.
- [[obsidian/SECURITY]] — write and trust boundary.
- [[obsidian/SETUP]] — local Obsidian setup.
- [[obsidian/MEMORY_LOG]] — append-only memory operations.

## Non-negotiable rule

Obsidian stores and exposes cognition; it does not become a runtime authority plane.
