"""API integration tests for the canonical Floor 02 service."""

from fastapi.testclient import TestClient

from floors.floor02_scripting.main import app
from floors.floor02_scripting.app.core.config import settings
from floors.floor02_scripting.tests.test_handoff import build_mock_floor01_payload

client = TestClient(app)
HEADERS = {"X-API-Key": settings.DEFAULT_API_KEY}


def test_health_check_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["floor_id"] == "floor02_scripting"


def _production_payload(request_id: str, topic: str):
    f01 = build_mock_floor01_payload()
    data = f01.model_dump(mode="json")
    data["request_id"] = request_id
    data["topic"]["selected_topic"] = topic
    data["topic"]["normalized_topic"] = topic.lower().replace(" ", "_")
    return {
        "request_id": request_id,
        "topic_query": topic,
        "target_duration_seconds": 60,
        "floor01_payload": data,
        "strict_upstream": True,
    }


def test_plan_script_endpoint_requires_floor01():
    response = client.post(
        "/v1/script/plan",
        json={"request_id": "req-api-no-f01", "topic_query": "Python Decorators", "target_duration_seconds": 60},
        headers=HEADERS,
    )
    assert response.status_code == 422


def test_plan_script_endpoint_success():
    response = client.post(
        "/v1/script/plan",
        json=_production_payload("req-api-plan-1", "Python Decorators"),
        headers=HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == "req-api-plan-1"
    assert data["floor_id"] == "floor02_scripting"
    assert data["script_ir"]["schema_version"] == "2.0"
    assert data["quality_report"]["accepted"] is True
    assert len(data["scenes"]) >= 3


def test_execution_report_endpoint():
    response = client.post(
        "/v1/script/execution-report",
        json=_production_payload("req-api-report-1", "Python Asyncio"),
        headers=HEADERS,
    )
    assert response.status_code == 200
    data = response.json()
    assert "handoff_payload" in data
    assert "execution_report" in data
    assert data["execution_report"]["floor_id"] == "floor02_scripting"


def test_regenerate_scene_endpoint_success():
    plan_resp = client.post(
        "/v1/script/plan",
        json=_production_payload("req-api-regen-1", "Python Generators"),
        headers=HEADERS,
    )
    assert plan_resp.status_code == 200
    initial_payload = plan_resp.json()

    target_scene_id = initial_payload["scenes"][0]["scene_id"]
    regen_req = {
        "current_payload": initial_payload,
        "target_scene_id": target_scene_id,
        "regeneration_instruction": "make the hook more surprising",
    }
    regen_resp = client.post("/v1/script/regenerate-scene", json=regen_req, headers=HEADERS)
    assert regen_resp.status_code == 200

    updated_payload = regen_resp.json()
    assert updated_payload["script_version"] == initial_payload["script_version"] + 1
    assert updated_payload["scenes"][0]["scene_version"] == initial_payload["scenes"][0]["scene_version"] + 1
    assert updated_payload["script_ir"]["quality"]["accepted"] is True
    assert updated_payload["successor_handoffs"]["floor03_asset_realization"]["script_version"] == updated_payload["script_version"]


def test_regenerate_scene_endpoint_invalid_scene():
    plan_resp = client.post(
        "/v1/script/plan",
        json=_production_payload("req-api-regen-invalid-1", "Python Classes"),
        headers=HEADERS,
    )
    assert plan_resp.status_code == 200
    initial_payload = plan_resp.json()

    regen_req = {
        "current_payload": initial_payload,
        "target_scene_id": "non-existent-scene-id-999",
        "regeneration_instruction": "Should fail",
    }
    regen_resp = client.post("/v1/script/regenerate-scene", json=regen_req, headers=HEADERS)
    assert regen_resp.status_code == 400
