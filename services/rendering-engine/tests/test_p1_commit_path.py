#!/usr/bin/env python3
"""
TDD Suite for Phase P1 — Single Commit Path & Fail-Closed Worker Hardening
===========================================================================
"""

import json
import re
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ENGINE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ENGINE_DIR / "scripts"
sys.path.insert(0, str(ENGINE_DIR))
sys.path.insert(0, str(SCRIPTS_DIR))


def test_worker_source_zero_firestore_writes_and_zero_synthetic_urls():
    """Static assertion: create_short.py has zero Firestore writes, zero synthetic URLs, zero completed status."""
    src = (SCRIPTS_DIR / "create_short.py").read_text(encoding="utf-8")

    forbidden_url = "storage.factoryos.app" + "/renders"
    assert forbidden_url not in src, "Forbidden synthetic URL still present"
    assert "firestore.client()" not in src, "Worker must NEVER instantiate firestore.client()"
    assert '.collection("videos")' not in src, "Worker must NEVER write to Firestore videos collection"
    assert not re.search(r'["\']status["\']\s*:\s*["\']completed["\']', src), (
        "Worker must NEVER emit status: completed"
    )
    assert not re.search(r'["\']status["\']\s*:\s*["\']processing["\']', src), (
        "Worker must NEVER write status: processing"
    )


def test_upload_failure_retains_artifact_and_fails_closed(tmp_path, monkeypatch):
    """Forced Cloudinary failure must fail closed, retain local artifact, and never fabricate completed/URL."""
    import create_short

    out_dir = tmp_path / "job_fail_001"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_final = out_dir / "final.mp4"
    out_final.write_bytes(b"FAKE_MP4_BYTES_" * 200)
    out_thumb = out_dir / "thumbnail.png"
    out_srt = out_dir / "subtitles.srt"

    def fail_upload(*args, **kwargs):
        raise RuntimeError("Simulated Cloudinary 503 outage")

    monkeypatch.setattr(create_short.cloudinary.uploader, "upload", fail_upload)
    monkeypatch.delenv("BASIC_RENDER_LOCAL_ONLY", raising=False)

    with pytest.raises(RuntimeError):
        create_short._finalize_render_and_upload(
            job_id="job_fail_001",
            out_dir=out_dir,
            out_final=out_final,
            out_thumbnail=out_thumb,
            out_srt=out_srt,
            timings={"step4_render_sec": 1.2},
            subtitle_meta={"renderProfile": "STANDARD_SHORTS", "fps": 30, "resolution": "1080x1920"},
            probe={"duration": 10.0, "playable": True, "audioDetected": True},
            cache_hits=0,
            cache_misses=1,
        )

    assert out_final.exists(), "Local artifact must be retained when upload fails"
    res_path = out_dir / "result.json"
    if res_path.exists():
        data = json.loads(res_path.read_text(encoding="utf-8"))
        assert data.get("status") != "completed"
        assert "storage.factoryos.app" not in json.dumps(data)


def test_commit_module_emits_result_and_posts_fenced_callback(tmp_path, monkeypatch):
    """core/commit.py emits result.json with sha256 and posts to fenced InstaBox callback."""
    from core.commit import emit_staged_result, post_fenced_callback

    out_dir = tmp_path / "job_commit_001"
    out_dir.mkdir(parents=True, exist_ok=True)
    artifact = out_dir / "final.mp4"
    artifact.write_bytes(b"VALID_MP4_PAYLOAD_" * 100)

    probe = {"duration": 12.0, "playable": True, "audioDetected": True}
    timings = {"step4_render_sec": 2.5}

    staged = emit_staged_result(
        job_id="job_commit_001",
        out_dir=out_dir,
        artifact_path=artifact,
        probe=probe,
        timings=timings,
    )
    assert staged["jobId"] == "job_commit_001"
    assert staged["status"] == "staged"
    assert len(staged["artifactSha256"]) == 64
    assert staged["byteLength"] == artifact.stat().st_size
    assert staged["probe"] == probe
    assert staged["timings"] == timings
    assert (out_dir / "result.json").exists()

    # Fenced callback POST
    captured = {}

    class FakeResp:
        def __init__(self, status_code, payload):
            self.status_code = status_code
            self._payload = payload
            self.text = json.dumps(payload)

        def json(self):
            return self._payload

    def fake_post(url, json=None, headers=None, timeout=None):
        captured["url"] = url
        captured["json"] = json
        captured["headers"] = headers
        return FakeResp(200, {"success": True, "casDigest": staged["artifactSha256"]})

    import requests
    monkeypatch.setattr(requests, "post", fake_post)

    ack = post_fenced_callback(
        callback_url="https://control.shortforge.test/api/rendering/instabox/callback",
        worker_id="instabox-1",
        worker_secret="secret-xyz",
        execution_token="tok-123",
        execution_id="exec-123",
        attempt_id=1,
        staged_result=staged,
    )
    assert ack["success"] is True
    assert captured["json"]["status"] == "COMPLETED"
    assert captured["json"]["metrics"]["stagedStatus"] == "staged"
    assert captured["json"]["attemptId"] == 1
    assert captured["json"]["sha256Proof"] == staged["artifactSha256"]
    assert captured["json"]["executionToken"] == "tok-123"

    # Rejects 409 stale/superseded callback without swallowing error
    monkeypatch.setattr(
        requests,
        "post",
        lambda *a, **kw: FakeResp(409, {"success": False, "error": "Stale attemptId"}),
    )
    with pytest.raises(RuntimeError, match="409"):
        post_fenced_callback(
            callback_url="https://control.shortforge.test/api/rendering/instabox/callback",
            worker_id="instabox-1",
            worker_secret="secret-xyz",
            execution_token="tok-123",
            execution_id="exec-123",
            attempt_id=1,
            staged_result=staged,
        )


def test_image_cache_key_includes_model_dims_steps_toolchain():
    """Image cache key must vary with model, width, height, steps, and toolchain hash."""
    import create_short

    k1 = create_short._compute_image_cache_key("prompt", "flux", 1024, 1024, 4, "tc-v1")
    k_model = create_short._compute_image_cache_key("prompt", "sdxl", 1024, 1024, 4, "tc-v1")
    k_dims = create_short._compute_image_cache_key("prompt", "flux", 720, 1280, 4, "tc-v1")
    k_steps = create_short._compute_image_cache_key("prompt", "flux", 1024, 1024, 8, "tc-v1")
    k_tc = create_short._compute_image_cache_key("prompt", "flux", 1024, 1024, 4, "tc-v2")

    assert len({k1, k_model, k_dims, k_steps, k_tc}) == 5


def test_download_image_ssrf_guard(tmp_path):
    """_download_image must block loopback and metadata SSRF targets."""
    import create_short

    with pytest.raises(ValueError, match="SSRF"):
        create_short._download_image("http://127.0.0.1:8080/secret.png", tmp_path / "a.png")
    with pytest.raises(ValueError, match="SSRF"):
        create_short._download_image("http://169.254.169.254/latest/meta-data/", tmp_path / "b.png")
