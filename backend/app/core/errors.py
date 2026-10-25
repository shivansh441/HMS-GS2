from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


class AppException(Exception):
    def __init__(
        self,
        status_code: int = status.HTTP_400_BAD_REQUEST,
        code: str = "BAD_REQUEST",
        message: str = "An error occurred",
        details: list[Any] | None = None,
    ):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []
        super().__init__(message)

class NotFoundError(AppException):
    def __init__(self, message: str = "Resource not found", code: str = "NOT_FOUND"):
        super().__init__(status_code=status.HTTP_404_NOT_FOUND, code=code, message=message)

class ForbiddenError(AppException):
    def __init__(self, message: str = "Access denied", code: str = "FORBIDDEN"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, code=code, message=message)

class UnauthorizedError(AppException):
    def __init__(self, message: str = "Unauthorized", code: str = "UNAUTHORIZED"):
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, code=code, message=message)

class ConflictError(AppException):
    def __init__(self, message: str = "Conflict", code: str = "CONFLICT"):
        super().__init__(status_code=status.HTTP_409_CONFLICT, code=code, message=message)

class ValidationError(AppException):
    def __init__(self, message: str = "Validation failed", details: list[Any] | None = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="VALIDATION_ERROR",
            message=message,
            details=details or [],
        )

def format_error_response(status_code: int, code: str, message: str, details: list[Any] | None = None) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "statusCode": status_code,
            "error": {
                "code": code,
                "message": message,
                "details": details or [],
            },
        },
    )

async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    return format_error_response(exc.status_code, exc.code, exc.message, exc.details)

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    details = []
    for err in exc.errors():
        loc = ".".join(str(item) for item in err.get("loc", []))
        details.append({"field": loc, "issue": err.get("msg")})
    return format_error_response(
        status.HTTP_422_UNPROCESSABLE_ENTITY,
        "VALIDATION_ERROR",
        "Request payload validation failed",
        details,
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code_map = {
        400: "BAD_REQUEST",
        401: "UNAUTHORIZED",
        403: "FORBIDDEN",
        404: "NOT_FOUND",
        405: "METHOD_NOT_ALLOWED",
        429: "TOO_MANY_REQUESTS",
        500: "INTERNAL_SERVER_ERROR",
        501: "NOT_IMPLEMENTED",
    }
    code = code_map.get(exc.status_code, "HTTP_ERROR")
    return format_error_response(exc.status_code, code, str(exc.detail))

async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return format_error_response(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred",
    )
