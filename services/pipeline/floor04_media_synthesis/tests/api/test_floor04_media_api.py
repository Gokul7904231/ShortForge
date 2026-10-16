"""Contract and physical-byte integrity tests for the Floor 04 runtime API."""

from fastapi.testclient import TestClient

from factoryos.guardian.floors.floor04_guardian import Floor04Guardian
from floors.floor04_media_synthesis.main import create_app
from floors.floor04_media_synthesis.app.services.pipeline import Floor04PipelineService
from floors.floor04_media_synthesis.tests.test_floor04_handoff import build_mock_floor03_payload


def _client(tmp_path, monkeypatch):
    monkeypatch.setenv("FLOOR04_SERVICE_API_KEY", "test-floor04-key")
    pipeline = Floor04PipelineService(storage_root=str(tmp_path / "media"))
    guardian = Floor04Guardian(pipeline_service=pipeline)
    return TestClient(create_app(guardian=guardian))


def test_floor04_health_is_liveness_not_readiness(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    response = client.get("/v1/media/health")
    assert response.status_code == 200
    assert response.json()["floor_id"] == "floor04_media_synthesis"


def test_floor04_execution_returns_lineage_bound_metadata_and_verified_bytes(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    f03 = build_mock_floor03_payload()
    request_id = "editor-source-api-test-01"

    response = client.post(
        "/v1/media/execution-report",
        headers={"X-API-Key": "test-floor04-key"},
        json={
            "request_id": request_id,
            "floor03_payload": f03.model_dump(mode="json"),
            "execution_mode": "HYBRID",
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    handoff = body["handoff_payload"]
    assert handoff["request_id"] == request_id
    expected = f03.asset_plan_ir.plan_fingerprint or f03.asset_plan_ir.source_fingerprint
    assert handoff["source_asset_plan_fingerprint"] == expected
    assert len(handoff["synthesized_visual_assets"]) == len(f03.visual_asset_requirements)
    assert len(handoff["synthesized_audio_assets"]) == len(f03.audio_asset_requirements)
    assert "file_path" not in handoff["synthesized_visual_assets"][0]
    assert body["execution_report"]["status"] == "COMPLETED"

    asset = handoff["synthesized_visual_assets"][0]
    download = client.get(
        f"/v1/media/assets/{asset['asset_id']}/content",
        headers={"X-API-Key": "test-floor04-key"},
        params={"request_id": request_id, "sha256": asset["sha256_checksum"]},
    )
    assert download.status_code == 200
    assert len(download.content) == asset["file_size_bytes"]
    assert download.headers["x-content-sha256"] == asset["sha256_checksum"]
    assert download.headers["x-source-spec-hash"] == expected


def test_floor04_artifact_route_rejects_wrong_digest_and_missing_auth(tmp_path, monkeypatch):
    client = _client(tmp_path, monkeypatch)
    f03 = build_mock_floor03_payload()
    request_id = "editor-source-api-auth-test"

    execution = client.post(
        "/v1/media/execution-report",
        headers={"X-API-Key": "test-floor04-key"},
        json={
            "request_id": request_id,
            "floor03_payload": f03.model_dump(mode="json"),
            "execution_mode": "HYBRID",
        },
    )
    assert execution.status_code == 200, execution.text
    asset = execution.json()["handoff_payload"]["synthesized_visual_assets"][0]

    unauthenticated = client.get(
        f"/v1/media/assets/{asset['asset_id']}/content",
        params={"request_id": request_id, "sha256": asset["sha256_checksum"]},
    )
    assert unauthenticated.status_code == 401

    mismatched = client.get(
        f"/v1/media/assets/{asset['asset_id']}/content",
        headers={"X-API-Key": "test-floor04-key"},
        params={"request_id": request_id, "sha256": "0" * 64},
    )
    assert mismatched.status_code == 404
