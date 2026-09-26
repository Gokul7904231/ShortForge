"""Provider-neutral visual planning adapter.

This adapter deliberately does not own provider credentials or media generation.
A future production model can implement the bounded protocol and return a typed
plan. Until then, the deterministic path is the only real execution path.
"""

from __future__ import annotations

from typing import Any, Dict

import structlog

from floors.floor03_asset_realization.app.domain.handoff import ExecutionMode

logger = structlog.get_logger(__name__)


class LLMAssetAdapter:
    def __init__(self, use_mock_fallback: bool = True):
        self.use_mock_fallback = use_mock_fallback

    def enhance_visual_prompt(
        self,
        visual_intent: str,
        aspect_ratio: str,
        style_preset: str = None,
    ) -> Dict[str, Any]:
        style_str = f" in {style_preset} style" if style_preset else ""
        prompt_text = (
            f"Visual close-up of {visual_intent}{style_str}, "
            f"high quality, crisp focus, {aspect_ratio} aspect ratio."
        )
        # No claim of model execution: this is the deterministic baseline.
        return {
            "prompt_text": prompt_text,
            "mode": ExecutionMode.DETERMINISTIC,
            "fallback_occurred": False,
        }
