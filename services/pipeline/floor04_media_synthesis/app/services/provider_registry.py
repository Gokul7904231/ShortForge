"""Provider registry and selection policy for Floor 04.

Provider selection is bounded and allowlisted. The Floor 03 contract remains
provider-neutral; this layer owns provider choice and fallback execution policy.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Dict, List, Optional

from floors.floor04_media_synthesis.app.domain.handoff import ExecutionMode, ProviderExecutionRecord


@dataclass(frozen=True)
class ProviderDescriptor:
    provider_id: str
    capability: str
    priority: int
    execution_mode: ExecutionMode
    enabled: bool = True
    model_id: Optional[str] = None
    health_check: Optional[Callable[[], bool]] = None


@dataclass(frozen=True)
class ProviderSelection:
    provider_id: str
    capability: str
    model_id: Optional[str]
    execution_mode: ExecutionMode


class MediaProviderRegistry:
    """Allowlist registry for Floor 04 media providers."""

    def __init__(self) -> None:
        self._providers: Dict[str, ProviderDescriptor] = {}

    def register(self, descriptor: ProviderDescriptor) -> None:
        if descriptor.provider_id in self._providers:
            raise ValueError(f"Duplicate Floor 04 provider: {descriptor.provider_id}")
        self._providers[descriptor.provider_id] = descriptor

    def get(self, provider_id: str) -> ProviderDescriptor:
        try:
            return self._providers[provider_id]
        except KeyError as exc:
            raise ValueError(f"Unknown Floor 04 provider: {provider_id}") from exc

    def list(self, capability: Optional[str] = None) -> List[ProviderDescriptor]:
        providers = list(self._providers.values())
        if capability:
            providers = [p for p in providers if p.capability == capability]
        return sorted(providers, key=lambda p: p.priority)

    def select(self, capability: str, preferred_provider: Optional[str] = None) -> ProviderSelection:
        candidates = [p for p in self.list(capability) if p.enabled]

        if preferred_provider:
            preferred = self.get(preferred_provider)
            if not preferred.enabled:
                raise ValueError(f"Preferred provider is disabled: {preferred_provider}")
            if preferred.capability != capability:
                raise ValueError(
                    f"Provider {preferred_provider} cannot execute capability {capability}"
                )
            if preferred.health_check and not preferred.health_check():
                raise RuntimeError(f"Preferred provider is unhealthy: {preferred_provider}")
            return ProviderSelection(
                provider_id=preferred.provider_id,
                capability=preferred.capability,
                model_id=preferred.model_id,
                execution_mode=preferred.execution_mode,
            )

        for provider in candidates:
            if provider.health_check and not provider.health_check():
                continue
            return ProviderSelection(
                provider_id=provider.provider_id,
                capability=provider.capability,
                model_id=provider.model_id,
                execution_mode=provider.execution_mode,
            )

        raise RuntimeError(f"No healthy provider is available for capability {capability}")

    @classmethod
    def deterministic_fallback(cls) -> "MediaProviderRegistry":
        registry = cls()
        registry.register(
            ProviderDescriptor(
                provider_id="deterministic_image_fallback",
                capability="image_generation",
                priority=10_000,
                execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK,
            )
        )
        registry.register(
            ProviderDescriptor(
                provider_id="deterministic_tts_fallback",
                capability="tts_generation",
                priority=10_000,
                execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK,
            )
        )
        registry.register(
            ProviderDescriptor(
                provider_id="deterministic_background_audio_fallback",
                capability="background_audio_generation",
                priority=10_000,
                execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK,
            )
        )
        return registry


def provider_execution_record(
    selection: ProviderSelection,
    request_fingerprint: str,
    *,
    attempt: int = 1,
    cache_hit: bool = False,
    latency_ms: Optional[float] = None,
    external_request_id: Optional[str] = None,
) -> ProviderExecutionRecord:
    return ProviderExecutionRecord(
        provider_id=selection.provider_id,
        model_id=selection.model_id,
        capability=selection.capability,
        request_fingerprint=request_fingerprint,
        attempt=attempt,
        cache_hit=cache_hit,
        latency_ms=latency_ms,
        external_request_id=external_request_id,
        execution_mode=selection.execution_mode,
    )
