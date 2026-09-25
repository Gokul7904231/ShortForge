# FactoryOS — Basic Compute & Distributed Rendering

## 1. Purpose

This document describes the non-authoritative compatibility compute surface used around the canonical Floor 06 rendering path.

Production authority:

```text
F05 TimelineIR / RenderIntent
        |
        v
F06 RenderFabric
        |
        v
ComputeGateway
        |
        v
ComputeRouter
        |
        +--> Local
        +--> Persistent Worker
        +--> Kaggle
        +--> Lightning
        +--> GitHub Actions
        +--> other qualified providers
        |
        v
Physical artifact
        |
        v
CAS
        |
        v
F07 verification
```

Provider selection is capability- and policy-driven. Provider adapters must fail closed when unavailable or unqualified.

## 2. Basic / Free Rendering

The existing basic quota guard may be used to bound free-tier capacity:

- per-user monthly generation limits
- global render-minute limits
- explicit enable/disable state
- no provider-specific authority

After the guard accepts a request, the authoritative F06 path remains `RenderFabric -> ComputeRouter`.

## 3. Provider Isolation

Provider identity is never treated as authority.

1. capability compatibility
2. health/availability
3. ComputePolicy eligibility
4. worker permission boundaries
5. artifact verification requirements
6. CAS registration where applicable
7. bounded failover rules

A provider cannot report render completion without a physical artifact receipt.

## 4. Environment Configuration

Example provider configuration is intentionally generic:

```env
RENDER_WORKER_URL=
RENDER_WORKER_SECRET=
GITHUB_RENDER_REPOSITORY=
GITHUB_RENDER_WORKFLOW=
GITHUB_RENDER_REF=main
GITHUB_RENDER_TOKEN=

BASIC_MONTHLY_RENDER_MINUTES_LIMIT=1000
BASIC_RENDER_MAX_DURATION_SECONDS=300
BASIC_RENDERING_ENABLED=true
```

Provider-specific secrets belong only to their provider adapters and never become creator-facing configuration.
