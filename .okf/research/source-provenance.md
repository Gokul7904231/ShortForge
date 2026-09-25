# Research: ResearchPassport & Evidence Provenance

> **Status**: CANONICAL / IMPLEMENTATION-ALIGNED  
> **Current implementation**: `apps/web/factoryos/core/contracts/ResearchPassportContracts.ts` and `apps/web/factoryos/core/research/ResearchRuntime.ts`

## 1. Passport purpose

A ResearchPassport is the durable evidence record emitted by Floor 00.

It records:

- passport ID and mission ID;
- the research question and intent;
- methodology;
- normalized evidence sources;
- claim-level classifications;
- unresolved issues;
- confidence;
- provenance identifying Reach, agent, and floor;
- lifecycle timestamps;
- transformation steps;
- optional Content Engine research context;
- cryptographic integrity metadata.

## 2. Claim fidelity

Claims are explicitly typed:

```text
VERIFIED_FACT
SOURCE_CLAIM
MODEL_CLAIM
UNVERIFIED_ASSERTION
CONTRADICTED_CLAIM
AMBIGUOUS_CLAIM
```

A model inference is never silently promoted to a verified fact.

Heuristic hook intelligence is explicitly marked `HEURISTIC_ESTIMATE`.

## 3. Current corroboration behavior

The current ResearchRuntime uses a conservative deterministic corroboration heuristic:

- source/title/snippet tokens are normalized;
- at least two meaningful shared tokens are required for the corroboration path;
- contradiction markers can downgrade a claim to `CONTRADICTED`;
- otherwise source-backed claims remain `UNVERIFIED` / `SOURCE_CLAIM`.

This is still **not equivalent to expert fact checking or semantic verification**. F00 must not be described as having perfect factual verification.

## 4. Integrity

The passport is signed with:

- SHA-256 content hash;
- HMAC-SHA256 integrity MAC;
- project canonicalization version `JCS-v1`.

The project canonicalizer is a deterministic implementation-specific canonical form. The implementation should not be described as a complete RFC 8785 implementation unless separately verified.

Production requires `FACTORY_INTEGRITY_SECRET`.

Development/test environments may use a fixed non-production development key.

Integrity verification uses constant-time MAC comparison.

## 5. Evidence failure invariant

Unavailable/unreachable Reach records are not treated as evidence.

When no usable sources remain:

- passport confidence becomes `0.0`;
- the passport contains an explicit `UNVERIFIED_ASSERTION`;
- no fake source is created;
- downstream consumers can see the lack of evidence through `unresolvedIssues`.

## 6. Training boundary

Ascalon training/export must preserve:

- source provenance;
- claim fidelity;
- passport integrity;
- distinction between observed evidence and heuristic/model outputs.

Heuristic output must never be exported as observed telemetry.
