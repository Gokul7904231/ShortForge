"""Compatibility package mapping to services/pipeline/floor05_timeline_composition."""

from pathlib import Path

__path__ = [
    str(
        Path(__file__).resolve().parents[2]
        / "services"
        / "pipeline"
        / "floor05_timeline_composition"
    )
]
