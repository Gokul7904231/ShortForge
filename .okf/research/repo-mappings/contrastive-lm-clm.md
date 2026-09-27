# Contrastive-LM/CLM — Ascalon Research Mapping

> Retrieval date: 2026-09-27
> Revision reviewed: main
> Adoption mode: PATTERN EXTRACTION + ISOLATED SHADOW ADAPTER
> Authority: external research evidence only; ShortForge executable contracts remain authoritative.

## 1. Source identity

- Upstream: https://github.com/Contrastive-LM/CLM
- Model card: https://huggingface.co/Contrastive-LM/CLM-v0.1-8B
- License reported upstream: Apache-2.0 for code and CLM-8B weights.
- Reference checkpoint: CLM-v0.1-8B.

## 2. What was verified

CLM-8B is a System One decision/ranking model built from a frozen Qwen3-8B encoder plus trainable state/action projection heads. The upstream implementation exposes typed NOUL/CHOICE/SCORE decisions and a generic candidate-ranking primitive. State/action representations are separately cacheable, making repeated candidate sets a first-class optimization.

Upstream documents describe a three-stage data recipe: approximately 60M Q&A examples for pre-training, approximately 30M synthetic hard negatives for mid-training, and approximately 1M agentic trajectories for post-training. The repository also reports author-run latency and verifier benchmark results. Those benchmark numbers are research evidence, not ShortForge qualification evidence.

## 3. Direct mapping into Ascalon

| Upstream pattern | ShortForge treatment | Status |
|---|---|---|
| State/action contrastive scoring | Fast Decision Core backend contract | ADOPTED AS PATTERN |
| Typed NOUL/CHOICE/SCORE | Reuse existing DecisionContracts | ADOPTED |
| Candidate-relative softmax | Explicit probability semantics added to DecisionUncertainty | ADOPTED |
| Cached action/state embeddings | Evaluation target for repeated worker option sets | ADOPTED AS BENCHMARK TARGET |
| Rank best-of-N candidates | Repair/provider/tool candidate ranking without generation | ADOPTED AS CAPABILITY |
| Fine-tunable projection heads | Candidate Ascalon fast-decision tuning track | EXPERIMENTAL |
| Qwen3-8B encoder lock | Keep backend-specific; never make it an SCL invariant | BOUNDARY |

## 4. Architectural conclusion

CLM is not Ascalon itself. It is an implementation candidate for the fast, bounded decision substrate described by the existing Ascalon two-speed architecture. Ascalon's generative/deep reasoning core remains separate.

Decision flow:

~~~
State/context + bounded candidate set
            |
            v
      Fast Decision Core
            |
      +-----+-----------+
      |                 |
      v                 v
  CLM-8B shadow     future backends
      |
      v
relative decision probabilities
      |
      v
Guardian / deterministic policy gate
      |
      v
authorized worker action
~~~

CLM cannot authorize, publish, lease, fence, mutate production contracts, or replace Overseer/F07.

## 5. Calibration / probability rule

CLM's probabilities are softmax scores over the candidate set supplied by the caller. They are not automatically evidence of globally calibrated confidence. ShortForge therefore records them as `CANDIDATE_RELATIVE` and keeps calibration status `UNCALIBRATED` until a ShortForge-specific calibration study proves otherwise.

Candidate set changes can change the distribution. Therefore training and evaluation must include:

- option-order invariance tests
- candidate-set perturbation tests
- hard-negative discrimination
- task-disjoint holdouts
- reliability/calibration curves before any production confidence claim.

## 6. Training implication

The Ascalon corpus should contain explicit state/action pairs for bounded worker decisions and difficult negative actions. Negative actions must be generated from verified failure taxonomy or deterministic teacher constraints, never from invented success claims.

Do not copy CLM's external datasets into ShortForge automatically. Use the pattern: verified ShortForge state -> authorized ground-truth action -> semantically hard but invalid alternatives -> deterministic verification.

## 7. Implementation delivered in ShortForge

- `apps/web/factoryos/core/intelligence/decision/CLMDecisionAdapter.ts` — strict, fail-closed CLM adapter; shadow only.
- `apps/web/factoryos/tests/clm-decision-adapter.test.ts` — wire-shape, malformed-response, candidate-relative semantics and fail-closed tests.
- `DecisionContracts` now distinguish probability semantics from calibration status.

## 8. Evidence limits

The upstream repository is marked alpha and depends on a Qwen3-8B pooling server for the reference head. The model card explicitly states no generation, encoder lock, and that verifier benchmark results require fine-tuned heads. ShortForge must not promote any of these claims to production guarantees without local evaluation.

## 9. Related 2026 references

- https://github.com/jaredpalmer/kev — small open Jev-like decision models; useful evidence for keeping a backend-neutral typed decision interface.
- https://github.com/uspraveen/Jevify — open reproducibility/calibration research; useful for calibration methodology, not production authority.
- https://github.com/patelvishwa112/jev-system-one-rlcd — local System One reproduction emphasizing non-autoregressive typed decisions and the distinction between reproducing mechanism and reproducing proprietary weights.