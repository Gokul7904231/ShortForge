"""Application entrypoint for Floor 01 with bounded CORS and security headers."""

from __future__ import annotations

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from floors.floor01_strategy.app.api.v1.strategy import router as strategy_router
from floors.floor01_strategy.app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title=f"FactoryOS {settings.floor_id.upper()} — {settings.floor_name}",
        description="FactoryOS Strategy & Intelligence Floor.",
        version=settings.floor_version,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    origins = settings.cors_origins or ["http://localhost:3000"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(strategy_router)
    return app


app = create_app()
