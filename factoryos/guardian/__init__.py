"""Compatibility bridge to the canonical FactoryOS Guardian package."""

from pathlib import Path

_CANONICAL_GUARDIAN = (
    Path(__file__).resolve().parents[2]
    / "services"
    / "pipeline"
    / "guardian"
)
__path__ = [str(_CANONICAL_GUARDIAN)]

from .contracts import (  # noqa: E402
    ActionRequest,
    DecisionActionType,
    ExecutionMode,
    ExecutionStatus,
    GuardianDecision,
    GuardianDecisionProposal,
    GuardianLifecycleState,
    GuardianReport,
    GuardianState,
    ReasonCategory,
    WorkerResult,
)
from .core.guardian import GuardianEngine  # noqa: E402
from .floors import Floor01Guardian, Floor02Guardian, Floor03Guardian  # noqa: E402

__all__ = [
    "GuardianEngine",
    "Floor01Guardian",
    "Floor02Guardian",
    "Floor03Guardian",
    "GuardianState",
    "GuardianLifecycleState",
    "ExecutionMode",
    "GuardianDecisionProposal",
    "GuardianDecision",
    "DecisionActionType",
    "ReasonCategory",
    "ActionRequest",
    "WorkerResult",
    "ExecutionStatus",
    "GuardianReport",
]
