# Compute Pool — Hosted Worker Convergence — 2026-10-02

Status: IMPLEMENTED — awaiting CI and physical provider activation

## Goal

Finish the compute roadmap by making Local, API-backed GPU workers, hosted notebook workers, and hosted sandbox workers appear behind one ComputePool and one ComputeRouter.

## Architecture

ComputePool -> hard worker preflight -> ComputeRouter utility score -> GLiDE advisory decision -> worker execution -> physical artifact -> CAS -> F07 verification.

## Worker rule

A provider is a render worker only when it has a real execution path that can return a physical artifact receipt. Control-only provider adapters are not promoted into the pool.

## Current render worker surfaces

- LOCAL: LocalComputeProvider
- API_GPU: AmdComputeProvider
- NOTEBOOK: KaggleNotebookComputeProvider
- SANDBOX: HostedSandboxComputeProvider backed by Daytona or Modal

## Decision rule

Ascalon/GLiDE may ask:

- Can this worker run the job?
- Is it healthy?
- Is it free?
- Can it finish before the deadline?
- Which eligible worker is the best fit given measured history?

Deterministic eligibility remains authoritative. GLiDE cannot grant capability, lease, fencing, publication, or F07 authority.

## Reliability rule

The router rejects unavailable workers before selection, learns from observed startup/execution/failure telemetry, and fails over when a worker fails, times out, or produces a physically invalid artifact.

## Truth rule

A provider saying "completed" is not enough. Render completion requires a physical artifact receipt, CAS integrity verification, and the existing physical F06/F07 verification path.

## Explicit non-goals

- No self-hosted PandaStack sandbox.
- No fake RunPod/Vast render-worker promotion.
- No GLiDE authority over hard admission.
- No provider completion treated as physical truth.

## Remaining activation/proof

1. Run CI and fix any compile/test failures.
2. Bind real provider credentials and render commands in a controlled environment.
3. Execute distributed rendering on at least two non-local workers.
4. Run chaos cases: unavailable worker, dead worker, timeout, slow worker, capacity saturation.
5. Run the existing golden-short-001 mission through RenderFabric and verify pool -> artifact -> CAS -> F07.
6. Promote GLiDE from shadow/canary only after measured calibration and failover evidence.
7. Optimize using measured telemetry, not provider marketing estimates.
