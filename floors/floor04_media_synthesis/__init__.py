"""Compatibility package mapping to services/pipeline/floor04_media_synthesis."""

from pathlib import Path

__path__ = [
    str(
        Path(__file__).resolve().parents[2]
        / "services"
        / "pipeline"
        / "floor04_media_synthesis"
    )
]
