# OKF Rule -> Enforcement -> Evidence Matrix

The machine source is .okf/rules/index.json. This document is the human-readable projection.

| Rule ID | Severity | Primary enforcement | Evidence |
|---|---|---|---|
| OKF.PROCESS.FULL_SWEEP | CRITICAL | OKF sweep compiler | sweep envelope |
| OKF.GOVERNANCE.TEAM_GATE | CRITICAL | Team Change Gate + CI | Team report |
| OKF.AUTH.MODEL_NON_SOVEREIGN | CRITICAL | Guardian/runtime | authority evidence |
| OKF.EVIDENCE.UNPROVEN_NOT_PASS | CRITICAL | deterministic report validator | CI evidence |
| OKF.SECURITY.LEAST_PRIVILEGE | CRITICAL | CapabilityRegistry/Guardian | permission tests |
| OKF.RELEASE.F07_VERIFIED | CRITICAL | F07 + release controls | release evidence |

A linked enforcement point is not itself proof that the underlying control is currently passing.
