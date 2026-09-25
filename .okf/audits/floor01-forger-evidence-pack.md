# Floor 01 Forger Evidence Pack

Date: 2026-09-25
Branch: `feat/floor01-strategy-v2`

## Forger Assembly applied

This work follows the repository's Forger Assembly model without promoting Forgers into production authority.

| Forger lane | Applied work |
|---|---|
| Architect | Canonical F00 -> F01 -> F02 boundary, authority preservation, typed handoff design |
| Builder | Python F01 runtime, Overseer adapter, production packaging, strict API boundary |
| Browser / Knowledge | Existing F01 architecture/research sources reviewed before implementation changes |
| Sentinel | API-key separation, fail-closed production startup, constant-time comparison, request limits, input sanitization, no raw 500 error leakage, validated-only downstream status |
| Reliability | File-locking, atomic persistence, corruption recovery, full-input idempotency, concurrent replay convergence |
| Performance | FastAPI blocking work moved to sync handlers, model/curriculum overlap retained, bounded candidate generation |
| Evaluator | Deterministic candidate scoring, tie-breaking, v2 regression coverage, container smoke validation |
| Release | CI Python gate, TypeScript gate, production-container gate, documentation/evidence-pack gate |

## Evidence order

Executable implementation and automated tests are treated as stronger evidence than narrative architecture notes. External architecture patterns are advisory only and never override repository authority.

## Implemented safety controls

- `floor01_strategy` is the only canonical production F01 identity.
- TypeScript Overseer no longer synthesizes a second strategy result.
- F00 ResearchPassport is verified before the Overseer bridge constructs ResearchContext.
- Production F01 startup requires `FLOOR01_SERVICE_API_KEY`.
- API-key comparison uses `secrets.compare_digest`.
- Canonical planning endpoints run strict validation.
- Overseer rejects `DEGRADED`, `REJECTED`, and unknown handoff statuses.
- Request fingerprints cover all F01 input fields except caller-selected request ID.
- Prompt-bound inputs are sanitized before provider calls.
- Request payloads are bounded.
- Rate-limit state is bounded per service instance.
- Runtime container runs unprivileged.
- Production API documentation is disabled.
- Persistence failures are surfaced rather than silently accepted.
- Concurrent idempotent calls converge under the storage lock.

## Known architectural boundaries

The file-backed memory implementation is intentionally single-instance. It is not advertised as multi-node shared memory.

A shared backend, semantic embedding scorer, downstream outcome learner, and bounded DELIBERATE/DEEP controller are separate capabilities. They do not get introduced implicitly into the production authority path.

## Verification record

At the time this pack was written:
- F01 Python CI had reached a corrected passing run after one report-contract defect was repaired.
- The TypeScript and production-container checks for the latest head were still running.
- Therefore final release status remained `VERIFICATION IN PROGRESS` and no merge/promotion claim was made.

## Release rule

No green-looking narrative is sufficient. The branch is releasable only when code, automated tests, runtime smoke, and security evidence are all green on the same head SHA.
