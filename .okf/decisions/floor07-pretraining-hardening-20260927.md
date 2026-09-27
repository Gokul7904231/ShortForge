# Decision — Floor 07 Pre-Training Hardening — 2026-09-27

## Decision

Strengthen F07 as an independent physical truth and release evidence boundary without changing the canonical floor topology.

## Locked invariants

- F07 never trusts provider-declared media measurements as production truth.
- Production release requires an independently resolved CAS artifact.
- SHA-256 identity must match the CAS identity and physical bytes.
- Media is probed independently through VerificationEngine.
- Digest stability is checked after probing.
- No publication without a valid signed ReleaseAuthorization.
- Ascalon remains proposal/learning-only.
- External research is advisory pattern evidence only.

## Implemented

- F07PhysicalArtifactVerifier.
- F07PreTrainingAdmission.
- F07ReleaseGuardian integration.
- Focused F07 physical-truth tests.
- Dedicated F07 pre-training CI workflow.
- F07 audit, research mapping, Ascalon admission, and Team report.

## Deferred

KMS/HSM signer migration, signed policy bundle packaging, persistent invalidation ledger, and C2PA runtime validation require additional qualification fixtures and operational credentials.
