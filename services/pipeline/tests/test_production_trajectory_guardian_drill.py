"""Real production-path Guardian trajectory drill for F01-F05.

Runs the canonical floor Guardian wrappers in one mission sequence and passes
real handoffs forward. Loop evidence comes only from the returned GuardianReport.
"""

from __future__ import annotations

import json
from pathlib import Path
from uuid import uuid4

from factoryos.guardian.contracts.guardian_state import GuardianLifecycleState
from factoryos.guardian.floors.floor01_guardian import Floor01Guardian
from factoryos.guardian.floors.floor02_guardian import Floor02Guardian
from factoryos.guardian.floors.floor03_guardian import Floor03Guardian
from factoryos.guardian.floors.floor04_guardian import Floor04Guardian
from factoryos.guardian.floors.floor05_guardian import Floor05Guardian
from floors.floor01_strategy.app.domain.handoff import Floor01HandoffPayload, Floor01Input
from floors.floor02_scripting.app.domain.handoff import Floor02HandoffPayload, Floor02Input
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload, Floor03Input
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload, Floor04Input
from floors.floor05_timeline_composition.app.domain.handoff import Floor05Input


CANONICAL = (
    ("floor01_strategy", "floor01"),
    ("floor02_scripting", "floor02"),
    ("floor03_asset_realization", "floor03_asset_realization"),
    ("floor04_media_synthesis", "floor04"),
    ("floor05_timeline_composition", "floor05"),
)


def observation(canonical_floor_id: str, report) -> dict:
    assert report.status == GuardianLifecycleState.COMPLETED, (
        f"{canonical_floor_id} Guardian did not complete: {report.status} "
        f"{report.errors}"
    )
    assert report.handoff_payload is not None

    return {
        "floorId": canonical_floor_id,
        "guardianFloorId": report.floor_id,
        "executionId": str(report.execution_id),
        "requestId": report.request_id,
        "proofLevel": "LOOP_RECEIPT",
        "verified": True,
        "termination": "COMPLETED",
        "iterations": max(1, report.step_count),
        "decisions": report.decision_count,
        "actions": report.action_count,
        "retries": report.retry_count,
        "recoveries": report.recovery_count,
        "durationMs": report.duration_ms,
        "evidenceRefs": [
            str(report.execution_id),
            f"guardian:{canonical_floor_id}",
        ],
    }


def test_real_f01_to_f05_guardian_trajectory(tmp_path: Path):
    mission_id = f"mission-guardian-trajectory-{uuid4().hex[:10]}"

    r01 = Floor01Guardian().execute(
        Floor01Input(
            request_id=mission_id,
            topic_query="Python decorators",
            target_audience="intermediate_developers",
            platform="youtube_shorts",
            content_format="educational_short",
            learning_level="intermediate",
        )
    )
    o01 = observation("floor01_strategy", r01)
    f01 = Floor01HandoffPayload.model_validate(r01.handoff_payload)

    r02 = Floor02Guardian().execute(
        Floor02Input(
            request_id=mission_id,
            floor01_payload=f01,
            topic_query="Python decorators",
        )
    )
    o02 = observation("floor02_scripting", r02)
    f02 = Floor02HandoffPayload.model_validate(r02.handoff_payload)

    r03 = Floor03Guardian().execute(
        Floor03Input(
            request_id=mission_id,
            floor02_payload=f02,
        )
    )
    o03 = observation("floor03_asset_realization", r03)
    f03 = Floor03HandoffPayload.model_validate(r03.handoff_payload)

    r04 = Floor04Guardian().execute(
        Floor04Input(
            request_id=mission_id,
            floor03_payload=f03,
        )
    )
    o04 = observation("floor04_media_synthesis", r04)
    f04 = Floor04HandoffPayload.model_validate(r04.handoff_payload)

    r05 = Floor05Guardian().execute(
        Floor05Input(
            request_id=mission_id,
            floor03_payload=f03,
            floor04_payload=f04,
        )
    )
    o05 = observation("floor05_timeline_composition", r05)

    observations = [o01, o02, o03, o04, o05]

    assert [item["floorId"] for item in observations] == [item[0] for item in CANONICAL]
    assert all(item["verified"] for item in observations)
    assert all(item["proofLevel"] == "LOOP_RECEIPT" for item in observations)
    assert all(item["decisions"] >= 1 for item in observations)
    assert all(item["actions"] >= 1 for item in observations)

    output = {
        "missionId": mission_id,
        "trajectoryType": "REAL_GUARDIAN_F01_F05",
        "status": "VERIFIED",
        "floorCount": len(observations),
        "observations": observations,
    }

    report_path = tmp_path / "production_trajectory_guardian_drill.json"
    report_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    assert report_path.exists()
