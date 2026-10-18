"""Authentication service handling registration, login, token rotation, password change, and reset."""

from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import (
    AuthenticationError,
    ConflictError,
    EntityNotFoundError,
    ValidationError,
)
from app.core.security import (
    UserRole,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    generate_secure_token,
    get_password_hash,
    hash_token,
    verify_password,
)
from app.models.auth_session import PasswordResetToken, RefreshSession
from app.models.guest import Guest
from app.models.user import User, UserPropertyAssignment
from app.schemas.auth import (
    AdminProvisionUserRequest,
    ChangePasswordRequest,
    CustomerRegisterRequest,
    ForgotPasswordRequest,
    LoginRequest,
    ResetPasswordRequest,
    Token,
)


class AuthService:
    """Service orchestrating auth operations against PostgreSQL."""

    @staticmethod
    async def register_customer(session: AsyncSession, data: CustomerRegisterRequest) -> User:
        """Register a new customer account."""
        # Check if email exists
        existing = await session.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise ConflictError(f"Email address '{data.email}' is already registered.")

        hashed_pwd = get_password_hash(data.password)
        user = User(
            email=data.email,
            hashed_password=hashed_pwd,
            first_name=data.first_name,
            last_name=data.last_name,
            global_role=UserRole.GUEST,
            is_superuser=False,
            is_active=True,
        )
        session.add(user)
        await session.flush()

        # Create corresponding Guest profile for booking linkage
        guest = Guest(
            user_id=user.id,
            email=data.email,
            first_name=data.first_name,
            last_name=data.last_name,
            phone=data.phone,
            country=data.country,
        )
        session.add(guest)
        await session.commit()
        await session.refresh(user)
        return user

    @staticmethod
    async def authenticate_user(
        session: AsyncSession,
        data: LoginRequest,
        ip_address: str | None = None,
        device_info: str | None = None,
    ) -> tuple[Token, str]:
        """Authenticate user credentials and issue access + refresh tokens."""
        result = await session.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()

        if not user or not verify_password(data.password, user.hashed_password):
            raise AuthenticationError("Incorrect email or password.")

        if not user.is_active:
            raise AuthenticationError("User account is deactivated.")

        # If property_id is provided, verify staff assignment (skip for guests / super_admins)
        if data.property_id and not user.is_superuser and user.global_role != UserRole.SUPER_ADMIN:
            if user.global_role != UserRole.GUEST:
                assignment_res = await session.execute(
                    select(UserPropertyAssignment).where(
                        UserPropertyAssignment.user_id == user.id,
                        UserPropertyAssignment.property_id == data.property_id,
                        UserPropertyAssignment.is_active,
                    )
                )
                if not assignment_res.scalar_one_or_none():
                    raise AuthenticationError("User is not authorized for the requested property.")

        # Create tokens
        access_token = create_access_token(
            subject=user.id,
            role=user.global_role,
            property_id=data.property_id,
        )
        refresh_token = create_refresh_token(
            subject=user.id,
            role=user.global_role,
        )

        # Store hashed refresh session
        refresh_hash = hash_token(refresh_token)
        expires_at = datetime.now(UTC) + timedelta(days=7)
        refresh_session = RefreshSession(
            user_id=user.id,
            refresh_token_hash=refresh_hash,
            ip_address=ip_address,
            device_info=device_info,
            expires_at=expires_at,
            is_revoked=False,
        )
        session.add(refresh_session)
        await session.commit()

        token_response = Token(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=1800,
            role=user.global_role,
            property_id=data.property_id,
        )
        return token_response, refresh_token

    @staticmethod
    async def rotate_refresh_token(
        session: AsyncSession,
        refresh_token: str,
        ip_address: str | None = None,
        device_info: str | None = None,
    ) -> Token:
        """Rotate refresh token and detect reuse/revocation."""
        try:
            payload = decode_access_token(refresh_token, expected_type="refresh")
        except Exception as e:
            raise AuthenticationError(f"Invalid refresh token: {e}") from e

        token_hash = hash_token(refresh_token)
        result = await session.execute(
            select(RefreshSession).where(RefreshSession.refresh_token_hash == token_hash)
        )
        ref_session = result.scalar_one_or_none()

        if not ref_session:
            raise AuthenticationError("Invalid or non-existent refresh token session.")

        if ref_session.is_revoked:
            # Security Alert: Reuse detected on an already revoked/rotated token!
            # Revoke all active sessions for this user immediately
            user_sessions = await session.execute(
                select(RefreshSession).where(
                    RefreshSession.user_id == ref_session.user_id,
                    RefreshSession.is_revoked.is_(False),
                )
            )
            for s in user_sessions.scalars().all():
                s.is_revoked = True
                s.revoked_at = datetime.now(UTC)
            await session.commit()
            raise AuthenticationError("Refresh token reuse detected. All active sessions have been revoked for security.")

        exp = ref_session.expires_at
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)

        if not exp or exp < datetime.now(UTC):
            ref_session.is_revoked = True
            ref_session.revoked_at = datetime.now(UTC)
            await session.commit()
            raise AuthenticationError("Refresh token session has expired.")

        # Revoke current refresh session (rotation)
        ref_session.is_revoked = True
        ref_session.revoked_at = datetime.now(UTC)

        # Fetch user
        user_res = await session.execute(select(User).where(User.id == payload.sub, User.is_active.is_(True)))
        user = user_res.scalar_one_or_none()
        if not user:
            raise AuthenticationError("User not found or deactivated.")

        # Issue new pair
        new_access = create_access_token(subject=user.id, role=user.global_role)
        new_refresh = create_refresh_token(subject=user.id, role=user.global_role)

        new_hash = hash_token(new_refresh)
        new_session = RefreshSession(
            user_id=user.id,
            refresh_token_hash=new_hash,
            ip_address=ip_address,
            device_info=device_info,
            expires_at=datetime.now(UTC) + timedelta(days=7),
            is_revoked=False,
        )
        session.add(new_session)
        await session.commit()

        return Token(
            access_token=new_access,
            refresh_token=new_refresh,
            expires_in=1800,
            role=user.global_role,
        )

    @staticmethod
    async def logout(session: AsyncSession, refresh_token: str) -> None:
        """Revoke refresh session."""
        token_hash = hash_token(refresh_token)
        result = await session.execute(
            select(RefreshSession).where(RefreshSession.refresh_token_hash == token_hash)
        )
        ref_session = result.scalar_one_or_none()
        if ref_session:
            ref_session.is_revoked = True
            ref_session.revoked_at = datetime.now(UTC)
            await session.commit()

    @staticmethod
    async def change_password(
        session: AsyncSession,
        user: User,
        data: ChangePasswordRequest,
    ) -> None:
        """Change user password, validating current password and revoking all refresh sessions."""
        if not verify_password(data.current_password, user.hashed_password):
            raise ValidationError("Current password is incorrect.")

        user.hashed_password = get_password_hash(data.new_password)

        # Revoke all active refresh sessions for this user
        sessions_res = await session.execute(
            select(RefreshSession).where(
                RefreshSession.user_id == user.id,
                RefreshSession.is_revoked.is_(False),
            )
        )
        for s in sessions_res.scalars().all():
            s.is_revoked = True
            s.revoked_at = datetime.now(UTC)

        await session.commit()

    @staticmethod
    async def request_password_reset(session: AsyncSession, data: ForgotPasswordRequest) -> str:
        """Generate a secure password reset token. Returns plaintext token for email delivery simulation."""
        result = await session.execute(select(User).where(User.email == data.email))
        user = result.scalar_one_or_none()

        # Always return generic success response even if user doesn't exist (prevent enumeration)
        if not user or not user.is_active:
            return "reset_token_simulated_placeholder"

        raw_token = generate_secure_token()
        token_hash = hash_token(raw_token)
        expires_at = datetime.now(UTC) + timedelta(hours=1)

        reset_record = PasswordResetToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=expires_at,
            is_used=False,
        )
        session.add(reset_record)
        await session.commit()
        return raw_token

    @staticmethod
    async def reset_password(session: AsyncSession, data: ResetPasswordRequest) -> None:
        """Consume single-use reset token and update password."""
        token_hash = hash_token(data.token)
        result = await session.execute(
            select(PasswordResetToken).where(
                PasswordResetToken.token_hash == token_hash,
                PasswordResetToken.is_used.is_(False),
            )
        )
        reset_rec = result.scalar_one_or_none()

        exp = reset_rec.expires_at if reset_rec else None
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=UTC)

        if not reset_rec or not exp or exp < datetime.now(UTC):
            raise ValidationError("Invalid or expired password reset token.")

        reset_rec.is_used = True
        reset_rec.used_at = datetime.now(UTC)

        user_res = await session.execute(select(User).where(User.id == reset_rec.user_id))
        user = user_res.scalar_one_or_none()
        if user:
            user.hashed_password = get_password_hash(data.new_password)
            # Revoke all sessions
            sessions_res = await session.execute(
                select(RefreshSession).where(
                    RefreshSession.user_id == user.id,
                    RefreshSession.is_revoked.is_(False),
                )
            )
            for s in sessions_res.scalars().all():
                s.is_revoked = True
                s.revoked_at = datetime.now(UTC)

        await session.commit()

    @staticmethod
    async def admin_provision_user(
        session: AsyncSession,
        data: AdminProvisionUserRequest,
    ) -> User:
        """Provision administrative or staff account."""
        existing = await session.execute(select(User).where(User.email == data.email))
        if existing.scalar_one_or_none():
            raise ConflictError(f"User with email '{data.email}' already exists.")

        user = User(
            email=data.email,
            hashed_password=get_password_hash(data.password),
            first_name=data.first_name,
            last_name=data.last_name,
            global_role=data.global_role,
            is_superuser=data.is_superuser,
            is_active=True,
        )
        session.add(user)
        await session.flush()

        for prop_id in data.assigned_property_ids:
            assignment = UserPropertyAssignment(
                user_id=user.id,
                property_id=prop_id,
                property_role=data.global_role,
                is_active=True,
            )
            session.add(assignment)

        await session.commit()
        await session.refresh(user)
        return user

    @staticmethod
    async def update_user_status(session: AsyncSession, user_id: str, is_active: bool) -> User:
        """Activate or deactivate a user account and immediately revoke sessions if deactivated."""
        result = await session.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise EntityNotFoundError("User", user_id)

        user.is_active = is_active
        if not is_active:
            sessions_res = await session.execute(
                select(RefreshSession).where(
                    RefreshSession.user_id == user.id,
                    RefreshSession.is_revoked.is_(False),
                )
            )
            for s in sessions_res.scalars().all():
                s.is_revoked = True
                s.revoked_at = datetime.now(UTC)

        await session.commit()
        await session.refresh(user)
        return user

