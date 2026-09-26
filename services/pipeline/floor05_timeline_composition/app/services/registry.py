"""Atomic local registry for TimelineSpec and RenderJob provenance."""
from __future__ import annotations

import json
import os
import threading
from pathlib import Path
from typing import Dict, Optional

import structlog

from floors.floor05_timeline_composition.app.domain.handoff import RenderJobSpecification, TimelineSpec

logger = structlog.get_logger(__name__)


class TimelineRegistry:
    """Small transactional registry; intentionally replaceable by durable storage later."""

    _lock = threading.RLock()

    def __init__(self, storage_root: str):
        self.storage_root = Path(storage_root).resolve()
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self.db_file = self.storage_root / "timeline_registry_db.json"
        self._init_db()

    def _init_db(self) -> None:
        if not self.db_file.exists():
            self._atomic_save({"schema_version": "2", "timelines": {}, "render_jobs": {}})

    def _load_db(self) -> Dict:
        try:
            return json.loads(self.db_file.read_text(encoding="utf-8"))
        except Exception as exc:
            logger.warning("timeline_registry_corrupt_or_missing", error=str(exc))
            return {"schema_version": "2", "timelines": {}, "render_jobs": {}}

    def _atomic_save(self, data: Dict) -> None:
        self.storage_root.mkdir(parents=True, exist_ok=True)
        tmp = self.db_file.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
        os.replace(tmp, self.db_file)

    def register_timeline(self, timeline_spec: TimelineSpec) -> None:
        with self._lock:
            db = self._load_db()
            existing = db["timelines"].get(timeline_spec.timeline_id)
            if existing is not None and existing != json.loads(timeline_spec.model_dump_json()):
                raise ValueError(f"Timeline identity collision for {timeline_spec.timeline_id}")
            db["timelines"][timeline_spec.timeline_id] = json.loads(timeline_spec.model_dump_json())
            self._atomic_save(db)

    def register_render_job(self, render_job: RenderJobSpecification) -> None:
        with self._lock:
            db = self._load_db()
            existing = db["render_jobs"].get(render_job.render_job_id)
            serialized = json.loads(render_job.model_dump_json())
            if existing is not None and existing != serialized:
                raise ValueError(f"Render job identity collision for {render_job.render_job_id}")
            db["render_jobs"][render_job.render_job_id] = serialized
            self._atomic_save(db)

    def get_timeline(self, timeline_id: str) -> Optional[TimelineSpec]:
        with self._lock:
            record = self._load_db()["timelines"].get(timeline_id)
            return TimelineSpec.model_validate(record) if record else None

    def get_render_job_by_hash(self, render_input_hash: str) -> Optional[RenderJobSpecification]:
        with self._lock:
            db = self._load_db()
            for record in db["render_jobs"].values():
                if (
                    record.get("render_input_hash") == render_input_hash
                    and record.get("state") == "COMMITTED"
                    and record.get("artifact_reference")
                    and Path(record["artifact_reference"]).exists()
                ):
                    return RenderJobSpecification.model_validate(record)
        return None
