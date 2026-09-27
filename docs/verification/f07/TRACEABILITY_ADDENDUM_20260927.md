# F07 Traceability Addendum — 2026-09-27

This addendum is the current correction layer for the older F07 requirements matrix. When an older entry claims that release authorization is only in-memory or that the placeholder SHA fallback is still active, this addendum reflects the current main code state.

| Requirement | Current implementation truth | Evidence boundary |
|---|---|---|
| Physical artifact identity | F07PhysicalArtifactVerifier now resolves CAS, re-hashes bytes, probes independently, and re-checks digest after probing. | Unit + focused physical truth tests; post-merge CI required. |
| CAS binding | Production release is blocked unless the physical artifact is CAS-bound. | F07ReleaseGuardian production path. |
| Durable release authorization | DurableAuthorizationStore persists ACTIVE/CONSUMED/INVALIDATED state using SQLite CAS transitions. | Authorization integration tests. |
| Replay resistance | JIT verification consults durable authorization status; provider cannot publish without active authorization. | F07 invariant and provider tests. |
| Cryptographic receipt | VerificationReceipt remains Ed25519 signed and verifier-checked. | Receipt and invariant tests. |
| Policy clock | F07 now explicitly checks that the selected snapshot interval covers publicationIntentAt. | F07ReleaseGuardian runtime check + policy test lane. |
| Production fake-success | YouTube provider fails closed when credentials are unavailable and does not synthesize production video IDs. | Existing F07 invariant/e2e-fail-closed evidence. |
| Evidence lineage | ArtifactLineageGraph prevents cycles and EvidenceInvalidationTracker invalidates downstream stages after repairs. | Remediation/invariant tests. |

Known stale matrix entries should be reconciled in a later documentation-only pass once the complete historical requirement ledger is refreshed against current main.
