import enum
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy import event as sqlalchemy_event
from sqlalchemy.orm import Mapped, mapped_column, relationship, synonym

from app.db.base import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())

def generate_receipt_number() -> str:
    return f"RCT-{datetime.now(timezone.utc):%Y%m%d}-{uuid.uuid4().hex[:10].upper()}"

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
    has_mess_facility: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
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
    staff_profiles: Mapped[list["StaffProfile"]] = relationship(
        "StaffProfile", back_populates="property"
    )
    mess_facilities: Mapped[list["MessFacility"]] = relationship(
        "MessFacility", back_populates="property", cascade="all, delete-orphan"
    )

class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="users_email_key"),
        UniqueConstraint("phone", name="users_phone_key"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    email: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    full_name: Mapped[str | None] = mapped_column(String(128), nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    customer_persona: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
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
    # PENDING_ACTIVATION | ACTIVE | INACTIVE | SUSPENDED | ARCHIVED
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
    id_document_file_present: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    id_document_file_media_type: Mapped[str | None] = mapped_column(String(64), nullable=True)

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
        "UnitAssignment",
        back_populates="user",
        foreign_keys="UnitAssignment.user_id",
    )
    stay_records: Mapped[list["StayRecord"]] = relationship("StayRecord", back_populates="user")
    staff_profile: Mapped["StaffProfile | None"] = relationship(
        "StaffProfile", back_populates="user", uselist=False
    )

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


class AuditAction(str, enum.Enum):
    CREATE = "CREATE"
    READ = "READ"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    FAILED_LOGIN = "FAILED_LOGIN"
    RATE_OVERRIDE = "RATE_OVERRIDE"
    REFUND = "REFUND"
    PRICE_NEGOTIATION = "PRICE_NEGOTIATION"


class SecuritySeverity(str, enum.Enum):
    LOW = "LOW"
    INFO = "INFO"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    actor_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id = synonym("actor_user_id")
    target_user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    property_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True, index=True
    )
    action: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, index=True)
    actor_email: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    actor_role: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    entity_name: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    client_ip: Mapped[str] = mapped_column(String(45), default="0.0.0.0", nullable=False)
    request_method: Mapped[str | None] = mapped_column(String(10), nullable=True)
    request_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payload_diff: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status_code: Mapped[int] = mapped_column(Integer, default=200, nullable=False)
    timestamp = synonym("created_at")


class SecurityAlert(Base):
    __tablename__ = "security_alerts"
    __table_args__ = (
        Index("ix_security_alerts_severity_resolved", "severity", "is_resolved"),
        Index("ix_security_alerts_source_ip_created", "source_ip", "created_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    alert_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    severity: Mapped[SecuritySeverity] = mapped_column(
        SAEnum(
            SecuritySeverity,
            name="security_severity",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [item.value for item in values],
        ),
        default=SecuritySeverity.MEDIUM,
        nullable=False,
    )
    description: Mapped[str] = mapped_column(Text, nullable=False)
    source_ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    is_resolved: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    resolved_by: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolution_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False, index=True
    )


@sqlalchemy_event.listens_for(AuditLog, "before_update")
def _prevent_audit_log_update(_mapper, _connection, _target) -> None:
    raise ValueError("Audit logs are immutable")


@sqlalchemy_event.listens_for(AuditLog, "before_delete")
def _prevent_audit_log_delete(_mapper, _connection, _target) -> None:
    raise ValueError("Audit logs are immutable")

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


class MealCategory(str, enum.Enum):
    BREAKFAST = "BREAKFAST"
    LUNCH = "LUNCH"
    SNACKS = "SNACKS"
    DINNER = "DINNER"


class DietaryType(str, enum.Enum):
    VEG = "VEG"
    NON_VEG = "NON_VEG"
    EGGETARIAN = "EGGETARIAN"


