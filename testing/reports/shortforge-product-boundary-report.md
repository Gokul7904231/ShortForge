# ShortForge Creator ↔ FactoryOS Operator Product Boundary Report

**Date**: September 10, 2026  
**Status**: VERIFIED & AUTHORIZED  
**Component**: ShortForge Web Shell & FactoryOS Control Plane Boundary

---

## 1. Executive Summary

A hard architectural and presentation boundary has been established between:
1. **ShortForge**: The user-facing AI video creation product tailored for creators (Content Engines, Templates, Video Projects, Assets, Publishing, Analytics).
2. **FactoryOS**: The internal orchestration, production, and operations control plane (Workflows/DAG, Models, Capability Registry, SRE Diagnostics, Queue Internals, Runtime Telemetry, API Settings).

**Core Product Principle Preserved**:
> *Keep the factory. Hide the factory. Expose only creator-safe projections. Allow authorized operators to see the factory.*

---

## 2. What Was Leaking (Root Cause Analysis)

Prior to this boundary separation, several internal operator systems were exposed directly in the creator shell:
- **Navigation Leaks**: The sidebar exposed Workflows (DAG), Queue internals, SRE Scheduler, AI Models, Capability Registry, Runtime telemetry, Benchmarks, and EventBus directly to consumer users.
- **API Leaks**: `/api/factory-state` returned comprehensive internal telemetry (active providers, queue depths, dead letter queues, hardware telemetry, EventBus event feeds) indiscriminately.
- **Internal API Open Surfaces**: `/api/models`, `/api/providers`, `/api/settings/api` lacked server-side role verification, allowing unprivileged consumers to query internal model registries and provider configuration.
- **Terminology Leaks**: Creator surfaces (such as `/factory/jobs` and `/factory/templates`) exposed raw internal concepts like `Floor 1 - Floor 7`, `Workflow DAG Node Details`, and synthetic telemetry fallbacks.

---

## 3. Explicit Route Classification

