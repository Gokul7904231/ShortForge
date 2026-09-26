"""Floor 05 Timeline Composition Brain Guardian Adapter."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, Optional
from uuid import uuid4

import structlog

from factoryos.guardian.capabilities.models import Capability
from factoryos.guardian.capabilities.registry import CapabilityRegistry
from factoryos.guardian.contracts.guardian_report import GuardianReport
from factoryos.guardian.contracts.guardian_state import ExecutionMode
from factoryos.guardian.core.guardian import GuardianEngine
from floors.floor05_timeline_composition.app.domain.handoff import Floor05HandoffPayload, Floor05Input
from floors.floor05_timeline_composition.app.services.pipeline import Floor05PipelineService

logger = structlog.get_logger(__name__)


def build_floor05_registry(pipeline_service: Optional[Floor05PipelineService] = None) -> CapabilityRegistry:
    """Build allowlist capability registry for Floor 05 Timeline Composition & Video Assembly."""
    service = pipeline_service or Floor05PipelineService()
    registry = CapabilityRegistry(floor_id="floor05")

    def run_timeline_pipeline_handler(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        inp = context["input_data"]
        handoff = service.run_pipeline(inp)
        context["handoff_payload"] = handoff.model_dump()
        return {
            "status": "success",
            "request_id": handoff.request_id,
            "timeline_id": handoff.timeline_spec.timeline_id,
            "render_job_id": handoff.render_job.render_job_id,
            "render_input_hash": handoff.render_job.render_input_hash,
            "video_path": handoff.rendered_video_path,
        }

    registry.register(
        Capability(
            name="timeline_composition_pipeline_worker",
            floor_id="floor05",
            description="Executes timeline composition, video rendering, double validation, and transaction commit",
            handler=run_timeline_pipeline_handler,
        )
    )
    return registry


class Floor05Guardian:
    """Autonomous Guardian for Floor 05 Timeline Composition & Video Assembly."""

    def __init__(self, pipeline_service: Optional[Floor05PipelineService] = None):
        self.pipeline_service = pipeline_service or Floor05PipelineService()
        self.registry = build_floor05_registry(self.pipeline_service)
        self.engine = GuardianEngine(floor_id="floor05", registry=self.registry)

    def execute(self, input_data: Floor05Input) -> GuardianReport:
        """Run autonomous Guardian execution loop for Floor 05."""
        req_id = input_data.request_id or f"req-f05-g-{uuid4()}"
        initial_context = {"input_data": input_data}

        report = self.engine.run_autonomous_loop(
            request_id=req_id,
            objective="Assemble TimelineSpec, execute reference video render, verify physical/semantic output, and prepare Floor 07 handoff",
            input_contract_hash=hashlib.sha256(
                f"{input_data.floor03_payload.asset_plan_ir.plan_fingerprint if input_data.floor03_payload.asset_plan_ir else input_data.floor03_payload.asset_plan_id}:
{input_data.floor04_payload.provenance_hash}".encode("utf-8")
            ).hexdigest(),
            initial_context=initial_context,
            execution_mode=input_data.execution_mode,
        )

        return report
