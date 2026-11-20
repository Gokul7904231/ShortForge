---
id: ADR-003-instabox-distributed-render-fleet
type: decision
title: 12-Node InstaBox Distributed Rendering Integration
status: active
stale_after: 2027-11-15T00:00:00Z
sources:
  - id: instabox-contracts
    resource: apps/web/factoryos/core/compute/instabox/InstaBoxContracts.ts
    title: FactoryOS InstaBox Fleet Contracts
sf_id: ADR-003-instabox-distributed-render-fleet
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
epistemic_state: sourced
verification: verified
created_at: 2026-11-15T13:00:00Z
updated_at: 2026-11-15T13:00:00Z
tags:
  - compute
  - instabox
  - distributed-rendering
  - cas
  - f07
sf_provenance:
  source_type: FILE
  source_id: apps/web/factoryos/core/compute/instabox/InstaBoxContracts.ts
  path: apps/web/factoryos/core/compute/instabox/InstaBoxContracts.ts
  start_line: 1
  end_line: 150
  captured_at: 2026-11-15T13:00:00Z
provenance:
  source_type: FILE
  source_id: apps/web/factoryos/core/compute/instabox/InstaBoxContracts.ts
  path: apps/web/factoryos/core/compute/instabox/InstaBoxContracts.ts
  start_line: 1
  end_line: 150
  captured_at: 2026-11-15T13:00:00Z
---

# ADR-003: 12-Node InstaBox Distributed Rendering Integration

## Context
ShortForge rendering previously relied on local processes, cloud sandboxes (Daytona, InstaVM), and legacy pull routes tied to Google Drive. The availability of a 12-node dedicated cluster (1 controller: `box1`, 11 workers: `box2`–`box8`, `box10`–`box13`, with `box9` intentionally excluded) required a genuine distributed rendering architecture that complies with FactoryOS Compute Fabric, CAS, and Floor 07 verification guarantees.

## Decision
1. **Dedicated Provider Type (`INSTABOX`):**
   - Registered directly with `ComputePool` (Surface: `INSTABOX`) and `ComputeRouter`.
   - Each worker node has a stable identity (`instabox-box2` through `instabox-box13`).
   - `box9` is permanently decommissioned and excluded.
2. **Authenticated Pull Protocol:**
   - Outbound HTTPS polling from worker agents to control plane.
   - Dual-header authentication and constant-time secret validation (`safeEqual`).
   - Monotonic attempt counters and cryptographic fencing tokens (`executionToken`).
3. **Hardware Contract & Resource Limits:**
   - 4 vCPU, 7.8 GiB RAM, 20 GB Disk per node (CPU-only, no GPU).
   - Conservative initial concurrency limit of 1 job per physical node.
   - Rejects GPU-required workloads during preflight admission.
4. **CAS Staging & Independent Forensic Verification:**
   - Workers stream completed MP4 binaries to `/api/rendering/instabox/upload` with SHA-256 digests.
   - Control plane computes SHA-256 over stream bytes and commits file into `ContentAddressedStore` (CAS).
   - Authoritative verification via `RenderArtifactVerifier` and `VerificationEngine` (F07 gate) before accepting `COMPLETED` status.

## Consequences
- Expands FactoryOS rendering capacity across 11 physical worker nodes with zero false completion receipts.
- Decouples controller plane from FFmpeg rendering execution.
- Retains complete F06/F07 physical verification and CAS provenance.
