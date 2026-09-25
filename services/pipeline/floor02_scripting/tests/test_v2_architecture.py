"""Regression tests for the production F02 v2 cognitive architecture."""

from floors.floor02_scripting.app.core.config import settings
from floors.floor02_scripting.app.domain.script_ir import BeatType
from floors.floor02_scripting.app.domain.handoff import Floor02Input
from floors.floor02_scripting.app.infrastructure.llm_narrative_adapter import LLMNarrativeAdapter
from floors.floor02_scripting.app.infrastructure.memory_store import ScriptMemoryStore
from floors.floor02_scripting.app.logical_workers.narrative_engine import NarrativeCompiler
from floors.floor02_scripting.app.pipeline import Floor02Pipeline
from floors.floor02_scripting.tests.test_handoff import build_mock_floor01_payload


def _input(request_id: str = "req-v2-arch-1") -> Floor02Input:
    return Floor02Input(
        request_id=request_id,
        floor01_payload=build_mock_floor01_payload(),
        topic_query="Python Decorators",
        target_duration_seconds=60,
        strict_upstream=True,
    )


def test_v2_generates_bounded_candidate_set_and_compiles():
    compiler = NarrativeCompiler(adapter=LLMNarrativeAdapter())
    candidate, ir, mode, model, candidates = compiler.generate(_input(), strict=True)

    assert 1 <= len(candidates) <= settings.MAX_CANDIDATES
    assert candidate.candidate_id
    assert ir.schema_version == "2.0"
    assert ir.quality is not None
    assert ir.quality.accepted is True
    assert mode.value in {"DETERMINISTIC_FALLBACK", "MODEL"}
    assert model is None or isinstance(model, str)


def test_v2_has_causal_graph_viewer_state_and_structured_visual_intent():
    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None))
    payload = pipeline.execute(_input("req-v2-graph-1"))

    assert payload.script_ir is not None
    assert payload.script_ir.causal_events
    assert payload.script_ir.narrative_state.viewer_state.current_question
    assert all(scene.visual_intent_structured for scene in payload.scenes)
    assert any(beat.beat_type == BeatType.HOOK for beat in payload.script_ir.beats)
    assert any(beat.beat_type == BeatType.RETAIN for beat in payload.script_ir.beats)
    assert any(beat.beat_type == BeatType.PAYOFF for beat in payload.script_ir.beats)


def test_v2_pacing_uses_130_160_words_per_60_seconds():
    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None))
    payload = pipeline.execute(_input("req-v2-pacing-1"))
    words = sum(scene.word_count for scene in payload.scenes)

    minimum = round(60 * settings.MIN_WORDS_PER_MINUTE / 60)
    maximum = round(60 * settings.MAX_WORDS_PER_MINUTE / 60)
    assert minimum <= words <= maximum
    assert payload.quality_report is not None
    assert payload.quality_report.hard_gates["F02-C05"] is True


def test_v2_provenance_is_attached_to_scenes():
    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None))
    payload = pipeline.execute(_input("req-v2-prov-1"))

    assert payload.provenance
    assert payload.script_ir is not None
    assert payload.script_ir.provenance_refs
    assert all(scene.evidence_refs for scene in payload.scenes)


def test_v2_idempotency_fingerprint_rejects_same_request_different_input():
    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None))
    first = _input("req-v2-idem-1")
    pipeline.execute(first)

    conflicting = _input("req-v2-idem-1")
    conflicting.topic_query = "Different Topic"

    try:
        pipeline.execute(conflicting)
    except Exception as exc:
        assert "Idempotency conflict" in str(exc)
    else:
        raise AssertionError("Expected idempotency conflict")


def test_v2_simulation_is_the_only_place_topic_only_execution_is_allowed():
    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None))
    simulation_input = Floor02Input(
        request_id="req-v2-sim-1",
        topic_query="Simulation Topic",
        strict_upstream=False,
    )
    payload = pipeline.execute(simulation_input, strict_rejection=False)
    assert payload.handoff_status.value == "VALIDATED"
