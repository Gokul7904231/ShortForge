"""Compatibility bridge for historical floors.floor03_asset_realization imports.

The canonical implementation lives in services/pipeline/floor03_asset_realization.
This namespace exposes that implementation without creating a second copy.
"""

from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[2] / "floor03_asset_realization"
__path__ = [str(_CANONICAL)]
