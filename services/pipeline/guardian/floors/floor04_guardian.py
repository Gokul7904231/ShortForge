"""Floor 04 Media Synthesis Brain Guardian Adapter."""

from __future__ import annotations

from typing import Any, Dict, Optional
from uuid import uuid4

import structlog

from factoryos.guardian.capabilities.models import Capability
from factoryos.guardian.capabilities.registry import CapabilityRegistry
from factoryos.guardian.contracts.guardian_report import GuardianReport
from factoryos.guardian.contracts.guardian_state import ExecutionMode
from factoryos.guardian.core.guardian import GuardianEngine
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload, Floor04Input
from floors.floor04_media_synthesis.app.services.pipeline import Floor04PipelineService

logger = structlog.get_logger(__name__)


def build_floor04_registry(pipeline_service: Optional[Floor04PipelineService] = None) -> CapabilityRegistry:
    """Build allowlist capability registry for Floor 04 Media Synthesis."""
    service = pipeline_service or Floor04PipelineService()
    registry = CapabilityRegistry(floor_id="floor04")

    def run_media_pipeline_handler(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        inp = context["input_data"]
        handoff = service.execute_pipeline(inp)
        context["handoff_payload"] = handoff.model_dump()
        return {"status": "success", "request_id": handoff.request_id, "visual_count": len(handoff.synthesized_visual_assets)}

    registry.register(
        Capability(
            name="media_synthesis_pipeline_worker",
            floor_id="floor04",
            description="Executes authorized Floor 04 media synthesis with physical validation and provider/fallback policy",
            handler=run_media_pipeline_handler,
        )
    )
    return registry


class Floor04Guardian:
    """Autonomous Guardian for Floor 04 Media Synthesis & Provider Execution."""

    def __init__(self, pipeline_service: Optional[Floor04PipelineService] = None):
        self.pipeline_service = pipeline_service or Floor04PipelineService()
        self.registry = build_floor04_registry(self.pipeline_service)
        self.engine = GuardianEngine(floor_id="floor04", registry=self.registry)

    def execute(self, input_data: Floor04Input) -> GuardianReport:
        """Run autonomous Guardian execution loop for Floor 04."""
        req_id = input_data.request_id or f"req-f04-g-{uuid4()}"
        initial_context = {"input_data": input_data}

        report = self.engine.run_autonomous_loop(
            request_id=req_id,
            objective="Execute authorized media synthesis, physically validate artifacts, and assemble verified media package for Floor 05",
            input_contract_hash=(input_data.floor03_payload.asset_plan_ir.plan_fingerprint or input_data.floor03_payload.asset_plan_ir.source_fingerprint),
            initial_context=initial_context,
            execution_mode=input_data.execution_mode,
        )

        return report
