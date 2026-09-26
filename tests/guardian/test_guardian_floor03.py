"""Integration tests for Floor 03 Asset Realization Brain Guardian Adapter."""

from uuid import uuid4
import pytest

from factoryos.guardian.contracts.guardian_state import GuardianLifecycleState
from factoryos.guardian.floors.floor03_guardian import Floor03Guardian
from floors.floor03_asset_realization.app.domain.handoff import Floor03Input
from floors.floor03_asset_realization.tests.test_floor03_handoff import build_mock_floor02_payload


def test_floor03_guardian_execution(tmp_path):
    f02_payload = build_mock_floor02_payload()
    req_id = f"req-f03-guard-{uuid4()}"
    inp = Floor03Input(floor02_payload=f02_payload, request_id=req_id)

    guardian = Floor03Guardian()
    report = guardian.execute(inp)

    assert report.floor_id == "floor03_asset_realization"
    assert report.request_id == req_id
    assert report.status == GuardianLifecycleState.COMPLETED
    assert report.handoff_payload is not None
    assert report.handoff_payload["manifest"]["total_visual_assets"] >= 3
    assert report.handoff_payload["asset_plan_ir"]["schema_version"] == "1.4.0"
    assert report.handoff_payload["asset_plan_ir"]["plan_fingerprint"]
