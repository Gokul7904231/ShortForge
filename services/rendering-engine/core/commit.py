#!/usr/bin/env python3
"""
ShortForge Worker Commit Boundary (Single Commit Path)
======================================================
Workers execute only and NEVER write application state (e.g. Firestore).
They emit a staged result.json with artifact SHA-256 + probe + timings,
then POST to the fenced control-plane callback.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any, Dict, Optional

import requests


def compute_file_sha256(file_path: Path) -> str:
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def emit_staged_result(
    *,
    job_id: str,
    out_dir: Path,
    artifact_path: Path,
    probe: Dict[str, Any],
    timings: Dict[str, Any],
    extra: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if not artifact_path.exists():
        raise FileNotFoundError(f"Cannot stage missing artifact: {artifact_path}")

    artifact_sha256 = compute_file_sha256(artifact_path)
    byte_length = artifact_path.stat().st_size

    payload: Dict[str, Any] = {
        "jobId": job_id,
        "status": "staged",
        "artifactSha256": artifact_sha256,
        "byteLength": byte_length,
        "probe": probe,
        "timings": timings,
    }
    if extra:
        for k, v in extra.items():
            if k not in ("status", "jobId", "artifactSha256", "byteLength"):
                payload[k] = v

    out_dir.mkdir(parents=True, exist_ok=True)
    result_path = out_dir / "result.json"
    result_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


def post_fenced_callback(
    *,
    callback_url: str,
    worker_id: str,
    worker_secret: str,
    execution_token: str,
    execution_id: str,
    attempt_id: int,
    staged_result: Dict[str, Any],
    cas_uri: Optional[str] = None,
    timeout: int = 30,
) -> Dict[str, Any]:
    if not isinstance(attempt_id, int) or attempt_id <= 0:
        raise ValueError(f"attempt_id must be a positive integer, got {attempt_id!r}")

    body = {
        "workerId": worker_id,
        "executionToken": execution_token,
        "executionId": execution_id,
        "jobId": staged_result["jobId"],
        "status": "COMPLETED",
        "attemptId": attempt_id,
        "exitCode": 0,
        "sha256Proof": staged_result["artifactSha256"],
        "byteLength": staged_result["byteLength"],
        "casUri": cas_uri,
        "metrics": {
            "stagedStatus": staged_result.get("status", "staged"),
            "timings": staged_result.get("timings", {}),
            "probe": staged_result.get("probe", {}),
        },
    }
    headers = {
        "Authorization": f"Bearer {worker_secret}",
        "Content-Type": "application/json",
    }
    resp = requests.post(callback_url, json=body, headers=headers, timeout=timeout)
    if resp.status_code >= 400:
        raise RuntimeError(f"Fenced callback rejected with HTTP {resp.status_code}: {resp.text}")
    try:
        return resp.json()
    except Exception:
        return {"success": True, "statusCode": resp.status_code}
