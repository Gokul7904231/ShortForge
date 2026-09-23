# ShortForge / FactoryOS — Autonomous Content Manufacturing Operating System
## Official System Specification & Operational Guide (.okf)

> **Specification Version**: 2.4.0-HARDENED  
> **Status**: OPERATIONAL / PRODUCTION-READY  
> **Target Runtime**: Node.js 20+ (Next.js 14 Web / Hybrid Control Plane) & FastAPI/Python 3.11 VPS Worker Nodes  
> **Repository Authority**: `apps/web/factoryos` (Autonomous Factory Engine)  

---

## 1. System Mission & Philosophy

FactoryOS is an autonomous, mission-driven operating system designed for deterministic short-form video synthesis. Rather than treating video generation as an ad-hoc pipeline of disconnected API calls, FactoryOS models content creation as a 7-floor industrial manufacturing plant overseen by a hierarchical supervisory control plane.

### Core Pillars
1. **Single Autonomous Authority**: Generation execution is governed through the FactoryOS Control Plane (`AutonomousFactoryController` + `OverseerControlPlane`). Ad-hoc rendering and unauthenticated side-effects are strictly forbidden.
2. **Fail-Closed Security & Trust**: Zero mock authorization in production; all worker callbacks are authenticated using high-entropy cryptographic HMAC/execution tokens with constant-time equality validation.
3. **Hierarchical Command Structure**:
   - **Overseer**: Supreme orchestrator managing multi-mission DAG generation and global factory throughput.
   - **Guardians**: Floor-level command authorities enforcing domain policy gates before and after execution.
   - **Independent Factory Workers**: Single-instance factory-wide investigators and remediators (`Slayer`, `Healer`, `ReMaker`, `Comms`, `Treasurer`).
   - **Floor Swarms**: Specialized bounded workers executing concrete stage-specific tasks.
4. **Resilient Render Fabric**: Decoupled rendering architecture seamlessly routing between high-throughput Azure GPU VM workers and deterministic local compositors with zero user-visible starvation.
5. **Continuous Verification & Audit**: Real-time memory logging, decision ledger tracing, and Floor 07 verification auditing every artifact before delivery.

---

## 2. Document Map

The `.okf/` documentation suite serves as the single architectural source of truth for the entire system:

| Section | Path | Purpose |
| :--- | :--- | :--- |
| **Architecture** | [`.okf/architecture.md`](./architecture.md) | Subsystem topology, dataflows, world state, event bus, storage engine |
| **Principles** | [`.okf/principles.md`](./principles.md) | Invariants, fail-closed safety, lease recovery, concurrency rules |
| **Terminology** | [`.okf/terminology.md`](./terminology.md) | Authoritative lexicon of roles, floors, primitives, and artifacts |
| **Hierarchy** | [`.okf/hierarchy/`](./hierarchy/) | Specification for Overseer, Slayer, Healer, ReMaker, Guardians, Auditors, and Workers |
| **Floors 01–07** | [`.okf/floors/`](./floors/) | Complete 7-floor manufacturing specifications from Strategy to Verification |
| **Rendering** | [`.okf/rendering/`](./rendering/) | Render Fabric, compilers, compute policy, and worker protocols |
| **Intelligence** | [`.okf/intelligence/`](./intelligence/) | Model routing, dynamic AI provider discovery, evaluation, and context management |
| **Research** | [`.okf/research/`](./research/) | Reach engine, trend intelligence, and source provenance tracking |
| **Memory** | [`.okf/memory/`](./memory/) | MemoryOS, cognitive indexing, and vector recall topology |
| **Artifacts** | [`.okf/artifacts/`](./artifacts/) | Manifest models, media lineage, and cryptographic checksum tracking |
| **Security** | [`.okf/security/`](./security/) | RBAC, capability security, lease protection, and zero-trust perimeter |
| **Workflows** | [`.okf/workflows/`](./workflows/) | Step-by-step lifecycle specifications for generation, recovery, and publishing |

---

## 3. Quickstart & Verification

```bash
# 1. Verify TypeScript compilation across web and FactoryOS kernels
npm run typecheck
npm run factoryos:typecheck

# 2. Run the complete FactoryOS test suite
npm run test:factoryos:audit

# 3. Boot FactoryOS Autonomous Controller in dev mode
npm run factoryos:dev
```
