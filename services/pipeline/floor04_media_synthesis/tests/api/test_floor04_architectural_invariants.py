"""Architectural Invariant Verification Suite for Floor 04 Media Synthesis."""

from pathlib import Path
import pytest

from factoryos.guardian.contracts.decision import DecisionActionType, GuardianDecisionProposal, ReasonCategory
from factoryos.guardian.contracts.guardian_state import GuardianLifecycleState, GuardianState
from factoryos.guardian.core.exceptions import GuardianPolicyError, GuardianValidationError
from factoryos.guardian.floors.floor04_guardian import Floor04Guardian
from floors.floor04_media_synthesis.app.brain.media_brain import MediaBrain
from floors.floor04_media_synthesis.app.domain.handoff import Floor04Input
from floors.floor04_media_synthesis.app.services.pipeline import Floor04PipelineService
from floors.floor04_media_synthesis.app.services.reconciliation import CrashReconciliationEngine
from floors.floor04_media_synthesis.app.services.validator import PNG_IEND, PNG_MAGIC, PhysicalMediaValidator
from floors.floor04_media_synthesis.tests.test_floor04_handoff import build_mock_floor03_payload
from floors.floor04_media_synthesis.tests.media_fixtures import write_png


def test_invariant_brain_cannot_authorize_itself(tmp_path):
    """INVARIANT 1: Brain formulates proposals, but cannot authorize execution itself."""
    f03 = build_mock_floor03_payload()
    inp = Floor04Input(floor03_payload=f03, request_id="req-inv-1")

    brain = MediaBrain()
    proposal = brain.propose_synthesis_plan(inp)

    # Proposal is a candidate structure, NOT an authorized decision report
    assert hasattr(proposal, "selected_capability")
    assert not hasattr(proposal, "status")  # Brain has no lifecycle status authority


def test_invariant_brain_cannot_bypass_guardian(tmp_path):
    """INVARIANT 2: Attempting worker execution without Guardian authorization fails policy."""
    pipeline_service = Floor04PipelineService(storage_root=str(tmp_path))
    guardian = Floor04Guardian(pipeline_service=pipeline_service)

    state = GuardianState(
        floor_id="floor04", request_id="req-inv-2", objective="Test objective", input_contract_hash="hash-123"
    )
    proposal = GuardianDecisionProposal(
        action_type=DecisionActionType.RUN_WORKER,
        target_capability="unauthorized_random_worker",
        reasoning_summary="Bypass attempt",
        reason_category=ReasonCategory.INITIAL_PLANNING,
        expected_outcome="Execute worker",
    )

    policy_results = guardian.engine.policy_engine.evaluate_proposal(state, proposal)
    fatal_denials = [r for r in policy_results if not r.allowed]
    assert len(fatal_denials) >= 1
    assert "not registered in the allowlist registry" in fatal_denials[0].reason


def test_invariant_worker_cannot_bypass_validator(tmp_path):
    """INVARIANT 3: Worker generating corrupt artifact cannot pass PhysicalMediaValidator."""
    bad_file = tmp_path / "corrupt_worker_out.png"
    bad_file.write_bytes(b"CORRUPT_BYTES")

    with pytest.raises(GuardianValidationError) as exc:
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(bad_file), required_width=1080, required_height=1920, storage_root=str(tmp_path)
        )
    assert "Invalid or unsupported image magic bytes" in str(exc.value)


def test_invariant_provider_metadata_cannot_override_bytes(tmp_path):
    """INVARIANT 4: Provider-declared MIME cannot override physical byte inspection."""
    png_file = tmp_path / "actual_png.png"
    write_png(png_file)

    with pytest.raises(GuardianValidationError) as exc:
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(png_file),
            required_width=1080,
            required_height=1920,
            storage_root=str(tmp_path),
            expected_mime="image/jpeg",
        )
    assert "Provider Trust Violation" in str(exc.value)


def test_invariant_provider_cannot_choose_arbitrary_paths(tmp_path):
    """INVARIANT 5: Out-of-bounds output paths are strictly rejected."""
    outside_root = tmp_path / "outside"
    outside_root.mkdir()
    outside_file = outside_root / "test.png"
    write_png(outside_file)

    authorized_root = tmp_path / "authorized_storage"
    authorized_root.mkdir()

    with pytest.raises(GuardianValidationError) as exc:
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(outside_file), required_width=1080, required_height=1920, storage_root=str(authorized_root)
        )
    assert "Security Violation" in str(exc.value)


def test_invariant_failed_transaction_cannot_commit(tmp_path):
    """INVARIANT 6: Failed/corrupted worker execution rolls back transaction."""
    storage_root = tmp_path / "media_storage"
    storage_root.mkdir()

    corrupt_file = storage_root / "bad_tx.png"
    corrupt_file.write_bytes(b"corrupt")

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    engine.record_transaction("tx-fail", "EXECUTING", {"files": [str(corrupt_file)]})

    summary = engine.reconcile_on_restart()
    assert "tx-fail" in summary["ROLLED_BACK"]
    assert "tx-fail" not in summary["COMMITTED"]


def test_invariant_ambiguous_recovery_becomes_orphaned(tmp_path):
    """INVARIANT 7: Partial/inconsistent staging state transitions to ORPHANED."""
    storage_root = tmp_path / "media_storage"
    storage_root.mkdir()

    valid_file = storage_root / "valid.png"
    write_png(valid_file)
    corrupt_file = storage_root / "corrupt.png"
    corrupt_file.write_bytes(b"corrupt")

    engine = CrashReconciliationEngine(storage_root=str(storage_root))
    engine.record_transaction("tx-ambiguous", "EXECUTING", {"files": [str(valid_file), str(corrupt_file)]})

    summary = engine.reconcile_on_restart()
    assert "tx-ambiguous" in summary["ORPHANED"]
    assert "tx-ambiguous" not in summary["COMMITTED"]
