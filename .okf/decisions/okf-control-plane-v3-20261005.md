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

## Promotion gates

Production promotion remains blocked until:
- durable repository-managed signing keys are configured and trusted;
- signed attestation verification is exercised in CI;
- release provenance is bound to the actual release authorization chain;
- GitHub repository ruleset enforcement is proven;
- V2 CI is passing with current evidence.

## Non-goals

V3 does not replace F07 cryptographic receipts, Guardian authorization, TeamChangeIR, existing MemoryFabric, or the current runtime verification hierarchy. It adds governance provenance around them.