class MessFacility(Base):
    __tablename__ = "mess_facilities"
    __table_args__ = (
        Index(
            "uq_mess_facilities_one_default_per_property",
            "property_id",
            unique=True,
            postgresql_where=text("is_default = true"),
            sqlite_where=text("is_default = true"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    capacity: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)

    property: Mapped["Property"] = relationship("Property", back_populates="mess_facilities")
    menu_schedules: Mapped[list["MessMenuSchedule"]] = relationship(
        "MessMenuSchedule", back_populates="mess", cascade="all, delete-orphan"
    )


class MealItem(Base):
    __tablename__ = "meal_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    category: Mapped[MealCategory] = mapped_column(
        SAEnum(
            MealCategory,
            name="meal_item_category",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [item.value for item in values],
        ),
        nullable=False,
    )
    dietary_type: Mapped[DietaryType] = mapped_column(
        SAEnum(
            DietaryType,
            name="meal_item_dietary_type",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [item.value for item in values],
        ),
        default=DietaryType.VEG,
        nullable=False,
    )
    ingredients: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class MessMenuSchedule(Base):
    __tablename__ = "mess_menu_schedules"
    __table_args__ = (
        UniqueConstraint(
            "mess_id", "meal_item_id", "scheduled_date", "meal_category",
            name="uq_mess_menu_item_date_category",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    mess_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("mess_facilities.id", ondelete="CASCADE"), nullable=False, index=True
    )
    meal_item_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("meal_items.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    scheduled_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    meal_category: Mapped[MealCategory] = mapped_column(
        SAEnum(
            MealCategory,
            name="mess_menu_category",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [item.value for item in values],
        ),
        nullable=False,
    )

    mess: Mapped["MessFacility"] = relationship("MessFacility", back_populates="menu_schedules")
    meal_item: Mapped["MealItem"] = relationship("MealItem")


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


class AssignmentStatus(str, enum.Enum):
    RESERVED = "RESERVED"
    CHECKED_IN = "CHECKED_IN"
    CHECKED_OUT = "CHECKED_OUT"
    CANCELLED = "CANCELLED"
    NO_SHOW = "NO_SHOW"


class BillingStrategy(str, enum.Enum):
    PER_NIGHT_STAY = "PER_NIGHT_STAY"
    RECURRING_MONTHLY = "RECURRING_MONTHLY"


class CustomerPersona(str, enum.Enum):
    HOTEL_GUEST = "HOTEL_GUEST"
    HOSTEL_GUEST = "HOSTEL_GUEST"
    HOSTELER = "HOSTELER"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"


class PaymentMode(str, enum.Enum):
    CASH = "CASH"
    BANK_TRANSFER = "BANK_TRANSFER"
    UPI = "UPI"


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
    requested_sharing_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
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
    id_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    id_number_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

    reservation_request: Mapped["ReservationRequest"] = relationship(
        "ReservationRequest", back_populates="occupants"
    )


class UnitAssignment(Base):
    __tablename__ = "unit_assignments"
    __table_args__ = (
        Index("ix_unit_assignments_unit_active", "unit_id", "is_active"),
        Index("ix_unit_assignments_user_id", "user_id"),
        Index("ix_unit_assignments_status_active", "status", "is_active"),
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
    status: Mapped[str] = mapped_column(
        String(24), default=AssignmentStatus.CHECKED_IN.value, nullable=False
    )
    standard_rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    rate_override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    actor_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
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
    user: Mapped["User"] = relationship(
        "User", back_populates="unit_assignments", foreign_keys=[user_id]
    )
    reservation_request: Mapped["ReservationRequest | None"] = relationship(
        "ReservationRequest", back_populates="unit_assignments"
    )
    stay_record: Mapped["StayRecord | None"] = relationship(
        "StayRecord", back_populates="assignment", uselist=False
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


class MonthlyInvoice(Base):
    __tablename__ = "monthly_invoices"
    __table_args__ = (
        UniqueConstraint("unit_assignment_id", "billing_month", name="uq_invoice_assignment_month"),
        UniqueConstraint("invoice_number", name="uq_monthly_invoice_number"),
        Index("ix_monthly_invoice_property_month", "property_id", "billing_month"),
        Index("ix_monthly_invoice_user_status", "user_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    invoice_number: Mapped[str] = mapped_column(String(64), nullable=False)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    unit_assignment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("unit_assignments.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    account_id = synonym("user_id")
    billing_month: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    unit_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    mess_fee: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    electricity_arrears: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    water_arrears: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="UNPAID", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False
    )

    property: Mapped["Property"] = relationship("Property")
    unit_assignment: Mapped["UnitAssignment"] = relationship("UnitAssignment")
    user: Mapped["User"] = relationship("User")


class DepositEscrow(Base):
    __tablename__ = "deposit_escrows"
    __table_args__ = (
        UniqueConstraint("unit_assignment_id", name="uq_deposit_escrow_assignment"),
        Index("ix_deposit_escrow_property_status", "property_id", "status"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    unit_assignment_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("unit_assignments.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    collected_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=0, nullable=False
    )
    status: Mapped[str] = mapped_column(String(24), default="DUE", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    property: Mapped["Property"] = relationship("Property")
    unit_assignment: Mapped["UnitAssignment"] = relationship("UnitAssignment")
    user: Mapped["User"] = relationship("User")


class PaymentReceipt(Base):
    __tablename__ = "payment_receipts"
    __table_args__ = (
        CheckConstraint(
            "(invoice_id IS NOT NULL AND deposit_escrow_id IS NULL) OR "
            "(invoice_id IS NULL AND deposit_escrow_id IS NOT NULL)",
            name="ck_payment_receipt_single_target",
        ),
        Index("ix_payment_receipts_property_received", "property_id", "received_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    receipt_number: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, default=generate_receipt_number
    )
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    invoice_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("monthly_invoices.id", ondelete="RESTRICT"), nullable=True
    )
    deposit_escrow_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("deposit_escrows.id", ondelete="RESTRICT"), nullable=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(24), nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    received_by_user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    property: Mapped["Property"] = relationship("Property")
    user: Mapped["User"] = relationship("User", foreign_keys=[user_id])
    received_by: Mapped["User"] = relationship("User", foreign_keys=[received_by_user_id])


CustomerInvoice = MonthlyInvoice
CustomerPaymentReceipt = PaymentReceipt


class StayRecord(Base):
    __tablename__ = "stay_records"
    __table_args__ = (
        Index("ix_stay_records_user_id", "user_id"),
        Index("ix_stay_records_property_id", "property_id"),
        CheckConstraint("guest_count >= 1", name="ck_stay_records_guest_count"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    assignment_id: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("unit_assignments.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    persona: Mapped[str] = mapped_column(String(32), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    guest_count: Mapped[int] = mapped_column(
        Integer, default=1, server_default=text("1"), nullable=False
    )
    final_amount_paid: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), default=Decimal("0.00"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="stay_records")
    property: Mapped["Property"] = relationship("Property", back_populates="stay_records")
    assignment: Mapped["UnitAssignment | None"] = relationship(
        "UnitAssignment", back_populates="stay_record"
    )
    additional_guests: Mapped[list["StayOccupant"]] = relationship(
        "StayOccupant",
        back_populates="stay_record",
        cascade="all, delete-orphan",
    )


class StayOccupant(Base):
    __tablename__ = "stay_occupants"
    __table_args__ = (
        Index("ix_stay_occupants_stay_record_id", "stay_record_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    stay_record_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("stay_records.id", ondelete="CASCADE"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(128), nullable=False)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(16), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(32), nullable=True)
    permanent_address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    id_document_type: Mapped[str] = mapped_column(String(64), nullable=False)
    id_document_number_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    id_document_last4: Mapped[str] = mapped_column(String(8), nullable=False)

    stay_record: Mapped["StayRecord"] = relationship(
        "StayRecord", back_populates="additional_guests"
    )


class StaffProfile(Base):
    __tablename__ = "staff_profiles"
    __table_args__ = (
        Index("ix_staff_profiles_property_id", "property_id"),
        UniqueConstraint("user_id", name="uq_staff_profiles_user_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    designation: Mapped[str] = mapped_column(String(100), nullable=False)
    department: Mapped[str] = mapped_column(String(100), nullable=False)
    property_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False
    )
    base_monthly_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    joining_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="staff_profile")
    property: Mapped["Property"] = relationship("Property", back_populates="staff_profiles")
    attendances: Mapped[list["StaffAttendance"]] = relationship(
        "StaffAttendance", back_populates="staff", cascade="all, delete-orphan"
    )
    salary_disbursements: Mapped[list["StaffSalaryDisbursement"]] = relationship(
        "StaffSalaryDisbursement", back_populates="staff", cascade="all, delete-orphan"
    )


class StaffAttendance(Base):
    __tablename__ = "staff_attendances"
    __table_args__ = (
        UniqueConstraint("staff_id", "year", "month", name="uq_staff_attendance_period"),
        Index("ix_staff_attendances_staff_id", "staff_id"),
        CheckConstraint("month >= 1 AND month <= 12", name="ck_staff_attendance_month"),
        CheckConstraint("worked_days >= 0", name="ck_staff_attendance_worked_days"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    staff_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    worked_days: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    staff: Mapped["StaffProfile"] = relationship("StaffProfile", back_populates="attendances")


class StaffSalaryDisbursement(Base):
    __tablename__ = "staff_salary_disbursements"
    __table_args__ = (
        UniqueConstraint("staff_id", "year", "month", name="uq_staff_salary_period"),
        Index("ix_staff_salary_disbursements_staff_id", "staff_id"),
        CheckConstraint("month >= 1 AND month <= 12", name="ck_staff_salary_month"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    staff_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("staff_profiles.id", ondelete="CASCADE"), nullable=False
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    payable_salary: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    payment_status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(
            PaymentStatus,
            name="staff_payment_status",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [item.value for item in values],
        ),
        default=PaymentStatus.PENDING,
        nullable=False,
    )
    payment_mode: Mapped[PaymentMode | None] = mapped_column(
        SAEnum(
            PaymentMode,
            name="staff_payment_mode",
            native_enum=False,
            create_constraint=True,
            values_callable=lambda values: [item.value for item in values],
        ),
        nullable=True,
    )
    transaction_reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payment_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, nullable=False
    )

    staff: Mapped["StaffProfile"] = relationship(
        "StaffProfile", back_populates="salary_disbursements"
    )
