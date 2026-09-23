# Workflows: Distribution & Publishing Workflow

> **Status**: OPERATIONAL  
> **Adapters**: Google Drive, YouTube Shorts API, Direct Download  

---

## 1. Distribution Sequence
1. Upon successful Floor 07 verification, video artifact is enqueued into the Delivery Outbox.
2. If Google Drive export is configured, `DriveDeliveryAdapter` uploads the artifact with an idempotency key (`idem_deliv_job_*`).
3. Outbox ensures zero duplicate uploads through atomic transaction checks.
4. Download URLs are attached to the job manifest for frontend retrieval.
