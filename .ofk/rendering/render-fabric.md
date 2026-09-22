# Rendering: The Render Fabric

> **Status**: OPERATIONAL  
> **Location**: `apps/web/lib/rendering/` & `apps/web/factoryos/core/overseer/OverseerControlPlane.ts`  

---

## 1. Overview & Architectural Role

The Render Fabric is an abstraction layer that decouples composition logic from physical rendering hardware. It handles job submission, lease claims, worker pool routing, and callback authorization.

### Key Capabilities:
- **Heterogeneous Worker Pools**: Supports local CPU/GPU composition, GitHub Actions headless runners, and dedicated high-performance Azure VM GPU nodes.
- **Fail-Closed Routing**: In production, rendering requests must route to authenticated cloud nodes; silent local fallback is forbidden to prevent silent CPU starvation on web servers.
- **Atomic Lease Claims**: Render workers poll or receive jobs using Firestore transactions (`runTransaction`), preventing race conditions and duplicate renders.
