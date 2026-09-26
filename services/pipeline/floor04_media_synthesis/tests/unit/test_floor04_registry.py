"""Unit tests for MediaAssetRegistry (provenance linkage & asset metadata persistence)."""

from pathlib import Path
import pytest

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor04_media_synthesis.app.domain.handoff import AssetSourceType, RightsMetadata
from floors.floor04_media_synthesis.app.services.registry import MediaAssetRecord, MediaAssetRegistry


def test_registry_register_and_retrieve(tmp_path):
    reg_file = tmp_path / "media_registry.json"
    registry = MediaAssetRegistry(registry_file_path=str(reg_file))

    rights = RightsMetadata(source_type=AssetSourceType.DETERMINISTIC_SYNTHESIS, provider_name="test_provider")
    storage_path = tmp_path / "asset-vis-01.png"
    storage_path.write_bytes(b"test-image-bytes")
    storage_path = tmp_path / "asset-aud-01.mp3"
    storage_path.write_bytes(b"test-audio-bytes")
    rec = MediaAssetRecord(
        asset_id="asset-vis-01",
        scene_id="sc-01",
        source_spec_hash="spec-hash-f03-12345",
        sha256_checksum="a" * 64,
        file_size_bytes=5000,
        mime_type="image/png",
        media_type="visual",
        width=1080,
        height=1920,
        provider_name="image_worker",
        generation_request_id="req-f04-01",
        transaction_id="tx-101",
        storage_path=str(tmp_path / "asset-vis-01.png"),
        rights_metadata=rights,
    )

    registry.register_asset(rec)

    # Verify retrieval from memory and loaded file
    loaded = registry.get_asset("asset-vis-01")
    assert loaded is not None
    assert loaded.source_spec_hash == "spec-hash-f03-12345"
    assert loaded.file_size_bytes == 5000

    # Test fresh load from disk
    new_reg_instance = MediaAssetRegistry(registry_file_path=str(reg_file))
    assert new_reg_instance.get_asset("asset-vis-01") is not None


def test_registry_spec_linkage_verification(tmp_path):
    reg_file = tmp_path / "media_registry.json"
    registry = MediaAssetRegistry(registry_file_path=str(reg_file))

    rights = RightsMetadata(source_type=AssetSourceType.DETERMINISTIC_SYNTHESIS, provider_name="test_provider")
    rec = MediaAssetRecord(
        asset_id="asset-aud-01",
        scene_id="sc-01",
        source_spec_hash="spec-hash-f03-99999",
        sha256_checksum="b" * 64,
        file_size_bytes=10000,
        mime_type="audio/mpeg",
        media_type="audio",
        duration_seconds=6.0,
        provider_name="tts_worker",
        generation_request_id="req-f04-02",
        transaction_id="tx-102",
        storage_path=str(tmp_path / "asset-aud-01.mp3"),
        rights_metadata=rights,
    )

    registry.register_asset(rec)

    assert registry.verify_spec_linkage("asset-aud-01", "spec-hash-f03-99999") is True
    assert registry.verify_spec_linkage("asset-aud-01", "wrong-hash") is False


def test_registry_missing_spec_hash_rejection(tmp_path):
    registry = MediaAssetRegistry(registry_file_path=str(tmp_path / "reg.json"))
    rights = RightsMetadata(source_type=AssetSourceType.DETERMINISTIC_SYNTHESIS, provider_name="test_provider")

    rec = MediaAssetRecord(
        asset_id="a1",
        scene_id="s1",
        source_spec_hash="temp",
        sha256_checksum="c" * 64,
        file_size_bytes=10,
        mime_type="image/png",
        media_type="visual",
        provider_name="p",
        generation_request_id="r",
        transaction_id="t",
        storage_path="path",
        rights_metadata=rights,
    )
    rec.source_spec_hash = ""  # Force empty spec hash

    with pytest.raises(GuardianValidationError) as exc:
        registry.register_asset(rec)

    assert "missing source_spec_hash" in str(exc.value)
