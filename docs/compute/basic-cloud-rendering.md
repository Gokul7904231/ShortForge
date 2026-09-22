# FactoryOS — Basic Cloud Rendering Plane & Admin-Only Azure Architecture

## 1. Executive Summary & Core Topology

FactoryOS implements a **strictly isolated multi-plane rendering architecture**:

```
                         FACTORYOS CONTROL PLANE
                                  │
                         RenderQueueManager
                                  │
                     WorkerPoolRegistry / Router
                                  │
                ┌─────────────────┴─────────────────┐
                │                                   │
             ADMIN                               BASIC
                │                                   │
                ▼                                   ▼
          Azure VM Pool                       GitHub Actions
          ADMIN ONLY                          BASIC ONLY
                │                                   │
                └─────────────────┬─────────────────┘
                                  ▼
                              B2 Storage
                                  │
                         Delivery / Download
```

---

## 2. Non-Negotiable Routing Matrix & Security Rules

| User Tier | Target Rendering Backend | Access Tier | Failure / Fallback Behavior |
| :--- | :--- | :--- | :--- |
| **ADMIN** | Azure VM Pool (`azure-admin`) | `ADMIN_ONLY` | Fallback to BYOR if configured |
| **BASIC / FREE** | GitHub Actions Ephemeral Workflow | `BASIC` | **NO Azure Fallback**. Returns `BASIC_RENDER_CAPACITY_UNAVAILABLE` |
| **PRO** | Placeholder (`PRO_RENDERING_NOT_AVAILABLE`) | N/A | Honest capability state. **No Azure / Basic Fallback** |
| **ENTERPRISE** | Placeholder (`ENTERPRISE_RENDERING_NOT_AVAILABLE`) | N/A | Honest capability state. **No Azure / Basic Fallback** |
| **BYOR** | User-Owned Desktop / VPS | `USER_OWNED` | Bound strictly to `job.tenantId` |

> **SERVER-SIDE AZURE ISOLATION**: Non-admin render requests targeting Azure are rejected server-side with `RENDER_BACKEND_FORBIDDEN` and emit an `AZURE_UNAUTHORIZED_ACCESS_ATTEMPT` security event.

---

## 3. GitHub Actions Ephemeral Compute Architecture

1. **Abstraction**: `WorkerPoolRegistry ➔ Provider Adapter ➔ Ephemeral Workflow Run` (via GitHub REST API `workflow_dispatch`).
2. **Input Security**: Workflow inputs receive **ONLY** `jobId` and short-lived `executionToken`. No master credentials, customer content, or cross-tenant secrets are passed in workflow inputs.
3. **Billing Safety Guard**: `BasicRenderingCapacityGuard` enforces user-level quotas (5 Shorts/month) and global monthly render minutes limits (`BASIC_MONTHLY_RENDER_MINUTES_LIMIT`) before dispatching.
4. **Server-Side MP4 Verification**: Control plane independently validates MP4 container headers and non-zero file sizes before issuing `RENDER_COMPLETED`.

---

## 4. Environment Variables & Infrastructure Configuration

```env
GITHUB_RENDER_REPOSITORY="FactoryOS/factoryos-basic-renderer"
GITHUB_RENDER_WORKFLOW="factoryos-basic-render.yml"
GITHUB_RENDER_REF="main"
GITHUB_RENDER_TOKEN="ghp_xxxxxxxxxxxx"

BASIC_MONTHLY_RENDER_MINUTES_LIMIT=1000
BASIC_RENDER_MAX_DURATION_SECONDS=300
BASIC_RENDERING_ENABLED=true
AZURE_RENDERING_ENABLED=true
AZURE_RENDERING_LOCKDOWN=false
```
