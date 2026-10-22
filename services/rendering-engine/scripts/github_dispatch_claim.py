#!/usr/bin/env python3
"""Queue-claim client for the FactoryOS render dispatcher workflow.

This is the single claim call used by
`.github/workflows/factoryos-render-worker.yml`. It lives in a file (rather than
inline in the workflow) so the dispatch outcome handling is unit-testable.

Contract derived from `apps/web/app/api/rendering/claim/route.ts`:

    POST {CONTROL_PLANE_URL}/api/rendering/claim
    Authorization: Bearer {RENDER_WORKER_SECRET}
    body {"workerId": ..., "workerPool": "github-actions"}

    200 {"success": true, "claimed": false, ...}           -> queue empty
    200 {"success": true, "claimed": true, "job": {...}}   -> job.jobId, job.executionToken
    400 invalid/missing workerPool
    401 invalid render worker credentials
    500 server-side RENDER_WORKER_SECRET not configured

That endpoint accepts only `workerId` and `workerPool`; it cannot claim a
*named* job. The workflow-level `repository_dispatch` trigger was removed after
a producer audit found no in-repository emitter of `factoryos_render_job`; the
named-job guard below stays as a fail-closed defence for direct invocations.

Exit codes:
    0  claim resolved: either a job was claimed, or the queue was empty
    2  required configuration missing/empty (fail closed, no request made)
    3  caller asked for a specific job, which this backend cannot honour
    4  claim not established (HTTP error, timeout, DNS/TLS, unparseable response)
"""

from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

WORKER_POOL = "github-actions"
WORKER_ID = "gh-dispatcher-runner"
TIMEOUT_SECONDS = 30
ERROR_BODY_PREVIEW = 300

# Never written to a log sink, only to GITHUB_OUTPUT.
SENSITIVE_OUTPUT_KEYS = frozenset({"execution_token"})

# Patched by tests; kept as a module global so requests can be intercepted.
_urlopen = urllib.request.urlopen


def _redact(text: str, secret: str) -> str:
    if secret:
        text = text.replace(secret, "***")
    text = text.replace("\n", " ").strip()
    return text[:ERROR_BODY_PREVIEW]


def _log_error(message: str) -> None:
    # `::error::` surfaces the message as a GitHub annotation. Callers must pass
    # an already-redacted message: this function never sees the secret.
    print(f"::error::{message}", file=sys.stderr)


def _write_outputs(pairs: dict[str, str]) -> None:
    """Publish step outputs, masking sensitive values when there is no safe sink."""
    output_path = os.environ.get("GITHUB_OUTPUT")
    if not output_path:
        # No step-output file (local/manual run). stdout is a log sink, so the
        # execution token must not go to it.
        for key, value in pairs.items():
            print(f"{key}={'***' if key in SENSITIVE_OUTPUT_KEYS else value}")
        return
    with open(output_path, "a", encoding="utf-8") as handle:
        for key, value in pairs.items():
            handle.write(f"{key}={value}\n")


def _read_error_body(exc: urllib.error.HTTPError) -> str:
    try:
        return exc.read().decode("utf-8", errors="replace")
    except Exception:
        return ""


def main() -> int:
    secret = os.environ.get("RENDER_WORKER_SECRET", "").strip()
    control_plane_url = os.environ.get("CONTROL_PLANE_URL", "").strip()
    dispatch_job_id = os.environ.get("DISPATCH_JOB_ID", "").strip()

    # --- Preflight: fail closed before any network access. -------------------
    if not control_plane_url:
        _log_error(
            "CONTROL_PLANE_URL is not configured; refusing to claim a job."
        )
        return 2
    if not secret:
        _log_error(
            "RENDER_WORKER_SECRET is not configured; refusing to claim a job. "
            "The repository secret must be set (and rotated) by the operator."
        )
        return 2

    if dispatch_job_id:
        _log_error(
            f"repository_dispatch asked for job '{dispatch_job_id}', but "
            "/api/rendering/claim cannot claim a named job: it accepts only "
            "workerId and workerPool. Refusing to claim an unrelated queued job. "
            "Use the supported immediate path instead: "
            "POST /repos/<owner>/<repo>/actions/workflows/factoryos-basic-render.yml/dispatches "
            "with inputs jobId and executionToken."
        )
        return 3

    # --- Claim ---------------------------------------------------------------
    url = f"{control_plane_url.rstrip('/')}/api/rendering/claim"
    body = json.dumps({"workerId": WORKER_ID, "workerPool": WORKER_POOL}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {secret}",
        },
        method="POST",
    )

    try:
        with _urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        _log_error(
            f"Claim rejected with HTTP {exc.code}: {_redact(_read_error_body(exc), secret)}"
        )
        return 4
    except Exception as exc:
        # URLError, socket.timeout, DNS, TLS, connection reset.
        _log_error(
            f"Claim request failed: {type(exc).__name__}: {_redact(str(exc), secret)}"
        )
        return 4

    try:
        data = json.loads(raw)
    except ValueError:
        _log_error(f"Claim returned a non-JSON response: {_redact(raw, secret)}")
        return 4

    if not isinstance(data, dict) or "success" not in data:
        _log_error(
            f"Claim returned an unrecognised response shape: {_redact(raw, secret)}"
        )
        return 4

    if not data.get("success"):
        _log_error(f"Claim reported failure: {_redact(str(data.get('error', 'unknown')), secret)}")
        return 4

    # --- Ordinary no-work outcome: the dispatcher may finish normally. -------
    if not data.get("claimed"):
        print("No queued basic video jobs to process.")
        _write_outputs({"claimed": "false"})
        return 0

    # --- Claimed: the jobId/executionToken are authoritative server output. --
    job = data.get("job") or {}
    job_id = job.get("jobId")
    execution_token = job.get("executionToken")
    if not job_id or not execution_token:
        _log_error(
            "Claim reported claimed=true without a jobId/executionToken; "
            "refusing to dispatch an unverified job."
        )
        return 4

    print(f"Claimed job {job_id}.")
    _write_outputs(
        {"claimed": "true", "job_id": job_id, "execution_token": execution_token}
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
