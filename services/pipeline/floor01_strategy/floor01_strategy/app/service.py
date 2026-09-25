"""Floor 01 Strategy Service.

Primary application layer entrypoint for executing Floor 01.
"""

from __future__ import annotations

from pathlib import Path
from typing import List, Optional, Tuple

from floor01_strategy.app.core.config import get_settings
from floor01_strategy.app.domain.handoff import (
    Floor01HandoffPayload,
    Floor01Input,
    FloorExecutionReport,
    TopicIntelligenceResult,
)
from floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
from floor01_strategy.app.pipeline import Floor01Pipeline


class Floor01Service:
    """Service facade for Floor 01 operations."""

    def __init__(
        self,
        memory_store: Optional[StrategyMemoryStore] = None,
    ) -> None:
        if memory_store is not None:
            self.memory_store = memory_store
        else:
            settings = get_settings()
            storage_path = Path(settings.memory_file_path)
            if not storage_path.is_absolute():
                storage_path = Path(__file__).resolve().parents[1] / storage_path
            self.memory_store = StrategyMemoryStore(storage_path=str(storage_path))
        self.pipeline = Floor01Pipeline(memory_store=self.memory_store)

    def plan_strategy(self, input_data: Floor01Input, strict_rejection: bool = False) -> Floor01HandoffPayload:
        """Execute Floor 01 strategy planning pipeline and return validated handoff payload."""
        return self.pipeline.execute(input_data, strict_rejection=strict_rejection)

    def generate_execution_report(
        self, input_data: Floor01Input, strict_rejection: bool = False
    ) -> Tuple[Floor01HandoffPayload, FloorExecutionReport]:
        """Execute Floor 01 pipeline and return both downstream handoff payload and Overseer report."""
        return self.pipeline.execute_with_report(input_data, strict_rejection=strict_rejection)

    def evaluate_topic(self, input_data: Floor01Input) -> TopicIntelligenceResult:
        """Evaluate topic intelligence standalone without running full strategy pipeline."""
        return self.pipeline.topic_worker.run(input_data)

    def get_memory_topics(self) -> List[str]:
        """Return list of historical topics stored in strategy memory."""
        return self.memory_store.get_all_topics()

    def clear_memory(self) -> None:
        """Clear strategy memory store."""
        self.memory_store.clear()
