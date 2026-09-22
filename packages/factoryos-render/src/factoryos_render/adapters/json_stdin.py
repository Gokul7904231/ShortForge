"""
JSON Stdin/Stdout Adapter for FactoryOS Node/TypeScript integration.
Guarantees clean machine-readable stdout and directs diagnostic logs to stderr.
"""

import sys
import json
import traceback
from typing import Dict, Any
from ..engine.renderer import Renderer
from ..contracts.render_intent import RenderIntent
from ..diagnostics.doctor import SystemDoctor

class JsonAdapter:
    def __init__(self, renderer: Renderer):
        self.renderer = renderer

    def process_stdin(self) -> None:
        try:
            raw_input = sys.stdin.read()
            if not raw_input.strip():
                self._send_error("EMPTY_INPUT", "Received empty input from stdin")
                return

            req = json.loads(raw_input)
            protocol_version = req.get("protocolVersion", "1.0")
            request_id = req.get("requestId", "req_unknown")
            command = req.get("command", "render")

            if command == "doctor":
                doctor = SystemDoctor(self.renderer.ffmpeg.ffmpeg_path)
                diag = doctor.run_diagnostics()
                self._send_success(request_id, {"diagnostics": diag})
                return

            if command == "render":
                intent_data = req.get("renderIntent")
                if not intent_data:
                    self._send_error("MISSING_INTENT", "Missing renderIntent in request payload", request_id)
                    return

                intent = RenderIntent.from_dict(intent_data)
                receipt = self.renderer.render(
                    intent=intent,
                    run_id=req.get("runId"),
                    progress_callback=lambda msg, cur, tot: sys.stderr.write(f"[RENDER_PROGRESS] {cur}/{tot}: {msg}\n")
                )
                self._send_success(request_id, {"receipt": receipt.to_dict()})
                return

            self._send_error("UNKNOWN_COMMAND", f"Unsupported command: {command}", request_id)

        except Exception as e:
            sys.stderr.write(f"[FATAL_RENDER_ERROR] {traceback.format_exc()}\n")
            self._send_error("EXECUTION_ERROR", str(e))

    def _send_success(self, request_id: str, data: Dict[str, Any]) -> None:
        payload = {
            "protocolVersion": "1.0",
            "requestId": request_id,
            "status": "COMPLETED",
            **data
        }
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()

    def _send_error(self, code: str, message: str, request_id: str = "req_unknown") -> None:
        payload = {
            "protocolVersion": "1.0",
            "requestId": request_id,
            "status": "FAILED",
            "error": {
                "code": code,
                "message": message,
                "retryable": False
            }
        }
        sys.stdout.write(json.dumps(payload) + "\n")
        sys.stdout.flush()
