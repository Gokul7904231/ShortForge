# Floor 01 Production Runbook

Date: 2026-09-25
Canonical floor: `floor01_strategy`
Implementation: `services/pipeline/floor01_strategy/`

## Authority

Floor 01 is a bounded strategy worker. Overseer remains lifecycle authority; Guardian, Slayer, Healer, F07, capability authorization, leases/fencing, and .okf policy remain authoritative outside F01.

F01 does not mint capabilities, bypass Guardian checks, certify media, publish artifacts, or replace F00 research.

## Canonical execution path

```
F00 ResearchPassport
    -> ResearchRuntime verification
    -> Floor01RuntimeAdapter
    -> POST /v1/plan
    -> typed ResearchContext
    -> Topic Intelligence + hybrid novelty
    -> Evidence Gate
    -> parallel model/curriculum preparation
    -> bounded StrategyCandidates
    -> deterministic evaluator
    -> Content Planner
    -> Floor01HandoffPayload
    -> F02
```

The LLM is a candidate generator only. The deterministic evaluator and typed handoff are authoritative.

## Production environment

Required:

```
FLOOR01_ENVIRONMENT=production
FLOOR01_SERVICE_API_KEY=<high-entropy service-to-service key>
FLOOR01_MEMORY_FILE_PATH=/persistent/floor01/memory.json
```

Optional:

```
FLOOR01_CORS_ORIGINS=<explicit comma-separated origins when browser access is required>
FLOOR01_LLM_API_KEY=<provider key>
FLOOR01_LLM_BASE_URL=<OpenAI-compatible endpoint>
FLOOR01_LLM_MODEL=<model identifier>
```

Production startup fails when `FLOOR01_SERVICE_API_KEY` is missing.

Do not reuse the service key as an LLM key. They are independent trust boundaries.

## API behavior

`GET /health` is intentionally unauthenticated for orchestration health checks.

`POST /v1/plan`, `POST /v1/plan/execution-report`, `POST /v1/evaluate-topic`, and `GET /v1/memory` are authenticated by `X-API-Key`.

The canonical plan and execution-report endpoints run in strict mode. Missing/insufficient F00 evidence or non-accepted strategy evaluation is not promoted as a production handoff.

The TypeScript Overseer adapter separately requires:
- `floor_id == floor01_strategy`
- `handoff_status == VALIDATED`

Any other status is rejected.

## Request safety

F01 applies:
- bounded text fields
- HTML/control-character removal
- common direct prompt-injection marker removal
- recursive bounded constraint sanitization
- a 256 KiB POST body guard
- bounded per-instance rate-limit state
- constant-time service API-key comparison
- non-root container execution
- production-only HSTS
- no-store responses
- disabled interactive OpenAPI docs in production

Input sanitization is defense-in-depth; it is not treated as a proof that arbitrary model providers are safe.

## Idempotency

Each request gets a SHA-256 fingerprint over the canonical request body excluding `request_id`.

A repeated request ID with changed parameters is rejected.

Concurrent processes writing the same request ID converge on one persisted canonical payload under the file lock.

Persistence errors fail the write instead of silently returning a non-durable success.

## Persistence

The current strategy memory implementation is a single-instance, file-backed durable store with:
- process locking
- atomic replacement
- corruption backup/recovery
- retention bounds
- request idempotency
- explicit runtime path configuration

Production deployment should mount the memory path on durable storage.

Do not horizontally scale F01 replicas until a shared strategy-memory backend is implemented and verified. The compatibility namespace `floors.floor01_strategy` is an import bridge, not a second implementation.

## Container

Build:

```bash
docker build -f services/pipeline/floor01_strategy/Dockerfile -t shortforge-floor01 .
```

Run with production configuration:

```bash
docker run --rm \
  -p 8000:8000 \
  -e FLOOR01_ENVIRONMENT=production \
  -e FLOOR01_SERVICE_API_KEY='<service-key>' \
  -e FLOOR01_MEMORY_FILE_PATH=/app/services/pipeline/floor01_strategy/data/memory.json \
  shortforge-floor01
```

The image runs as an unprivileged user and includes an HTTP health check.

## Verification gates

Required before promotion:
1. Floor 01 Python suite passes.
2. TypeScript typecheck and factory tests pass.
3. Production container smoke test passes.
4. Auth failure and validated-handoff checks pass.
5. Security review has no unresolved blocking finding.
6. The F01 branch evidence pack is updated.

Historical test counts are not used as current proof.

## Operational limits

The current architecture deliberately does not pretend to support:
- multi-node shared strategic memory
- autonomous unbounded deliberation
- automatic outcome-based strategy learning
- embedding-backed semantic retrieval without an explicitly configured provider
- replacement of Overseer lifecycle authority

Those are separate evolutions and must pass the same authority, reliability, security, and evaluation gates before promotion.
