# ShortForge / FactoryOS — Architectural Knowledge System (.okf)

> **Document Class**: Root Index & Architecture Handbook  
> **Status**: AUTHORITATIVE & IMPLEMENTATION-GROUNDED  
> **Repository**: [ShortForge](https://github.com/Gokul7904231/ShortForge)  
> **Canonical Pipeline**: F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07  

---

## 1. Executive Mission & System Identity

**ShortForge / FactoryOS** is an autonomous media manufacturing operating system engineered to transform raw schedule directives into verified, broadcast-grade short-form video assets. It replaces ad-hoc generative scripting with an industrial production plant governed by formal state machines, cryptographic provenance, capability-fenced worker leases, and forensic output verification.

```
                            USER / SCHEDULE DIRECTIVE
                                       │
                                       ▼
                              SCHEDULE INSTANCE
                                       │
                                       ▼
                                    MISSION
                                       │
                                       ▼
                       OVERSEER SUPREME CONTROL PLANE (L1)
                                       │
               ┌───────────────────────┼───────────────────────┐
               ▼                       ▼                       ▼
      GUARDIAN (L2 Gate)       SLAYER (Lease Reclaim)   HEALER (Circuit Doctor)
               │
               ▼
      AGENT RUNTIME HARNESS (Sessions, Budgets, Checkpointing, Tracing)
               │
               ▼
 ┌───────────────────────────────────────────────────────────────────────────┐
 │               CANONICAL EIGHT-FLOOR PRODUCTION PIPELINE                   │
 │                                                                           │
 │  F00: Analyst & Research Ingestion (Schedule-driven candidate slate)      │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F01: Strategic Direction & Narrative Blueprint Formulation               │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F02: Cognitive Scripting & Retention Architecture                        │
 │   │                                                                       │
 │   ├───────────────────────────────────┐                                   │
 │   ▼                                   ▼                                   │
 │  F03: Visual Asset Realization       F04: Media Synthesis & Provider Execution │
 │   │                                   │                                   │
 │   └───────────────────┬───────────────┘                                   │
 │                       ▼                                                   │
 │  F05: Timeline Composition & Motion (TimelineIR / EDL compilation)        │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F06: Distributed Render Orchestration (Utility compute router)           │
 │   │                                                                       │
 │   ▼                                                                       │
 │  F07: QA Gate & Social Compliance (Forensic verification & structured finding)│
 └───────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
                          FORENSIC VERIFICATION RECEIPT
                                       │
                                       ▼
                               GATEWAY / OUTBOX
```

---

## 2. Source-of-Truth Priority Matrix

To prevent documentation drift and eliminate false claims, all architectural assertions in this system adhere to a strict source-of-truth precedence hierarchy:

```
[1. Executable Implementation] 
         ▼
[2. Canonical Ontologies & Contracts] (hierarchy.json, floors.json, FloorRegistry.ts)
         ▼
[3. Automated Verification Tests] (vitest suites)
         ▼
[4. Provider Registries & Runtime Configurations]
         ▼
[5. Inline Code Architecture Comments]
         ▼
[6. Authoritative .okf Documentation]
         ▼
[7. Historical Audits & Legacy Records]
         ▼
[8. External Reference Patterns]
         ▼
[9. Architectural Inference]
```

> **Invariant**: Never silently convert an architectural inference or target design into an implementation fact. Components not backed by executable code and passing tests must carry an explicit status tag: `IMPLEMENTED`, `PARTIALLY_IMPLEMENTED`, `SCAFFOLDED`, `PLACEHOLDER`, `EXPERIMENTAL`, or `PLANNED`.

---

## 3. Directory Navigation & Reading Taxonomy

| Section | Directory Path | Core Topics & Mandates |
| :--- | :--- | :--- |
| **System Foundations** | [`./architecture.md`](./architecture.md)<br>[`./principles.md`](./principles.md)<br>[`./terminology.md`](./terminology.md) | Decoupled hierarchy, 8-floor topology, core design principles, and unified terminology. |
| **Production Floors** | [`./floors/`](./floors/) | Deep specifications for Floors 00 through 07, inputs, outputs, contracts, and failure modes. |
| **Mandatory Decision Protocol** | [./decision-protocol.md](./decision-protocol.md) | Mandatory end-to-end .okf review gate before architecture, research, model, worker, security, rendering, or workflow decisions. |
| **Worker Permissions** | [./security/worker-permissions.md](./security/worker-permissions.md) | Canonical floor-by-floor capability grants, forbidden capabilities, attenuation, leases, fencing, and worker security rules. |
| **Engineering Stack** | [./engineering-stack.md](./engineering-stack.md) | Locked media stack: TimelineIR + Remotion + AgentTube-derived scene lifecycle + RenderFabric / FFmpeg. |
| **Production Helper** | [./production-helper.md](./production-helper.md) | Routine validation workflow for P0 hardening, static security, runtime convergence, staging, and release evidence. |
| **Devourer Charter** | [./devourer.md](./devourer.md) | Root-level controlled self-improvement charter; detailed cognitive implementation remains in .okf/cognitive/devourer.md. |
| **Absolute Hierarchy Map** | [`./hierarchy-map.md`](./hierarchy-map.md) | Master mapping of authority levels, cognition, regulators, runtime, workers, F00–F07, verification, memory, learning, and boundary rules. |
| **Control Hierarchy** | [`./hierarchy/`](./hierarchy/) | Overseer, Guardian, Slayer, Healer, ReMaker, Auditor, and Worker execution contracts. |
| **Intelligence & Models** | [`./intelligence/`](./intelligence/) | AgentRuntime, Skills, Capability-First Model Routing, Evaluation suite, and Ascalon training. |
| **Overseer Collaboration & Work Fabric** | [`./intelligence/overseer-collaboration-fabric-wave1.md`](./intelligence/overseer-collaboration-fabric-wave1.md)<br>[`./intelligence/overseer-collaboration-fabric-wave2.md`](./intelligence/overseer-collaboration-fabric-wave2.md)<br>[`./intelligence/overseer-collaboration-fabric-wave3.md`](./intelligence/overseer-collaboration-fabric-wave3.md) | Mission Rooms, durable mission work, and workspace-scoped co-manageable agent workforce. |
| **Ascalon Model** | [`./intelligence/ascalon-model.md`](./intelligence/ascalon-model.md) | Project-owned fine-tuned Llama model plan: decision + generation cognition, training pipeline, inference gateway, evaluation, promotion, and Devourer integration. |
| **Ascalon Epistemic Runtime** | [`./intelligence/aer.md`](./intelligence/aer.md) | Target epistemic runtime for state-of-knowledge management, uncertainty decomposition, probe planning, evidence orchestration, cognitive routing, and the bounded EpistemicContext handoff into Ascalon. |
| **Locked Decisions** | [`./decisions.md`](./decisions.md) | Canonical root-level ledger for locked cognitive, performance, authority, worker, and Devourer decisions. |
| **Cognitive Layer** | [`./cognitive/`](./cognitive/) | ShortForge Cognitive Layer, worker cognition contract, Devourer self-improvement program, and cross-layer improvement roadmap. |
| **Memory & Knowledge** | [`./memory/`](./memory/) | MemoryOS, KnowledgeOS, domain-typed stores, and long-term memory promotion. |
| **Workflows & Schedule** | [`./workflows/`](./workflows/) | Schedule lifecycle, mission execution, bounded healing, and gate-verified publishing. |
| **Artifacts & Lineage** | [`./artifacts/`](./artifacts/) | Content-addressed storage, TimelineIR (EDL), Structured Findings, and cryptographic receipts. |
| **Security & Trust** | [`./security/`](./security/) | Untrusted web content boundaries, capability grants, secret scanning, and lease fencing. |
| **Repository Mapping Stack** | [`./research/repo-mappings/`](./research/repo-mappings/) | Prioritized clean-room engineering mappings; media composition, scene lifecycle, F03 planning, asset identity, conditioning, lineage and repair references are recorded here. Remotion remains the primary composition engine and AgentTube remains the selected scene-lifecycle pattern source. |
| **Research & External** | [`./research/`](./research/) | Clean-room mappings for `video-use`, `WeKnora`, `Octop`, `orca`, `VoiceStudio`, and Reach. |
| **F06 Azure Retirement Audit** | [./audits/f06-azure-retirement.md](./audits/f06-azure-retirement.md) | Current pre-merge audit: Azure removed from active architecture; F06 RenderFabric + ComputeRouter is canonical. |
| **Historical Audits** | [`./audits/`](./audits/) | Archived forensic baselines, bypass analyses, and red-team findings (Historical Reference). |


---

## 4. Mandatory Decision Gate

Before any non-trivial ShortForge architecture, engineering, research, model, worker-permission, security, rendering, or workflow decision, the current .okf tree must be reviewed end to end.

Canonical entry point: [./decision-protocol.md](./decision-protocol.md)

The current .okf review is the highest-priority design input. Relevant repository mappings and production-helper evidence must then be incorporated before implementation decisions are finalized.


## 7. Mandatory Governance Entry Points

Use these files as the canonical entry points for future architecture decisions and execution-boundary changes:

| Entry Point | Purpose |
|---|---|
| `.okf/decision-protocol.md` | Mandatory end-to-end `.okf` analysis before non-trivial decisions. |
| `.okf/hierarchy-map.md` | Absolute authority and subsystem relationship map. |
| `.okf/security/worker-permissions.md` | Least-privilege worker capability and scope contract. |
| `.okf/engineering-stack.md` | Locked media engineering stack and renderer-selection rules. |
| `.okf/production-helper.md` | Routine production-helper evidence and validation procedure. |
| `.okf/devourer.md` | Controlled self-improvement governance charter. |

**Decision priority:** complete current `.okf` review first, then inspect relevant implementation, tests, repository mappings, and production-helper evidence.

## 8. Absolute routine

Every future non-trivial decision begins with the complete current .okf end-to-end sweep defined in .okf/decision-protocol.md. Relevant repository mappings and production-helper evidence are mandatory decision inputs, and worker permissions are governed by .okf/security/worker-permissions.md.


## 9. MCP Integration Architecture

MCP integrations are external tool/context surfaces, not a replacement for FactoryOS authority.

Current MCP posture:
- GitHub: existing engineering/development integration.
- Google Drive: repository-owned bounded storage/knowledge integration at tools/mcp/google-drive/.
- Browser / DevTools: planned research/diagnostic integration, subject to the same capability and evidence rules.

Production side effects must continue through canonical internal boundaries such as AgentRuntime, Guardian, CAS, F07, ReleaseAuthorization, RenderFabric, and provider adapters.

The canonical MCP architecture is documented in .okf/intelligence/mcp-architecture.md.

## 10. MCP Security Entry Point

MCP-specific least-privilege rules are documented in .okf/security/mcp-permissions.md.

No F00-F07 worker receives generic MCP access by default.


## 11. Content Engine Configuration & ProductionSpec

| Entry Point | Purpose |
|---|---|
| .okf/content-engine-architecture.md | Canonical architecture for EngineManifest, ConfigurationSchema, ProductionSpec, authority domains, and F00/AgentReach boundaries. |
| apps/web/lib/core/EngineConfigurationContracts.ts | Declarative creator-facing configuration schema, validation helpers, compatibility contracts, and engine contract profiles. |
| apps/web/factoryos/core/contracts/ProductionSpecContracts.ts | Typed immutable mission-level ProductionSpec contract. |
| apps/web/factoryos/core/engines/ProductionSpecCompiler.ts | Server-authoritative configuration compiler, normalization, validation, and SHA-256 spec hashing. |

Invariant: engine UI configuration is creator intent. It does not grant worker capabilities, bypass .okf, override Guardian/Slayer controls, or bypass F07.

## 12. Floor 00 Final Audit

The authoritative pre-F01 audit is .okf/audits/floor00-final-audit.md. It reconciles executable F00 runtime, floor contracts, ResearchPassport provenance, Reach failure semantics, Content Engine research contracts, Ascalon ontology, regression tests, and remaining target-vs-current boundaries.

## 11. Team Engineering Workforce

The canonical operational home for the development-time engineering workforce and security stack is now the top-level `Team/` directory.

- `Team/workflow/change-gate.md` — mandatory change gate.
- `Team/forgers/TEAM.md` — specialist Forger Assembly.
- `Team/security/TEAM.md` — Semgrep / Strix / ZAP / production-helper security stack.
- `Team/contracts/team-change-ir.md` — semantic TeamChangeIR.
- `Team/contracts/team-change-report.schema.json` — machine report contract.
- `Team/llm/` — Ascalon Team protocol and training specification.
- `Team/reports/` — per-change evidence reports.

`.okf/` remains the authority/law layer. `Team/` is the execution/workforce layer.


## Floor 06 pre-training boundary — 2026-09-27

The canonical Floor 06 operating contract is now documented at `services/pipeline/floor06_rendering/README.md`. The F06 research/adoption ledger is `.okf/research/repo-mappings/f06-distributed-rendering-wave1-20260927.md` and the Ascalon admission specification is `docs/verification/ascalon/floor06-pretraining-admission.md`.

F06 may not treat provider completion as physical truth. The pre-F07 completion chain is provider admission → physical SHA/size → ffprobe → FFmpeg decode smoke → F06 handoff.


## Canonical floor identity — 2026-09-27

Current runtime/training identity:
- F03: Visual Asset Realization & Blueprints.
- F04: Media Synthesis & Provider Execution.
- F05: Timeline Composition & Motion.
- F06: Video GPU Rendering Engine.
- F07: QA Gate & Social Compliance.

Historical documents may contain earlier F04 voice-only terminology. Those records are audit history, not current production or Ascalon ontology authority.


## 12. Floor Governance Cell

| Entry Point | Purpose |
|---|---|
| [./floor-governance-cell.md](./floor-governance-cell.md) | Canonical bounded-autonomy architecture for a governed production floor: Guardian authority, Ascalon cognition, Council/Blackboard, BDA, execution, paired healing, fencing, and closure. |
| [./floor-design-template.md](./floor-design-template.md) | Reusable five-question design gate for new or modified floors and their action contracts. |
| [./decisions/floor-governance-cell-final-wave-20260928.md](./decisions/floor-governance-cell-final-wave-20260928.md) | Final-wave decision: durable Council sessions, verified derived memory context, and typed Ascalon inference admission. |
| [./audits/floor-governance-cell-final-wave-audit.md](./audits/floor-governance-cell-final-wave-audit.md) | Final-wave implementation audit and authority-boundary checks. |
| [./decisions/agent-execution-fabric-20260928.md](./decisions/agent-execution-fabric-20260928.md) | Agent Execution Fabric decision: deterministic router, structured state, scoped tools, retry/idempotency recovery. |
| [./intelligence/agent-execution-fabric.md](./intelligence/agent-execution-fabric.md) | Canonical execution-plane mapping for cognition, governance, routing, tools, MCP, A2A and verification. |
| [./intelligence/a2a-boundary.md](./intelligence/a2a-boundary.md) | A2A boundary: remote-agent interoperability without importing external authority, memory or worker capabilities. |
| [./audits/final-integration-closeout-20260928.md](./audits/final-integration-closeout-20260928.md) | Final integration closeout: FGC + AEF + durable HITL merged into main with validation evidence and baseline exceptions. |
| [./decisions/repository-ci-baseline-20260928.md](./decisions/repository-ci-baseline-20260928.md) | Repository CI baseline correction: CLM shadow type contract repaired and strict mainline TypeScript CI restored. |
| [./decisions/floor-governance-cell-wave1-20260928.md](./decisions/floor-governance-cell-wave1-20260928.md) | Wave-1 decision record and implementation boundary. |
| [./audits/floor-governance-cell-wave1-audit.md](./audits/floor-governance-cell-wave1-audit.md) | Documentation/code audit distinguishing implemented foundation from future integration. |
| [./decisions/floor-governance-cell-wave2-20260928.md](./decisions/floor-governance-cell-wave2-20260928.md) | Wave-2 production integration decision: Guardian gate, persistent Blackboard, live Python BDA boundary, and ResolutionGate tightening. |
| [./audits/floor-governance-cell-wave2-audit.md](./audits/floor-governance-cell-wave2-audit.md) | Wave-2 implementation audit and target-vs-current boundary record. |
| [./decisions/floor-governance-cell-wave3-20260928.md](./decisions/floor-governance-cell-wave3-20260928.md) | Wave-3 durable paired-healing decision: parallel reasoning, fenced mutation, BDA reinspection, Auditor verification, Guardian closure. |\n| [./audits/floor-governance-cell-wave3-audit.md](./audits/floor-governance-cell-wave3-audit.md) | Wave-3 implementation and validation audit. |\n| [./decisions/floor-governance-cell-wave4-20260928.md](./decisions/floor-governance-cell-wave4-20260928.md) | Wave-4 cognitive council decision: Instructor/Advisor/Auditor deliberation before governed proposals. |\n| [./audits/floor-governance-cell-wave4-audit.md](./audits/floor-governance-cell-wave4-audit.md) | Wave-4 council implementation and validation audit. |

FGC runtime foundation lives under `apps/web/factoryos/core/governance/`. The FGC does not replace the locked F00–F07 topology or F07 release gate.
