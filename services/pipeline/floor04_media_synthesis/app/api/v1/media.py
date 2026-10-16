"""Authenticated Floor 04 media execution and verified artifact retrieval endpoints."""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import FileResponse

from factoryos.guardian.contracts.guardian_state import GuardianLifecycleState
from factoryos.guardian.contracts.guardian_report import GuardianReport
from floors.floor04_media_synthesis.app.core.security import verify_api_key
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload, Floor04Input

router = APIRouter(prefix="/v1/media", tags=["Floor 04 Media Synthesis"])


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _public_handoff(handoff: Floor04HandoffPayload) -> Dict[str, Any]:
    """Return asset metadata while withholding paths from the F04 service filesystem."""
    payload = handoff.model_dump(mode="json")
    for key in ("synthesized_visual_assets", "synthesized_audio_assets"):
        for asset in payload.get(key, []):
            asset.pop("file_path", None)
    background = payload.get("background_audio_asset")
    if isinstance(background, dict):
        background.pop("file_path", None)
    return payload


def _public_report(report: GuardianReport) -> Dict[str, Any]:
    """Expose the execution decision summary, not untrusted worker path details."""
    status_value = report.status.value if hasattr(report.status, "value") else str(report.status)
    mode_value = report.execution_mode.value if hasattr(report.execution_mode, "value") else str(report.execution_mode)
    return {
        "report_id": str(report.report_id),
        "execution_id": str(report.execution_id),
        "request_id": report.request_id,
        "floor_id": report.floor_id,
        "floor_version": report.floor_version,
        "status": status_value,
        "execution_mode": mode_value,
        "duration_ms": report.duration_ms,
        "step_count": report.step_count,
        "decision_count": report.decision_count,
        "action_count": report.action_count,
        "retry_count": report.retry_count,
        "recovery_count": report.recovery_count,
        "warnings": list(report.warnings),
        "errors": list(report.errors),
    }


@router.get("/health", status_code=status.HTTP_200_OK)
def health_check() -> Dict[str, str]:
    """Service liveness only; this endpoint does not claim provider readiness."""
    return {
        "status": "healthy",
        "floor_id": "floor04_media_synthesis",
        "version": "2.0.0",
    }


def _valid_request_id(value: str) -> bool:
    return bool(
        value
        and len(value) <= 200
        and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:-]{0,199}", value)
        and ".." not in value
    )


@router.post("/execution-report", status_code=status.HTTP_200_OK)
def execute_media(
    inp: Floor04Input,
    request: Request,
    _api_key: str = Depends(verify_api_key),
) -> Dict[str, Any]:
    """Execute authorized F04 synthesis and return a lineage-checked media handoff."""
    if inp.request_id is not None and not _valid_request_id(inp.request_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Floor 04 request identity.")
    guardian = request.app.state.guardian
    try:
        report = guardian.execute(inp)
    except Exception as exc:
        # Do not disclose provider secrets, local paths, or stack traces to callers.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Floor 04 execution failed ({type(exc).__name__}).",
        ) from exc

    completed = report.status == GuardianLifecycleState.COMPLETED
    if not completed or not isinstance(report.handoff_payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Floor 04 Guardian did not produce a completed physical-media handoff.",
        )

    try:
        handoff = Floor04HandoffPayload.model_validate(report.handoff_payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Floor 04 Guardian emitted an invalid media handoff.",
        ) from exc

    source_plan = inp.floor03_payload.asset_plan_ir
    expected_fingerprint = source_plan.plan_fingerprint or source_plan.source_fingerprint
    if handoff.source_asset_plan_fingerprint != expected_fingerprint:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Floor 03/Floor 04 lineage mismatch.")

    expected_visual = {asset.asset_id for asset in inp.floor03_payload.visual_asset_requirements}
    actual_visual = {asset.asset_id for asset in handoff.synthesized_visual_assets}
    expected_audio = {asset.asset_id for asset in inp.floor03_payload.audio_asset_requirements}
    actual_audio = {asset.asset_id for asset in handoff.synthesized_audio_assets}
    if actual_visual != expected_visual or actual_audio != expected_audio:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Floor 04 returned an incomplete or unexpected source-asset set.",
        )

    return {
        "handoff_payload": _public_handoff(handoff),
        "execution_report": _public_report(report),
    }


@router.get("/assets/{asset_id}/content")
def download_validated_asset(
    request: Request,
    asset_id: str,
    request_id: str = Query(..., min_length=1, max_length=200),
    sha256: str = Query(..., min_length=64, max_length=64),
    _api_key: str = Depends(verify_api_key),
) -> FileResponse:
    """Stream one committed F04 asset only when request identity and physical bytes match."""
    if not re.fullmatch(r"[a-f0-9]{64}", sha256):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid SHA-256 encoding.")

    if not _valid_request_id(request_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Floor 04 request identity.")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{0,199}", asset_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Floor 04 asset identity.")

    guardian = request.app.state.guardian
    record = guardian.pipeline_service.registry.get_asset(asset_id)
    if (
        not record
        or record.validation_status != "VALIDATED"
        or record.generation_request_id != request_id
        or record.sha256_checksum != sha256
    ):
        # Use 404 to avoid disclosing whether a foreign asset ID exists.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validated media asset not found.")

    storage_root = Path(request.app.state.storage_root).resolve()
    try:
        path = Path(record.storage_path).resolve(strict=True)
    except (OSError, RuntimeError):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validated media asset is missing.")

    if storage_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Asset path is outside the media storage root.")

    try:
        stat = path.stat()
        actual_digest = _sha256_file(path)
    except OSError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Validated media asset is unavailable.")

    if stat.st_size != record.file_size_bytes or actual_digest != record.sha256_checksum:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Physical media failed integrity revalidation.")

    return FileResponse(
        path=str(path),
        media_type=record.mime_type,
        headers={
            "Cache-Control": "no-store",
            "X-Asset-Id": record.asset_id,
            "X-Content-SHA256": record.sha256_checksum,
            "X-Source-Spec-Hash": record.source_spec_hash,
            "X-Asset-Byte-Length": str(record.file_size_bytes),
        },
    )
