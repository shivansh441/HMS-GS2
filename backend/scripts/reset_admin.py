#!/usr/bin/env python3
"""
Haven Stays CLI - Out-of-Band Admin Password Reset
Usage:
    python scripts/reset_admin.py <email> <new_password>
"""
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

from sqlalchemy import select
from app.db.session import SessionLocal
from app.db.models import User
from app.core.permissions import Role
from app.core.security import hash_password, validate_password_strength
from app.modules.auth.service import revoke_all_user_sessions
from app.modules.audit.service import write_audit_log


def reset_admin_password(email: str, new_pass: str) -> None:
    clean_email = email.strip().lower()
    try:
        validate_password_strength(new_pass)
    except ValueError as e:
        print(f"Error: Password does not meet security requirements: {e}")
        sys.exit(1)

    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == clean_email))
        if not user:
            print(f"Error: User with email '{clean_email}' not found.")
            sys.exit(1)

        if user.role != Role.ADMIN:
            print(f"Error: User '{clean_email}' has role '{user.role}', not ADMIN.")
            sys.exit(1)

        # Update password and reset lockout state
        user.password_hash = hash_password(new_pass)
        user.failed_login_count = 0
        user.locked_until = None
        user.lockout_count = 0
        user.must_change_password = False

        # Revoke all existing sessions
        revoke_all_user_sessions(db, user.id, reason="CLI_ADMIN_PASSWORD_RESET")

        # Audit log
        write_audit_log(
            db,
            action="ADMIN_PASSWORD_RESET_CLI",
            actor_user_id=user.id,
            target_user_id=user.id,
            details={"email": clean_email, "method": "cli"},
            ip="127.0.0.1",
            user_agent="HavenStays-CLI/1.0",
        )
        db.commit()

        print(f"Successfully reset password for Admin: {clean_email}")
        print("All existing active sessions have been revoked.")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python scripts/reset_admin.py <email> <new_password>")
        sys.exit(1)

    target_email = sys.argv[1]
    new_password = sys.argv[2]
    reset_admin_password(target_email, new_password)
