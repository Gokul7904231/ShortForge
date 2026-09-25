---
id: ADR-002-render-worker-pool-routing
type: decision
title: Tier-Isolated Render Worker Architecture
status: stable
stale_after: 2027-08-20T00:00:00Z
sources:
  - id: basic-render-api
    resource: services/rendering-engine/basic_render_api.py
    title: Basic Render Engine Worker API
sf_id: ADR-002-render-worker-pool-routing
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
epistemic_state: sourced
verification: verified
created_at: 2026-08-20T12:00:00Z
updated_at: 2026-09-20T17:00:00Z
tags:
  - rendering
  - architecture
  - security
  - providers
sf_provenance:
  source_type: FILE
  source_id: services/rendering-engine/basic_render_api.py
  path: services/rendering-engine/basic_render_api.py
  start_line: 1
  end_line: 60
  captured_at: 2026-08-20T12:00:00Z
provenance:
  source_type: FILE
  source_id: services/rendering-engine/basic_render_api.py
  path: services/rendering-engine/basic_render_api.py
  start_line: 1
  end_line: 60
  captured_at: 2026-08-20T12:00:00Z
---

# ADR-002: Tier-Isolated Render Worker Architecture

## Context
Video rendering is the primary CPU/GPU bottleneck in ShortForge. Free/serverless execution platforms (such as Kaggle notebooks or unauthenticated cloud containers) suffer from unpredictably long cold starts (>3 minutes), strict execution timeouts, intermittent IP bans, and lack of deterministic callback guarantees.

## Decision
We establish a two-tier rendering fabric:
1. **Tier 1 — Warm Pool Basic Render Engine (`:8100`)**:
   - High-availability dedicated FastAPI worker pool with sub-60s render latency for Standard/Basic tier jobs.
   - Isolated per-job disk workspace (`services/rendering-engine/output/jobs/{jobId}`).
   - Secure communication using high-entropy `executionToken` validated via constant-time `timingSafeEqual`.
2. **Distributed GPU providers**:
   - GPU-capable providers such as AMD workers, Kaggle, Lightning, or future qualified fleets are selected by ComputeRouter capability policy.
   - Provider-specific credentials stay inside provider adapters.
3. **Kaggle / Ephemeral Workers**:
   - Rejected as canonical or primary render workers due to cold starts, ephemeral storage loss, and security risks.

## Consequences
- Guarantees predictable sub-60s short generation.
- Decouples Next.js Control Plane from heavy FFmpeg execution.
- Prevents cross-tenant privilege escalation or GPU resource starvation.
