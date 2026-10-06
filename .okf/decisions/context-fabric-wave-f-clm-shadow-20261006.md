# Context Fabric Wave F — CLM Shadow Context Proposals

Date: 2026-10-06
Issue: #223

## Decision

CLM may participate only as a shadow context-policy proposer. The model produces typed ContextEdit[] suggestions through a narrow proposal port. ContextFabric is the sole owner of deterministic validation and remains the only component allowed to mutate the active working context.

## Runtime boundary

- CLMContextProposalPort is the only model-facing proposal contract.
- CLMContextProposal carries schema version, workspace identity/version, provenance, trace ID, policy version, authority scope, confidence, budget, cost, context-growth estimate, rationale, and a deterministic fingerprint.
- ContextFabric.proposeCLMShadowEdits supplies the current workspace to the proposal port, validates the returned envelope, and reports the result without mutating the active context or attempting durable commit.
- Validation fails closed on stale versions, non-CLM actors, duplicate edit IDs, unsupported operations, budget drift, invalid confidence/cost/growth values, excessive latency/cost/edit count, provenance mismatch, authority-scope mismatch, forbidden authority markers, and fingerprint mismatch.
- The CLM adapter is disabled by default and has no direct access to ContextFabric mutators, repositories, Guardian, Treasury, CAS, or F07.
- The CLM proposal path does not grant execution, economic admission, artifact, verification, release, memory-promotion, or model-promotion authority.

## Non-goals

- No CLM training.
- No production model promotion.
- No automatic proposal application or durable commit.
- No new database.
- No new sovereign authority.
- No ContextBench.

## Acceptance / exit criteria

1. Valid shadow proposals are typed and provenance-bearing.
2. Deterministic validation rejects unsafe or out-of-version proposals.
3. Shadow proposal evaluation leaves ContextFabric.getWorkspace() unchanged from its pre-evaluation state.
4. The adapter is fail-closed by default.
5. A blocking machine verifier prevents direct CLM shadow mutation/persistence/authority paths.
6. Context Fabric, FactoryOS TypeCheck/F01 contracts, Team, OKF Governance, security, repository CI, and the CLM shadow boundary checks are green before merge.
7. .okf architecture and Team evidence reflect the exact shipped boundary.

## Rollback

Rollback is a normal Git revert of the Wave F merge. No durable schema migration or data backfill is introduced by this wave, and the existing ContextFabric workspace/edit ledger remains unchanged.

## Next gate

Wave G is ContextBench evaluation of the shadow policy before any discussion of production CLM promotion.
