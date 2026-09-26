"""Compatibility package mapping to services/pipeline/floor03_asset_realization."""

from pathlib import Path

__path__ = [
    str(
        Path(__file__).resolve().parents[2]
        / "services"
        / "pipeline"
        / "floor03_asset_realization"
    )
]
