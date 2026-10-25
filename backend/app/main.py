from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.core.errors import (
    AppException,
    app_exception_handler,
    http_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import logger
from app.db.base import Base
from app.db.session import engine
from app.modules.audit.router import audit_router
from app.modules.auth.deps import limiter
from app.modules.auth.router import admin_auth_router, auth_router
from app.modules.me.router import admin_me_router, me_router
from app.modules.properties.router import properties_router
from app.modules.users.router import users_router

# Ensure tables exist on boot (Alembic also handles migrations)
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title=settings.APP_NAME,
    description="Haven Stays Hospitality Platform Core API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Attach Slowapi Rate Limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# Register Custom Error Handlers
app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, unhandled_exception_handler)

# CORS: Explicit allow-list of admin-panel and public-website origins only
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Property-Id"],
)

# Health & Readiness Endpoints
@app.get("/health", tags=["System"])
@app.get("/api/v1/health", tags=["System"])
def health_check():
    return {"status": "ok", "service": "haven-stays-api"}

@app.get("/ready", tags=["System"])
@app.get("/api/v1/ready", tags=["System"])
def readiness_check():
    # Verify DB connectivity
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"status": "ready", "database": "connected"}
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return {"status": "not_ready", "database": "disconnected"}

# Base API v1 Routers
api_v1_prefix = "/api/v1"
app.include_router(auth_router, prefix=api_v1_prefix)
app.include_router(admin_auth_router, prefix=api_v1_prefix)
app.include_router(me_router, prefix=api_v1_prefix)
app.include_router(admin_me_router, prefix=api_v1_prefix)
app.include_router(properties_router, prefix=api_v1_prefix)
app.include_router(users_router, prefix=api_v1_prefix)
app.include_router(audit_router, prefix=api_v1_prefix)

logger.info("Haven Stays FastAPI application initialized successfully")
