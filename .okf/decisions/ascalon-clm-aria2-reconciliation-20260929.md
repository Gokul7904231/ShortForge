# Ascalon CLM + aria2 reconciliation — 2026-09-29

## Classification

Reconciliation of stale PR #39 onto current `main`.

## Preserved

- CLM remains a candidate-ranking backend only.
- Probability semantics remain `CANDIDATE_RELATIVE`.
- CLM is disabled by default.
- CLM cannot grant capabilities, create leases, execute tools, publish, certify F07, or become a training-label source.
- Malformed, unavailable, unauthorised, and timeout responses fail closed.
- aria2 remains a transfer accelerator only.
- Acquisition requires HTTPS, explicit origin allowlisting, independent SHA-256 verification, optional byte-length verification, and later CAS/manifest promotion.

## Reconciled implementation

- `CLMDecisionAdapter.ts` is promoted as a hardened shadow adapter compatible with the current DecisionContracts.
- `DecisionEngine` exposes `enableShadowClm`, default false, and records CLM observations without changing the primary decision path.
- Existing current-main `CLM_SHADOW` contract support is reused rather than reintroducing obsolete contract changes.
- aria2 helper and tests are ported as isolated Ascalon supply-chain utilities.

## Deliberately not carried forward

The stale PR's older Ascalon documentation copies are not allowed to overwrite newer current-main ontology/decision documents. Current-main source-of-truth documents remain authoritative.

## Promotion gate

Fresh repository TypeScript, security, Ascalon adapter tests, and repository CI must pass before merge.

## Source

Original branch: `feat/ascalon-clm-aria2-upgrade-20260927`

Original PR: #39

Reconciliation branch: `reconcile/ascalon-clm-aria2-20260929`
