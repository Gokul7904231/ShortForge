# FACTORYOS — FLOOR 04: MEDIA SYNTHESIS & PROVIDER EXECUTION

**Location**: `floors/floor04_media_synthesis/`  
**Adapter Location**: `factoryos/guardian/floors/floor04_guardian.py`  
**Status**: **HARDENED CORE — EXTERNAL PROVIDERS GATED, DETERMINISTIC FALLBACK VERIFIED BY PHYSICAL MEDIA CHECKS**  
**Validation**: Fresh CI is required after the 2026-09-26 contract hardening; historical 175/175 status is no longer sufficient evidence.  

---

## 1. Domain Responsibility

Floor 04 is the **Media Synthesis & Provider Execution Floor** in FactoryOS. It takes machine-consumable asset specifications produced by Floor 03 (`Floor03HandoffPayload`) and orchestrates visual frame synthesis, voiceover audio generation, background audio acquisition, physical media validation, local media storage, and rights metadata registration.

```text
FLOOR 03 (Asset Realization Specs)
               │
               ▼
┌─────────────────────────────┐
│        FLOOR 04 BRAIN       │
│ Proposes candidate actions  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│      GUARDIAN KERNEL        │
│ Authorizes policy, budget,  │
│ transactions, idempotency   │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────┐
│      FLOOR 04 WORKERS       │
│ Image, TTS, Audio Workers   │
└──────────────┬──────────────┘
               │ UNTRUSTED OUTPUT
               ▼
┌─────────────────────────────┐
│   PHYSICAL MEDIA VALIDATOR  │
│ Magic bytes, MIME, Spec     │
│ dimensions/duration, Decode │
└──────────────┬──────────────┘
               │ VALID
               ▼
┌─────────────────────────────┐
│    LOCAL MEDIA REGISTRY     │
│ data/media_storage/ + Hash  │
└──────────────┬──────────────┘
               │
               ▼
   FLOOR 05 TIMELINE COMPOSITION
```

---

## 2. Immutable Architectural Invariants (7/7 Verified)

1. **Brain Cannot Authorize Itself**: `MediaBrain` produces candidate proposals (`BrainProposal`), but only `GuardianEngine` can authorize tool/worker execution.
2. **Brain Cannot Bypass Guardian**: Unregistered execution attempts trigger fatal `POLICY_WORKER_AUTHORIZED` policy denials.
3. **Worker Cannot Bypass Validator**: Corrupt or invalid artifacts are strictly rejected by `PhysicalMediaValidator`.
4. **Provider Metadata Cannot Override Physical Bytes**: Provider-declared MIME types mismatching raw file byte inspection are rejected (`Provider Trust Violation`).
5. **Provider Cannot Choose Arbitrary Paths**: Out-of-bounds output paths fail path security and symlink containment rules.
6. **Failed Transaction Cannot Commit**: Transactions with failed or corrupted worker execution roll back, never commit.
7. **Ambiguous Recovery Becomes ORPHANED**: Partial/inconsistent staging files transition to `ORPHANED` during restart reconciliation.

---

## 3. Capability Classification Matrix

| Capability / Module | Status | Verification Evidence |
| :--- | :--- | :--- |
| **Floor 03 Handoff Intake** | `IMPLEMENTED` | `test_floor04_handoff_contract_serialization` |
| **Deterministic Visual Frame Worker** | `IMPLEMENTED` | `test_run_image_worker` |
| **Deterministic TTS Narration Worker** | `IMPLEMENTED` | `test_run_tts_worker` |
| **Background Audio & Rights Metadata** | `IMPLEMENTED` | `test_run_background_audio_worker` |
| **Physical Media Output Validator** | `IMPLEMENTED` | 18 OWASP tests in `test_physical_validator_extended.py` |
| **Storage & Provenance Registry** | `IMPLEMENTED` | `test_registry_register_and_retrieve` & `test_registry_spec_linkage_verification` |
| **Crash Reconciliation Engine** | `IMPLEMENTED` | `test_reconciliation_commits_valid_files` & `test_reconciliation_cleans_orphaned_staging_files` |
| **Floor 04 Media Brain** | `IMPLEMENTED` | `test_brain_proposal_generation` |
| **Guardian Adapter & Policies** | `IMPLEMENTED` | `test_guardian_authorizes_registered_capability` |
| **Real Image Generation Providers** | `EXTERNAL_DEPENDENCY` | Real OpenAI DALL-E / Stable Diffusion / Midjourney APIs unverified |
| **Real TTS Voice Providers** | `EXTERNAL_DEPENDENCY` | Real EdgeTTS / ElevenLabs / OpenAI Voice APIs unverified |
| **Real Audio Acquisition Providers** | `EXTERNAL_DEPENDENCY` | Real third-party licensed library integration unverified |
| **Prompt Injection Resilience** | `NOT_VERIFIED` | Threat model & adversarial attack resilience unverified |
| **Production Autonomous Readiness** | `NOT_VERIFIED` | Production live quality & model decision quality unverified |

---

## 4. Test Suite Execution Summary

