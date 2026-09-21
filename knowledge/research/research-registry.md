---
id: research-registry
type: reference
title: External Architectural Research Registry
status: stable
stale_after: 2027-09-20T00:00:00Z
sources:
  - id: external-repos
    resource: https://github.com
    title: Evaluated Open Source Repositories
sf_id: research-registry
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
epistemic_state: sourced
verification: verified
created_at: 2026-09-20T17:00:00Z
updated_at: 2026-09-20T17:00:00Z
tags:
  - research
  - architecture
  - evaluation
sf_provenance:
  source_type: AGENT_OBSERVATION
  source_id: arch-eval-2026-09
  captured_at: 2026-09-20T17:00:00Z
provenance:
  source_type: AGENT_OBSERVATION
  source_id: arch-eval-2026-09
  captured_at: 2026-09-20T17:00:00Z
---

# External Architectural Research Registry

> **Purpose**: Systematic evaluation of supporting repositories and frameworks.  
> **Rule**: Treat external repositories as architectural research sources. Never blindly copy or introduce unneeded runtime daemon dependencies.

---

## 1. Evaluation Matrix

| Framework | Category | Status | Key Concept Extracted | Why it fits ShortForge | What was Rejected |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **Graphify** | Structural AST Intelligence | `ADOPT` | Deterministic tree-sitter AST extraction into queryable structural graph; separation of `EXTRACTED` vs `INFERRED` provenance. | Provides instant structural understanding of 1,572 code files without LLM token spend or vector DB. | Rejected running Graphify as an always-on background server; used via snapshot adapter. |
| **Obsidian / OKF** | Durable Knowledge Format | `ADOPT` | Portable Markdown files with YAML frontmatter, Git-friendly, human/agent-readable, wikilinks. | Durable repository memory survives database migrations, framework replacements, and offline work. | Rejected making the Obsidian desktop application a required runtime dependency. |
| **Context Mode** | Context Efficiency & Bounding | `ADAPT` | Deterministic preprocessing, SQLite/FTS compact indexing, session context compression. | Prevents model prompt bloat and bounds context capsules before entering LLM. | Rejected deploying Context Mode's external runtime daemon in v1. |
| **WeKnora** | Knowledge Management | `INSPIRE` | Scoped retrieval, revision tracking, multi-tier document organization. | Informs our document lookup hierarchy and revision metadata. | Rejected full multi-service Java/Python enterprise server deployment. |
| **Graphiti** | Temporal Knowledge Graphs | `ADAPT` | Temporal validity windows (`valid_from`, `valid_until`), fact revision, supersession. | Informs our fact evolution and supersession model (`superseded_by`). | Rejected deploying Neo4j / dynamic temporal graph database in v1. |
| **Katra** | Memory Consolidation | `ADAPT` | Consolidation pipeline: raw observations -> deduplicate -> cluster -> candidate lesson -> promotion to durable vault. | Prevents every random run log or debugging trace from becoming permanent memory. | Rejected autonomous unvalidated self-writes to codebase. |
| **Ogham** | Compact Serialization | `INSPIRE` | Lexical-structural indexing and dense representation formats. | Informs token-efficient evidence capsule formatting for model context. | Rejected proprietary binary serialization protocols. |
| **ECC (Everything Claude Code)** | Engineering Lifecycle & Skills | `ADAPT` | Memory persistence policies, structured engineering gates, verification harness. | Aligns with FactoryOS strict validation gates (`Agents reason, deterministic systems measure`). | Rejected raw transcript dumps into memory. |
| **Worktrunk** | Parallel Worktrees | `REJECT / INSPIRE` | Isolated git worktrees for concurrent agent branches. | ShortForge development workflow relies on deterministic modular test suites and CI. | Rejected runtime dependency; preserved as local workflow pattern. |
| **Claude Code Plugin Architecture** | Modular Capabilities | `ADAPT` | Extensible tools, hooks (`PreToolUse`, `BeforeTool`), and skill integration. | Clean integration with FactoryOS domain skills and diagnostic commands. | Rejected platform-specific daemon lock-in. |
| **Addy Agent Skills** | Phased Execution | `ADAPT` | Phased discipline: `SPEC -> PLAN -> BUILD -> TEST -> REVIEW -> SHIP`. | Governs agent operation cycles and memory commit verification gates. | Rejected ad-hoc unconstrained execution loops. |
| **Alibaba OpenCodeReview** | Deterministic Review & Slicing | `ADAPT` | Bounded context slicing, deterministic AST diffing, isolated parallel validation. | Ensures LLMs receive only the minimum necessary evidence package rather than entire repos. | Rejected heavy centralized review server. |

---

## 2. In-Depth Evaluations

### 1. Graphify (v0.9.64)
- **License**: MIT
- **Architecture**: Uses `tree-sitter` for 25+ programming languages to extract AST symbols (classes, functions, calls, imports) into node-link format. Distinguishes `EXTRACTED` (structural AST facts, confidence 1.0) from `INFERRED` (deduced semantic links).
- **ShortForge Implementation**: `GraphifyStructuralAdapter` reads version-pinned `graphify-out/snapshot_manifest.json` and exposes `IStructuralGraphProvider` with BFS pathfinding and neighbor queries.

### 2. Open Knowledge Format (OKF v0.2) + Obsidian
- **License**: Open Specification
- **Architecture**: Plain Markdown files with standardized YAML frontmatter. Human-navigable through standard Markdown links and optional Obsidian wikilinks.
- **ShortForge Implementation**: `ShortForge OKF Profile v0.1` implemented in `knowledge/` with validation for IDs, timestamps, status, and provenance.

### 3. Context Mode & Alibaba OpenCodeReview
- **Architecture**: Compute and filter evidence deterministically using lexical search, AST slicing, and token budget limits before model invocation.
- **ShortForge Implementation**: `ContextCompiler` packs bounded `ContextCapsule` objects under configurable budgets (1000–4000 tokens) with strict secret redaction.
