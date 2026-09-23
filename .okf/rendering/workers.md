# Rendering: Distributed Render Workers & Protocol Specifications

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/lib/rendering/` & `apps/web/factoryos/core/rendering/`

---

## 1. Architectural Philosophy: Leased Worker Protocols

Floor 06 (Rendering & Media Encoding) orchestrates distributed execution across heterogeneous render workers using two distinct protocol models: **Push Workers** and **Pull Workers**.

Both models enforce strict distributed systems contracts:
1. **Exclusive Lease**: Only one worker may hold the processing lock for a specific render job at any given instant.
2. **Monotonic Fencing**: Every lease assignment increments the job's `fencingToken`. Callbacks presenting stale tokens are rejected.
3. **Cryptographic Validation**: Callbacks must present a valid execution token and a cryptographic SHA-256 digest of the produced MP4 file.

```
┌────────────────────────────────────────────────────────┐
│                   Compute Fabric Master                │
├───────────────────────────┬────────────────────────────┤
│  Protocol 1: Push (REST)  │  Protocol 2: Pull (Claim)  │
│  POST /api/render/jobs    │  POST /api/rendering/claim │
└─────────────┬─────────────┴─────────────┬──────────────┘
              │                           │
              ▼ Dispatch Job              ▼ Claim Job + Lease
┌───────────────────────────┐   ┌────────────────────────┐
│      FastAPI Worker       │   │    Headless Worker     │
│   (Cloud Dedicated GPU)   │   │  (CI/CD / Bare-Metal)  │
└─────────────┬─────────────┘   └─────────────┬──────────┘
              │                               │
              └───────────────┬───────────────┘
                              │ Signed Callback
                              ▼
┌────────────────────────────────────────────────────────┐
│               POST /api/rendering/callback             │
│  ├── Execution Token Verification                      │
│  ├── Fencing Token Match Verification                  │
│  └── Content SHA-256 Hash Verification                 │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Worker Protocols** | HTTP REST Push & Claim endpoints with execution tokens | Binary gRPC streaming with bidirectional multiplexed channels |
| **Worker Types** | FastAPI GPU service and GitHub Actions claim runner | Dynamic Nomad/Kubernetes worker pods autoscaled on GPU metrics |
| **Callback Security** | `crypto.timingSafeEqual` comparison over execution tokens | Mutual TLS (mTLS) with client certificate verification |

---

## 3. Worker Protocol Endpoints

### 1. Push Protocol (FastAPI Dedicated GPU Service)
- **Endpoint**: `POST /api/render/jobs`
- **Authentication**: `Bearer <BASIC_RENDER_API_SECRET>`
- **Payload**: Full job definition including `TimelineIR` manifest, scene image URLs, speech audio URL, and execution token.
- **Callback**: `POST /api/rendering/callback` with `{ jobId, executionToken, videoUrl, videoSizeMb, sha256 }`.

### 2. Pull Protocol (Claim Worker)
- **Endpoint**: `POST /api/rendering/claim`
- **Authentication**: `x-worker-secret: <WORKER_POOL_SECRET>`
- **Behavior**: Atomically claims the next pending render job with lease timeout.
- **Heartbeat**: Worker periodically calls `/api/rendering/heartbeat` to renew active lease.
- **Callback**: Calls `/api/rendering/callback` upon successful MP4 composition and upload.
