"""FastAPI application entrypoint for Floor 02 (Scripting & Narrative)."""

from fastapi import FastAPI

from floors.floor02_scripting.app.api.v1.script import router as script_router
from floors.floor02_scripting.app.core.config import settings

app = FastAPI(
    title=f"FactoryOS {settings.FLOOR_NAME}",
    version=settings.FLOOR_VERSION,
    description="Floor 02 microservice: production Narrative Compiler and ScriptIR handoff engine.",
)

app.include_router(script_router)


@app.get("/health", tags=["Health"])
def health_check():
    return {
        "status": "healthy",
        "floor_id": settings.FLOOR_ID,
        "legacy_floor_id": settings.LEGACY_FLOOR_ID,
        "floor_name": settings.FLOOR_NAME,
        "floor_version": settings.FLOOR_VERSION,
        "environment": settings.ENVIRONMENT,
    }
