import enum
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from app.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())

def utc_now() -> datetime:
    return datetime.now(timezone.utc)

class Property(Base):
    __tablename__ = "properties"
    __table_args__ = (UniqueConstraint("code", name="properties_code_key"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    code: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", nullable=False)
    type: Mapped[str] = mapped_column(String(32), default="HOTEL", nullable=False)
    floors: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    address: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    city: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    state: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    pincode: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    contact_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    facilities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="INR", nullable=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    user_access: Mapped[list["UserPropertyAccess"]] = relationship("UserPropertyAccess", back_populates="property", cascade="all, delete-orphan")
    customer_links: Mapped[list["CustomerPropertyLink"]] = relationship("CustomerPropertyLink", back_populates="property", cascade="all, delete-orphan")
    floors_inventory: Mapped[list["Floor"]] = relationship("Floor", back_populates="property")
    units: Mapped[list["Unit"]] = relationship("Unit", back_populates="property")
    fee_configs: Mapped[list["PropertyFeeConfig"]] = relationship("PropertyFeeConfig", back_populates="property")
    reservation_requests: Mapped[list["ReservationRequest"]] = relationship(
        "ReservationRequest", back_populates="property"
    )
    stay_records: Mapped[list["StayRecord"]] = relationship("StayRecord", back_populates="property")

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="users_email_key"),
        UniqueConstraint("username", name="users_username_key"),
        UniqueConstraint("phone", name="users_phone_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    username: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    customer_persona: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    emergency_contact_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    emergency_contact_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    permanent_address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    occupation: Mapped[str | None] = mapped_column(String(128), nullable=True)
    
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    role: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    # FRONT_DESK | MAINTENANCE | HOUSEKEEPING
    staff_role: Mapped[str | None] = mapped_column(String(64), nullable=True)
    # PENDING_ACTIVATION | ACTIVE | SUSPENDED | ARCHIVED
    status: Mapped[str] = mapped_column(String(32), default="ACTIVE", index=True, nullable=False)

    # MFA
    mfa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_enforced: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    mfa_secret_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    # ID Document (AES-256-GCM encrypted + last4 + lookup hash)
    id_document_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    id_document_number_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    id_document_last4: Mapped[str | None] = mapped_column(String(8), nullable=True)
    id_document_lookup_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)

    # Security controls
    failed_login_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    lockout_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_totp_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    pending_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    pending_phone: Mapped[str | None] = mapped_column(String(32), nullable=True)

    created_by_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now)

    sessions: Mapped[list["SessionModel"]] = relationship("SessionModel", back_populates="user", cascade="all, delete-orphan")
    property_access: Mapped[list["UserPropertyAccess"]] = relationship("UserPropertyAccess", back_populates="user", cascade="all, delete-orphan")
    customer_property_links: Mapped[list["CustomerPropertyLink"]] = relationship("CustomerPropertyLink", back_populates="user", cascade="all, delete-orphan")
    reservation_requests: Mapped[list["ReservationRequest"]] = relationship(
        "ReservationRequest", back_populates="primary_user"
    )
    unit_assignments: Mapped[list["UnitAssignment"]] = relationship(
        "UnitAssignment", back_populates="user"
    )
    stay_records: Mapped[list["StayRecord"]] = relationship("StayRecord", back_populates="user")

