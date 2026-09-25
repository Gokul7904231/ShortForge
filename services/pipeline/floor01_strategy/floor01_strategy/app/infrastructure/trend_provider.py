"""Trend & Intelligence Provider Abstraction for Floor 01.

Provides provider abstraction (MockTrendProvider, GoogleTrendsAdapter stub) for trend discovery,
demand signals, and opportunity evaluation.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

import structlog

logger = structlog.get_logger(__name__)


class TrendProvider:
    """Base interface for trend & demand signal providers."""

    def evaluate_trend_signals(self, topic: str, category: str) -> Dict[str, Any]:
        raise NotImplementedError


class MockTrendProvider(TrendProvider):
    """Mock/Heuristic trend provider for testing and offline execution."""

    def evaluate_trend_signals(self, topic: str, category: str) -> Dict[str, Any]:
        norm_topic = topic.lower()

        # Heuristic opportunity score based on category
        if "python" in norm_topic or "coding" in norm_topic:
            demand_score = 0.88
            saturation_score = 0.40
            opportunity_score = 0.85
        elif "space" in norm_topic or "science" in norm_topic:
            demand_score = 0.92
            saturation_score = 0.35
            opportunity_score = 0.90
        else:
            demand_score = 0.70
            saturation_score = 0.50
            opportunity_score = 0.72

        logger.info("evaluated_trend_signals", topic=topic, opportunity_score=opportunity_score)

        return {
            "provider": "MockTrendProvider",
            "demand_score": demand_score,
            "saturation_score": saturation_score,
            "opportunity_score": opportunity_score,
            "status": "simulated_trend_signals",
        }
