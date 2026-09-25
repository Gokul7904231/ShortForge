"""Production orchestration for Floor 02.

The pipeline owns execution identity, idempotency, narrative compilation,
quality gates, durable reporting, and the typed handoff. Model output is
always a candidate; the NarrativeCompiler produces the only authoritative IR.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Tuple
from uuid import uuid4

import structlog

from floors.floor02_scripting.app.core.config import settings
from floors.floor02_scripting.app.core.exceptions import Floor02PipelineError, Floor02ValidationError
from floors.floor02_scripting.app.domain.handoff import (
    ExecutionMode,
    ExecutionModeDetails,
    Floor02HandoffPayload,
    Floor02Input,
    FloorExecutionReport,
    HandoffStatus,
    ProvenanceEntry,
    WorkerExecutionSummary,
)
from floors.floor02_scripting.app.domain.script_ir import EvidenceType as ScriptEvidenceType
from floors.floor02_scripting.app.infrastructure.llm_narrative_adapter import LLMNarrativeAdapter
from floors.floor02_scripting.app.infrastructure.memory_store import ScriptMemoryStore
from floors.floor02_scripting.app.logical_workers.narrative_engine import NarrativeCompiler

logger = structlog.get_logger(__name__)


class Floor02Pipeline:
    """Single authoritative production pipeline for canonical F02."""

    def __init__(
        self,
        memory_store: Optional[ScriptMemoryStore] = None,
        llm_adapter: Optional[LLMNarrativeAdapter] = None,
        artifact_report_dir: Optional[str] = None,
    ) -> None:
        self.memory_store = memory_store or ScriptMemoryStore(
            storage_path=settings.MEMORY_STORAGE_PATH,
            max_records=settings.MEMORY_MAX_RECORDS,
        )
        self.llm_adapter = llm_adapter or LLMNarrativeAdapter()
        self.compiler = NarrativeCompiler(adapter=self.llm_adapter)
        self.artifact_report_dir = Path(artifact_report_dir or settings.EXECUTION_REPORT_PATH)

    def _require_upstream(self, inp: Floor02Input, strict: bool) -> None:
        if strict and inp.strict_upstream and inp.floor01_payload is None:
            raise Floor02ValidationError("Production Floor 02 requires a validated Floor 01 handoff")

        if inp.floor01_payload is not None:
            if inp.floor01_payload.handoff_status.value != "VALIDATED":
                raise Floor02ValidationError("Floor 01 handoff must be VALIDATED before production scripting")
            if inp.floor01_payload.plan_id == "":
                raise Floor02ValidationError("Floor 01 handoff is missing plan_id")

    def execute_with_report(
        self,
        inp: Floor02Input,
        strict_rejection: bool = True,
    ) -> Tuple[Floor02HandoffPayload, FloorExecutionReport]:
        started = time.perf_counter()
        started_at = datetime.now(timezone.utc).isoformat()
        execution_id = str(uuid4())

        strict = settings.is_production or strict_rejection or inp.strict_upstream
        self._require_upstream(inp, strict)

        input_fingerprint = self.memory_store.fingerprint(inp.model_dump(mode="json"))
        cached = self.memory_store.get_idempotent_payload(inp.request_id, input_fingerprint)
        if cached:
            try:
                payload = Floor02HandoffPayload.model_validate(cached)
                report = self._build_execution_report(
                    execution_id=execution_id,
                    inp=inp,
                    payload=payload,
                    duration_ms=round((time.perf_counter() - started) * 1000, 2),
                    worker_results=[],
                    warnings=["Idempotent cached payload returned"],
                )
                return payload, report
            except Exception as exc:
                logger.warning("floor02_cached_payload_invalid", error=str(exc))

        try:
            candidate, script_ir, execution_mode, executed_model, candidates = self.compiler.generate(
                inp,
                strict=strict,
            )

            if script_ir.quality is None or not script_ir.quality.accepted:
                raise Floor02ValidationError("F02 quality gates were not satisfied")

            model_provenance = ProvenanceEntry(
                evidence_type=(
                    __import__("floors.floor02_scripting.app.domain.handoff", fromlist=["EvidenceType"]).EvidenceType.MODEL_INFERENCE
                    if execution_mode == ExecutionMode.MODEL
                    else __import__("floors.floor02_scripting.app.domain.handoff", fromlist=["EvidenceType"]).EvidenceType.DETERMINISTIC_RULE
                ),
                source_type="llm_narrative_adapter" if execution_mode == ExecutionMode.MODEL else "deterministic_candidate_engine",
                source_identifier=executed_model or "f02_deterministic_v2",
                method="bounded_candidate_generation_and_compilation",
                summary=f"Generated {len(candidates)} candidate narrative plans and selected {candidate.candidate_id}.",
                raw_data={
                    "candidate_count": len(candidates),
                    "selected_candidate": candidate.candidate_id,
                    "quality_score": script_ir.quality.overall_score,
                },
            )

            script_id = script_ir.script_id
            total_speech = round(
                sum(getattr(scene, "estimated_speech_duration_seconds", 0.0) for scene in script_ir.scenes),
                1,
            )
            payload = Floor02HandoffPayload(
                script_id=script_id,
                script_version=script_ir.script_version,
                plan_id=script_ir.plan_id,
                request_id=inp.request_id,
                floor_id=settings.FLOOR_ID,
                floor_version=settings.FLOOR_VERSION,
                created_at=datetime.now(timezone.utc).isoformat(),
                execution_mode=execution_mode,
                format=inp.narrative_format,
                title=candidate.title,
                logline=candidate.logline,
                target_duration_seconds=inp.target_duration_seconds,
                estimated_total_duration_seconds=total_speech,
                estimated_speech_duration_seconds=total_speech,
                estimated_pause_transition_duration_seconds=0.0,
                scenes=script_ir.scenes,
                character_profiles=[],
                educational_beats={b.beat_id: b.objective for b in script_ir.beats},
                decision_quality_score=script_ir.quality.overall_score,
                handoff_status=HandoffStatus.VALIDATED,
                provenance=[
                    model_provenance,
                    ProvenanceEntry(
                        evidence_type=__import__("floors.floor02_scripting.app.domain.handoff", fromlist=["EvidenceType"]).EvidenceType.DETERMINISTIC_RULE,
                        source_type="narrative_compiler",
                        source_identifier="f02_compiler_v2",
                        method="compile_script_ir",
                        summary="Compiled ScriptIR and re-ran all deterministic hard gates before handoff.",
                        raw_data={"schema_version": script_ir.schema_version},
                    ),
                ],
                script_ir=script_ir,
                quality_report=script_ir.quality,
                successor_handoffs={
                    "floor03_asset_realization": {
                        "script_id": script_ir.script_id,
                        "script_version": script_ir.script_version,
                        "schema_version": script_ir.schema_version,
                    },
                    "floor04_media_synthesis": {
                        "script_id": script_ir.script_id,
                        "script_version": script_ir.script_version,
                        "schema_version": script_ir.schema_version,
                    },
                },
            )

            self.memory_store.add_record(
                script_id=payload.script_id,
                title=payload.title,
                request_id=inp.request_id,
                payload=payload.model_dump(mode="json"),
                metadata={
                    "request_id": inp.request_id,
                    "format": payload.format.value,
                    "script_version": payload.script_version,
                    "quality_score": payload.decision_quality_score,
                },
                request_fingerprint=input_fingerprint,
            )

            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            report = self._build_execution_report(
                execution_id=execution_id,
                inp=inp,
                payload=payload,
                duration_ms=duration_ms,
                worker_results=[
                    WorkerExecutionSummary(
                        worker_name="NarrativeCompiler",
                        execution_mode=execution_mode,
                        duration_ms=duration_ms,
                        decision_quality_score=script_ir.quality.overall_score,
                        status="SUCCESS",
                        summary=f"Compiled ScriptIR v{script_ir.script_version} with {len(script_ir.scenes)} scenes.",
                    )
                ],
                warnings=[],
            )
            self._persist_report_artifact(report)
            return payload, report

        except Floor02ValidationError:
            raise
        except Exception as exc:
            logger.error("floor02_pipeline_execution_failed", error=str(exc))
            raise Floor02PipelineError(f"Floor 02 pipeline failed for request '{inp.request_id}'") from exc

    def execute(self, inp: Floor02Input, strict_rejection: bool = True) -> Floor02HandoffPayload:
        payload, _ = self.execute_with_report(inp, strict_rejection=strict_rejection)
        return payload

    def _build_execution_report(
        self,
        execution_id: str,
        inp: Floor02Input,
        payload: Floor02HandoffPayload,
        duration_ms: float,
        worker_results: List[WorkerExecutionSummary],
        warnings: List[str],
    ) -> FloorExecutionReport:
        quality = payload.quality_report
        gates = quality.hard_gates if quality else {}
        executed = payload.execution_mode == ExecutionMode.MODEL
        return FloorExecutionReport(
            execution_id=execution_id,
            request_id=inp.request_id,
            plan_id=payload.plan_id,
            script_id=payload.script_id,
            floor_id=settings.FLOOR_ID,
            floor_version=settings.FLOOR_VERSION,
            started_at=datetime.now(timezone.utc).isoformat(),
            completed_at=datetime.now(timezone.utc).isoformat(),
            duration_ms=duration_ms,
            execution_mode=ExecutionModeDetails(
                global_mode=payload.execution_mode,
                worker_modes={w.worker_name: w.execution_mode for w in worker_results},
                configured_provider=self.llm_adapter.provider,
                configured_model=self.llm_adapter.model,
                selected_provider=self.llm_adapter.provider,
                selected_model=self.llm_adapter.model,
                executed=executed,
                executed_model=self.llm_adapter.model if executed else None,
            ),
            status=payload.handoff_status,
            input_summary={
                "request_id": inp.request_id,
                "topic_query": inp.topic_query,
                "target_duration_seconds": inp.target_duration_seconds,
                "narrative_format": inp.narrative_format.value,
                "strict_upstream": inp.strict_upstream,
            },
            worker_results=worker_results,
            decisions=[
                {
                    "candidate_id": payload.script_ir.script_id if payload.script_ir else None,
                    "quality_score": payload.decision_quality_score,
                    "scene_count": len(payload.scenes),
                }
            ],
            decision_quality_score=payload.decision_quality_score,
            component_gates=gates,
            provenance_audit=payload.provenance,
            warnings=warnings,
            errors=[],
            handoff_reference={
                "script_id": payload.script_id,
                "script_version": payload.script_version,
                "successors": list(payload.successor_handoffs.keys()),
            },
            script_ir_schema_version=payload.script_ir.schema_version if payload.script_ir else "legacy",
            quality_gates=gates,
        )

    def _persist_report_artifact(self, report: FloorExecutionReport) -> None:
        self.artifact_report_dir.mkdir(parents=True, exist_ok=True)
        report_path = self.artifact_report_dir / f"floor02_execution_{report.execution_id}.json"
        temp_path = report_path.with_suffix(".tmp")
        try:
            with temp_path.open("w", encoding="utf-8") as handle:
                json.dump(report.model_dump(mode="json"), handle, indent=2, ensure_ascii=False)
                handle.flush()
            temp_path.replace(report_path)
        except Exception:
            try:
                if temp_path.exists():
                    temp_path.unlink()
            finally:
                if settings.is_production:
                    raise
                logger.exception("floor02_execution_report_persistence_failed")
