
# Ascalon — ShortForge Fine-Tuned Llama Cognitive Model

> **Document Class:** Intelligence / Model Architecture  
> **Status:** TARGET / TRAINING PROGRAM  
> **Scope:** Project Ascalon, ShortForge Cognitive Layer (SCL), decision cognition, generation, evaluation, and inference serving.

> **Status rule:** This document defines the intended Ascalon architecture and training program. It is not proof that a production fine-tuned checkpoint already exists. Executable implementation, training artifacts, evaluation reports, and deployment evidence remain authoritative.

---

## 1. Executive Definition

**Ascalon is the project-owned fine-tuned Llama-based model program for ShortForge.**

The objective is to train a domain-specialized model that understands ShortForge / FactoryOS terminology, contracts, workflows, failure modes, production conventions, and evidence rules.

Ascalon is intended to become the primary **deep-cognition substrate** of the ShortForge Cognitive Layer while remaining bounded by the FactoryOS authority and safety hierarchy.

The target model combines two complementary capabilities:

1. **Decision cognition** — JEV/KEV-like useful properties such as typed choices, scoring, classification, uncertainty expression, routing suggestions, and policy-aware decisions.
2. **Generation cognition** — LLM-style planning, reasoning, scripting, structured synthesis, research interpretation, diagnostics, and worker guidance.

These capabilities do not grant Ascalon sovereign authority.

---

## 2. Canonical Architectural Position

~~~
                         HUMAN AUTHORITY
                               |
                               v
                           OVERSEER
                               |
                       mission / policy
                               |
                               v
                 SHORTFORGE COGNITIVE LAYER
                               |
                 +-------------+-------------+
                 |                           |
                 v                           v
          Ascalon Llama                  Fast Decision
          Fine-Tune Core                 / Typed Core
                 |                           |
                 +-------------+-------------+
                               |
                               v
                       Worker cognition
                               |
                               v
                  Guardian authorization gate
                               |
                               v
                    Slayer / Healer controls
                               |
                               v
                         Floor workers
                               |
                               v
                          Verification
                               |
                               v
                          Ascalon data
~~~

Ascalon provides cognition. Deterministic contracts, Guardian authorization, leases/fencing, verification, and physical execution remain outside the model.

---

## 3. Relationship to Existing ShortForge Decisions

The existing locked direction defines the project-owned fine-tuned LLM as the **ShortForge Cognitive Model** and the primary deep-cognition substrate of SCL.

Ascalon is the concrete model program for that role.

The model remains subordinate to:

- Human Authority
- Overseer
- Guardian safety and capability authorization
- Slayer lease/fencing enforcement
- Healer bounded recovery
- Auditor / F07 verification
- worker capability contracts

Ascalon must never silently redefine these boundaries.

---

## 4. Core Capability Model

### 4.1 Decision Mode

The decision side should learn patterns useful for narrow typed decisions:

- NOUL — binary / yes-no decisions
- CHOICE — categorical selection
- SCORE — rubric-based scoring
- provider / compute routing proposals
- confidence and uncertainty representation
- evidence-aware escalation
- worker-plan selection
- failure classification
- repair strategy selection
- policy-aware action proposals

Decision outputs must conform to explicit schemas.

The model must not invent confidence simply to satisfy a schema.

### 4.2 Generation Mode

The generative side should specialize in:

- production planning
- worker instructions
- script generation
- hook and retention reasoning
- scene planning
- timeline reasoning
- research interpretation
- failure diagnosis
- repair proposals
- structured metadata
- prompt construction
- architecture explanations
- operational summaries
- retrospective analysis
- new-work synthesis within the permitted cognitive boundary

### 4.3 Tool / Action Proposal Mode

Ascalon may propose actions or tool calls, but the runtime executes them only after authorization.

~~~
Ascalon proposal
      |
      v
schema validation
      |
      v
capability check
      |
      v
Guardian authorization
      |
      v
lease / fencing validation
      |
      v
