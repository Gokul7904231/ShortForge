---
id: lesson-secret-redaction-hygiene
type: lesson
title: Strict Secret Redaction Boundary in Memory Persistence
status: stable
stale_after: 2027-09-10T00:00:00Z
sources:
  - id: auth-subsystem
    resource: apps/web/lib/auth/
    title: ShortForge Auth Subsystem
sf_id: lesson-secret-redaction-hygiene
sf_lifecycle: active
sf_epistemic_state: sourced
sf_verification_state: verified
epistemic_state: sourced
verification: verified
created_at: 2026-09-10T09:00:00Z
updated_at: 2026-09-20T17:00:00Z
tags:
  - security
  - memory
  - redaction
  - rbac
sf_provenance:
  source_type: AGENT_OBSERVATION
  source_id: sec-audit-2026-09-10
  path: apps/web/lib/auth/
  captured_at: 2026-09-10T09:00:00Z
provenance:
  source_type: AGENT_OBSERVATION
  source_id: sec-audit-2026-09-10
  path: apps/web/lib/auth/
  captured_at: 2026-09-10T09:00:00Z
---

# Lesson: Strict Secret Redaction Boundary in Memory Persistence

## 1. Problem Description
Autonomous agents recording operational summaries, error traces, and configuration states risk inadvertently persisting high-entropy secrets (e.g. `INTERNAL_API_SECRET_KEY`, `executionToken`, Gemini/Groq API keys, Clerk session tokens) into Git-tracked Markdown knowledge files or databases.

## 2. Invariants & Policy
1. **Never persist raw credentials**: No API key, bearer token, password, or HMAC token may enter the durable knowledge vault.
2. **Deterministic pre-persistence filtering**: All memory writing must pass through `MemoryWriter` regex sanitization before touching the filesystem or database.
3. **Redacted token mask**: Sensitive patterns are replaced deterministically with `[REDACTED_SECRET:type]`.
4. **Git commit safety**: The knowledge directory is continuously verified by `factory knowledge validate` to reject any accidental secret patterns.
