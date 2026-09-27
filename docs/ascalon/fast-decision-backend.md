# Ascalon Fast Decision Backend

> Status: EXPERIMENTAL / SHADOW-ONLY
> Owner: ShortForge Cognitive Layer
> Authority: `.okf/intelligence/ascalon-model.md` and executable DecisionContracts

## Purpose

Ascalon is a two-speed cognitive system. Deep reasoning remains the Llama-based Ascalon core. High-frequency bounded choices may use a specialized decision backend.

CLM-8B is the first concrete backend candidate evaluated against this contract.

## Backend contract

A fast decision backend receives:

- an authoritative state/context slice
- a typed question
- a closed candidate set or ordered rubric
- evidence references where available.

It returns only a typed decision candidate. Runtime policy, capability grants, leases, fencing, execution and verification remain outside the model.

## Probability semantics

Three values must never be collapsed:

1. outcome probability
2. epistemic confidence
3. calibration status.

CLM additionally needs a fourth label: probability semantics. CLM's softmax is candidate-relative to the supplied action set. It therefore cannot be treated as globally calibrated confidence without a ShortForge calibration study.

ShortForge now represents this explicitly in `DecisionUncertainty`.

## Backend selection

~~~
deterministic rule
      | unresolved
      v
fast decision backend
      | low confidence / invalid / policy-sensitive
      v
Ascalon deep cognition or human escalation
      |
      v
Guardian authorization
      |
      v
worker execution
~~~

CLM is not the sole future backend. The adapter interface remains interchangeable so that locally fine-tuned contrastive heads, other System One research models, or a future native Ascalon head can be evaluated without changing worker contracts.

## Training track

The fast-decision dataset is derived from verified ShortForge state/action pairs. Hard negatives must be plausible but invalid actions grounded in deterministic constraints, incident history, or verified repair outcomes.

Every candidate backend is evaluated on:

- task-disjoint holdout families
- hard-negative top-1 accuracy
- option-order invariance
- candidate-set sensitivity
- probability reliability/calibration
- invalid-output rate
- escalation behavior
- latency and GPU memory
- shadow agreement with the incumbent decision path.

## Production gate

CLM remains `CLM_SHADOW` and `isProductionAuthority=false` until a future promotion decision records a complete evaluation and canary result. No external benchmark claim alone promotes the backend.