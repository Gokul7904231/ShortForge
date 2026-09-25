# Intelligence: Model Training Integration & Dataset Governance (Project Ascalon)

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/tests/ascalon-training-readiness.test.ts` & `apps/web/factoryos/core/agent/`

---

## 1. Architectural Philosophy: The Real Worldstate Mandate

Project Ascalon prepares the ShortForge / FactoryOS system for fine-tuning, continuous alignment, and reinforcement learning (SFT, DPO, RLVR) of domain-specialized LLMs and autonomous agents.

A fundamental axiom of Project Ascalon is: **Never train models on unverified synthetic hallucinations, fabricated metrics, or contaminated state.** Training an agent on false telemetry or fabricated performance numbers produces compounding systemic failure, operational blindness, and brittle agent policies.

Every training sample exported by FactoryOS must represent an authentic, ground-truth execution trajectory:
1. **Verifiable Tool Invocation**: Exact skill call inputs, environment state, and real tool outputs.
2. **Deterministic Receipts**: Cryptographic digests of intermediate artifacts and final media renders.
3. **Rigorous Labeling**: Every metric carries an explicit provenance tag (`VERIFIED_FACT`, `OBSERVED_MEASUREMENT`, `MODEL_INFERENCE`, `HEURISTIC_ESTIMATE`, `UNVERIFIED_ASSERTION`).
4. **Structured Evaluation Signal**: Explicit rewards or preference pairs derived from Floor 07 automated verification and real viewer retention data.

```
┌────────────────────────────────────────────────────────┐
│                   Real World Execution                 │
│         (Mission -> AgentRuntime -> Floor DAG)         │
└───────────────────────────┬────────────────────────────┘
                            │ Telemetry & Trace Context
                            ▼
┌────────────────────────────────────────────────────────┐
│               Ascalon Extraction Engine                │
│  ├── Filter: Strip Heuristic & Contaminated Runs       │
│  ├── Validate: Verify Artifact Digests & Receipts      │
│  ├── Format: Multi-Turn Conversation / Action Traces   │
│  └── Pair: Success vs Failed Repairs (DPO / RLVR)      │
└───────────────────────────┬────────────────────────────┘
                            │ Curated Golden Dataset
                            ▼
┌────────────────────────────────────────────────────────┐
│                   Model Training Loop                  │
│       (Supervised Fine-Tuning & Preference Tuning)     │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Contamination Control** | Anomaly remediation complete; hardcoded values removed; fidelity tags mandatory | Automated pre-training pipeline with statistical drift & duplicate detection |
| **Trace Extraction** | `TraceContext` and `AgentCheckpoint` capturing full step sequences | Automatic export pipelines to Parquet/JSONL formats for HuggingFace / Axolotl |
| **Preference Datasets (DPO)** | Pairings between initial failed synthesis and successful Healer repairs | Distributed preference collection across hundreds of synthetic & human review sessions |
| **Holdout Evaluation** | Hermetic test suite with 20 Ascalon verification checks | Scaled holdout benchmark harness evaluating agentic reasoning on unseen topics |
| **Training Pipeline** | Architecture and data contracts certified training-ready | Scheduled LoRA fine-tuning workflows for local model distillation (Llama / Mistral) |

---

## 3. Dataset Integrity Guarantees

Project Ascalon enforces strict data hygiene invariants verified by `ascalon-training-readiness.test.ts`:

1. **Zero Heuristic Impersonation**: Code paths that generate estimates or heuristic curves must never label their output as `OBSERVED_MEASUREMENT`.
2. **Provenance Traceability**: Every research claim ingested during Floor 00 must link to an authenticated `ResearchPassport` containing genuine source metadata, retrieval timestamp, and provider information.
3. **Artifact Digest Verification**: Intermediate outputs must include verifiable content hashes (`sha256`). Mismatched or missing digests disqualify a trajectory from training export.
4. **Separation of Concerns**: Control-plane orchestrators (Overseer, Guardian, Slayer) are evaluated and exported separately from task-specific floor agents.

---

## 4. Training Data Formats

FactoryOS exports trajectories in three primary formats:

### Supervised Fine-Tuning (SFT)
- **Objective**: Teach models the syntax, schemas, and floor protocol conventions of FactoryOS.
- **Payload**: Full session history formatted as system instructions, user mission prompts, structured tool calls, and verified valid responses.

### Direct Preference Optimization (DPO)
- **Objective**: Align agent decision-making towards high-retention, high-fidelity scripts and timelines.
- **Chosen**: Trajectories that pass Floor 07 verification on the first attempt without repair.
- **Rejected**: Trajectories that trigger `HIGH` or `CRITICAL` findings in Floor 07.

### Reinforcement Learning via Verifiable Rewards (RLVR)
- **Objective**: Train agents to self-correct during the Floor 07 / Healer bounded repair loop.
- **Reward Signal**: Deterministic reduction of active findings between iterations $N$ and $N+1$, bounded by max repair budget.

---

## 5. Verification Gate: Project Ascalon Test Suite

The training readiness of the codebase is verified continuously:
- **Test File**: `apps/web/factoryos/tests/ascalon-training-readiness.test.ts`
- **Coverage**: 20 automated checks verifying:
  - Canonical floor registry consistency.
  - Absence of hardcoded research quotas.
  - Proper tagging of `ResearchMeasurementFidelity`.
  - Integrity of `AgentReachAdapter` provider boundaries.
  - Clean separation between sovereign authorities and production workers.


## 6. Team workflow training for Ascalon

Team change trajectories should become a first-class Ascalon training/evaluation source.

Training examples must preserve:
- .okf sweep attestations and source references
- TeamChangeIR
- Forger routing decisions
- security evidence and unavailable-tool semantics
- ConflictRecords
- final Team Change Reports
- accepted/rejected/escalated dispositions

Hard-negative examples must include attempts to hide contradictions, skip the .okf gate, treat external mappings as authority, or turn UNPROVEN security evidence into PASS.

The Team report contract is machine-readable JSON; the underlying semantic contract is TeamChangeIR.

