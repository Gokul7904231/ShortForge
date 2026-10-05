# ShortForge — Training Readiness Record
## 2026-10-04

### Executive status

| Area | Status |
|---|---|
| AER-Core training infrastructure | **READY** |
| AER-Bench definition + evaluator | **READY** |
| AER-Core shadow integration | **READY — provider required** |
| AER-Core production authority | **DISABLED** |
| Verified AER-Core corpus | **REQUIRED / NOT YET POPULATED** |
| AER-Core checkpoint | **NOT TRAINED / NOT PROMOTED** |
| Ascalon training-data preparation | **READY under proposal/learning-only boundary** |
| Current branch CI evidence | **NOT CONFIRMED** |

### AER-Core foundation completed

ShortForge now has a dedicated training boundary under `training/aer_core/` covering:

1. Verified-gold dataset schema and export boundary.
2. Rejection of synthetic, fallback-generated, unverified, or model/heuristic-as-gold examples.
3. Exact question-to-gold coverage validation.
4. Mission/trajectory-isolated deterministic train/validation/test partitioning.
5. Reproducible CPU/GPU-aware trainer.
6. Validation-only temperature calibration.
7. Held-out prediction generation with measured latency.
8. AER-Bench metrics and report generation.
9. Strict model-output validation.
10. Non-authoritative shadow comparison against primary/JEV/GLiDE.
11. HTTP serving seam for a future trained checkpoint.
12. Source-control exclusion for local datasets/checkpoints.
13. CI validation of the training boundary.

### AER-Bench scope

The benchmark covers:
- epistemic-state classification
- evidence sufficiency
- probe selection
- hypothesis ranking
- cognitive routing
- worker/provider routing
- failure classification
- recovery selection
- authority escalation
- stop/replan

Required measurements include correctness, top-k, Brier/ECE/AUROC where applicable, score MAE/QWK, selective accuracy, abstention, malformed output rate, p50/p95 latency, and measured throughput.

Numeric quality cutoffs are intentionally left for governance approval rather than invented in code.

### Shadow-mode rule

AER-Core is an observer only. DecisionEngine can run AER-Core beside the primary path and JEV/GLiDE using non-blocking observation. Shadow output cannot replace the authoritative result, authorize execution, grant capabilities, mint leases, alter fencing, publish, certify F07, or redefine policy.

### Ascalon boundary

Ascalon remains a separate deep-cognition training program. The existing Ascalon trajectory/ontology/replay infrastructure is available for training-data preparation. Synthetic curriculum data is now isolated from the production-golden path, and generated quality reports no longer claim unmeasured replay or perfect quality.

### The remaining blocker is data/evidence, not architecture

A real training run still requires a sufficiently large independently verified corpus. The committed golden trajectory builder currently contains only a small set of production-grounding exemplars, which is useful for contract/replay verification but not enough to establish a statistically meaningful AER-Core model.

The first promoted checkpoint must carry:
- dataset manifest and split evidence
- checkpoint fingerprint
- validation-only calibration artifact
- held-out AER-Bench report
- authority-invariant test evidence
- JEV/GLiDE shadow replay evidence
- restricted-canary evidence
- governance approval

### Decision

**ShortForge is ready for AER-Core training at the engineering-infrastructure level.**

This statement does **not** mean that a production-quality training corpus exists, that a checkpoint has been trained, or that AER-Core may enter the authoritative decision path.

Canonical next wave:
`verified runtime outcomes -> corpus admission -> AER-Core training -> calibration -> AER-Bench -> shadow replay vs JEV/GLiDE -> restricted canary -> promotion`.
