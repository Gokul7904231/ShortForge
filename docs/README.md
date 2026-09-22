# ShortForge Documentation Authority

Welcome to the canonical documentation tree for **ShortForge** and its operating kernel, **FactoryOS**.  
This index serves as the single source of truth for architecture specifications, verification matrices, deployment guides, and design decisions.

Operating Standard: **CLAIM <= EVIDENCE** | Zero tolerance for undocumented or simulated claims.

---

## Documentation Taxonomy

```text
docs/
├── architecture/      # Authoritative system topology and runtime specifications
├── factoryos/         # FactoryOS control plane, agent contracts, and event models
├── compute/           # Heterogeneous rendering fabric (Kaggle, RunPod, Vast, Local)
├── intelligence/      # Decision Fabric, Token Economy, Context Compiler, BYOLM
├── security/          # Threat models, RBAC gates, capability security, and audit workflows
├── deployment/        # Multi-cloud deployment, authentication migration, and local setups
├── development/       # Engineering workflows, code conventions, and testing guides
├── verification/      # Requirement traceability, F07 release proofs, and test reports
├── decisions/         # Architectural Decision Records (ADRs)
└── archive/           # Historical milestones, superseded drafts, and legacy reports
```

---

## 1. Architecture

Canonical system designs and runtime inventories:

* **[Current Factual Architecture](architecture/current.md)** — Physical ground-truth architecture, audited against active code and test suites.
* **[System Overview & Topology](architecture/system-overview.md)** — End-to-end topology diagram, data plane flow, and component responsibilities.
* **[Authentication Architecture](architecture/authentication.md)** — Session verification, JWT handling, and server-authoritative RBAC.
* **[Architecture Index](architecture/README.md)** — Architectural sub-components and guidelines.

---

## 2. FactoryOS Kernel

Control plane contracts, agent models, and orchestration primitives:

* **[Agent Contracts](factoryos/agent-contracts.md)** — Typed interfaces for factory agents and overseers.
* **[Agent Model](factoryos/agent-model.md)** — Autonomous operational agent patterns and lifecycle states.
* **[Event Contracts](factoryos/event-contracts.md)** — Event bus schemas and state-change notifications.
* **[Floor Contracts](factoryos/floor-contracts.md)** — Input/output schemas for production floors F01 through F06.
* **[FactoryOS Hierarchy](factoryos/hierarchy.md)** — Sovereign supervisory hierarchy (Overseer, Slayer, Healer, Worker).
* **[Overseer Command Surface](factoryos/overseer-command-surface.md)** — Dynamic operator interface and presence engine.
* **[Overseer Productization](factoryos/overseer-productization.md)** — Control plane productization specifications.

---

## 3. Distributed Compute Fabric

Heterogeneous rendering orchestration across cloud and bare-metal environments:

* **[Basic Cloud Rendering](compute/basic-cloud-rendering.md)** — Cloud VM rendering architecture and worker dispatch.
* **Provider Matrix**:
  * **Kaggle Compute Adapter**: NVIDIA T4 GPU autonomous worker daemon (`kaggle_worker_bootstrap.py`).
  * **RunPod Compute Adapter**: RTX 4090 serverless/pod rendering execution.
  * **Vast.ai Compute Adapter**: RTX 3090 cost-efficient rendering instances.
  * **Local FFmpeg Worker**: Zero-cost development and testing execution pipeline.
* **[Provider Qualification Matrix](/apps/web/factoryos/core/fabric/contracts/ProviderQualificationMatrix.ts)** — 8-level automated qualification gate (Levels 1–8).

---

## 4. Intelligence & Economy

Token economy, context optimization, and typed decision intelligence:

* **[BYOLM (Bring Your Own Language Model)](intelligence/byolm.md)** — Model routing, local inference, and provider abstraction.
* **Ponytail Token Economy**: `CallGate`, `RetryClassifier` (10 taxonomical types), and `TokenEconomyLedger`.
* **Context Economy v2**: Bounded token capsules, deterministic key sorting, fingerprinting, and 11-class secret redaction.
* **Typed Decision Fabric**: `Noul`, `Choice`, and `Score` primitives with distinct epistemic confidence vs. outcome probability.

---

## 5. Security & Threat Modeling

Cryptographic capability boundaries and compliance enforcement:

* **[Security Threat Model](security/threat-model.md)** — STRIDE threat analysis, trust boundaries, and mitigation controls.
* **[Strix Security Workflow](security/strix-security-workflow.md)** — Automated static and dynamic vulnerability analysis.
* **Cryptographic Release Boundary**: Ed25519 asymmetric signatures and Content-Addressed Storage (CAS) SHA-256 verification.

---

## 6. Deployment & Operations

Infrastructure automation, authentication setup, and runtime configuration:

* **[Authentication Migration](deployment/auth-migration.md)** — Migrating to Better-Auth and multi-role session tokens.
* **[Local AI Setup](deployment/local-ai-setup.md)** — Running local TTS, LLM inference, and FFmpeg workers.
* **[Deployment Overview](deployment/README.md)** — Production deployment targets, Docker images, and systemd services.

---

## 7. Verification & Release Integrity

Comprehensive audit evidence, requirement traceability, and release gating:

* **[Requirement Traceability Matrix](verification/requirements/traceability-matrix.md)** — End-to-end mapping from business requirements to code and tests.
* **[Release Readiness Report](verification/reports/release-readiness.md)** — Pre-flight audit for autonomous production readiness.
* **[Forensic Side-Effect Paths](verification/reports/forensic-side-effect-paths.md)** — Audit of all filesystem, network, and database mutations.
* **[Final Verification Report](verification/reports/final-verification-report.md)** — Formal system verification and gate sign-offs.
* **[Frontier Verification](verification/reports/frontier-v2-verification.md)** — Cognitive autonomous verification benchmarks.
* **[F07 YouTube Monetization Guardian](verification/f07/)**:
  * [Verification Matrix](verification/f07/F07_VERIFICATION_MATRIX.md)
  * [Policy Source Audit](verification/f07/POLICY_SOURCE_AND_SNAPSHOT_AUDIT.md)
  * [Publication Authorization Audit](verification/f07/PUBLICATION_AUTHORIZATION_AUDIT.md)
  * [Remediation Lineage Audit](verification/f07/REMEDIATION_LINEAGE_AUDIT.md)
  * [Test Evidence Report](verification/f07/TEST_EVIDENCE_REPORT.md)

---

## 8. Historical Archive

Preserved milestone reports, progress logs, and early architecture drafts:

* **Superseded Drafts**:
  * [Architecture Canonical Draft](archive/superseded/architecture-canonical-draft.md)
  * [Architecture Current Inventory](archive/superseded/architecture-current-inventory.md)
* **Historical Specifications**:
  * [Architecture Target Specification](archive/historical/architecture-target-specification.md)
* **Progress & Audit Reports**:
  * [ShortForge Reentry Audit](archive/reports/shortforge-reentry-audit.md)
  * [Frontier v2 Progress](archive/reports/frontier-v2-progress.md)
  * [Frontier v2 Execution Progress](archive/reports/frontier-v2-execution-progress.md)
  * [Implementation Progress](archive/reports/implementation-progress.md)
  * [Overseer Productization Audit](archive/reports/overseer-productization-audit.md)
