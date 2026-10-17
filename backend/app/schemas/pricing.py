"""Pricing schemas for rate plans, seasonal price rules, tax rules, and price computation."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.pricing import TaxType


class RatePlanBase(BaseModel):
    property_id: str
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=30)
    description: str | None = None
    cancellation_policy: str = "flexible"
    min_nights: int = Field(default=1, ge=1)
    max_nights: int = Field(default=365, ge=1)


class RatePlanCreate(RatePlanBase):
    pass


class RatePlanRead(RatePlanBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PriceRuleBase(BaseModel):
    property_id: str
    rate_plan_id: str
    room_type_id: str
    start_date: date
    end_date: date
    price_per_night: Decimal = Field(..., ge=0, decimal_places=2)
    currency: str = Field(default="USD", min_length=3, max_length=3)
    minimum_stay: int = Field(default=1, ge=1)
    is_closed_to_arrival: bool = False
    is_closed_to_departure: bool = False


class PriceRuleCreate(PriceRuleBase):
    pass


class PriceRuleRead(PriceRuleBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class PropertyTaxBase(BaseModel):
    property_id: str
    name: str = Field(..., min_length=2, max_length=100)
    tax_type: TaxType = TaxType.PERCENTAGE
    rate: Decimal = Field(..., decimal_places=4)  # e.g. 0.1200 for 12%
    is_inclusive: bool = False


class PropertyTaxCreate(PropertyTaxBase):
    pass


class PropertyTaxRead(PropertyTaxBase):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DailyPriceBreakdown(BaseModel):
    date: date
    base_rate: Decimal
    tax_amount: Decimal
    total_rate: Decimal


class PriceCalculationRequest(BaseModel):
    property_id: str
    room_type_id: str
    rate_plan_id: str | None = None
    check_in_date: date
    check_out_date: date
    adult_count: int = Field(default=1, ge=1)
    child_count: int = Field(default=0, ge=0)


class PriceCalculationResult(BaseModel):
    """Accurate price computation for a stay using rate rules and property taxes."""

    check_in_date: date
    check_out_date: date
    total_nights: int
    currency: str
    base_amount: Decimal
    tax_amount: Decimal
    service_amount: Decimal
    total_amount: Decimal
    daily_breakdown: list[DailyPriceBreakdown]
