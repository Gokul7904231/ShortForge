"""API integration tests for Floor 03 endpoints."""

from uuid import uuid4
from fastapi.testclient import TestClient
import pytest

from floors.floor03_asset_realization.main import app
from floors.floor03_asset_realization.app.core.config import settings
from floors.floor03_asset_realization.tests.test_floor03_handoff import build_mock_floor02_payload

client = TestClient(app)
HEADERS = {"X-API-Key": settings.DEFAULT_API_KEY}


def test_health_check_endpoint():
    response = client.get("/v1/assets/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["floor_id"] == "floor03_asset_realization"


def test_plan_assets_endpoint_success():
    f02_payload = build_mock_floor02_payload().model_dump()
    req_id = f"req-api-plan-{uuid4()}"
    payload = {
        "request_id": req_id,
        "floor02_payload": f02_payload,
    }
    response = client.post("/v1/assets/plan", json=payload, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert data["request_id"] == req_id
    assert data["floor_id"] == "floor03_asset_realization"
    assert len(data["visual_asset_requirements"]) >= 3


def test_execution_report_endpoint():
    f02_payload = build_mock_floor02_payload().model_dump()
    req_id = f"req-api-report-{uuid4()}"
    payload = {
        "request_id": req_id,
        "floor02_payload": f02_payload,
    }
    response = client.post("/v1/assets/execution-report", json=payload, headers=HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert "handoff_payload" in data
    assert "execution_report" in data
    assert data["execution_report"]["floor_id"] == "floor03_asset_realization"


def test_regenerate_scene_endpoint_success():
    f02_payload = build_mock_floor02_payload().model_dump()
    req_id = f"req-api-regen-{uuid4()}"
    plan_req = {"request_id": req_id, "floor02_payload": f02_payload}
    plan_resp = client.post("/v1/assets/plan", json=plan_req, headers=HEADERS)
    assert plan_resp.status_code == 200
    initial_payload = plan_resp.json()

    target_scene_id = initial_payload["visual_asset_requirements"][0]["scene_id"]

    regen_req = {
        "current_payload": initial_payload,
        "target_scene_id": target_scene_id,
        "regeneration_instruction": "Enhance lighting",
    }
    regen_resp = client.post("/v1/assets/regenerate-scene", json=regen_req, headers=HEADERS)
    assert regen_resp.status_code == 200

    updated_payload = regen_resp.json()
    assert updated_payload["asset_plan_version"] == initial_payload["asset_plan_version"] + 1
    assert updated_payload["visual_asset_requirements"][0]["asset_version"] == 2
