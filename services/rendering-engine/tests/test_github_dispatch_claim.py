"""Tests for the render dispatcher's queue-claim client.

Covers the failure-visibility contract of
`services/rendering-engine/scripts/github_dispatch_claim.py`:
missing configuration must fail closed *before* any network access, and an
empty queue must stay distinguishable from a broken claim.
"""

from __future__ import annotations

import io
import json
import os
import sys
import tempfile
import unittest
import urllib.error
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from unittest import mock

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR.parent / "scripts"))

import github_dispatch_claim as claim_mod  # noqa: E402

SECRET = "test-worker-secret-value"
CONTROL_PLANE = "https://control-plane.test"
JOB_TOKEN = "exec_deadbeefdeadbeefdeadbeef"


class FakeResponse:
    def __init__(self, payload: bytes, status: int = 200):
        self._payload = payload
        self.status = status

    def read(self) -> bytes:
        return self._payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *exc) -> bool:
        return False


def http_error(code: int, body: bytes) -> urllib.error.HTTPError:
    return urllib.error.HTTPError(
        f"{CONTROL_PLANE}/api/rendering/claim", code, "err", {}, io.BytesIO(body)
    )


class ClaimClientTest(unittest.TestCase):
    """Each test drives main() with a patched transport and a captured log."""

    def run_claim(self, env_overrides, payload=None, exc=None):
        """Returns (exit_code, stdout, stderr, requests_seen)."""
        requests: list = []

        def fake_urlopen(request, timeout=None):
            requests.append(request)
            if exc is not None:
                raise exc
            return FakeResponse(payload if payload is not None else b"{}")

        env = {
            "CONTROL_PLANE_URL": CONTROL_PLANE,
            "RENDER_WORKER_SECRET": SECRET,
            "DISPATCH_JOB_ID": "",
        }
        env.update(env_overrides)
        # GITHUB_OUTPUT is only present when a test supplies one.
        for key in ("GITHUB_OUTPUT",):
            env.pop(key, None)

        with tempfile.TemporaryDirectory() as tmp:
            if env_overrides.get("GITHUB_OUTPUT"):
                env["GITHUB_OUTPUT"] = str(Path(tmp) / "out.txt")
            out, err = io.StringIO(), io.StringIO()
            with mock.patch.dict(os.environ, env, clear=True):
                with mock.patch.object(claim_mod, "_urlopen", fake_urlopen):
                    with redirect_stdout(out), redirect_stderr(err):
                        code = claim_mod.main()
            outputs = ""
            output_file = Path(env["GITHUB_OUTPUT"]) if env_overrides.get("GITHUB_OUTPUT") else None
            if output_file is not None and output_file.exists():
                outputs = output_file.read_text(encoding="utf-8")

        return code, out.getvalue(), err.getvalue(), requests, outputs

    # --- Fail closed before any API access --------------------------------

    def test_missing_secret_fails_closed_without_network_access(self):
        code, _, err, requests, _ = self.run_claim({"RENDER_WORKER_SECRET": ""})
        self.assertEqual(code, 2)
        self.assertEqual(requests, [], "no request may be made without a secret")
        self.assertIn("RENDER_WORKER_SECRET is not configured", err)

    def test_whitespace_only_secret_fails_closed(self):
        code, _, err, requests, _ = self.run_claim({"RENDER_WORKER_SECRET": "   \n "})
        self.assertEqual(code, 2)
        self.assertEqual(requests, [])
        self.assertIn("RENDER_WORKER_SECRET is not configured", err)

    def test_missing_control_plane_url_fails_closed(self):
        code, _, err, requests, _ = self.run_claim({"CONTROL_PLANE_URL": ""})
        self.assertEqual(code, 2)
        self.assertEqual(requests, [])
        self.assertIn("CONTROL_PLANE_URL is not configured", err)

    # --- Direct dispatch cannot silently become a generic claim -----------

    def test_named_job_dispatch_is_refused_and_claims_nothing(self):
        code, _, err, requests, _ = self.run_claim({"DISPATCH_JOB_ID": "abc12345"})
        self.assertEqual(code, 3)
        self.assertEqual(requests, [], "must not fall back to a generic queue claim")
        self.assertIn("abc12345", err)
        self.assertIn("cannot claim a named job", err)

    # --- Ordinary outcomes -------------------------------------------------

    def test_empty_queue_is_an_ordinary_no_work_outcome(self):
        payload = json.dumps(
            {"success": True, "claimed": False, "workerPool": "github-actions"}
        ).encode()
        code, out, _, requests, outputs = self.run_claim(
            {"GITHUB_OUTPUT": "1"}, payload=payload
        )
        self.assertEqual(code, 0)
        self.assertEqual(len(requests), 1)
        self.assertIn("claimed=false", outputs)
        self.assertNotIn("claimed=true", outputs)
        self.assertIn("No queued basic video jobs", out)

    def test_successful_claim_publishes_job_and_token_outputs(self):
        payload = json.dumps(
            {
                "success": True,
                "claimed": True,
                "job": {"jobId": "job_12345678", "executionToken": JOB_TOKEN},
            }
        ).encode()
        code, _, _, _, outputs = self.run_claim({"GITHUB_OUTPUT": "1"}, payload=payload)
        self.assertEqual(code, 0)
        self.assertIn("claimed=true", outputs)
        self.assertIn("job_id=job_12345678", outputs)
        self.assertIn(f"execution_token={JOB_TOKEN}", outputs)

    def test_request_is_authenticated_and_targets_the_claim_endpoint(self):
        payload = json.dumps({"success": True, "claimed": False}).encode()
        _, _, _, requests, _ = self.run_claim({"GITHUB_OUTPUT": "1"}, payload=payload)
        request = requests[0]
        self.assertTrue(request.full_url.endswith("/api/rendering/claim"))
        self.assertEqual(request.get_header("Authorization"), f"Bearer {SECRET}")
        self.assertEqual(json.loads(request.data)["workerPool"], "github-actions")

    # --- Failures must be visible, never an empty queue -------------------

    def test_http_401_fails_visibly(self):
        code, _, err, _, outputs = self.run_claim(
            {"GITHUB_OUTPUT": "1"},
            exc=http_error(401, b'{"success":false,"error":"Unauthorized"}'),
        )
        self.assertEqual(code, 4)
        self.assertIn("HTTP 401", err)
        self.assertNotIn("claimed=false", outputs)

    def test_http_500_fails_visibly(self):
        code, _, err, _, _ = self.run_claim(
            {"GITHUB_OUTPUT": "1"},
            exc=http_error(500, b'{"success":false,"error":"misconfigured"}'),
        )
        self.assertEqual(code, 4)
        self.assertIn("HTTP 500", err)

    def test_network_timeout_fails_visibly(self):
        code, _, err, _, _ = self.run_claim(
            {"GITHUB_OUTPUT": "1"}, exc=urllib.error.URLError("timed out")
        )
        self.assertEqual(code, 4)
        self.assertIn("Claim request failed", err)

    def test_non_json_response_fails_visibly(self):
        code, _, err, _, _ = self.run_claim(
            {"GITHUB_OUTPUT": "1"}, payload=b"<html>gateway error</html>"
        )
        self.assertEqual(code, 4)
        self.assertIn("non-JSON", err)

    def test_unrecognised_response_shape_fails_visibly(self):
        code, _, err, _, _ = self.run_claim(
            {"GITHUB_OUTPUT": "1"}, payload=json.dumps({"ok": True}).encode()
        )
        self.assertEqual(code, 4)
        self.assertIn("unrecognised response shape", err)

    def test_success_false_fails_visibly(self):
        code, _, err, _, _ = self.run_claim(
            {"GITHUB_OUTPUT": "1"},
            payload=json.dumps({"success": False, "error": "boom"}).encode(),
        )
        self.assertEqual(code, 4)
        self.assertIn("boom", err)

    def test_claimed_without_token_fails_visibly(self):
        code, _, err, _, outputs = self.run_claim(
            {"GITHUB_OUTPUT": "1"},
            payload=json.dumps(
                {"success": True, "claimed": True, "job": {"jobId": "job_12345678"}}
            ).encode(),
        )
        self.assertEqual(code, 4)
        self.assertIn("without a jobId/executionToken", err)
        self.assertNotIn("claimed=true", outputs)

    # --- Secret hygiene ----------------------------------------------------

    def test_secret_and_token_never_reach_the_log(self):
        payload = json.dumps(
            {
                "success": True,
                "claimed": True,
                "job": {"jobId": "job_12345678", "executionToken": JOB_TOKEN},
            }
        ).encode()
        # No GITHUB_OUTPUT: stdout is the only sink, and it must stay clean.
        code, out, err, _, _ = self.run_claim({}, payload=payload)
        self.assertEqual(code, 0)
        self.assertNotIn(SECRET, out)
        self.assertNotIn(SECRET, err)
        self.assertNotIn(JOB_TOKEN, out)
        self.assertNotIn(JOB_TOKEN, err)

    def test_secret_is_redacted_from_error_bodies(self):
        code, _, err, _, _ = self.run_claim(
            {"GITHUB_OUTPUT": "1"},
            exc=http_error(401, f'{{"error":"bad {SECRET}"}}'.encode()),
        )
        self.assertEqual(code, 4)
        self.assertNotIn(SECRET, err)
        self.assertIn("***", err)


if __name__ == "__main__":
    unittest.main()