Per architectural requirements, a blanket `/factory/*` restriction was **strictly avoided**, because `/factory/templates` and `/factory/jobs` are legitimate creator surfaces. Explicit classification was centralized in [`apps/web/lib/core/RouteRegistry.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/lib/core/RouteRegistry.ts):

| Route | Surface | Min Role | Description |
|---|---|---|---|
| `/dashboard` | `creator` | `USER` | Creator Workspace & Video Projects |
| `/create` | `creator` | `USER` | Quick Generate Flow |
| `/engines` & `/engines/*` | `creator` | `USER` | Content Generation Engines (Quiz, GK, History, etc.) |
| `/factory/templates` | `creator` | `USER` | ShortForge Video Templates Marketplace |
| `/factory/jobs` | `creator` | `USER` | Video Generation Jobs & Status |
| `/media/library` & `/media/assets` | `creator` | `USER` | Media Asset Library |
| `/publishing/*` & `/analytics/*` | `creator` | `USER` | Multi-channel Publishing & Analytics |
| `/settings` & `/pricing` | `creator` | `USER` | Account & Plan Settings |
| **Internal Routes** | | | |
| `/factory/workflows` | `factory` | `ADMIN` | Pipeline Workflows & Task DAG |
| `/factory/queue` | `factory` | `ADMIN` | Render & Storage Queue Internals |
| `/factory/scheduler` | `factory` | `ADMIN` | Task Scheduler Control |
| `/ai/models` | `factory` | `ADMIN` | Model Passports & Benchmark Registry |
| `/ai/marketplace` | `factory` | `ADMIN` | Provider Plugin Marketplace |
| `/ai/capability-registry`| `factory` | `ADMIN` | Capability Graph & Routing Tables |
| `/ai/runtime` | `factory` | `ADMIN` | Orchestrator Runtime Telemetry |
| `/ai/benchmarks` | `factory` | `ADMIN` | SRE Benchmark Matrix |
| `/ai/events` | `factory` | `ADMIN` | Internal EventBus Stream |
| `/dashboard/ai-hospital` | `factory` | `ADMIN` | Provider Health & Recovery |
| `/dashboard/profiler` | `factory` | `ADMIN` | Frame & Step Profiler |
| `/dashboard/workers` | `factory` | `ADMIN` | Worker Daemon Telemetry |
| `/dashboard/simulation` | `factory` | `ADMIN` | Chaos & Mission Simulation |
| `/settings/api` | `factory` | `ADMIN` | Production API & Provider Keys |
| `/admin/*` | `factory` | `ADMIN` | User & Role Administration |

---

## 4. Server-Side Authorization Architecture

Client-side UI hiding is strictly treated as defense-in-depth. Server-side authorization is authoritative:

1. **Next.js Middleware (`apps/web/middleware.ts`)**:
   - Evaluates `isInternalFactoryRoute(pathname)`.
   - Resolves caller role using `decodeEdgeSessionRole` from cryptographic session cookies (`__session`) or verified `INTERNAL_API_SECRET_KEY`.
   - **Unauthenticated requests** to internal routes are redirected to `/login` (for UI) or return `401 Unauthorized` (for API).
   - **Basic creators** (`USER`, `VIEWER`, `EDITOR`) attempting to access internal routes receive a **307 redirect to `/dashboard?denied=operator_access`** (for UI) or **403 Forbidden** (for API).
   - Creator routes like `/factory/templates` and `/factory/jobs` pass through unimpeded.

2. **Internal API Protection**:
   - [`/api/models`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/app/api/models/route.ts): Enforced via `verifyAuthAndRole(request, "ADMIN")`. Returns 403 to non-admins with no model passport data.
   - [`/api/providers`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/app/api/providers/route.ts): Enforced via `verifyAuthAndRole(request, "ADMIN")`.
   - [`/api/settings/api`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/app/api/settings/api/route.ts) & test endpoint: Enforced via `verifyAuthAndRole(request, "ADMIN")`.

3. **Creator-Safe Projection on `/api/factory-state`**:
   - When requested by non-admins, returns `surface: "creator"`, exposing only personal generation jobs, engine availability, and pipeline readiness.
   - Completely omits internal fields: `activeProviders`, `events`, `queues`, `factoryOS` runtime stats, and SRE load metrics.

---

## 5. Navigation & UI Separation

1. **Brand Identity**:
   - The application navigation is branded as **ShortForge**.
2. **Basic Creator Navigation Plane**:
   - **ShortForge**: Create Video, Dashboard.
   - **Content Engines**: Quiz, GK, History, Coding, Motivation, Psychology, News, Reddit, Story.
   - **Library**: Templates, My Videos, Assets, Projects.
   - **Publishing & Analytics**: Publish, Analytics, Settings.
   - No FactoryOS control plane elements exist in the DOM or sidebar.
3. **Admin / Owner Navigation Plane**:
   - Contains all creator surfaces.
   - Includes a dedicated, visually distinct **FACTORYOS CONTROL PLANE** section with an `ADMIN` badge, organizing Operations, Intelligence, Observability, and Administration.

---

## 6. Creator Status Projection

Underlying execution stages (F1-F7, DAG nodes, worker phases) are translated via [`apps/web/lib/presentation/JobStatusProjection.ts`](file:///c:/Users/ASUS/OneDrive/Desktop/123/aishorts/apps/web/lib/presentation/JobStatusProjection.ts):

| Internal State / Floor | Creator Projected Status |
|---|---|
| F0 / F1 / Research / Strategy | **Planning** |
| F2 / Script Writing | **Writing Script** |
| F3 / Visuals & Chunks | **Generating Visuals** |
| F4 / Voice Synthesis | **Synthesizing Voice** |
| F5 / Composition & Timeline | **Composing Timeline** |
| F6 / Local Render Execution | **Rendering Video** |
| F7 / Forensic Verification | **Verifying Final Video** |
| Completed / F7 Verified | **Ready** |
| Failed / Execution Error | **Needs Attention** |

*No synthetic telemetry or fabricated percentages are emitted; the presentation is an authentic projection of real underlying state.*

---

## 7. Verification Evidence

### 1. Automated Vitest Suite (`tests/product-boundary.test.ts`)
- **14 / 14 tests passing** in `apps/web`:
  - Route classification guarantees `/factory/templates` and `/factory/jobs` remain creator surfaces.
  - Navigation isolation verifies pure creator navigation for `USER` and combined planes for `ADMIN`.
  - Middleware server-side enforcement verifies 307 redirects for unauthorized UI routes.
  - Internal API authorization gates verify 401/403 for unauthenticated and basic users.
  - `/api/factory-state` verified to project creator-safe state without leaks.

### 2. Live Running HTTP Server Verification (`http://localhost:3000`)
Executed live against Next.js Turbopack development server:
```text
=== LIVE SERVER VERIFICATION (http://localhost:3000) ===
1. Basic user -> /factory/workflows: status = 307 location = /dashboard?denied=operator_access
2. Admin user -> /factory/workflows: status = 200
3. Basic user -> /factory/templates: status = 200
4. Basic user -> /factory/jobs: status = 200
5. Basic user -> /api/models: status = 403 (expected: 403)
6. Admin user -> /api/models: status = 200 (expected: 200)
7. Basic user -> /api/providers: status = 403 (expected: 403)
8. Admin user -> /api/providers: status = 200 (expected: 200)
9. Basic user -> /api/settings/api: status = 403 (expected: 403)
10. Admin user -> /api/settings/api: status = 200 (expected: 200)
11. Basic user -> /api/factory-state: status = 200 surface = creator hasProviders = false hasQueues = false
12. Admin user -> /api/factory-state: status = 200 surface = factory hasProviders = true hasQueues = true
=== LIVE BOUNDARY VERIFICATION COMPLETE ===
```

---

## 8. Remaining Limitations & Next Steps

1. **Distributed Compute Activation**:
   - Provider adapters (Local, Kaggle, Lightning AI, GitHub Actions) must be wired into the `ComputeFabric` without requiring active cloud credentials during foundation builds.
2. **Template Single Source of Truth**:
   - Re-export canonical definitions from `apps/web/lib/templates` into `testing/templates` to eliminate duplicate definitions.
3. **Final End-to-End Qualification**:
   - Execute canonical 5-template test batch (`facts.rapid-facts.v1`, `history.timeline.v1`, `motivation.story-to-lesson.v1`, `reddit.story.v1`, `news.why-it-matters.v1`) to verify local physical MP4 generation and F7 compliance.
