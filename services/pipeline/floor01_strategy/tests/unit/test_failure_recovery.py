"""Unit tests for failure recovery, error handling, and threshold enforcement."""

import pytest

from floor01_strategy.app.core.config import get_settings
from floor01_strategy.app.core.exceptions import (
    DuplicateTopicError,
    LowConfidenceError,
    UnsupportedFormatError,
    UnsupportedPlatformError,
)
from floor01_strategy.app.domain.handoff import Floor01Input, HandoffStatus
from floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
from floor01_strategy.app.pipeline import Floor01Pipeline


def test_unsupported_platform_error():
    pipeline = Floor01Pipeline()
    inp = Floor01Input(topic_query="Topic", platform="unsupported_platform_xyz")

    with pytest.raises(UnsupportedPlatformError) as exc_info:
        pipeline.execute(inp)

    assert "unsupported_platform_xyz" in str(exc_info.value)
    assert exc_info.value.retryable is False


def test_unsupported_format_error():
    pipeline = Floor01Pipeline()
    inp = Floor01Input(topic_query="Topic", content_format="unsupported_format_abc")

    with pytest.raises(UnsupportedFormatError) as exc_info:
        pipeline.execute(inp)

    assert "unsupported_format_abc" in str(exc_info.value)
    assert exc_info.value.retryable is False


def test_strict_duplicate_topic_rejection():
    memory = StrategyMemoryStore()
    memory.clear()
    memory.add_record("Python Decorators & Memory", "plan-1")

    pipeline = Floor01Pipeline(memory_store=memory)
    inp = Floor01Input(topic_query="Python Decorators & Memory")

    # Strict rejection enabled -> raises DuplicateTopicError
    with pytest.raises(DuplicateTopicError) as exc_info:
        pipeline.execute(inp, strict_rejection=True)

    assert exc_info.value.similarity_score >= 0.75
    assert exc_info.value.matched_topic == "Python Decorators & Memory"

    # Non-strict mode -> returns payload with REJECTED status
    payload = pipeline.execute(inp, strict_rejection=False)
    assert payload.handoff_status == HandoffStatus.REJECTED
