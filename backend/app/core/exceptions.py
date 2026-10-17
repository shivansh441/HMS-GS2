"""Domain exceptions and standardized error response handlers."""

from typing import Any

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import correlation_id_ctx, logger


class AppException(Exception):
    """Base domain exception with HTTP status code and machine-readable error code."""

    def __init__(
        self,
        message: str,
        code: str = "INTERNAL_ERROR",
        status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details


class EntityNotFoundError(AppException):
    """Raised when a requested resource does not exist."""

    def __init__(self, entity: str, identifier: Any) -> None:
        super().__init__(
            message=f"{entity} with identifier '{identifier}' was not found.",
            code="ENTITY_NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )


class PermissionDeniedError(AppException):
    """Raised when an authenticated principal lacks required role/permission."""

    def __init__(self, message: str = "Access denied: insufficient permissions.") -> None:
        super().__init__(
            message=message,
            code="PERMISSION_DENIED",
            status_code=status.HTTP_403_FORBIDDEN,
        )


class PropertyAccessViolationError(AppException):
    """Raised when accessing or mutating data belonging to an unauthorized property."""

    def __init__(self, property_id: str) -> None:
        super().__init__(
            message=f"Access denied: user is not authorized to access property '{property_id}'.",
            code="PROPERTY_ACCESS_VIOLATION",
            status_code=status.HTTP_403_FORBIDDEN,
            details={"property_id": property_id},
        )


class ConflictError(AppException):
    """Raised when an operation conflicts with existing system state."""

    def __init__(self, message: str) -> None:
        super().__init__(
            message=message,
            code="RESOURCE_CONFLICT",
            status_code=status.HTTP_409_CONFLICT,
        )


class AuthenticationError(AppException):
    """Raised when authentication fails (invalid credentials, token expired, etc.)."""

    def __init__(self, message: str = "Authentication failed.") -> None:
        super().__init__(
            message=message,
            code="AUTHENTICATION_ERROR",
            status_code=status.HTTP_401_UNAUTHORIZED,
        )


class NotFoundError(AppException):
    """Raised when a requested resource is not found."""

    def __init__(self, message: str = "Requested resource not found.") -> None:
        super().__init__(
            message=message,
            code="NOT_FOUND",
            status_code=status.HTTP_404_NOT_FOUND,
        )


class ValidationError(AppException):
    """Raised when business validation fails."""

    def __init__(self, message: str = "Validation failed.") -> None:
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


def register_exception_handlers(app: FastAPI) -> None:
    """Register uniform JSON error formatting across all standard and custom exceptions."""

    @app.exception_handler(AppException)
    async def app_exception_handler(_: Request, exc: AppException) -> JSONResponse:
        cid = correlation_id_ctx.get() or "-"
        logger.warning(f"Domain exception: {exc.code} - {exc.message} (cid: {cid})")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": exc.code,
                    "message": exc.message,
                    "details": exc.details,
                    "correlation_id": cid,
                },
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
        cid = correlation_id_ctx.get() or "-"
        logger.info(f"Validation error on request (cid: {cid}): {exc.errors()}")
        formatted_errors = [
            {
                "field": " -> ".join(str(loc) for loc in err["loc"]),
                "message": err["msg"],
                "type": err["type"],
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "success": False,
                "error": {
                    "code": "VALIDATION_ERROR",
                    "message": "Input validation failed. Inspect details for fields.",
                    "details": formatted_errors,
                    "correlation_id": cid,
                },
            },
        )

    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        cid = correlation_id_ctx.get() or "-"
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "success": False,
                "error": {
                    "code": f"HTTP_{exc.status_code}",
                    "message": exc.detail,
                    "details": None,
                    "correlation_id": cid,
                },
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(_: Request, exc: Exception) -> JSONResponse:
        cid = correlation_id_ctx.get() or "-"
        logger.error(f"Unhandled system exception: {exc} (cid: {cid})", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "success": False,
                "error": {
                    "code": "INTERNAL_SERVER_ERROR",
                    "message": (
                        "An unexpected server error occurred. Please contact system support."
                    ),
                    "details": None,
                    "correlation_id": cid,
                },
            },
        )
