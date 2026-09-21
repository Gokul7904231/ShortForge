---
id: lesson-render-worker-timeout
type: lesson
title: Render Worker Timeout & Callback Idempotency Mitigation
status: stable
stale_after: 2027-09-02T00:00:00Z
sources:
  - id: worker-script
    resource: services/rendering-engine/basic_render_worker.py
    title: Basic Render Worker Implementation
sf_id: lesson-render-worker-timeout
sf_lifecycle: active
sf_epistemic_state: observed
sf_verification_state: verified
epistemic_state: observed
verification: verified
created_at: 2026-09-02T14:30:00Z
updated_at: 2026-09-20T17:00:00Z
tags:
  - rendering
  - postmortem
  - lesson
  - reliability
sf_provenance:
  source_type: RUNTIME_EVENT
  source_id: incident-2026-09-02-worker-hang
  path: services/rendering-engine/basic_render_worker.py
  start_line: 180
  end_line: 230
  captured_at: 2026-09-02T14:30:00Z
provenance:
  source_type: RUNTIME_EVENT
  source_id: incident-2026-09-02-worker-hang
  path: services/rendering-engine/basic_render_worker.py
  start_line: 180
  end_line: 230
  captured_at: 2026-09-02T14:30:00Z
---

# Lesson: Render Worker Timeout & Callback Idempotency

## 1. Problem Description
During high concurrent load, multiple Whisper model loads in separate subprocesses caused worker CPU starvation, resulting in HTTP callback timeouts (>120s) between `basic_render_worker.py` and the Control Plane. Repeated retry attempts created duplicate callbacks and job state flapping.

## 2. Root Cause Analysis
1. Whisper model was re-instantiated in each subprocess rather than leveraging cached weights.
2. The Control Plane callback endpoint lacked idempotency locking, allowing late callbacks to overwrite subsequent job statuses.
3. Subprocess timeout was unbounded on long video scripts.

## 3. Verified Mitigation
1. Added process-level timeout (max 180s) to `create_short.py` subprocess execution.
2. In `POST /api/rendering/callback`, implemented atomic status check: if job status is already `COMPLETED`, ignore duplicate callbacks with 200 OK.
3. Added exponential backoff and maximum 3 retries in worker callback logic.
4. Pre-warmed `faster-whisper` model weights in worker startup.
