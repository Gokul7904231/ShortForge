"""FastAPI entry point for authenticated Floor 04 media synthesis."""

from __future__ import annotations

import os
from typing import Optional

from fastapi import FastAPI

from factoryos.guardian.floors.floor04_guardian import Floor04Guardian
from floors.floor04_media_synthesis.app.api.v1.media import router as media_router
from floors.floor04_media_synthesis.app.services.pipeline import Floor04PipelineService


def create_app(guardian: Optional[Floor04Guardian] = None) -> FastAPI:
    """Build an app with an injectable Guardian for isolated tests and deployments."""
    storage_root = os.environ.get("FLOOR04_MEDIA_STORAGE_ROOT", "data/media_storage")
    effective_guardian = guardian or Floor04Guardian(
        pipeline_service=Floor04PipelineService(storage_root=storage_root)
    )

    app = FastAPI(
        title="FactoryOS Floor 04 — Media Synthesis",
        description="Authenticated API for Guardian-controlled physical media synthesis and verified artifact retrieval.",
        version="2.0.0",
    )
    app.state.guardian = effective_guardian
    app.state.storage_root = str(effective_guardian.pipeline_service.storage_root)
    app.include_router(media_router)
    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "floors.floor04_media_synthesis.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8004")),
        reload=False,
    )
