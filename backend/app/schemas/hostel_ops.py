"""Hostel operational schemas for resident admissions and agreements."""

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from app.models.hostel_ops import AgreementStatus, AgreementTermType


class HostelResidentProfileCreate(BaseModel):
    guest_id: str
    property_id: str
    emergency_contact_name: str
    emergency_contact_phone: str
    institution_or_employer: str | None = None
    student_or_work_id: str | None = None
    curfew_exemption: bool = False
    notes: str | None = None


class HostelResidentProfileRead(HostelResidentProfileCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    is_kyc_verified: bool
    created_at: datetime


class HostelAgreementCreate(BaseModel):
    property_id: str
    resident_profile_id: str
    allocated_bed_id: str
    agreement_number: str
    start_date: date
    end_date: date
    term_type: AgreementTermType = AgreementTermType.SEMESTER
    monthly_rate: Decimal = Field(..., ge=0)
    security_deposit: Decimal = Field(default=Decimal("0.00"), ge=0)
    special_terms: str | None = None


class HostelAgreementRead(HostelAgreementCreate):
    model_config = ConfigDict(from_attributes=True)

    id: str
    status: AgreementStatus
    created_at: datetime
