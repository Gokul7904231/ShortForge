"""Strategy Planner Logical Worker for Floor 01.

Determines strategic angle, target audience calibration, tone, format,
target duration, and platform-specific specification bounds with version metadata.
"""

from __future__ import annotations

from typing import Any, Dict

from floors.floor01_strategy.app.core.config import get_settings
from floors.floor01_strategy.app.domain.handoff import (
    EvidenceType,
    ExecutionMode,
    Floor01Input,
    ProvenanceEntry,
    StrategyResult,
    TopicIntelligenceResult,
)


class StrategyPlannerWorker:
    """Logical worker for strategic content planning & multi-platform audience positioning."""

    def run(
        self,
        inp: Floor01Input,
        topic_res: TopicIntelligenceResult,
        execution_mode: ExecutionMode = ExecutionMode.DETERMINISTIC_FALLBACK,
    ) -> StrategyResult:
        settings = get_settings()

        category = topic_res.category
        fmt = inp.content_format
        platform = inp.platform

        # Resolve strategic angle
        if "angle" in inp.constraints:
            angle = str(inp.constraints["angle"])
        elif category == "computer_science":
            angle = "practical_mental_model"
        elif category == "science":
            angle = "counter_intuitive_fact"
        elif category == "history":
            angle = "untold_story_angle"
        else:
            angle = "curiosity_first_explainer"

        # Platform-specific specification rules with metadata provenance
        platform_spec: Dict[str, Any] = {
            "platform_spec_version": "1.0",
            "last_verified": "2026-08-11",
            "source": "factoryos_platform_matrix_policy",
        }

        if platform == "youtube_shorts":
            tone = "fast_paced_educational" if fmt == "quiz_short" else "engaging_educational"
            target_duration = 60
            platform_spec.update({
                "aspect_ratio": "9:16",
                "max_hook_window_seconds": 3,
                "cta_type": "subscribe_and_comment",
                "max_duration_seconds": 60,
                "layout_safe_zone": "center_vertical_safe",
            })
        elif platform == "tiktok":
            tone = "raw_informal_curious"
            target_duration = 45
            platform_spec.update({
                "aspect_ratio": "9:16",
                "max_hook_window_seconds": 2,
                "cta_type": "follow_and_share",
                "max_duration_seconds": 45,
                "layout_safe_zone": "avoid_bottom_caption_overlap",
            })
        elif platform == "instagram_reels":
            tone = "visually_aesthetic_polished"
            target_duration = 30
            platform_spec.update({
                "aspect_ratio": "9:16",
                "max_hook_window_seconds": 3,
                "cta_type": "save_and_share",
                "max_duration_seconds": 90,
                "layout_safe_zone": "avoid_right_sidebar_icons",
            })
        elif platform == "linkedin_video":
            tone = "analytical_professional"
            target_duration = 120
            platform_spec.update({
                "aspect_ratio": "16:9_or_1:1",
                "max_hook_window_seconds": 8,
                "cta_type": "connect_and_discuss",
                "max_duration_seconds": 120,
                "layout_safe_zone": "standard_subtitles",
            })
        elif platform == "twitter_video":
            tone = "concise_news_bullet"
            target_duration = 45
            platform_spec.update({
                "aspect_ratio": "1:1",
                "max_hook_window_seconds": 3,
                "cta_type": "retweet_and_reply",
                "max_duration_seconds": 140,
                "layout_safe_zone": "standard",
            })
        else:
            tone = "engaging_educational"
            target_duration = 60
            platform_spec.update({"aspect_ratio": "9:16", "cta_type": "standard"})

        if "target_duration" in inp.constraints:
            target_duration = int(inp.constraints["target_duration"])

        # Clamp duration within settings
        target_duration = max(settings.min_duration_seconds, min(settings.max_duration_seconds, target_duration))

        evidence_type = (
            EvidenceType.MODEL_INFERENCE
            if execution_mode == ExecutionMode.MODEL
            else EvidenceType.DETERMINISTIC_RULE
        )

        prov_entry = ProvenanceEntry(
            evidence_type=evidence_type,
            source_type="channel_strategy_matrix",
            source_identifier="platform_policy_matrix_v1",
            method="resolve_platform_specification",
            confidence_score=0.92,
            summary=f"Selected '{angle}' angle for category '{category}' on platform '{platform}' (mode: {execution_mode.value}).",
            raw_data={
                "category": category,
                "angle": angle,
                "tone": tone,
                "platform": platform,
                "platform_spec": platform_spec,
                "duration_seconds": target_duration,
                "execution_mode": execution_mode.value,
            },
        )

        return StrategyResult(
            target_audience=inp.target_audience,
            platform=platform,
            content_angle=angle,
            tone=tone,
            format=fmt,
            target_duration_seconds=target_duration,
            platform_spec=platform_spec,
            execution_mode=execution_mode,
            provenance=[prov_entry],
        )
