# Floor 06 — Distributed Render Orchestration & Physical Artifact Admission

**Canonical Floor ID:** `floor06_rendering`  
**Status:** **PRE-TRAINING HARDENING WAVE 1 — CURRENT MAIN VALIDATION PASSED**

## Purpose

Floor 06 is the production execution boundary between the immutable composition contract from Floor 05 and the independent verification authority in Floor 07.

Canonical topology:

`F00 → F01 → F02 → (F03 || F04) → F05 → F06 → F07`

F06 does not redesign the video. It executes the already-committed render contract, chooses qualified heterogeneous compute, manages provider failover, records an admission decision, verifies the physical output, and returns a provenance-bound artifact for F07.

## Start condition

F06 may start only when:

1. the Floor 05 handoff is `COMMITTED`;
2. the TimelineSpec identity matches the committed F05 render job;
3. the F05 artifact SHA-256 and byte length match the handoff;
4. the F05 render-input hash and timeline fingerprint are intact;
5. Guardian/policy has authorized the F06 render capability;
6. the selected compute provider passes health, capability, policy and availability admission.

## End condition

A successful F06 execution ends only after:

1. a provider completes the requested render;
2. a physical artifact is present in an approved staging/CAS path;
3. F06 recomputes SHA-256 over physical bytes;
4. F06 confirms exact byte length;
5. ffprobe confirms MP4/container, video/audio streams and required dimensions/FPS/codecs;
6. FFmpeg decode smoke succeeds;
7. the artifact is bound to the selected admission record and F05 render identity;
8. the execution receipt is marked completed;
9. the F06 handoff is emitted for F07.

A provider-reported `COMPLETED` status is therefore not sufficient by itself.

## Features

- Canonical RenderFabric entry point.
- Compiler/semantic planning separated from provider execution.
- ComputeGateway → ComputeRouter provider-neutral execution path.
- Capability- and health-aware provider routing.
- Provider availability is a hard admission gate.
- Deterministic utility-based routing with explicit candidate/rejection evidence.
- Typed `RenderAdmissionRecord` for decision provenance and Ascalon training.
- Physical artifact verification before F06 completion.
- SHA-256 and byte-length verification against provider receipt.
- ffprobe container/stream measurement.
- FFmpeg decoder smoke test.
- Provider failover when physical artifact admission fails.
- Content-addressed artifact storage through CAS.
- Existing worker leases, fencing, callbacks and reconciliation remain bounded control mechanisms.
- F07 remains the independent final release/compliance authority.

## Actions

### RenderFabric

Compiles the committed render intent into an executable provider-neutral render job. It does not select secrets or bypass policy.

### ComputeGateway

Provides the canonical F06 execution facade over the ComputeRouter and CAS.

### ComputeRouter

Evaluates allowed providers, hard eligibility, health, availability and utility signals; records the admission decision; dispatches with bounded failover.

### Provider adapter

Executes the job inside its own credential/security boundary and returns an execution receipt plus artifact identity.

### Physical Artifact Verifier

Re-checks the actual bytes and media streams after provider completion. It is intentionally provider-independent.

### CAS

Stores output bytes by SHA-256 and provides immutable retrieval/integrity binding.

### Reconciliation / worker fabric

Handles leases, fencing, stale callbacks, worker loss and interrupted execution. It must not promote unverified artifacts.

## Permissions

| Actor | Allowed | Not allowed |
|---|---|---|
| OVERSEER | request authorized F06 execution | bypass Guardian |
| Ascalon / SCL | recommend provider/capability/repair decisions from evidence | dispatch, grant capability, mark completion |
| Guardian | authorize `cap_render_dispatch` | surrender release authority |
| ComputeRouter | evaluate eligible providers, dispatch, fail over | rewrite F05 semantics, publish |
| Provider worker | execute granted render, stage output, report receipt | self-certify final verification, publish |
| Slayer | revoke stale/unsafe leases | approve production success |
| Healer | bounded retry/recovery | expand permissions or ignore fencing |
| CAS | bind immutable bytes to digest | rewrite artifact identity |
| F07 | independently verify/release | be bypassed by F06 |

## Admission record

Every F06 render decision now has a typed admission record containing:

- policy version;
- selected provider;
- utility score;
- candidate providers;
- hard rejection reasons;
- capability snapshot;
- health snapshot;
- evaluation timestamp.

This is evidence, not a new authority layer.

## Physical verification record

The F06 physical verifier records:

- actual artifact path;
- actual SHA-256;
- actual byte length;
- MP4 container evidence;
- video/audio codec evidence;
- width/height/FPS;
- duration where observable;
- decoder smoke result;
- named verification checks and failure reason.

F07 may perform the same classes of inspection independently. F06 evidence never substitutes for F07 release authorization.

## Ascalon role

The training target is:

`F05 committed evidence → provider admission decision → execution → physical artifact evidence → verification result → F06 handoff`

Ascalon should improve:

- capability requirement interpretation;
- hard eligibility reasoning;
- provider selection explanations;
- cost/latency/reliability trade-off reasoning;
- failover diagnosis;
- artifact-verification failure classification;
- bounded recovery recommendations;
- explicit uncertainty when telemetry is missing;
- distinction between provider claims and physically observed evidence.

Ascalon must not learn:

- to self-authorize rendering;
- to invent provider availability;
- to treat GPU presence as proof of hardware video encoding;
- to accept a provider completion receipt without physical verification;
- to mutate the F05 TimelineSpec;
- to issue F07 release authority.

## F06 → F07 handoff

F06 passes:

- exact F05 timeline fingerprint;
- exact F05 render-input hash;
- final artifact URI/path;
- physical SHA-256 and byte length;
- measured media metadata;
- physical verification evidence;
- provider identity;
- execution/admission provenance;
- worker/attempt identity where available.

F07 uses this as input evidence and remains the final verification/release boundary.

## External research disposition

| Source | Pattern considered | Decision |
|---|---|---|
| OpenCue | render task decomposition, queue/resource tags | boundary reference only |
| Temporal | durable workflow/event-history semantics | concept reference; no second workflow authority |
| Kueue | explicit resource admission, quotas, fair sharing | concept reference; no Kubernetes dependency |
| Ray | hard resource eligibility vs soft scheduling and locality | adopted conceptually in routing |
| OpenTelemetry | consistent spans/events around execution | evidence design reference |
| FFmpeg / ffprobe | physical media inspection | directly adopted |
| OpenAssetIO | logical identity vs physical location | already consistent with F03/F05 boundary |

No third-party runtime, provider credential, model weight or source code was promoted into the canonical F06 authority chain.

## F03 relationship

No new F03 semantic field was promoted in this wave. Existing F03 `AssetPlanIR` already provides the plan fingerprint, scene identity, dependencies, continuity/reference intent and downstream-relevant constraints needed by F05 and therefore F06.

The F03 improvement in this wave is boundary documentation: F06 consumes F03-derived semantics only through the immutable F05 contract; F06 never reaches backward to rewrite F03.

## Completion gate

This README is a design/implementation record. Final F06 admission requires green typecheck, F06 tests, routing/failover tests, physical-verifier tests, F03/F04/F05/F06 contract regression, Team Change Gate, and the applicable repository CI lanes.
