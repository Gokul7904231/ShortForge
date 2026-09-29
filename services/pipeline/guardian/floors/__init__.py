"""Floor Guardian adapters.

F04/F05 are exposed lazily because their domain handoff modules import
factoryos.guardian contracts; eager imports would create a package cycle.
"""

from factoryos.guardian.floors.floor01_guardian import Floor01Guardian
from factoryos.guardian.floors.floor02_guardian import Floor02Guardian
from factoryos.guardian.floors.floor03_guardian import Floor03Guardian

__all__ = [
    "Floor01Guardian",
    "Floor02Guardian",
    "Floor03Guardian",
    "Floor04Guardian",
    "Floor05Guardian",
]

def __getattr__(name: str):
    if name == "Floor04Guardian":
        from factoryos.guardian.floors.floor04_guardian import Floor04Guardian
        return Floor04Guardian
    if name == "Floor05Guardian":
        from factoryos.guardian.floors.floor05_guardian import Floor05Guardian
        return Floor05Guardian
    raise AttributeError(name)
