# Workflows: Distribution, Delivery & Publishing Pipeline

> **Status**: OPERATIONAL / CANONICAL  
> **Source Location**: `apps/web/factoryos/core/delivery/` & `apps/web/lib/delivery/`

---

## 1. Architectural Philosophy: Verified Delivery & Strict Idempotency

The final stage of the FactoryOS lifecycle is the secure distribution of verified short-form media to target publication endpoints (YouTube Shorts, TikTok, Instagram Reels, Google Drive, or Cloud Storage).

In automated distribution systems, transient network retries risk catastrophic duplicate uploads (e.g., publishing the same video multiple times to a public YouTube channel, triggering spam strikes or audience confusion).

FactoryOS enforces strict delivery invariants:
1. **Floor 07 Verification Gate**: Media artifacts cannot enter the delivery pipeline unless accompanied by a cryptographically signed Floor 07 `VerificationReceipt` certifying zero critical compliance defects.
2. **Idempotent Outbox Pattern**: Every publication dispatch uses an atomic idempotency key (`idem_deliv_job_*`) evaluated inside a transactional delivery outbox.
3. **Channel Credential Isolation**: OAuth refresh tokens and API secrets are never passed into general agent memory; they are injected solely within sandboxed delivery workers at dispatch time.

```
┌────────────────────────────────────────────────────────┐
│                   Verified Artifact                    │
│             (MP4 + Floor 07 Verification)              │
└───────────────────────────┬────────────────────────────┘
                            │ Enqueue
                            ▼
┌────────────────────────────────────────────────────────┐
│               Transactional Delivery Outbox            │
│  ├── Check Unique Idempotency Key (`idem_deliv_*`)     │
│  ├── Validate Content SHA-256 Digest                   │
│  └── Reserve Delivery Slot                             │
└───────────────────────────┬────────────────────────────┘
                            │ Authorized Dispatch
                            ▼
┌───────────────────┬───────────────────┬────────────────┐
│  YouTube Shorts   │      TikTok       │  Google Drive  │
│  API Publisher    │   API Publisher   │   Cloud Sync   │
└───────────────────┴───────────────────┴────────────────┘
                            │ Callback Receipt
                            ▼
┌────────────────────────────────────────────────────────┐
│               Delivery Receipt Confirmation            │
│    (External Video ID, Public URL, Timestamp, Hash)    │
└────────────────────────────────────────────────────────┘
```

---

## 2. CURRENT vs TARGET Architecture Status

| Architectural Dimension | CURRENT Implementation | TARGET Implementation |
|:------------------------|:-----------------------|:----------------------|
| **Delivery Outbox** | Transactional outbox pattern in `DeliveryManager` with idempotency keys | Distributed transactional message queue with exactly-once delivery guarantees |
| **Verification Gating** | Rejection of uncertified artifacts lacking Floor 07 approval | Cryptographic signature verification over artifact manifest and audit trail |
| **Credential Storage** | Environment variables and encrypted credential store | Hardware Security Module (HSM) / AWS Secrets Manager dynamic credential leasing |
| **Multi-Platform Dispatch**| YouTube Shorts API and Google Drive adapters | Direct automated publishing to TikTok, Instagram Reels, and X (Twitter) APIs |
| **Audience Telemetry** | Polling post-publish analytics via API hooks | Real-time automated webhook ingestion feeding viewer retention directly into `KnowledgeOS` |

---

## 3. Delivery Lifecycle & Safeguards

1. **Gate Verification**: Before queueing, the system validates that `job.status === 'VERIFIED'` and `job.receiptId` exists.
2. **Atomic Lock**: The outbox claims the job using `UPDATE delivery_outbox SET status = 'IN_FLIGHT' WHERE id = :id AND status = 'PENDING'`.
3. **Chunked Resumable Upload**: Large video binaries are uploaded via resumable byte-range chunk streams to handle network instability.
4. **Receipt Generation**: Upon confirmation from the platform API, a `DeliveryReceipt` is persisted, containing the platform's immutable video ID and canonical URL.
