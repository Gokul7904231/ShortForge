# OKF Rule -> Enforcement -> Evidence Matrix

Machine source: `.okf/rules/index.json`. This document is the human-readable projection.

| Rule ID | Severity | Primary enforcement | Verification binding |
|---|---|---|---|
| OKF.PROCESS.FULL_SWEEP | CRITICAL | OKF sweep compiler | tools/okf/sweep.py |
| OKF.GOVERNANCE.TEAM_GATE | CRITICAL | Team Change Gate + CI | Team/reports/pr-<number>.json |
| OKF.AUTH.MODEL_NON_SOVEREIGN | CRITICAL | Guardian/runtime boundary | authority-hierarchy-proof.test.ts |
| OKF.EVIDENCE.UNPROVEN_NOT_PASS | CRITICAL | deterministic report validator | Team/scripts/validate-team-report.mjs |
| OKF.SECURITY.LEAST_PRIVILEGE | CRITICAL | CapabilityRegistry/Guardian | authority-hierarchy-proof.test.ts |
| OKF.RELEASE.F07_VERIFIED | CRITICAL | F07 + release controls | f07-architectural-invariants.test.ts |
| OKF.PRINCIPLE.SCHEDULE_DERIVED | CRITICAL | OKF Governance Gate | architecture-modernization.test.ts |
| OKF.PRINCIPLE.CONTROL_PIPELINE_SEPARATION | CRITICAL | OKF Governance Gate | architecture-modernization.test.ts |
| OKF.PRINCIPLE.SINGLE_SOURCE_OF_TRUTH | CRITICAL | OKF Governance Gate | architecture-modernization.test.ts |
| OKF.PRINCIPLE.CLAIM_EVIDENCE | CRITICAL | OKF Governance Gate | f07-architectural-invariants.test.ts |
| OKF.PRINCIPLE.TELEMETRY_ERROR_HONESTY | CRITICAL | OKF Governance Gate | f07-physical-truth.test.ts |
| OKF.PRINCIPLE.REPLAY_FENCING | CRITICAL | OKF Governance Gate | render-fabric-providers-and-chaos.test.ts |
| OKF.PRINCIPLE.BOUNDED_REPAIR | HIGH | OKF Governance Gate | architecture-modernization.test.ts |
| OKF.PRINCIPLE.CAPABILITY_PROVIDER_NEUTRAL | HIGH | OKF Governance Gate | architecture-modernization.test.ts |
| OKF.PRINCIPLE.TYPED_MEMORY | HIGH | OKF Governance Gate | obsidian-memory-fabric.integration.test.ts |
| OKF.PRINCIPLE.LEAST_PRIVILEGE | CRITICAL | OKF Governance Gate | authority-hierarchy-proof.test.ts |

Verification bindings establish traceability and coverage. CI results determine whether the referenced verification currently passes.
