"""Generate this month's hostel invoices; schedule hourly for property time zones."""

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.db.models import Property
from app.db.session import SessionLocal
from app.modules.billing.service import generate_monthly_invoices


def main() -> None:
    with SessionLocal() as db:
        properties = db.scalars(
            select(Property).where(
                Property.is_deleted.is_(False),
                Property.type.in_(("HOSTEL_BOYS", "HOSTEL_GIRLS", "HOSTEL_COED", "CO_LIVING")),
            )
        ).all()
        for prop in properties:
            today = datetime.now(ZoneInfo(prop.timezone)).date()
            if today.day != 1:
                continue
            invoices, skipped = generate_monthly_invoices(
                db, prop, today.replace(day=1)
            )
            db.commit()
            print(
                f"{prop.code} {today:%Y-%m}: "
                f"{len(invoices)} invoices created, {skipped} existing"
            )


if __name__ == "__main__":
    main()
