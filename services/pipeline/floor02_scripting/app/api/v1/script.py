"""HTTP API for canonical Floor 02.

Production routes require authentication, bounded payloads, strict Floor 01
handoff ingestion, deterministic validation, and canonical ScriptIR output.
"""

from __future__ import annotations

import json
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from floors.floor02_scripting.app.core.config import settings
from floors.floor02_scripting.app.core.exceptions import Floor02Error
from floors.floor02_scripting.app.core.security import (
    enforce_body_limit,
    rate_limiter,
    sanitize_input_text,
    verify_api_key,
)
from floors.floor02_scripting.app.domain.handoff import Floor02HandoffPayload, Floor02Input
from floors.floor02_scripting.app.service import Floor02Service

router = APIRouter(prefix="/v1/script", tags=["Floor 02 - Cognitive Scripting"])
service = Floor02Service()


class RegenerateSceneRequest(BaseModel):
    current_payload: Floor02HandoffPayload
    target_scene_id: str = Field(..., min_length=1, max_length=128)
    regeneration_instruction: Optional[str] = Field(default=None, max_length=1000)


def check_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    if not rate_limiter.is_allowed(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded",
        )


def _bounded_response(payload: Any) -> Any:
    encoded = json.dumps(payload.model_dump(mode="json") if hasattr(payload, "model_dump") else payload)
    if len(encoded.encode("utf-8")) > settings.MAX_RESPONSE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Floor 02 response exceeded configured size bound",
        )
    return payload


@router.post(
    "/plan",
    response_model=Floor02HandoffPayload,
    dependencies=[Depends(verify_api_key), Depends(check_rate_limit), Depends(enforce_body_limit)],
)
def plan_script_endpoint(inp: Floor02Input) -> Floor02HandoffPayload:
    try:
        inp.topic_query = sanitize_input_text(inp.topic_query)
        if not inp.floor01_payload:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Floor 01 handoff is mandatory for production scripting",
            )
        return _bounded_response(service.plan_script(inp, strict_rejection=True))
    except HTTPException:
        raise
    except Floor02Error as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/execution-report",
    response_model=Dict[str, Any],
    dependencies=[Depends(verify_api_key), Depends(check_rate_limit), Depends(enforce_body_limit)],
)
def generate_execution_report_endpoint(inp: Floor02Input) -> Dict[str, Any]:
    try:
        inp.topic_query = sanitize_input_text(inp.topic_query)
        if not inp.floor01_payload:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Floor 01 handoff is mandatory for production scripting",
            )
        payload, report = service.generate_execution_report(inp, strict_rejection=True)
        result = {"handoff_payload": payload.model_dump(mode="json"), "execution_report": report.model_dump(mode="json")}
        encoded = json.dumps(result)
        if len(encoded.encode("utf-8")) > settings.MAX_RESPONSE_BYTES:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Response exceeds Floor 02 limit")
        return result
    except HTTPException:
        raise
    except Floor02Error as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/regenerate-scene",
    response_model=Floor02HandoffPayload,
    dependencies=[Depends(verify_api_key), Depends(check_rate_limit), Depends(enforce_body_limit)],
)
def regenerate_scene_endpoint(req: RegenerateSceneRequest) -> Floor02HandoffPayload:
    try:
        instruction = sanitize_input_text(req.regeneration_instruction) if req.regeneration_instruction else None
        payload = req.current_payload
        if payload.script_ir is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Legacy F02 payload cannot be regenerated; recompile it through the canonical F02 pipeline first",
            )
        inp = Floor02Input(
            request_id=payload.request_id,
            topic_query=payload.title,
            target_duration_seconds=payload.target_duration_seconds,
            narrative_format=payload.format,
            words_per_second=2.5,
            strict_upstream=False,
        )
        return _bounded_response(
            service.regenerate_scene(
                current_payload=payload,
                target_scene_id=req.target_scene_id,
                regeneration_instruction=instruction,
                inp=inp,
            )
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
