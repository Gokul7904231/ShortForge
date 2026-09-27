# F07 Pre-Training Hardening — Research & Repo Mapping

Date: 2026-09-27
Repository: Gokul7904231/ShortForge
Scope: Floor 07 final verification and release boundary

## External research screened

| Source | Pattern screened | ShortForge disposition |
|---|---|---|
| C2PA 2.4 specification | Cryptographically verifiable content provenance, assertions, actions, workflow continuity | Complementary provenance evidence; never replaces physical byte verification or F07 authority. |
| OPA signed bundles | Verify policy bundle signatures and file hashes before activation | Apply candidate -> validated -> active principle to policy snapshots. |
| SLSA 1.2 | Verifiable provenance describing where/how an artifact was produced | Use provenance model for a future verification attestation envelope. |
| in-toto Attestation Framework v1.0 | Typed attestations and producer/subject binding | Evidence-structure inspiration; no dependency added. |
| YouTube current monetization policy | Repetitive or mass-produced content is inauthentic for monetization | Strengthen channel-level repetition and template-diversity evidence. |
| YouTube current AI disclosure policy | Realistic AI alteration/generation requires disclosure; script/outline assistance is treated differently | Keep disclosure as a typed policy result, not a generic AI-used failure. |
| YouTube Shorts current policy | Shorts up to 3 minutes; 24 Sep 2026 change for >1 minute claimed Shorts | Keep policy clocks date-aware and separate duration eligibility from Content ID effects. |

## Repository-side candidates

- F07ReleaseGuardian.ts: final coordinator.
- VerificationReceipt.ts: signed evidence receipt.
- F07CryptoSigner.ts and F07TrustedKeyStore.ts: signer identity.
- DurableAuthorizationStore.ts: durable release capability state.
- PublicationAuthorizationService.ts: capability issuance and JIT revalidation.
- ArtifactLineageGraph.ts and EvidenceInvalidationTracker.ts: lineage and stale-evidence handling.
- ContentAddressedStore.ts: immutable artifact identity.
- .okf/cognitive and training/ascalon/ontology: learning boundary.

## Adopted implementation changes

1. Production F07 verification must independently resolve a physical source.
2. CAS identity and caller-declared SHA-256 must agree exactly.
3. Media probing is independent from provider-declared measurements.
4. Digest verification is repeated after probing.
5. F07 pre-training admission is now a typed evidence contract.

## Rejected or deferred

- No C2PA runtime dependency in this wave.
- No OPA runtime dependency in this wave.
- No SLSA/in-toto runtime dependency in this wave.
- No new floor or authority layer.

Authority rule: .okf governance -> executable contracts/runtime -> physical evidence -> verified knowledge -> Ascalon learning projection.
