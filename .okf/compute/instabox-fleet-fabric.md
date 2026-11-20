# OKF Compute Specification: InstaBox Distributed Fleet Fabric

**ID:** `COMPUTE-INSTABOX-FLEET-V1`  
**Status:** `INTEGRATED`  
**Classification:** `DISTRIBUTED_COMPUTE_FABRIC`  
**Floor:** `Floor 06 (Rendering) & Floor 07 (Forensics & Verification)`

---

## 1. Fleet Hardware & Topology
- **Controller:** `box1` (Hosts the FactoryOS Control Plane and CAS registry)
- **Active Compute Nodes (11 nodes):** `box2`, `box3`, `box4`, `box5`, `box6`, `box7`, `box8`, `box10`, `box11`, `box12`, `box13`
- **Excluded Nodes:** `box9` is permanently decommissioned and excluded from registration and scheduling.
- **Node Specs:** ~4 vCPU, 7.8 GiB RAM, 20 GB Disk (CPU-only, no GPU acceleration).
- **Concurrency Policy:** Strictly bounded to 1 active render job per physical node.

---

## 2. Authentication & Protocol Layer
- **Communication Direction:** Strict outbound-only polling from nodes to control plane via HTTPS. No inbound SSH or Docker daemon ports required.
- **Authentication:** Dual-header secret authentication (`Authorization: Bearer <secret>` or `x-instabox-secret`) validated with constant-time equality (`safeEqual`).
- **Execution Leases:** Dynamic 15-minute lease with ephemeral 32-byte cryptographic execution tokens (`tok_...`) and monotonic attempt counters.
- **API Endpoints:**
  - `POST /api/rendering/instabox/heartbeat`: Live node health, OS, load, memory, and disk reporting.
  - `POST /api/rendering/instabox/claim`: Concurrency-safe atomic job claim.
  - `POST /api/rendering/instabox/progress`: Incremental progress reporting and lease renewal.
  - `POST /api/rendering/instabox/upload`: Binary streaming MP4 upload with SHA-256 validation.
  - `POST /api/rendering/instabox/callback`: Authoritative completion and failure callback.

---

## 3. Artifact Lineage, CAS & Forensic Media Verification
1. Output MP4 is encoded with FFmpeg in an isolated per-job temporary workspace.
2. Physical SHA-256 and byte length are computed across the raw output file.
3. Artifact is streamed to the control plane, re-hashed on arrival, and atomically committed to `ContentAddressedStore` (CAS).
4. `RenderArtifactVerifier` inspects the local CAS file, checking container type, dimensions (1080x1920), codecs (H.264 video, AAC audio), and frame rate.
5. `VerificationEngine` executes Layer 1 forensic audit and decode smoke test.
6. Only upon complete physical audit success is the job marked `COMPLETED`. No false completion receipts are ever permitted.
