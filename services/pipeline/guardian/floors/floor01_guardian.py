"""Floor 01 Guardian adapter."""

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

from floors.floor01_strategy.app.domain.handoff import Floor01Input
from floors.floor01_strategy.app.pipeline import Floor01Pipeline

logger = structlog.get_logger(__name__)

FLOOR_ID = "floor01_strategy"


def create_floor01_capability_registry() -> CapabilityRegistry:
    registry = CapabilityRegistry(floor_id=FLOOR_ID)
    pipeline = Floor01Pipeline()

    def run_strategy_pipeline(params: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        inp = context["floor01_input"]
        payload = pipeline.execute(inp)
        context["handoff_payload"] = payload.model_dump()
        return {
            "status": "success",
            "script_topic": payload.topic.selected_topic,
            "platform": payload.strategy.platform,
            "candidate_id": payload.selected_candidate_id,
            "quality_score": payload.decision_quality_score,
            "handoff_status": payload.handoff_status.value,
        }

    registry.register(
        Capability(
            name="strategy_pipeline_worker",
            floor_id=FLOOR_ID,
            description="Executes the canonical Floor 01 Strategy Pipeline",
            handler=run_strategy_pipeline,
        )
    )
    return registry


class Floor01Guardian:
    """Guardian wrapper around canonical F01 execution."""

    def __init__(self, reasoning_engine: Optional[ReasoningEngine] = None):
        self.registry = create_floor01_capability_registry()
        self.engine = GuardianEngine(
            floor_id=FLOOR_ID,
            registry=self.registry,
            reasoning_engine=reasoning_engine,
        )

    def execute(
        self,
        inp: Floor01Input,
        execution_mode: ExecutionMode = ExecutionMode.HYBRID,
    ) -> GuardianReport:
        logger.info("floor01_guardian_executing", request_id=inp.request_id)
        input_hash = hashlib.sha256(
            inp.model_dump_json(exclude_none=True).encode("utf-8")
        ).hexdigest()
        initial_context = {"floor01_input": inp}

        return self.engine.run_autonomous_loop(
            request_id=inp.request_id,
            objective=f"Plan curriculum & content strategy for topic: {inp.topic_query or 'general'}",
            input_contract_hash=input_hash,
            initial_context=initial_context,
            execution_mode=execution_mode,
        )