class SessionModel(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("refresh_token_hash", name="sessions_refresh_token_hash_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    family_id: Mapped[str] = mapped_column(String(36), index=True, nullable=False)
    audience: Mapped[str] = mapped_column(String(16), default="customer", nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    last_active_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    is_revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    revoked_reason: Mapped[str | None] = mapped_column(String(128), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    user: Mapped["User"] = relationship("User", back_populates="sessions")

class UserPropertyAccess(Base):
    __tablename__ = "user_property_access"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    property_id: Mapped[str] = mapped_column(String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_user_property_access"),
    )

    user: Mapped["User"] = relationship("User", back_populates="property_access")
    property: Mapped["Property"] = relationship("Property", back_populates="user_access")

class CustomerPropertyLink(Base):
    __tablename__ = "customer_property_links"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    property_id: Mapped[str] = mapped_column(String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False)
    source: Mapped[str] = mapped_column(String(32), default="MANUAL", nullable=False) # OFFLINE_ONBOARD | BOOKING | MANUAL
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_customer_property_link"),
    )

    user: Mapped["User"] = relationship("User", back_populates="customer_property_links")
    property: Mapped["Property"] = relationship("Property", back_populates="customer_links")

class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    recipient: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    channel: Mapped[str] = mapped_column(String(16), default="EMAIL", nullable=False) # EMAIL | SMS
    purpose: Mapped[str] = mapped_column(String(32), default="LOGIN", nullable=False) # LOGIN | VERIFY_PHONE | VERIFY_EMAIL
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

class VerificationToken(Base):
    __tablename__ = "verification_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    token_hash: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    token_type: Mapped[str] = mapped_column(String(32), nullable=False) # EMAIL_VERIFY | PASSWORD_RESET | MAGIC_LINK | ACTIVATION
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    metadata_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

class LinkedIdentity(Base):
    __tablename__ = "linked_identities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False) # GOOGLE | APPLE
    provider_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    __table_args__ = (
        UniqueConstraint("provider", "provider_user_id", name="uq_provider_identity"),
    )

class MfaRecoveryCode(Base):
    __tablename__ = "mfa_recovery_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    is_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    actor_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    target_user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    property_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)

class OutboxMessage(Base):
    __tablename__ = "outbox_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    channel: Mapped[str] = mapped_column(String(32), default="EMAIL", nullable=False)
    destination: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="PENDING", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Floor(Base):
    __tablename__ = "floors"
    __table_args__ = (UniqueConstraint("property_id", "number", name="uq_floor_property_number"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(String(128), default="", nullable=False)
    amenities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    access_zone: Mapped[str | None] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    property: Mapped["Property"] = relationship("Property", back_populates="floors_inventory")
    units: Mapped[list["Unit"]] = relationship("Unit", back_populates="floor_record")


class Unit(Base):
    __tablename__ = "units"
    __table_args__ = (
        UniqueConstraint("property_id", "unit_number", name="uq_unit_property_number"),
        UniqueConstraint("property_id", "smart_lock_id", name="uq_unit_property_smart_lock"),
        Index("ix_units_property_status", "property_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    floor_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("floors.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("units.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    unit_number: Mapped[str] = mapped_column(String(64), nullable=False)
    code = synonym("unit_number")
    floor: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    type: Mapped[str] = mapped_column(String(16), default="ROOM", nullable=False)
    category: Mapped[str] = mapped_column(String(32), default="CLASSIC", nullable=False)
    sharing_type: Mapped[str | None] = mapped_column(String(16), nullable=True, index=True)
    capacity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    default_price_per_night: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    default_recurring_monthly_rate: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    base_rate_daily = synonym("default_price_per_night")
    base_rate_monthly = synonym("default_recurring_monthly_rate")
    deposit_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    utility_package_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    features: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    amenities = synonym("features")
    status: Mapped[str] = mapped_column(String(16), default="AVAILABLE", nullable=False)
    smart_lock_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    property: Mapped["Property"] = relationship("Property", back_populates="units")
    floor_record: Mapped["Floor | None"] = relationship("Floor", back_populates="units")
    parent: Mapped["Unit | None"] = relationship(
        "Unit", remote_side="Unit.id", back_populates="children"
    )
    children: Mapped[list["Unit"]] = relationship("Unit", back_populates="parent")
    unit_assignments: Mapped[list["UnitAssignment"]] = relationship(
        "UnitAssignment", back_populates="unit"
    )


class PropertyFeeConfig(Base):
    __tablename__ = "property_fee_configs"
    __table_args__ = (
        UniqueConstraint("property_id", "fee_type", name="uq_property_fee_type"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fee_type: Mapped[str] = mapped_column(String(32), default="UNIT_FEE", nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    is_mandatory: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    pricing_basis: Mapped[str] = mapped_column(String(16), default="FIXED_FLAT", nullable=False)
    billing_timing: Mapped[str] = mapped_column(String(16), default="ADVANCE", nullable=False)
    rate_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    unit_of_measure: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )

    property: Mapped["Property"] = relationship("Property", back_populates="fee_configs")


class ReservationStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    WAITLISTED = "WAITLISTED"
    REJECTED = "REJECTED"
    CONVERTED = "CONVERTED"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


class ChannelOrigin(str, enum.Enum):
    PUBLIC_WEB = "PUBLIC_WEB"
    PUBLIC_MOBILE = "PUBLIC_MOBILE"
    WALK_IN = "WALK_IN"
    PHONE = "PHONE"
    OTA_IMPORT = "OTA_IMPORT"


class BillingStrategy(str, enum.Enum):
    PER_NIGHT_STAY = "PER_NIGHT_STAY"
    RECURRING_MONTHLY = "RECURRING_MONTHLY"


class CustomerPersona(str, enum.Enum):
    HOTEL_GUEST = "HOTEL_GUEST"
    HOSTEL_GUEST = "HOSTEL_GUEST"
    HOSTELER = "HOSTELER"


class ReservationRequest(Base):
    __tablename__ = "reservation_requests"
    __table_args__ = (
        Index("ix_reservation_requests_property_status", "property_id", "status"),
        Index("ix_reservation_requests_mobile_email", "mobile", "email"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    request_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    primary_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    guest_name: Mapped[str] = mapped_column(String(100), nullable=False)
    mobile: Mapped[str] = mapped_column(String(20), nullable=False)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    requested_category: Mapped[str] = mapped_column(String(50), default="CLASSIC", nullable=False)
    requested_type: Mapped[str] = mapped_column(String(20), default="ROOM", nullable=False)
    requested_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    number_of_adults: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    number_of_children: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expected_check_in: Mapped[date] = mapped_column(Date, nullable=False)
    expected_check_out: Mapped[date | None] = mapped_column(Date, nullable=True)
    channel_origin: Mapped[str] = mapped_column(
        String(32), default=ChannelOrigin.PUBLIC_WEB.value, nullable=False
    )
    status: Mapped[str] = mapped_column(
        String(32), default=ReservationStatus.PENDING.value, nullable=False
    )
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    property: Mapped["Property"] = relationship(
        "Property", back_populates="reservation_requests"
    )
    primary_user: Mapped["User | None"] = relationship(
        "User", back_populates="reservation_requests"
    )
    occupants: Mapped[list["ReservationOccupant"]] = relationship(
        "ReservationOccupant",
        back_populates="reservation_request",
        cascade="all, delete-orphan",
    )
    unit_assignments: Mapped[list["UnitAssignment"]] = relationship(
        "UnitAssignment", back_populates="reservation_request"
    )


class ReservationOccupant(Base):
    __tablename__ = "reservation_occupants"
    __table_args__ = (
        Index("ix_reservation_occupants_reservation_request_id", "reservation_request_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    reservation_request_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("reservation_requests.id", ondelete="CASCADE"),
        nullable=False,
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    first_name: Mapped[str] = mapped_column(String(50), nullable=False)
    last_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    email: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)

    reservation_request: Mapped["ReservationRequest"] = relationship(
        "ReservationRequest", back_populates="occupants"
    )


class UnitAssignment(Base):
    __tablename__ = "unit_assignments"
    __table_args__ = (
        Index("ix_unit_assignments_unit_active", "unit_id", "is_active"),
        Index("ix_unit_assignments_user_id", "user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    unit_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("units.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    reservation_request_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("reservation_requests.id", ondelete="SET NULL"),
        nullable=True,
    )
    billing_strategy: Mapped[str] = mapped_column(
        String(32), default=BillingStrategy.PER_NIGHT_STAY.value, nullable=False
    )
    agreed_price_per_night: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    agreed_monthly_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    agreed_rate = synonym("agreed_monthly_rate")
    expected_check_in: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    actual_check_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expected_check_out: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    actual_check_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    unit: Mapped["Unit"] = relationship("Unit", back_populates="unit_assignments")
    user: Mapped["User"] = relationship("User", back_populates="unit_assignments")
    reservation_request: Mapped["ReservationRequest | None"] = relationship(
        "ReservationRequest", back_populates="unit_assignments"
    )


class UtilityMeterReading(Base):
    __tablename__ = "utility_meter_readings"
    __table_args__ = (
        UniqueConstraint(
            "unit_assignment_id",
            "fee_type",
            "period_start",
            "period_end",
            name="uq_utility_reading_assignment_fee_period",
        ),
        Index("ix_utility_reading_property_status", "property_id", "billing_status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    unit_assignment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("unit_assignments.id", ondelete="RESTRICT"), nullable=False
    )
    fee_type: Mapped[str] = mapped_column(String(32), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    previous_reading: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    current_reading: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    consumption: Mapped[Decimal] = mapped_column(Numeric(12, 3), nullable=False)
    rate_per_unit: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    billing_status: Mapped[str] = mapped_column(String(16), default="QUEUED", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    property: Mapped["Property"] = relationship("Property")
    unit_assignment: Mapped["UnitAssignment"] = relationship("UnitAssignment")


class StayRecord(Base):
    __tablename__ = "stay_records"
    __table_args__ = (
        Index("ix_stay_records_user_id", "user_id"),
        Index("ix_stay_records_property_id", "property_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    persona: Mapped[str] = mapped_column(String(32), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="stay_records")
    property: Mapped["Property"] = relationship("Property", back_populates="stay_records")
