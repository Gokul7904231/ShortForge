# Compute Resilience and Optimization — 2026-10-02

Status: CODE-COMPLETE — live provider proof is operator-triggered

## Phase 8 — reliability proof

ComputeRouter now has explicit tests for:
- dead/unavailable worker admission
- capacity saturation
- timeout failover
- repeated-observation telemetry learning.

Render jobs still require physical artifact verification. A worker marked completed without a valid artifact cannot terminate the failover chain.

## Phase 9 — golden mission

The canonical golden compute boundary runs:

RenderFabric -> ComputeGateway -> ComputePool -> ComputeRouter -> provider -> physical MP4 -> CAS -> F07 VerificationEngine.

Full mission delivery remains a separate external integration concern and is not part of the compute-boundary gate.

## Phase 10 — measured optimization

Declared provider estimates are used until `COMPUTE_TELEMETRY_MIN_SAMPLES` successful observations exist for a provider. The default is 3.

After the threshold, measured startup, execution, and transfer telemetry can replace declared estimates in utility scoring.

Observed failure rate increases the reliability penalty only after repeated attempts, reducing sensitivity to one-off failures.

## Live activation

The manual `Live Multi-Provider Render` workflow proves real non-local execution through the same RenderFabric entrypoint for AMD, Kaggle, Daytona, or Modal.

Required secrets/configuration remain provider-specific. CI does not fabricate credentials.

The manual AMD smoke workflow remains available for the AMD DevCloud worker.

## Boundaries

- GLiDE remains advisory and cannot bypass deterministic eligibility.
- Hosted sandboxes remain outside F06 worker authority until the worker contract is satisfied.
- PandaStack is not part of the sandbox plane.
- F07 remains the physical truth authority.