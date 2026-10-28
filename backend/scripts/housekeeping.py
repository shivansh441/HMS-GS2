import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import and_, select

from app.core.permissions import Role, UserStatus
from app.db.models import User
from app.db.session import SessionLocal
from app.modules.audit.service import write_audit_log


def run_housekeeping():
    """
    Housekeeping task:
    - Archives unverified customer accounts created more than 7 days ago.
    - Verified no-booking accounts are kept intact.
    """
    db = SessionLocal()
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=7)

    print(f"[{now.isoformat()}] Starting Haven Stays user housekeeping job...")

    try:
        # Customers with no verified email or phone, older than 7 days
        unverified_customers = db.scalars(
            select(User).where(
                and_(
                    User.role == Role.CUSTOMER,
                    User.status == UserStatus.ACTIVE,
                    User.email_verified_at.is_(None),
                    User.phone_verified_at.is_(None),
                    User.created_at < cutoff,
                )
            )
        ).all()

        archived_count = 0
        for user in unverified_customers:
            user.status = UserStatus.ARCHIVED
            write_audit_log(
                db,
                action="USER_AUTO_ARCHIVED_UNVERIFIED",
                target_user_id=user.id,
                details={"reason": "UNVERIFIED_OLDER_THAN_7_DAYS", "created_at": user.created_at.isoformat()},
            )
            archived_count += 1

        db.commit()
        print(f"Housekeeping complete. Archived {archived_count} stale unverified accounts.")
    except Exception as e:
        db.rollback()
        print(f"Housekeeping error: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    run_housekeeping()
