"""Application entrypoint for Floor 01 with bounded CORS and security headers."""

from __future__ import annotations

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from floor01_strategy.app.api.v1.strategy import router as strategy_router
from floor01_strategy.app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    if settings.environment.lower() not in {"development", "test"} and not settings.service_api_key:
        raise RuntimeError(
            "FLOOR01_SERVICE_API_KEY must be configured before starting Floor 01 in production."
        )

    is_production = settings.environment.lower() == "production"
    app = FastAPI(
        title=f"FactoryOS {settings.floor_id.upper()} — {settings.floor_name}",
        description="FactoryOS Strategy & Intelligence Floor.",
        version=settings.floor_version,
        docs_url=None if is_production else "/docs",
        redoc_url=None if is_production else "/redoc",
        openapi_url=None if is_production else "/openapi.json",
    )

    origins = settings.cors_origins
    if not origins and settings.environment.lower() in {"development", "test"}:
        origins = ["http://localhost:3000"]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    @app.middleware("http")
    async def enforce_request_limits_and_security_headers(request: Request, call_next):
        if request.method == "POST":
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    content_length_value = int(content_length)
                except ValueError:
                    return Response(
                        content="Invalid Content-Length",
                        status_code=400,
                        media_type="text/plain",
                    )
                if content_length_value > 262144:
                    return Response(
                    content="Request body too large",
                    status_code=413,
                    media_type="text/plain",
                )

        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
        if is_production:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(strategy_router)
    return app


app = create_app()
