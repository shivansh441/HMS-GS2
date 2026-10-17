"""FastAPI application entry point for GrandStay Hybrid HMS."""

import time
import uuid
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.exceptions import register_exception_handlers
from app.core.logging import correlation_id_ctx, logger, setup_logging


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifecycle events: startup and graceful shutdown."""
    setup_logging(log_level=settings.LOG_LEVEL, log_format=settings.LOG_FORMAT)
    logger.info(
        f"Starting {settings.PROJECT_NAME} v{settings.VERSION} "
        f"[env={settings.ENVIRONMENT}, debug={settings.DEBUG}]"
    )
    yield
    logger.info(f"Shutting down {settings.PROJECT_NAME} cleanly.")


def create_application() -> FastAPI:
    """Application factory for FastAPI instance."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description=(
            "Enterprise Hybrid Hostel & Hotel Management Platform. "
            "Supports unified multi-property administrative operations, "
            "separate hostel and hotel domain workflows, and property-level data isolation."
        ),
        openapi_url=f"{settings.API_V1_STR}/openapi.json",
        docs_url=f"{settings.API_V1_STR}/docs",
        redoc_url=f"{settings.API_V1_STR}/redoc",
        lifespan=lifespan,
    )

    # Correlation ID & Timing Middleware
    class RequestTracingMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
            correlation_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
            token = correlation_id_ctx.set(correlation_id)
            start_time = time.perf_counter()

            try:
                response = await call_next(request)
                process_time = round((time.perf_counter() - start_time) * 1000, 2)
                response.headers["X-Request-ID"] = correlation_id
                response.headers["X-Process-Time-Ms"] = str(process_time)
                return response
            finally:
                correlation_id_ctx.reset(token)

    app.add_middleware(RequestTracingMiddleware)

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.BACKEND_CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register centralized exception handlers
    register_exception_handlers(app)

    # Mount versioned API router
    app.include_router(api_router, prefix=settings.API_V1_STR)

    # Root redirect / basic info
    @app.get("/", include_in_schema=False)
    async def root_ping() -> dict[str, str]:
        return {
            "name": settings.PROJECT_NAME,
            "version": settings.VERSION,
            "docs": f"{settings.API_V1_STR}/docs",
            "health": f"{settings.API_V1_STR}/health",
        }

    return app


app = create_application()