```bash
python -m pytest floors/floor01_strategy/tests/ floors/floor02_scripting/tests/ floors/floor03_asset_realization/tests/ floors/floor04_media_synthesis/tests/ tests/guardian/
```

- **Floor 01 Strategy Suite**: 31/31 PASSING 🔒
- **Floor 02 Scripting Suite**: 23/23 PASSING 🔒
- **Floor 03 Asset Realization Suite**: 25/25 PASSING 🔒
- **Guardian Control Plane Kernel Suite**: 50/50 PASSING 🔒
- **Floor 04 Media Synthesis Suite**: 46/46 PASSING 🔒
- **Total Baseline Suite**: **175/175 PASSING TESTS IN 15.23s** 🔒


## 5. Floor 04 Operating Contract

### When Floor 04 starts

F04 starts only after:
- the Floor 03 handoff is VALIDATED;
- the F03 AssetPlanIR is present;
- the F03 semantic plan fingerprint is present;
- the Guardian has authorized the registered media-synthesis capability;
- required media storage and execution dependencies are available.

F04 does not begin from raw script text and does not reconstruct planning intent from physical files.

### Actions

The floor executes the following bounded sequence:

1. Receive and validate the typed F03 handoff.
2. Bind the execution to the exact F03 AssetPlanIR fingerprint.
3. Select an explicitly allowlisted provider/fallback per capability.
4. Generate/acquire visual, narration and background-audio assets.
5. Physically validate bytes, dimensions/duration, path containment and MIME agreement.
6. Compute SHA-256 and provenance fingerprints.
7. Register the physical asset atomically.
8. Assemble the Floor04HandoffPayload.
9. Persist the transaction as committed only after all assets pass validation.

Visual and audio workers can run in bounded parallelism because their scene-local outputs are independent until package assembly.

### Permissions

F04 may:
- read the validated F03 handoff and plan IR;
- select registered providers within Guardian-authorized capabilities;
- write F04-local physical media and registry records;
- produce the validated F04 handoff;
- quarantine failed or ambiguous physical artifacts for forensic inspection.

F04 may not:
- mutate F03/F02 source state;
- mint new capabilities;
- access provider secrets outside the approved adapter boundary;
- approve release;
- bypass Guardian;
- certify final content quality;
- sign final provenance authority reserved for downstream verification;
- replace TimelineIR/F05 or F07.

### When Floor 04 ends

F04 ends only when:
- every required asset is physically validated;
- every asset is linked to the exact F03 plan fingerprint;
- rights/provider execution metadata exists;
- the media manifest matches actual bytes;
- the transaction is committed;
- a complete Floor04HandoffPayload is emitted for F05.

Any failed/ambiguous state ends in rollback/quarantine/reconciliation, not in a partially valid handoff.

## 6. What Ascalon can improve in Floor 04

Ascalon should improve Floor 04 in bounded cognition, not by becoming the authority.

High-value responsibilities:
- rank eligible providers based on measured latency, cost, availability and prior evidence;
- choose a safe fallback family;
- detect repeated provider failure patterns;
- recommend batch/parallelism levels;
- classify failure causes before retry/repair;
- predict media validation risk before expensive provider calls;
- learn provider-specific quality/cost profiles from verified trajectories;
- recommend deterministic preflight rules that Devourer can later convert into cheap validators.

Ascalon must not:
- bypass Guardian authorization;
- override physical validation;
- turn unverified provider output into trusted memory;
- grant a provider new permissions;
- certify F07/release.

The Fast Decision Core is the preferred path for narrow high-frequency provider selection; deeper Ascalon cognition is reserved for diagnosis, novel repair and architecture/procedure proposals.

## 7. What Floor 04 gives Floor 05

F04 now gives F05 a validated media package rather than just file paths:

- exact F03 AssetPlanIR lineage;
- verified visual assets;
- verified audio assets;
- background audio when present;
- SHA-256 checksums;
- physical dimensions/duration;
- provider execution records;
- rights metadata;
- media manifest with byte totals;
- transaction/execution identity;
- provenance hash.

F05 can therefore compile TimelineIR from authoritative physical asset identities without guessing what was actually generated or reconstructing F03 semantics indirectly.

## 8. Product / engineering principle

F03 specifies intent. F04 realizes physical media. F05 composes time. F07 verifies the final artifact.

The floor must remain understandable as a bounded manufacturing station, not as a generic agent.

## 9. External-provider maturity

The repository now has a provider-selection seam and truthful deterministic fallbacks. Real external providers remain explicit adapters requiring:
- credentials outside the F03 contract;
- health checks;
- request/response evidence;
- physical artifact validation;
- retry/timeout policy;
- provider-specific benchmark results;
- quality evaluation;
- rights metadata;
- rollback/circuit-breaker behavior.

Research repositories and model announcements do not automatically promote a provider to production status.

## 10. Research / non-conflict record

The 2026-09-26 hardening research is recorded in .okf/research/repo-mappings/f04-production-hardening-wave1.md

The selected patterns are deliberately compatible with the locked F03/F04 parallel topology and the existing Guardian/F07 authority boundaries.
