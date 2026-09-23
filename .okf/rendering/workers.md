# Rendering: Render Workers & Execution Protocols

> **Status**: OPERATIONAL  
> **Protocols**: REST API (`/api/render/jobs`, `/api/rendering/claim`, `/api/rendering/callback`)  

---

## 1. Fast-API Render Worker Protocol
Dedicated Python FastAPI worker nodes running on Azure GPU virtual machines:
- **Enqueue**: Accepts POST `/api/render/jobs` with bearer token (`BASIC_RENDER_API_SECRET`).
- **Processing**: Pulls scene images, renders video with hardware-accelerated NVENC, mixes audio.
- **Callback**: Emits POST `/api/rendering/callback` with bearer token equal to `executionToken`.

## 2. Claim Worker Protocol
Pull-based headless render workers (e.g. GitHub Actions or internal bare-metal nodes):
- Polls POST `/api/rendering/claim` with `workerPool` and `x-worker-secret`.
- Obtains atomic exclusive lease on queued jobs.
- Returns rendered artifacts via callback endpoint.
