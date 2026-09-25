"""Compatibility bridge for historical `floors.floor01_strategy` imports.

The canonical implementation lives in the installable `floor01_strategy`
package. This namespace contains no second implementation.
"""

from pathlib import Path

_CANONICAL = Path(__file__).resolve().parents[2] / "floor01_strategy" / "floor01_strategy"
__path__ = [str(_CANONICAL)]
