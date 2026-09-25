"""Floor 03 (Asset Brain) Guardian Adapter for FactoryOS Autonomous Guardian System."""

from __future__ import annotations

from typing import Any, Dict, Optional

import structlog

from factoryos.guardian.capabilities.models import Capability
from factoryos.guardian.capabilities.registry import CapabilityRegistry
from factoryos.guardian.contracts.guardian_report import GuardianReport
from factoryos.guardian.contracts.guardian_state import ExecutionMode
from factoryos.guardian.core.guardian import GuardianEngine
from factoryos.guardian.reasoning.base import ReasoningEngine

# Frozen Floor 03 Core Ingestion
from floors.floor03_asset_realization.app.domain.handoff import Floor03Input, Floor03HandoffPayload
from floors.floor03_asset_realization.app.pipeline import Floor03Pipeline
from floors.floor03_asset_realization.app.core.identity import request_fingerprint

logger = structlog.get_logger(__name__)


def create_floor03_capability_registry() -> CapabilityRegistry:
    """Build authoritative capability registry wrapping frozen Floor 03 capabilities."""
    registry = CapabilityRegistry(floor_id="floor03_asset_realization")
    pipeline = Floor03Pipeline()

    def run_asset_pipeline(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        inp = context["floor03_input"]
        payload = pipeline.execute(inp)
        context["handoff_payload"] = payload.model_dump()
        return {
            "status": "success",
            "asset_plan_id": payload.asset_plan_id,
            "resolved_platform": payload.resolved_platform,
            "total_visual_assets": payload.manifest.total_visual_assets,
            "total_audio_assets": payload.manifest.total_audio_assets,
        }

    registry.register(
        Capability(
            name="asset_pipeline_worker",
            floor_id="floor03_asset_realization",
            description="Executes deterministic Floor 03 Asset Specification & Realization Planning Pipeline",
            handler=run_asset_pipeline,
        )
    )
    return registry


class Floor03Guardian:
    """Floor 03 Autonomous Asset Realization Brain Guardian."""

    def __init__(self, reasoning_engine: Optional[ReasoningEngine] = None):
        self.registry = create_floor03_capability_registry()
        self.engine = GuardianEngine(
            floor_id="floor03",
            registry=self.registry,
            reasoning_engine=reasoning_engine,
        )

    def execute(
        self,
        inp: Floor03Input,
        execution_mode: ExecutionMode = ExecutionMode.HYBRID,
    ) -> GuardianReport:
        """Execute Floor 03 Autonomous Guardian loop around frozen Floor 03 core."""
        logger.info("floor03_guardian_executing", request_id=inp.request_id)
        input_hash = request_fingerprint(inp.request_id, inp.floor02_payload.script_id, inp.floor02_payload.script_version)
        initial_context = {"floor03_input": inp}

        return self.engine.run_autonomous_loop(
            request_id=inp.request_id,
            objective=f"Plan visual and audio asset requirements for script: {inp.floor02_payload.script_id}",
            input_contract_hash=input_hash,
            initial_context=initial_context,
            execution_mode=execution_mode,
        )
