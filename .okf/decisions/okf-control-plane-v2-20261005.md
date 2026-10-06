# OKF Control Plane v2 — Enforcement & Drift

**Date:** 2026-10-05  
**Classification:** extends existing governance capability
**Status:** IMPLEMENTED ON FEATURE BRANCH / CI VALIDATION REQUIRED

## Decision

Advance OKF from machine-identifiable policy (V1) to machine-enforced governance (V2) by binding active CRITICAL/HIGH rules to verification references, detecting source-policy drift, enforcing machine-rule coverage, binding Team Change Reports to the compiled sweep, and rejecting invalid or expired governance exceptions.

## Canonical boundary

`.okf` remains normative policy. The control-plane tooling is a compiler/validator and evidence producer. It does not become production authority and cannot replace Guardian, F07, human governance, or executable implementation truth.

## V2 controls

1. Policy-to-test binding: active CRITICAL/HIGH rules must declare verificationRefs that resolve to repository-controlled verification artifacts.
2. Source drift detection: active-rule sourceRefs are pinned to Git blob identities and checked against the current checkout.
3. Rule coverage enforcement: active CRITICAL/HIGH rules without verification bindings fail the governance gate.
4. TeamChangeIR linkage: the Team report must carry the compiled sweep corpus digest, relevant rule IDs, and sweep status; the validator compares these values with the CI-generated envelope.
5. Exception expiration: malformed, OPEN, or expired APPROVED exceptions fail the gate. CLOSED/REJECTED historical records remain auditable.

## Deliberate limitation

VerificationRefs establish machine traceability and coverage. They do not prove that a referenced test currently passes. CI evidence remains the source of verification status.

## Exit condition

V2 is ready for merge only after the OKF Governance Gate produces successful evidence on the PR and the Team Change Gate remains consistent. Repository ruleset/branch-protection enforcement is a separate owner-side setting and remains tracked by Issue #188.

## V3 boundary

V3 may add cryptographic attestations, release provenance, PolicyContext projection, and governance observability. V3 must not create a second governance authority.

## 2026-10-06 Mainline reconciliation

This V2 promotion branch is constructed directly from the current `main` tree. Existing mainline architecture and context-fabric entries are preserved while V2 machine-rule coverage, source-drift controls, Team sweep linkage, exception expiry checks, and governed-path CODEOWNERS are added. The live repository rulesets are active; direct protected-main write attempts are rejected by GitHub and the merge path remains subject to the required status check and independent approving review.