runtime execution
      |
      v
verification
~~~

A natural-language instruction from Ascalon is never an authorization grant.

---

## 5. Training Data Strategy

Ascalon must be trained from verified ShortForge operational evidence.

The current Project Ascalon training architecture establishes:

- real-world execution traces
- deterministic receipts
- provenance labels
- contamination controls
- SFT datasets
- DPO preference pairs
- RLVR-style verifiable signals
- train / validation / test separation
- trajectory validation and replay

### Non-negotiable training rule

> **Only verified, provenance-safe, training-eligible trajectories may become model-learning material.**

### 5.1 Primary data sources

Potential sources include:

- verified F00–F07 production trajectories
- Overseer mission records
- worker DecisionRecords
- successful repair episodes
- verified failed attempts with correct diagnoses
- Guardian authorization decisions
- F07 findings and receipts
- research records with valid provenance
- human-reviewed preference data
- deterministic teacher outputs
- postmortems converted into structured examples

### 5.2 Explicit exclusions

Exclude or quarantine:

- simulated trajectories presented as real
- fabricated metrics
- fake success receipts
- hardcoded confidence values
- unverified assertions
- secret-bearing records
- expired or invalid capability state
- contaminated trajectories
- malformed / schema-invalid outputs
- mock adapters that are not explicitly training-eligible

---

## 6. Training Stages

### Stage A — Domain adaptation

Teach the model:

- FactoryOS terminology
- floor semantics
- authority hierarchy
- worker contracts
- production lifecycle
- TimelineIR / rendering concepts
- verification terminology
- failure and recovery vocabulary

### Stage B — Supervised Fine-Tuning (SFT)

Teach correct behavior for:

- mission planning
- structured generation
- worker instruction
- diagnostics
- schema-constrained outputs
- policy-aware reasoning
- evidence-grounded explanations

### Stage C — Preference Tuning (DPO)

Prefer:

- verified outcomes
- policy-compliant decisions
- useful reasoning
- valid schemas
- correct escalation
- reliable repair proposals
- higher-quality production outputs

Reject:

- fabricated certainty
- unsupported claims
- capability bypass
- invalid tool calls
- weak recovery logic
- unverified success claims

### Stage D — Verifiable Reward Training

Where appropriate, use deterministic rewards from FactoryOS verification:

- schema validity
- invariant adherence
- reduction of F07 findings
- successful replay
- correct lease handling
- correct Guardian gating
- successful bounded repair

---

## 7. Dataset / Trajectory Contract

Each training example should preserve enough metadata to explain why it is trusted.

Minimum conceptual record:

~~~
trajectoryId
missionId
runId
workerId / floorId
worldStateDigest
input
context
decision / response
toolCalls
policyRefs
evidenceRefs
outcome
verificationRefs
modelRef
trainingEligible
provenance
datasetVersion
~~~

Training eligibility must be explicit and independently validated.

---

## 8. Model Output Contracts

Ascalon should support multiple response contracts rather than one unconstrained text channel.

### Text

Normal generation, explanations, planning, and synthesis.

### Structured Decision

~~~json
{
  "type": "CHOICE",
  "decision": "route_to_lightning",
  "confidence": 0.0,
  "uncertainty": 0.0,
  "evidenceRefs": [],
  "policyRefs": []
}
~~~

The numeric values are illustrative schema shape only. The model must not manufacture confidence when evidence is insufficient.

### Action Proposal

~~~json
{
  "type": "ACTION_PROPOSAL",
  "action": "render.submit",
  "arguments": {},
  "reason": "",
  "evidenceRefs": [],
  "requiredCapabilities": []
}
~~~

The runtime validates and authorizes the proposal before execution.

---

## 9. Inference Architecture

The intended production path is OpenAI-compatible serving behind an Ascalon gateway.

