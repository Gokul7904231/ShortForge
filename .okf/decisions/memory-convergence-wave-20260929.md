---
type: decision
title: Memory Fabric Convergence Wave — 2026-09-29
status: stable
id: shortforge-memory-convergence-wave-20260929
sf_id: shortforge-memory-convergence-wave-20260929
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
created_at: 2026-09-29T00:00:00.000Z
updated_at: 2026-09-29T00:00:00.000Z
tags:
  - shortforge
  - memory-fabric
  - convergence
  - aer
  - ascalon
---

# Memory Fabric Convergence Wave — 2026-09-29

## Decision

Memory Fabric is the canonical learned-memory substrate for ShortForge cognitive recall. Legacy ExperienceMemory remains a compatibility fallback only where the canonical lifecycle has not yet been injected.

## Implemented

- Retention now persists through one canonical MemoryLifecycle path.
- Multiple retained facts are preserved instead of silently reducing to the first fact.
- Agent and Ascalon projections require explicit access context; missing authorization fails closed.
- Global Ascalon projection refresh is disabled unless an explicit scoped/global authority context is configured.
- CognitiveRuntime can consume canonical Memory Fabric recall and feed its evidence into AER without granting AER or Ascalon execution authority.
- KnowledgeStore/OKF serialization now preserves Memory Fabric scope, evidence, entity, relation, observation, mental-model, and refresh fields across reload.
- Stale filtering excludes only actually stale memories; unknown temporal freshness is not treated as stale.
- Contradictions remain typed and move observations to DISPUTED rather than concatenating claims into one statement.
- Proof counts are based on unique verified evidence identities.
- RRF channel weights are configurable and intended to be tuned from labeled evaluation data.
- Lexical/entity/graph retrieval uses a derived in-process index cache; the KnowledgeStore remains the canonical source of truth.

## Explicit non-goals

This wave does not claim that the memory subsystem is production-complete. A persistent ANN/vector backend, AER-aware mental-model scheduler, cryptographic proof anchoring, stronger privacy classification, and LongMemEval-style decision-effect evaluation remain follow-on gates.

## Authority invariant

Learning may inform cognition. Memory does not become production truth, AER does not execute, Ascalon does not authorize, and F07 remains the final artifact truth boundary.

## Verification requirement

Promotion of this wave requires:

1. Typecheck green.
2. Memory/Obsidian integration green.
3. AEF and FGC validation green on the same commit.
4. Regression results distinguished from environment-only media-tool failures.
5. Memory evaluation reports recorded with retrieval and authorization metrics.

## Proof anchoring

Memory gate proofs may bind to a verified F07 VerificationReceipt. The anchor is accepted only after the existing F07 VerificationReceiptVerifier validates the receipt digest and Ed25519 signature. The memory ledger remains a proof-state record; the F07 receipt remains the trusted artifact/proof issuer.
