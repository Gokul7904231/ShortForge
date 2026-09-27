"""Worker Runner for FactoryOS Autonomous Guardian System."""

from __future__ import annotations

import time
from typing import Any, Dict

import structlog

from factoryos.guardian.capabilities.registry import CapabilityRegistry
from factoryos.guardian.contracts.action import ActionRequest
from factoryos.guardian.contracts.worker_result import ExecutionStatus, WorkerResult
from factoryos.guardian.execution.circuit_breaker import CircuitBreaker

logger = structlog.get_logger(__name__)


class WorkerRunner:
    """Safely executes authorized worker capability requests with circuit breaker and timing metrics."""

    def __init__(self, registry: CapabilityRegistry, circuit_breaker: CircuitBreaker):
        self.registry = registry
        self.circuit_breaker = circuit_breaker

    def execute_action(self, action: ActionRequest, context: Dict[str, Any]) -> WorkerResult:
        """Execute authorized capability request and return WorkerResult."""
        if not self.circuit_breaker.allow_execution():
            logger.warning("worker_runner_circuit_open", target=action.capability_name)
            return WorkerResult(
                action_id=action.action_id,
                execution_id=action.execution_id,
                capability_name=action.capability_name,
                target_worker=action.target_worker,
                status=ExecutionStatus.CIRCUIT_BROKEN,
                duration_ms=0.0,
                error_message="Circuit breaker is OPEN. Capability execution blocked.",
                error_code="CIRCUIT_OPEN",
            )

        start_time = time.time()
        try:
            capability = self.registry.get(action.capability_name)
            logger.info("worker_runner_executing_capability", capability=capability.name)

            if capability.handler:
                handler_context = dict(context)
                # Authorization evidence is injected by Guardian here, immediately
                # before the capability handler executes. Workers cannot mint this
                # context themselves because it is derived from the validated ActionRequest.
                handler_context["_guardian_authorization"] = {
                    "decision_id": str(action.decision_id),
                    "execution_id": str(action.execution_id),
                    "floor_id": action.floor_id,
                    "capability_name": action.capability_name,
                    "authorized_by": action.authorized_by,
                }
                out_data = capability.handler(action.parameters, handler_context)
            else:
                out_data = {"status": "executed", "capability": capability.name, "parameters": action.parameters}

            duration_ms = round((time.time() - start_time) * 1000.0, 2)
            self.circuit_breaker.record_success()

            return WorkerResult(
                action_id=action.action_id,
                execution_id=action.execution_id,
                capability_name=action.capability_name,
                target_worker=action.target_worker,
                status=ExecutionStatus.SUCCESS,
                duration_ms=duration_ms,
                output_data=out_data if isinstance(out_data, dict) else {"result": out_data},
            )
        except Exception as exc:
            duration_ms = round((time.time() - start_time) * 1000.0, 2)
            self.circuit_breaker.record_failure()
            logger.error("worker_runner_execution_failed", capability=action.capability_name, error=str(exc))

            return WorkerResult(
                action_id=action.action_id,
                execution_id=action.execution_id,
                capability_name=action.capability_name,
                target_worker=action.target_worker,
                status=ExecutionStatus.FAILED,
                duration_ms=duration_ms,
                error_message=str(exc),
                error_code="WORKER_EXECUTION_ERROR",
            )
