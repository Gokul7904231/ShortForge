# OKF Control Plane V3 — Attestation, Provenance, PolicyContext & Governance Observability

**Date:** 2026-10-05
**Classification:** extends existing governance capability
**Status:** IMPLEMENTED / PROMOTION BLOCKED

## Objective

Complete the V3 architectural boundary by adding cryptographic governance attestations, release provenance, compact OKF PolicyContext projection for AER/Ascalon, and an observability dashboard without creating another authority system.

## Decisions

### Cryptographic attestations

`OKFAttestationSigner` uses Ed25519 with externally supplied key material. There is no production key-generation fallback. The attestation authority class is `EVIDENCE_ONLY`.

### Release provenance

`tools/okf/provenance.py` binds repository commit identity, OKF corpus digest, sweep envelope digest, rule IDs, drift/coverage state, and evidence artifact digests into a release-provenance envelope. It explicitly sets `productionReleaseEligible=false`; the existing F07/ReleaseAuthorization chain remains authoritative.

### AER / Ascalon PolicyContext

`OKFPolicyContext` provides the smallest sufficient applicable governance state: stable rule IDs, normative text, source/verification references, constraints, evidence state, and corpus/sweep fingerprints. It cannot authorize execution or rewrite policy. AER may carry it into epistemic context; Ascalon receives it as bounded policy context.

### Governance dashboard

`/governance/okf` exposes coverage, rule counts, lifecycle/severity counts, and control states for operator observability. The dashboard is read-only and explicitly cannot authorize execution or replace Guardian/F07.

## Authority invariant

`Intelligence proposes. Authority authorizes. Runtime executes. Evidence proves.`

V3 does not modify this hierarchy.

## Current enforcement evidence

Owner-side GitHub repository protection is active and has now been exercised:
- `OKF Main Protection` targets `refs/heads/main`, requires pull requests, one approval, Code Owner review, up-to-date branches, and the `OKF Governance Gate` status check; force updates and deletion are blocked.
- `OKF Release Tag Protection` targets `refs/tags/v*` and blocks tag updates/deletion/non-fast-forward changes.
- Both rulesets have an empty bypass list and the live API reports `enforcement=active`.
- A direct write attempt to `main` through the GitHub Contents API was rejected with the real repository-rule response: `Changes must be made through a pull request` and `Required status check "OKF Governance Gate" is expected.`
- No release-style `v*` tag currently exists in the repository, so tag mutation behavior cannot be exercised without first creating a test tag; no tag was created solely for this qualification.

The cryptographic signing configuration has been supplied through repository-managed Actions secrets/variables, and V3 Validation #8 exercised the Ed25519 signing path successfully with a retained `okf-v3-evidence` artifact. The next gate is the F07-bound release provenance path and its corresponding repository enforcement proof.

## Promotion gates

Production promotion remains blocked until:
- a live F07 qualification run produces and verifies a real `ReleaseAuthorization`, then binds it into `okf-release-provenance.json` and retains the evidence artifact;
- the final PR-to-main merge is performed with the active ruleset, a valid Code Owner approval, and `OKF Governance Gate` passing;
- current V2 CI evidence is passing and reconciled with the promotion candidate.


## Non-goals

V3 does not replace F07 cryptographic receipts, Guardian authorization, TeamChangeIR, existing MemoryFabric, or the current runtime verification hierarchy. It adds governance provenance around them.
