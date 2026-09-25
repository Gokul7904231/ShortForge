"""Application service facade for canonical Floor 02."""

from __future__ import annotations

from typing import Optional, Tuple

from floors.floor02_scripting.app.domain.handoff import Floor02HandoffPayload, Floor02Input, FloorExecutionReport
from floors.floor02_scripting.app.infrastructure.memory_store import ScriptMemoryStore
from floors.floor02_scripting.app.logical_workers.narrative_engine import NarrativeCompiler
from floors.floor02_scripting.app.pipeline import Floor02Pipeline


class Floor02Service:
    """Stable application boundary; controllers never call workers directly."""

    def __init__(
        self,
        pipeline: Optional[Floor02Pipeline] = None,
        memory_store: Optional[ScriptMemoryStore] = None,
    ) -> None:
        self.memory_store = memory_store
        self.pipeline = pipeline or Floor02Pipeline(memory_store=memory_store)
        self.compiler = NarrativeCompiler()

    def plan_script(self, inp: Floor02Input, strict_rejection: bool = True) -> Floor02HandoffPayload:
        return self.pipeline.execute(inp, strict_rejection=strict_rejection)

    def generate_execution_report(
        self, inp: Floor02Input, strict_rejection: bool = True
    ) -> Tuple[Floor02HandoffPayload, FloorExecutionReport]:
        return self.pipeline.execute_with_report(inp, strict_rejection=strict_rejection)

    def regenerate_scene(
        self,
        current_payload: Floor02HandoffPayload,
        target_scene_id: str,
        regeneration_instruction: Optional[str],
        inp: Floor02Input,
    ) -> Floor02HandoffPayload:
        return self.compiler.regenerate_scene(
            current_payload=current_payload,
            target_scene_id=target_scene_id,
            instruction=regeneration_instruction,
            inp=inp,
        )
