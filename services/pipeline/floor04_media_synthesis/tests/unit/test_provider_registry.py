from floors.floor04_media_synthesis.app.domain.handoff import ExecutionMode
from floors.floor04_media_synthesis.app.services.provider_registry import (
    MediaProviderRegistry,
    ProviderDescriptor,
)


def test_registry_prefers_healthy_high_priority_provider():
    registry = MediaProviderRegistry()
    registry.register(
        ProviderDescriptor(
            provider_id="healthy-low-number",
            capability="image_generation",
            priority=10,
            execution_mode=ExecutionMode.MODEL,
            health_check=lambda: True,
        )
    )
    registry.register(
        ProviderDescriptor(
            provider_id="healthy-high-number",
            capability="image_generation",
            priority=20,
            execution_mode=ExecutionMode.MODEL,
            health_check=lambda: True,
        )
    )

    selection = registry.select("image_generation")
    assert selection.provider_id == "healthy-low-number"


def test_registry_skips_unhealthy_provider():
    registry = MediaProviderRegistry()
    registry.register(
        ProviderDescriptor(
            provider_id="down-provider",
            capability="tts_generation",
            priority=1,
            execution_mode=ExecutionMode.MODEL,
            health_check=lambda: False,
        )
    )
    registry.register(
        ProviderDescriptor(
            provider_id="fallback",
            capability="tts_generation",
            priority=100,
            execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK,
        )
    )

    selection = registry.select("tts_generation")
    assert selection.provider_id == "fallback"


def test_registry_rejects_capability_mismatch():
    registry = MediaProviderRegistry()
    registry.register(
        ProviderDescriptor(
            provider_id="image-only",
            capability="image_generation",
            priority=1,
            execution_mode=ExecutionMode.MODEL,
        )
    )

    try:
        registry.select("tts_generation", preferred_provider="image-only")
    except ValueError as exc:
        assert "cannot execute capability" in str(exc)
    else:
        raise AssertionError("capability mismatch must be rejected")


def test_deterministic_fallbacks_are_explicit():
    registry = MediaProviderRegistry.deterministic_fallback()

    selections = {
        capability: registry.select(capability)
        for capability in (
            "image_generation",
            "tts_generation",
            "background_audio_generation",
        )
    }

    assert all(
        item.execution_mode == ExecutionMode.DETERMINISTIC_FALLBACK
        for item in selections.values()
    )
