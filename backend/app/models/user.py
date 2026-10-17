"""User and Property-Access-Assignment models enforcing strict multi-property isolation."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.security import UserRole
from app.db.base import Base
from app.models.base import SoftDeleteMixin, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.auth_session import PasswordResetToken, RefreshSession
    from app.models.guest import Guest
    from app.models.property import Property


class User(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """User account entity across the enterprise management system."""

    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Primary or Global System Role
    global_role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, native_enum=False, length=30),
        default=UserRole.FRONT_DESK,
        nullable=False,
        index=True,
    )
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Scoped property assignments
    property_assignments: Mapped[list[UserPropertyAssignment]] = relationship(
        "UserPropertyAssignment",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    guest_profile: Mapped[Guest | None] = relationship(
        "Guest",
        back_populates="user",
        uselist=False,
    )
    refresh_sessions: Mapped[list[RefreshSession]] = relationship(
        "RefreshSession",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    password_resets: Mapped[list[PasswordResetToken]] = relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class UserPropertyAssignment(Base, UUIDMixin, TimestampMixin, SoftDeleteMixin):
    """Binds staff users to specific properties with granular property-level roles."""

    __tablename__ = "user_property_assignments"
    __table_args__ = (
        UniqueConstraint("user_id", "property_id", name="uq_user_property_assignment"),
    )

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    property_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("properties.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Property-specific role (e.g. Front desk at Hotel A, Manager at Hostel B)
    property_role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, native_enum=False, length=30),
        nullable=False,
    )

    # Relationships
    user: Mapped[User] = relationship("User", back_populates="property_assignments")
    property: Mapped[Property] = relationship("Property", back_populates="user_assignments")
