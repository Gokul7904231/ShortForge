# Floor 07 — Ascalon Pre-Training Admission

Date: 2026-09-27  
Status: HARDENING IMPLEMENTED — CI ADMISSION PASS  
Authority: F07 Release Guardian plus repository test/CI evidence. Ascalon is proposal and learning only.

## Start condition

F07 starts only after F06 supplies a committed render identity, a content-addressed artifact reference and SHA-256 identity, physical byte length, independent media/decode evidence, provider admission/execution evidence, and the F05 timeline/intent lineage needed to explain what was rendered.

For release decisions, F07 treats physical bytes and an independently re-probed CAS object as authoritative. Caller-supplied measurements are evidence inputs, not physical truth.

## Actions

1. Resolve the physical artifact from CAS.
2. Re-hash the bytes independently.
3. Re-probe media with FFprobe-backed VerificationEngine.
4. Re-check byte length and digest stability after probing.
5. Evaluate creative variation, originality, and channel fatigue.
6. Evaluate YouTube gates G00-G14 using the intended publication clock.
7. Reconcile evidence and invalidate downstream evidence after repair.
8. Build and sign an immutable VerificationReceipt.
9. Allow PublicationAuthorizationService to issue a durable Ed25519 capability only from a valid publishable receipt.
10. Keep publication as a separate side-effect boundary with JIT authorization revalidation.

## Permissions

Declared F07 capabilities remain CAP_QA_INSPECT and CAP_EVAL_EXEC.

F07 does not own CAP_FS_WRITE, CAP_DELIVERY_PUBLISH, render dispatch, provider credential selection, or F05/F06 semantic mutation. Publication is performed only through a separately issued ReleaseAuthorization capability.

## End condition

F07 terminates only with a durable terminal state: READY, REPAIR_REQUIRED, BLOCKED, NOT_YET_ELIGIBLE, POLICY_STALE, or EXTERNAL_REVIEW.

A gate passing without independently verified physical artifact evidence does not complete F07.

## Hardening implemented in this wave

- Added F07PhysicalArtifactVerifier for physical CAS/local verification.
- Added digest stability checks before and after physical probing.
- Added strict CAS identity matching: cas://<sha256> must equal the expected digest.
- Added F07PreTrainingAdmission so missing evidence is machine-visible before Ascalon training.
- Preserved test fixtures as explicitly non-production evidence.

## Research-driven upgrades

C2PA 2.4: use signed provenance/manifests as a complementary origin signal, not as a replacement for byte-level verification.

OPA signed bundles: use the candidate -> verify signature/hash -> activate pattern for policy snapshots.

SLSA 1.2 and in-toto: use typed provenance/attestation patterns for a future F05/F06/F07 verification envelope.

These are clean-room architectural patterns. External systems do not become ShortForge authorities.

## Ascalon improvement boundary

Ascalon should learn the difference between proposal, observation, evidence, and authority; physical versus declared truth; F05/F06/F07 provenance; policy-clock reasoning and abstention; structured remediation and stale-evidence invalidation; and blocked/repair-required examples.

Ascalon must never self-certify media, issue release capabilities, or bypass Guardian and authorization boundaries.

Training admission is not granted by this document. Fresh CI/test evidence and the Team report are required.

## Fresh verification evidence

- Floor 07 Pre-Training Validation: GitHub Actions run 36305703180 — PASS.
- Team Change Gate: run 36305703091 — PASS.
- Floor 04 validation: run 36305703036 — PASS.
- Floor 05 validation: run 36305703013 — PASS.
- Floor 06 validation: run 36305703016 — PASS.
- Strict repository TypeScript typecheck: run 36305703239 / job 108581817261 — PASS.
- Full Web Regression is informational and remains red because of environment-dependent FFmpeg/ffprobe, external provider, MongoDB, Agent-Reach, and legacy test failures; no F07-specific test is failing in that lane.

**Admission result:** F07 is ready for Ascalon pre-training under the locked authority boundaries. This does not claim live YouTube OAuth/provider qualification or guaranteed platform monetization.
