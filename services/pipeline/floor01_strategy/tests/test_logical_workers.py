"""Unit tests for Floor 01 logical workers."""

import pytest

from floor01_strategy.app.domain.handoff import BloomLevel, Floor01Input, UniquenessVerdict
from floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
from floor01_strategy.app.logical_workers.content_planner import ContentPlannerWorker
from floor01_strategy.app.logical_workers.curriculum_mapper import CurriculumMapperWorker
from floor01_strategy.app.logical_workers.strategy_planner import StrategyPlannerWorker
from floor01_strategy.app.logical_workers.topic_intelligence import (
    TopicIntelligenceWorker,
    calculate_jaccard_similarity,
    extract_keywords,
)


def test_jaccard_similarity_calculation():
    tokens_a = extract_keywords("Python Variables & Memory Allocation")
    tokens_b = extract_keywords("Python Variables Explained")
    tokens_c = extract_keywords("Ancient Roman History Empires")

    sim_high = calculate_jaccard_similarity(tokens_a, tokens_b)
    sim_low = calculate_jaccard_similarity(tokens_a, tokens_c)

    assert sim_high > 0.3
    assert sim_low == 0.0


def test_topic_intelligence_worker_memory_unseen():
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    mem_store.add_record("Quantum Computing Fundamentals", "plan-0")

    worker = TopicIntelligenceWorker(memory_store=mem_store)
    inp = Floor01Input(topic_query="Python Decorators")
    res = worker.run(inp)

    assert res.selected_topic == "Python Decorators"
    assert res.category == "computer_science"
    assert res.uniqueness_verdict == UniquenessVerdict.MEMORY_UNSEEN
    assert res.similarity_risk_score < 0.45
    assert len(res.provenance) >= 1


test_topic_intelligence_worker_duplicate_data = [
    ("Python Decorators Explained", UniquenessVerdict.DUPLICATE_IN_MEMORY),
]


@pytest.mark.parametrize("topic_query,expected_verdict", test_topic_intelligence_worker_duplicate_data)
def test_topic_intelligence_worker_duplicate(topic_query, expected_verdict):
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    mem_store.add_record("Python Decorators Explained", "plan-1")

    worker = TopicIntelligenceWorker(memory_store=mem_store)
    inp = Floor01Input(topic_query=topic_query)
    res = worker.run(inp)

    assert res.uniqueness_verdict == expected_verdict
    assert res.similarity_risk_score >= 0.75


def test_strategy_planner_worker_platform_specs():
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    topic_worker = TopicIntelligenceWorker(memory_store=mem_store)
    inp = Floor01Input(topic_query="Space Black Holes", platform="linkedin_video")
    topic_res = topic_worker.run(inp)

    strat_worker = StrategyPlannerWorker()
    strat_res = strat_worker.run(inp, topic_res)

    assert strat_res.target_audience == "general_learners"
    assert strat_res.platform == "linkedin_video"
    assert strat_res.target_duration_seconds == 120
    assert strat_res.platform_spec["cta_type"] == "connect_and_discuss"
    assert len(strat_res.provenance) == 1


def test_content_planner_worker():
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    topic_worker = TopicIntelligenceWorker(memory_store=mem_store)
    inp = Floor01Input(topic_query="Python Variables", content_format="quiz_short")
    topic_res = topic_worker.run(inp)

    strat_worker = StrategyPlannerWorker()
    strat_res = strat_worker.run(inp, topic_res)

    plan_worker = ContentPlannerWorker()
    plan_res = plan_worker.run(inp, topic_res, strat_res)

    assert "Python Variables" in plan_res.core_objective
    assert "Hook Card" in plan_res.structural_outline
    assert "Comment your score" in plan_res.cta_direction
    assert "Hook Card" in plan_res.pacing_guidance


def test_curriculum_mapper_worker_dependency_tree():
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    topic_worker = TopicIntelligenceWorker(memory_store=mem_store)
    inp = Floor01Input(topic_query="Python Decorators & Wrapper Functions", learning_level="advanced")
    topic_res = topic_worker.run(inp)

    curr_worker = CurriculumMapperWorker()
    curr_res = curr_worker.run(inp, topic_res)

    assert curr_res.difficulty_level == "advanced"
    assert curr_res.bloom_taxonomy_level == BloomLevel.ANALYZE
    assert "Functions as First-Class Objects" in curr_res.concept_dependencies
    assert len(curr_res.prerequisites) > 0