~~~
ShortForge / FactoryOS
          |
          v
   Ascalon AI Gateway
          |
     Provider Router
      +---+-------------+
      |   |             |
      v   v             v
  Ascalon Fast       External
  Llama   Decision    fallback
  8B      Core
      |
      v
  vLLM / compatible
  inference server
      |
      v
   GPU worker
~~~

The gateway hides inference-provider details from F00–F07 and other consumers.

Conceptual configuration:

~~~
AI_PROVIDER=ascalon
AI_BASE_URL=<ascalon-openai-compatible-endpoint>/v1
AI_MODEL=ascalon-llama-8b
AI_API_KEY=<runtime-secret>
~~~

The exact endpoint, checkpoint name, quantization, serving runtime, and GPU class must be pinned from verified deployment evidence.

---

## 10. Model Routing Policy

Ascalon should not be forced to answer every task.

The runtime may classify work into:

~~~
direct / deterministic
        |
        v
fast decision
        |
        v
Ascalon deep cognition
        |
        v
external specialist model
        |
        v
human escalation
~~~

Routing should consider:

- task type
- complexity
- uncertainty
- latency budget
- cost budget
- capability availability
- model health
- evidence requirements
- safety sensitivity
- output contract

The model router remains deterministic infrastructure.

---

## 11. Ascalon + Fast Decision Core

The intended long-term system is two-speed:

~~~
FAST PATH
Typed / narrow decisions
High frequency
Low latency
Small context

DEEP PATH
Ascalon Llama fine-tune
Planning / diagnosis / synthesis
Lower frequency
Larger context
Higher reasoning budget
~~~

This avoids making every inexpensive routing decision depend on the deepest cognitive path.

The fast path can provide JEV/KEV-like decision properties without pretending that a text-generating Llama is itself a dedicated probabilistic classifier.

---

## 12. Safety and Authority Invariants

Ascalon must not:

- grant itself capabilities
- bypass Guardian authorization
- mint or extend worker leases
- modify fencing tokens
- declare verification success without evidence
- access secrets merely because they appear in context
- publish artifacts outside the authorized pipeline
- change production contracts autonomously
- replace the Overseer
- silently change its own production weights

The runtime must enforce these boundaries mechanically.

---

## 13. Evaluation Program

Every candidate checkpoint must pass staged evaluation.

Required evaluation families:

1. Schema compliance
2. FactoryOS invariant adherence
3. Authority and capability boundary testing
4. Guardian bypass testing
5. Lease and fencing testing
6. Replay consistency
7. Evidence-grounded answer testing
8. Hallucinated capability testing
9. Decision calibration
10. Generation quality
11. Latency / memory / GPU utilization
12. Regression against the incumbent model stack
13. Held-out topic evaluation
14. Restricted canary evaluation

Existing Ascalon evaluation rules remain authoritative, including immediate rejection of Guardian bypass attempts and strict schema/invariant requirements.

---

## 14. Promotion Lifecycle

~~~
TRAIN
  |
  v
OFFLINE VALIDATION
  |
  v
DETERMINISTIC INVARIANT SUITE
  |
  v
SHADOW REPLAY
  |
  v
COUNTERFACTUAL / HELD-OUT EVALUATION
  |
  v
RESTRICTED CANARY
  |
  v
HUMAN / GOVERNANCE REVIEW
  |
  v
PROMOTE
~~~

A stronger benchmark result alone does not authorize deployment if authority, security, verification, or replay invariants regress.

---

## 15. Versioning

Track independently:

- base Llama checkpoint/version
- training dataset manifest
- dataset commit
- tokenizer version
- training configuration
- adapter / LoRA version
- evaluation suite version
- model checkpoint hash
- inference runtime version
- quantization format
- serving image / runtime digest
- promotion decision
- rollback target

A production model identity should be immutable and content-addressable where practical.

---

## 16. Experiment / Production Boundary

Experimental checkpoints must be separated from production checkpoints.

Recommended lifecycle naming:

~~~
ascalon-dev-*
ascalon-exp-*
ascalon-candidate-*
ascalon-canary-*
ascalon-prod-*
~~~

