"""Common API response envelopes, pagination, and error schemas."""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel, ConfigDict, Field

T = TypeVar("T")


class PaginationParams(BaseModel):
    """Standardized pagination, sorting, and ordering query parameters."""

    model_config = ConfigDict(extra="forbid")

    page: int = Field(default=1, ge=1, description="1-indexed page number")
    page_size: int = Field(default=20, ge=1, le=100, description="Items per page (max 100)")
    sort_by: str = Field(default="created_at", description="Field name to sort by")
    sort_order: Literal["asc", "desc"] = Field(default="desc", description="Sorting direction")

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


class PaginatedMeta(BaseModel):
    """Pagination metadata included in paginated responses."""

    total: int = Field(..., description="Total count of matching records across all pages")
    page: int = Field(..., description="Current page number")
    page_size: int = Field(..., description="Items requested per page")
    total_pages: int = Field(..., description="Total available pages")
    has_next: bool
    has_previous: bool


class PaginatedResponse(BaseModel, Generic[T]):
    """Standardized envelope for paginated resource lists."""

    items: list[T]
    meta: PaginatedMeta


class ApiResponse(BaseModel, Generic[T]):
    """Universal production envelope for standard single-resource API responses."""

    success: bool = True
    data: T
    message: str | None = None
    correlation_id: str | None = None
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ErrorDetail(BaseModel):
    """Individual field error or issue detail."""

    code: str
    message: str
    details: Any = None
    correlation_id: str | None = None


class ErrorResponse(BaseModel):
    """Universal production envelope for API failure responses."""

    success: bool = False
    error: ErrorDetail
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class Money(BaseModel):
    """High-precision monetary representation ensuring zero floating-point drift."""

    amount: Decimal = Field(
        ...,
        decimal_places=2,
        max_digits=12,
        description="Monetary value with 2 decimal places",
    )
    currency: str = Field(
        default="USD",
        min_length=3,
        max_length=3,
        description="ISO 4217 Currency Code",
    )
