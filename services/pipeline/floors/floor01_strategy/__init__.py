"""Compatibility alias for the canonical floor01_strategy package."""

from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[2] / "floor01_strategy"
__path__ = [str(_CANONICAL)]
