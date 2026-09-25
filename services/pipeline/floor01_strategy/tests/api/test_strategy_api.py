"""API Integration tests for Floor 01 endpoints including Overseer execution report."""

import pytest
from httpx import ASGITransport, AsyncClient

from floor01_strategy.main import app
from floor01_strategy.app.domain.handoff import ResearchContext, ResearchEvidenceRef


def verified_research_payload() -> dict:
    return {
        "passport_id": "pass_api_01",
        "mission_id": "mission_api_01",
        "integrity_verified": True,
        "confidence": 0.95,
        "source_count": 3,
        "verified_claim_count": 3,
        "unresolved_issue_count": 0,
        "key_findings": ["Evidence-backed finding for API integration coverage."],
        "recommended_hook": "Most people misunderstand this topic.",
        "hook_archetype": "CURIOSITY_GAP",
        "evidence": [
            {
                "evidence_id": "clm_api_01",
                "claim_id": "clm_api_01",
                "statement": "Observed source-backed fact.",
                "verification_status": "VERIFIED",
                "confidence": 0.95,
                "supporting_source_ids": ["src_api_01"],
                "source_quality": ["TIER_1_PRIMARY"],
            }
        ],
        "provenance": ["ResearchRuntime.verifyResearchPassport", "floor00_analyst"],
    }




@pytest.mark.asyncio
async def test_production_cors_does_not_default_to_localhost(monkeypatch):
    from floor01_strategy.app.core.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "environment", "production")
    monkeypatch.setattr(settings, "cors_origins", [])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.options(
            "/v1/plan",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.asyncio
async def test_malformed_content_length_is_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.post(
            "/v1/plan",
            headers={"Content-Length": "not-a-number", "X-API-Key": "anonymous_dev"},
            json={"topic_query": "Python decorators"},
        )
    assert response.status_code == 400

@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["floor_id"] == "floor01_strategy"
        assert "topics_in_memory" in data


@pytest.mark.asyncio
async def test_plan_strategy_endpoint_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "topic_query": "Python Memory Management & Garbage Collection",
            "target_audience": "intermediate_developers",
            "platform": "youtube_shorts",
            "content_format": "educational_short",
            "learning_level": "intermediate",
            "research_context": verified_research_payload(),
        }
        response = await ac.post("/v1/plan", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["handoff_status"] == "VALIDATED"
        assert data["floor_id"] == "floor01_strategy"
        assert data["topic"]["selected_topic"] == "Python Memory Management & Garbage Collection"
        assert data["topic"]["category"] == "computer_science"
        assert data["strategy"]["platform"] == "youtube_shorts"
        assert "curriculum" in data
        assert "content_plan" in data


@pytest.mark.asyncio
async def test_generate_execution_report_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "topic_query": "Python Decorators Concept Graph",
            "target_audience": "intermediate_developers",
            "platform": "youtube_shorts",
            "research_context": verified_research_payload(),
        }
        response = await ac.post("/v1/plan/execution-report", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["floor_id"] == "floor01_strategy"
        assert "execution_id" in data
        assert "duration_ms" in data
        assert "worker_results" in data
        assert len(data["worker_results"]) == 4
        assert "component_gates" in data
        assert data["status"] == "VALIDATED"


@pytest.mark.asyncio
async def test_evaluate_topic_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        payload = {
            "topic_query": "Black Holes & Space Gravity",
        }
        response = await ac.post("/v1/evaluate-topic", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["category"] == "science"
        assert data["uniqueness_verdict"] == "MEMORY_UNSEEN"


@pytest.mark.asyncio
async def test_memory_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        response = await ac.get("/v1/memory")
        assert response.status_code == 200
        data = response.json()
        assert "count" in data
        assert "topics" in data
        assert isinstance(data["topics"], list)
