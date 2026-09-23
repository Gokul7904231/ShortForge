# Rendering: Provider-Neutral Distributed Compute Fabric

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/rendering/` & `apps/web/lib/rendering/`

---

## 1. Architectural Philosophy: Provider-Neutral Distributed Media Rendering

In large-scale media production systems, tying render orchestration to a single proprietary cloud vendor creates operational vulnerability, cost inflation, and development friction.

FactoryOS implements a clean-room **Provider-Neutral Distributed Compute Fabric** (assimilated from distributed systems patterns in `orca`). The Compute Fabric completely decouples timeline composition (`TimelineIR`) from physical execution hardware:
1. **Heterogeneous Worker Pools**: Supports local workstation GPUs (NVIDIA NVENC, Apple Silicon VideoToolbox), containerized cloud GPU clusters, on-demand serverless instances, and CI/CD runners.
2. **Leases & Fencing Tokens**: Jobs are leased to workers with monotonically increasing fencing tokens. If a worker hangs and its lease expires, the scheduler safely re-assigns the job with a higher fencing token; any subsequent late callback from the zombie worker is rejected.
3. **Cryptographic Callbacks**: Worker callbacks must present a valid execution token, HMAC signature, and content SHA-256 digest of the uploaded MP4 artifact.
4. **CAS Ingestion**: Completed video files are validated against the `TimelineIR` specification and ingested directly into Content-Addressed Storage.

```
┌────────────────────────────────────────────────────────┐
│                   Floor 05 Composition                 │
│         (Compiles Canonical TimelineIR Manifest)       │
└───────────────────────────┬────────────────────────────┘
                            │ Dispatches Render Task
                            ▼
┌────────────────────────────────────────────────────────┐
│               Distributed Compute Fabric               │
│  ├── Issue Lease (Lease ID, Expiry, Fencing Token N)   │
│  ├── Select Worker Pool: Local GPU | Cloud VM | Cluster│
│  └── Monitor Heartbeats (30s Timeout Sweep)            │
└───────────────────────────┬────────────────────────────┘
                            │ Dispatched to Worker
                            ▼
┌───────────────────┬───────────────────┬────────────────┐
│   Local GPU Node  │   Cloud GPU Node  │  CI/CD Runner  │
│  (NVENC / Apple)  │  (Headless Linux) │ (Docker Worker)│
└───────────────────┴───────────────────┴────────────────┘
                            │ Signed Callback: Token + Digest
                            ▼
┌────────────────────────────────────────────────────────┐
│               Fabric Callback Validator                │
│  ├── Timing-Safe Token Equality Check                  │
│  ├── Validate Fencing Token == Current Active Lease    │
│  └── Verify SHA-256 of Received MP4 against Specs      │
└───────────────────────────┬────────────────────────────┘
                            │ Promote
                            ▼
┌────────────────────────────────────────────────────────┐
│             Floor 07 QA & Compliance Gate             │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Provider Independence**| Provider-neutral worker abstraction supporting local, REST, and pull pools | Multi-cloud dynamic spot arbitrage (AWS Spot / GCP Preemptible / RunPod) |
| **Fencing & Safety** | Monotonically increasing fencing tokens in lease manager | Linearizable distributed state store (etcd / Raft) with strict CAS locking |
| **Worker Protocols** | Push (REST `/api/render/jobs`) and Pull (Claim `/api/rendering/claim`) | High-performance gRPC / WebTransport streaming protocol |
| **Artifact Ingestion** | SHA-256 hash verification with CAS persistence | Chunked peer-to-peer torrent / IPFS asset distribution for distributed render nodes |

---

## 3. Distributed Invariants

- **Fencing Monotonicity**: A worker callback presenting fencing token $T$ is rejected if the job's current registered fencing token is $> T$.
- **Zero Local Starvation**: In production mode, web application servers never run high-load Remotion or FFmpeg video encoding in the main Node.js event loop.
- **Fail-Closed Verification**: The orchestrator will not mark Floor 06 as complete until the downloaded artifact's SHA-256 hash is independently confirmed.
