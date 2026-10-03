#!/usr/bin/env python3
"""Minimal Jupyter kernel bridge used by the ShortForge Colab adapter.

This process runs locally. It connects to a Google Colab managed runtime using
the short-lived X-Colab-Runtime-Proxy-Token, starts one Python kernel, executes
one bounded command, collects stdout/stderr, and deletes the kernel.
"""

from __future__ import annotations

import base64
import json
import os
import sys
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import uuid

try:
    import websocket
except ImportError as exc:  # pragma: no cover - surfaced as structured runtime error
    print(
        json.dumps(
            {
                "exitCode": 2,
                "timedOut": False,
                "stdout": "",
                "stderr": "",
                "error": (
                    "Missing Python dependency 'websocket-client'. "
                    "Install it with: python -m pip install websocket-client"
                ),
            }
        )
    )
    sys.exit(2)


def env_required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def request_json(base_url: str, token: str, path: str, method: str = "GET", body=None):
    base = base_url if base_url.endswith("/") else base_url + "/"
    url = urllib.parse.urljoin(base, path.lstrip("/"))
    data = None
    headers = {
        "X-Colab-Runtime-Proxy-Token": token,
        "Accept": "application/json",
    }
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(url, method=method, data=data, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()
        if not payload:
            return {}
        return json.loads(payload.decode("utf-8"))


def create_kernel(base_url: str, token: str) -> str:
    model = request_json(
        base_url,
        token,
        "/api/kernels",
        method="POST",
        body={"name": "python3"},
    )
    kernel_id = model.get("id")
    if not kernel_id:
        raise RuntimeError("Jupyter did not return a kernel id.")
    return kernel_id


def delete_kernel(base_url: str, token: str, kernel_id: str) -> None:
    try:
        request_json(
            base_url,
            token,
            f"/api/kernels/{urllib.parse.quote(kernel_id, safe='')}",
            method="DELETE",
        )
    except Exception:
        # Cleanup is best-effort; the runtime itself is terminated by the caller.
        pass


def make_execute_message(code: str, session_id: str) -> dict:
    msg_id = str(uuid.uuid4())
    return {
        "channel": "shell",
        "header": {
            "msg_id": msg_id,
            "username": "shortforge",
            "session": session_id,
            "date": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "msg_type": "execute_request",
            "version": "5.3",
        },
        "parent_header": {},
        "metadata": {},
        "content": {
            "code": code,
            "silent": False,
            "store_history": False,
            "user_expressions": {},
            "allow_stdin": False,
            "stop_on_error": True,
        },
        "_request_msg_id": msg_id,
    }


def ws_url_for(base_url: str, kernel_id: str, session_id: str) -> str:
    parsed = urllib.parse.urlsplit(base_url)
    scheme = "wss" if parsed.scheme == "https" else "ws"
    root = urllib.parse.urlunsplit((scheme, parsed.netloc, parsed.path, "", ""))
    if not root.endswith("/"):
        root += "/"
    return urllib.parse.urljoin(
        root,
        (
            "api/kernels/"
            + urllib.parse.quote(kernel_id, safe="")
            + "/channels?session_id="
            + urllib.parse.quote(session_id, safe="")
        ),
    )


def collect_execution(base_url: str, token: str, kernel_id: str, code: str, timeout_ms: int):
    session_id = str(uuid.uuid4())
    message = make_execute_message(code, session_id)
    request_msg_id = message.pop("_request_msg_id")
    ws_url = ws_url_for(base_url, kernel_id, session_id)

    ws = websocket.create_connection(
        ws_url,
        timeout=max(5, timeout_ms / 1000.0),
        header=[f"X-Colab-Runtime-Proxy-Token: {token}"],
        enable_multithread=True,
    )

    stdout_chunks: list[str] = []
    stderr_chunks: list[str] = []
    execute_reply = None
    idle_seen = False
    deadline = time.monotonic() + timeout_ms / 1000.0

    try:
        ws.send(json.dumps(message))
        while time.monotonic() < deadline:
            remaining = max(0.1, deadline - time.monotonic())
            ws.settimeout(min(2.0, remaining))
            try:
                raw = ws.recv()
            except websocket.WebSocketTimeoutException:
                continue

            if raw is None:
                break

            if isinstance(raw, bytes):
                raw = raw.decode("utf-8")

            try:
                incoming = json.loads(raw)
            except json.JSONDecodeError:
                continue

            header = incoming.get("header", {})
            parent = incoming.get("parent_header", {})
            content = incoming.get("content", {})
            if parent.get("msg_id") != request_msg_id:
                continue

            msg_type = header.get("msg_type")
            channel = incoming.get("channel")

            if msg_type == "stream":
                text = str(content.get("text", ""))
                if content.get("name") == "stderr":
                    stderr_chunks.append(text)
                else:
                    stdout_chunks.append(text)
            elif msg_type in {"display_data", "execute_result"}:
                data = content.get("data", {})
                text = data.get("text/plain")
                if text:
                    stdout_chunks.append(str(text) + "\n")
            elif msg_type == "error":
                tb = content.get("traceback") or []
                stderr_chunks.append("\n".join(str(x) for x in tb) + "\n")
            elif channel == "shell" and msg_type == "execute_reply":
                execute_reply = content
            elif channel == "iopub" and msg_type == "status":
                if content.get("execution_state") == "idle":
                    idle_seen = True

            if execute_reply is not None and idle_seen:
                break
    finally:
        try:
            ws.close()
        except Exception:
            pass

    if execute_reply is None:
        return {
            "exitCode": 124,
            "timedOut": True,
            "stdout": "".join(stdout_chunks),
            "stderr": "".join(stderr_chunks),
            "error": "Timed out waiting for Jupyter execute_reply.",
        }

    status = execute_reply.get("status")
    exit_code = 0 if status == "ok" else 1
    return {
        "exitCode": exit_code,
        "timedOut": False,
        "stdout": "".join(stdout_chunks),
        "stderr": "".join(stderr_chunks),
        "error": None if status == "ok" else "Jupyter execute_reply reported an error.",
    }


def main() -> int:
    base_url = env_required("SHORTFORGE_COLAB_BASE_URL")
    token = env_required("SHORTFORGE_COLAB_RUNTIME_TOKEN")
    code_b64 = env_required("SHORTFORGE_COLAB_CODE_B64")
    timeout_ms = int(os.environ.get("SHORTFORGE_COLAB_TIMEOUT_MS", "900000"))

    try:
        code = base64.b64decode(code_b64.encode("ascii")).decode("utf-8")
        kernel_id = create_kernel(base_url, token)
        try:
            result = collect_execution(base_url, token, kernel_id, code, timeout_ms)
        finally:
            delete_kernel(base_url, token, kernel_id)

        print(json.dumps(result))
        return int(result.get("exitCode", 1))
    except urllib.error.HTTPError as exc:
        body = ""
        try:
            body = exc.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        print(
            json.dumps(
                {
                    "exitCode": 1,
                    "timedOut": False,
                    "stdout": "",
                    "stderr": "",
                    "error": f"Jupyter HTTP {exc.code}: {body[:800]}",
                }
            )
        )
        return 1
    except Exception as exc:
        print(
            json.dumps(
                {
                    "exitCode": 1,
                    "timedOut": False,
                    "stdout": "",
                    "stderr": "",
                    "error": f"{type(exc).__name__}: {exc}",
                    "traceback": traceback.format_exc(limit=5),
                }
            )
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
