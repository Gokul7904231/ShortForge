"""FastAPI Router for Floor 01 Strategy & Intelligence endpoints with Security & Rate Limiting."""

from __future__ import annotations

import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status

from floors.floor01_strategy.app.core.config import get_settings
from floors.floor01_strategy.app.core.exceptions import Floor01Error
from floors.floor01_strategy.app.core.security import enforce_rate_limit, verify_api_key
from floors.floor01_strategy.app.domain.handoff import (
    Floor01HandoffPayload,
    Floor01Input,
    FloorExecutionReport,
    TopicIntelligenceResult,
)
from floors.floor01_strategy.app.service import Floor01Service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Strategy & Intelligence"], dependencies=[Depends(enforce_rate_limit)])
service = Floor01Service()


@router.post(
    "/v1/plan",
    response_model=Floor01HandoffPayload,
    summary="Generate Floor 01 Strategy & Intelligence Handoff Payload",
    description="Executes Floor 01 and returns the downstream Floor 02-ready Floor01HandoffPayload.",
    dependencies=[Depends(verify_api_key)],
)
def plan_strategy(payload: Floor01Input) -> Floor01HandoffPayload:
    """Submit topic query and constraints to receive a validated Floor01HandoffPayload."""
    try:
        return service.plan_strategy(payload)
    except Floor01Error as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": exc.message, "detail": exc.detail, "retryable": exc.retryable},
        )
    except Exception:
        logger.exception("floor01_plan_unhandled_error", extra={"request_id": payload.request_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Floor 01 execution failed", "request_id": payload.request_id},
        )


@router.post(
    "/v1/plan/execution-report",
    response_model=FloorExecutionReport,
    summary="Generate Canonical Overseer FloorExecutionReport",
    description="Executes Floor 01 and returns the canonical FloorExecutionReport for Overseer control plane audit.",
    dependencies=[Depends(verify_api_key)],
)
def generate_execution_report(payload: Floor01Input) -> FloorExecutionReport:
    """Submit topic query and constraints to receive the Overseer FloorExecutionReport."""
    try:
        _, report = service.generate_execution_report(payload)
        return report
    except Floor01Error as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": exc.message, "detail": exc.detail, "retryable": exc.retryable},
        )
    except Exception:
        logger.exception("floor01_execution_report_unhandled_error", extra={"request_id": payload.request_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Floor 01 execution failed", "request_id": payload.request_id},
        )


@router.post(
    "/v1/evaluate-topic",
    response_model=TopicIntelligenceResult,
    summary="Evaluate Topic Intelligence Standalone",
    description="Evaluates topic normalization, category classification, and hybrid similarity memory lookup.",
    dependencies=[Depends(verify_api_key)],
)
def evaluate_topic(payload: Floor01Input) -> TopicIntelligenceResult:
    """Evaluate topic intelligence standalone."""
    try:
        return service.evaluate_topic(payload)
    except Floor01Error as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": exc.message, "detail": exc.detail},
        )
    except Exception:
        logger.exception("floor01_evaluate_topic_unhandled_error", extra={"request_id": payload.request_id})
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "Floor 01 topic evaluation failed", "request_id": payload.request_id},
        )


@router.get(
    "/v1/memory",
    summary="List Historical Strategy Topics (Read Only)",
    description="Returns list of topics stored in Strategy Memory.",
    dependencies=[Depends(verify_api_key)],
)
def list_memory() -> Dict[str, Any]:
    """Return memory topic index."""
    topics = service.get_memory_topics()
    return {"count": len(topics), "topics": topics}


@router.get(
    "/health",
    summary="Floor 01 Diagnostics & Health Probe",
)
def health() -> Dict[str, Any]:
    """Returns Floor 01 status, version, and memory count."""
    settings = get_settings()
    return {
        "status": "healthy",
        "floor_id": settings.floor_id,
        "floor_name": settings.floor_name,
        "floor_version": settings.floor_version,
        "topics_in_memory": len(service.get_memory_topics()),
    }
