---
id: shortforge-knowledge-index
type: reference
title: ShortForge Durable Knowledge Vault
status: stable
stale_after: 2027-09-20T00:00:00Z
sources:
  - id: knowledge-root
    resource: knowledge/
    title: ShortForge Root Knowledge Vault
sf_id: shortforge-knowledge-index
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
epistemic_state: sourced
verification: verified
created_at: 2026-09-20T17:00:00Z
updated_at: 2026-09-20T17:00:00Z
tags:
  - index
  - knowledge
  - factoryos
  - architecture
---

# ShortForge / FactoryOS — Durable Knowledge Vault

> **Specification**: ShortForge OKF Profile v0.1 (OKF v0.2 Baseline)  
> **Authority**: FactoryOS Autonomous Intelligence Layer  
> **Workspace**: Obsidian-compatible plain Markdown files with YAML frontmatter  

---

## 1. Vault Purpose

This vault preserves durable, human- and agent-readable engineering knowledge for ShortForge:
- **Decisions**: Architectural decisions, provider trade-offs, rationale, and consequences.
- **Lessons**: Post-mortems, verified failure remedies, and production insights.
- **Systems & Architecture**: High-level designs of Control Plane, Render Fabric, and Pipeline Floors.
- **Research**: Architectural analysis of external frameworks with explicit adoption status.

Live operational state (e.g. running jobs, worker heartbeats, current errors) is explicitly **NOT** stored here; live truth belongs to the `RuntimeStateProvider`.

---

## 2. Knowledge Navigation Map

| Domain | Path | Contents |
| :--- | :--- | :--- |
| **Decisions (ADRs)** | [`decisions/`](decisions/) | Accepted & superseded architectural choices ([ADR-001](decisions/ADR-001-structural-intelligence-knowledge-vault.md), [ADR-002](decisions/ADR-002-render-worker-pool-routing.md)) |
| **Architecture** | [`architecture/`](architecture/) | High-level system topologies and invariant boundaries |
| **Systems** | [`systems/`](systems/) | Deep dives into [Rendering Pipeline](systems/rendering-pipeline.md), Control Plane, and Pipelines |
| **Agents** | [`agents/`](agents/) | Overseer, Guardians, Slayers, Healers, and Swarms |
| **Memory** | [`memory/`](memory/) | Memory tiers, lifecycle policies, and Controlled MemoryWriter contracts |
| **Research Registry** | [`research/`](research/) | Evaluated external repositories ([Research Registry](research/research-registry.md)) |
| **Lessons & Failures** | [`lessons/`](lessons/) | Verified lessons ([Render Timeout](lessons/lesson-render-worker-timeout.md), [Secret Hygiene](lessons/lesson-secret-redaction-hygiene.md)) |
| **Incidents** | [`incidents/`](incidents/) | Production incidents, post-mortems, and root cause analysis |
| **Experiments** | [`experiments/`](experiments/) | Benchmark runs, model quality scores, and latency tests |
| **Providers** | [`providers/`](providers/) | Capabilities, cost profiles, and fallback safety matrices |
| **Rendering** | [`rendering/`](rendering/) | FFmpeg configurations, Pillow pipelines, and queue policies |
| **Deployment** | [`deployment/`](deployment/) | Systemd services, Cloudflare edge, and CI workflows |
| **Entities** | [`entities/`](entities/) | Shared domain entities, schemas, and glossary |

---

## 3. ShortForge OKF Profile v0.1

Every concept document in this vault adheres to:
```yaml
---
type: Concept | Decision | Lesson | Architecture | Reference
title: Human Readable Title
status: draft | stable | deprecated
stale_after: YYYY-MM-DDTHH:MM:SSZ
sources:
  - id: source-id
    resource: relative/path/or/uri
id: unique-kebab-id
sf_id: unique-kebab-id
sf_lifecycle: candidate | active | superseded | archived
sf_epistemic_state: observed | sourced | inferred | hypothesized
sf_verification_state: unverified | verified | disputed
created_at: YYYY-MM-DDTHH:MM:SSZ
updated_at: YYYY-MM-DDTHH:MM:SSZ
tags:
  - domain
  - subsystem
sf_provenance:
  source_type: FILE | GIT_COMMIT | RUNTIME_EVENT | USER_DECISION | AGENT_OBSERVATION | EXPERIMENT
  source_id: identifier
  path: relative/path/to/file.ts
  captured_at: YYYY-MM-DDTHH:MM:SSZ
---
```
