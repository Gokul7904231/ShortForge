"""Floor 02 (Scripting Brain) Guardian Adapter for FactoryOS Autonomous Guardian System."""

from __future__ import annotations

import hashlib
from typing import Any, Dict, Optional

import structlog

from factoryos.guardian.capabilities.models import Capability
from factoryos.guardian.capabilities.registry import CapabilityRegistry
from factoryos.guardian.contracts.guardian_report import GuardianReport
from factoryos.guardian.contracts.guardian_state import ExecutionMode
from factoryos.guardian.core.guardian import GuardianEngine
from factoryos.guardian.reasoning.base import ReasoningEngine

# Frozen Floor 02 Core Ingestion
from floors.floor02_scripting.app.domain.handoff import Floor02Input
from floors.floor02_scripting.app.pipeline import Floor02Pipeline

logger = structlog.get_logger(__name__)


def create_floor02_capability_registry() -> CapabilityRegistry:
    """Build authoritative capability registry wrapping frozen Floor 02 capabilities."""
    registry = CapabilityRegistry(floor_id="floor02_scripting")
    pipeline = Floor02Pipeline()

    def run_scripting_pipeline(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        inp = context["floor02_input"]
        payload = pipeline.execute(inp)
        context["handoff_payload"] = payload.model_dump()
        return {"status": "success", "script_id": payload.script_id, "scene_count": len(payload.scenes)}

    registry.register(
        Capability(
            name="scripting_pipeline_worker",
            floor_id="floor02_scripting",
            description="Executes deterministic Floor 02 Scripting & Narrative Pipeline",
            handler=run_scripting_pipeline,
        )
    )
    return registry


class Floor02Guardian:
    """Floor 02 Autonomous Scripting Brain Guardian."""

    def __init__(self, reasoning_engine: Optional[ReasoningEngine] = None):
        self.registry = create_floor02_capability_registry()
        self.engine = GuardianEngine(
            floor_id="floor02_scripting",
            registry=self.registry,
            reasoning_engine=reasoning_engine,
        )

    def execute(
        self,
        inp: Floor02Input,
        execution_mode: ExecutionMode = ExecutionMode.HYBRID,
    ) -> GuardianReport:
        """Execute Floor 02 Autonomous Guardian loop around frozen Floor 02 core."""
        logger.info("floor02_guardian_executing", request_id=inp.request_id)
        input_hash = hashlib.sha256(inp.request_id.encode("utf-8")).hexdigest()
        initial_context = {"floor02_input": inp}

        return self.engine.run_autonomous_loop(
            request_id=inp.request_id,
            objective=f"Generate narrative script and scenes for request: {inp.request_id}",
            input_contract_hash=input_hash,
            initial_context=initial_context,
            execution_mode=execution_mode,
        )
