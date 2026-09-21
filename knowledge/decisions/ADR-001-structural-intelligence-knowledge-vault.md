---
id: ADR-001-structural-intelligence-knowledge-vault
type: decision
title: Structural Intelligence & Durable Knowledge Architecture
status: stable
stale_after: 2027-09-20T00:00:00Z
sources:
  - id: repo-root
    resource: apps/web/factoryos/core/intelligence/
    title: FactoryOS Intelligence Core
sf_id: ADR-001-structural-intelligence-knowledge-vault
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
epistemic_state: sourced
verification: verified
created_at: 2026-09-20T17:15:00Z
updated_at: 2026-09-20T17:15:00Z
tags:
  - architecture
  - graphify
  - okf
  - memory
  - factoryos
sf_provenance:
  source_type: USER_DECISION
  source_id: arch-rev-2026-09-20
  captured_at: 2026-09-20T17:15:00Z
provenance:
  source_type: USER_DECISION
  source_id: arch-rev-2026-09-20
  captured_at: 2026-09-20T17:15:00Z
---

# ADR-001: Structural Intelligence & Durable Knowledge Architecture

## Context
ShortForge is an enterprise AI short-form video factory consisting of 1,572 code files across Next.js Control Plane, Python FastAPI workers, and pipeline stages. Agents previously lacked bounded context, structured code knowledge, and durable memory of past architectural decisions and post-mortem lessons. Naive LLM prompt flooding (loading 50 files into context) creates latency, token waste, and hallucinations.

## Decision
We implement a decoupled 4-pillar intelligence layer:
1. **Structural Intelligence (Graphify)**: Deterministic tree-sitter AST parsing extracts codebase structure into `graph.json` with tagged `EXTRACTED` vs `INFERRED` edges. Managed via `GraphifyStructuralAdapter`.
2. **Durable Knowledge (Obsidian / OKF)**: Human- and agent-readable Markdown vault under `knowledge/` adhering to ShortForge OKF Profile v0.1.
3. **Evidence Retrieval Planner**: Deterministically routes queries across AST Graph, OKF Vault, Git/History, and Live State without an unnecessary vector DB in v1.
4. **Context Compiler**: Deterministically aggregates, ranks, deduplicates, bounds, and redacts evidence into a compact `ContextCapsule` adhering to strict token budgets.
5. **Controlled MemoryWriter**: Rejects unvalidated agent self-writes and requires verification before promoting candidate observations into permanent vault documents.

## Consequences
### Positive
- Code relationships and dependencies are answered deterministically in sub-millisecond AST queries.
- Knowledge persists in plain Git-tracked Markdown files independent of runtime databases or LLM providers.
- Context is strictly bounded, protecting against prompt bloat and credential leaks.

### Trade-offs
- Static AST graphs require regeneration when code changes significantly (`factory graph refresh`).
- Plain Markdown knowledge requires frontmatter validation to prevent metadata drift.
