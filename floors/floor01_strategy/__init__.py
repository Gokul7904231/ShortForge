"""Compatibility package mapping to the canonical Floor 01 implementation.

The installable package is nested one level deeper under services/pipeline.
This namespace preserves historical `floors.floor01_strategy.*` imports
without duplicating runtime source files.
"""

from pathlib import Path

__path__ = [
    str(
        Path(__file__).resolve().parents[2]
        / "services"
        / "pipeline"
        / "floor01_strategy"
        / "floor01_strategy"
    )
]