A checkpoint does not become production merely because inference succeeds.

---

## 17. Devourer Integration

Devourer may:

- inspect Ascalon failures
- identify missing training examples
- propose dataset improvements
- propose new evaluation cases
- compare candidate checkpoints
- benchmark training strategies
- recommend promotion or rejection

Devourer may not silently:

- replace production weights
- weaken evaluation gates
- alter authority boundaries
- redefine training eligibility
- bypass governance promotion requirements

The improvement loop is:

~~~
Factory evidence
      |
      v
Ascalon dataset
      |
      v
candidate training
      |
      v
evaluation
      |
      v
Devourer analysis
      |
      v
candidate improvement
      |
      v
bounded re-evaluation
      |
      v
promotion gate
~~~

---

## 18. Mandatory .okf / Repo Devourer Gate

Before changing Ascalon architecture, training strategy, model routing, inference serving, or data contracts:

1. Perform the mandatory full current .okf sweep.
2. Inspect executable implementation.
3. Inspect relevant contracts and tests.
4. Inspect repository mappings.
5. Inspect production-helper evidence when applicable.
6. Classify the proposed change using the canonical decision taxonomy.
7. Preserve the authority, security, evidence, replay, and worker-boundary invariants.

Ascalon documentation must never outrank executable evidence.

---

## 19. Initial Implementation Roadmap

### Phase 1 — Contract alignment

- finalize model I/O schemas
- finalize trajectory schema usage
- define model / version registry entries
- define Ascalon gateway contract

### Phase 2 — Dataset pipeline

- export verified trajectories
- build train / validation / test manifests
- add contamination and duplicate checks
- generate SFT data
- generate preference pairs

### Phase 3 — Fine-tuning

- pin the exact Llama base checkpoint
- choose LoRA / QLoRA configuration
- run baseline training
- record complete provenance
- checkpoint and hash every candidate

### Phase 4 — Evaluation

- schema tests
- invariant tests
- authority / capability tests
- replay tests
- held-out content / decision benchmarks
- latency and resource measurements

### Phase 5 — Serving

- deploy OpenAI-compatible Ascalon endpoint
- connect Ascalon Gateway
- integrate the provider router
- preserve external fallback
- introduce shadow mode first

### Phase 6 — Canary

- restricted capabilities
- staging artifacts only
- bounded traffic
- full telemetry and receipts
- comparison against incumbent models

### Phase 7 — Promotion

- governance review
- immutable model identity
- rollback checkpoint
- controlled production activation

---

## 20. Success Criteria

Ascalon is production-ready only when the candidate checkpoint demonstrates recorded evidence of:

- strong ShortForge domain performance
- reliable structured outputs
- evidence-grounded reasoning
- correct authority behavior
- zero tolerated Guardian bypasses
- correct capability enforcement
- replay compatibility where required
- acceptable latency and resource usage
- no unacceptable regression against the incumbent stack
- successful restricted canary
- reproducible training and evaluation provenance

A fine-tuned model being available is not sufficient for production promotion.

---

## 21. Canonical References

Primary architecture references:

- .okf/intelligence/training.md
- .okf/decisions.md
- .okf/cognitive/layer-contract.md
- .okf/hierarchy-map.md
- .okf/security/worker-permissions.md
- docs/ascalon/architecture.md
- docs/ascalon/evaluation-plan.md
- training/ascalon/

Relevant implementation areas:

- apps/web/factoryos/core/cognition/
- apps/web/factoryos/core/intelligence/decision/
- apps/web/factoryos/core/agent/
- training/ascalon/

---

## 22. Non-Negotiable Principle

> **Ascalon is the brain we train for ShortForge; FactoryOS is the body and governance system that constrains, verifies, and executes it.**

The target is not a model that can do everything.

The target is a model that is **deeply specialized in ShortForge, evidence-grounded, schema-disciplined, authority-bounded, recoverable, measurable, and replaceable**.
