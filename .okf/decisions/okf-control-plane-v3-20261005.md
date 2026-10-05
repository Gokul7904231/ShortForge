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

Owner-side GitHub repository protection has now been configured and is active:
- `OKF Main Protection` targets `refs/heads/main` and requires pull requests, one approval, Code Owner review, up-to-date branches, and the `OKF Governance Gate` status check; force updates and deletion are blocked.
- `OKF Release Tag Protection` targets `refs/tags/v*` and blocks tag updates and deletions.
- Both rulesets have an empty bypass list.

The cryptographic signing configuration has also been supplied through repository-managed Actions secrets/variables. The next gate is to exercise the signed-attestation path in CI and retain the resulting evidence artifact.

## Promotion gates

Production promotion remains blocked until:
- signed attestation verification is exercised in CI and the resulting evidence is retained;
- release provenance is bound to the actual release authorization chain;
- GitHub repository ruleset enforcement is proven with an actual protected-branch/tag behavior test;
- V2 CI is passing with current evidence.

## Non-goals

V3 does not replace F07 cryptographic receipts, Guardian authorization, TeamChangeIR, existing MemoryFabric, or the current runtime verification hierarchy. It adds governance provenance around them.
