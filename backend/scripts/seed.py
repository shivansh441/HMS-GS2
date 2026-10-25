import os
import sys
from datetime import datetime, timezone

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select

from app.core.crypto import encrypt_data, process_id_document
from app.core.permissions import AccountType, StaffRole, UserStatus
from app.core.security import generate_mfa_secret, hash_password
from app.db.base import Base
from app.db.models import (
    CustomerPropertyLink,
    Property,
    User,
    UserPropertyAccess,
)
from app.db.session import SessionLocal, engine


def seed_database():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        print("--- SEEDING HAVEN STAYS DATABASE ---")

        # 1. Properties
        p1 = db.scalar(select(Property).where(Property.code == "HQ-01"))
        if not p1:
            p1 = Property(
                code="HQ-01",
                name="Haven Grand Downtown",
                timezone="America/New_York",
                status="ACTIVE",
            )
            db.add(p1)

        p2 = db.scalar(select(Property).where(Property.code == "HQ-02"))
        if not p2:
            p2 = Property(
                code="HQ-02",
                name="Haven Boutique Waterfront",
                timezone="America/Los_Angeles",
                status="ACTIVE",
            )
            db.add(p2)

        db.flush()
        print(f"Properties seeded: {p1.code} ({p1.id}), {p2.code} ({p2.id})")

        # 2. Super Admin (forced MFA on first login)
        admin_email = "admin@havenstays.com"
        super_admin = db.scalar(select(User).where(User.email == admin_email))
        if not super_admin:
            mfa_sec = generate_mfa_secret()
            super_admin = User(
                email=admin_email,
                username="superadmin",
                full_name="Super Administrator",
                password_hash=hash_password("AdminSecurePass123!"),
                account_type=AccountType.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
                mfa_enabled=True,
                mfa_enforced=True,
                mfa_secret_encrypted=encrypt_data(mfa_sec),
            )
            db.add(super_admin)
            print(f"Super Admin seeded: {admin_email} / AdminSecurePass123! (MFA enforced)")

        # 3. Manager on HQ-01 only
        mgr1_email = "manager.hq01@havenstays.com"
        mgr1 = db.scalar(select(User).where(User.email == mgr1_email))
        if not mgr1:
            mgr1 = User(
                email=mgr1_email,
                username="manager_hq01",
                full_name="Marcus Vance (HQ-01 Mgr)",
                password_hash=hash_password("ManagerSecurePass123!"),
                account_type=AccountType.MANAGER,
                status=UserStatus.ACTIVE,
            )
            db.add(mgr1)
            db.flush()
            db.add(UserPropertyAccess(user_id=mgr1.id, property_id=p1.id))
            print(f"Manager HQ-01 seeded: {mgr1_email}")

        # 4. Manager on BOTH properties
        mgr_all_email = "manager.all@havenstays.com"
        mgr_all = db.scalar(select(User).where(User.email == mgr_all_email))
        if not mgr_all:
            mgr_all = User(
                email=mgr_all_email,
                username="manager_all",
                full_name="Elena Rostova (Dual Mgr)",
                password_hash=hash_password("ManagerSecurePass123!"),
                account_type=AccountType.MANAGER,
                status=UserStatus.ACTIVE,
            )
            db.add(mgr_all)
            db.flush()
            db.add(UserPropertyAccess(user_id=mgr_all.id, property_id=p1.id))
            db.add(UserPropertyAccess(user_id=mgr_all.id, property_id=p2.id))
            print(f"Dual Manager seeded: {mgr_all_email}")

        # 5. Front Desk Staff on HQ-01
        fd_email = "frontdesk@havenstays.com"
        front_desk = db.scalar(select(User).where(User.email == fd_email))
        if not front_desk:
            front_desk = User(
                email=fd_email,
                username="frontdesk_hq01",
                full_name="Chloe Bennett (Front Desk)",
                password_hash=hash_password("StaffSecurePass123!"),
                account_type=AccountType.STAFF,
                staff_role=StaffRole.FRONT_DESK,
                status=UserStatus.ACTIVE,
            )
            db.add(front_desk)
            db.flush()
            db.add(UserPropertyAccess(user_id=front_desk.id, property_id=p1.id))
            print(f"Front Desk HQ-01 seeded: {fd_email}")

        # 6. Housekeeping Staff on HQ-02
        hk_email = "housekeeping@havenstays.com"
        housekeeping = db.scalar(select(User).where(User.email == hk_email))
        if not housekeeping:
            housekeeping = User(
                email=hk_email,
                username="housekeeping_hq02",
                full_name="David Chen (Housekeeping)",
                password_hash=hash_password("StaffSecurePass123!"),
                account_type=AccountType.STAFF,
                staff_role=StaffRole.HOUSEKEEPING,
                status=UserStatus.ACTIVE,
            )
            db.add(housekeeping)
            db.flush()
            db.add(UserPropertyAccess(user_id=housekeeping.id, property_id=p2.id))
            print(f"Housekeeping HQ-02 seeded: {hk_email}")

        # 7. Customers:
        # 7a. 2 web-registered users with NO booking and NO property link
        cust_nobook1_email = "guest.nobooking1@gmail.com"
        cust1 = db.scalar(select(User).where(User.email == cust_nobook1_email))
        if not cust1:
            cust1 = User(
                email=cust_nobook1_email,
                username="guest_nobook1",
                full_name="Sophia Martinez",
                password_hash=hash_password("CustomerPass123!"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=datetime.now(timezone.utc), # Verified, so housekeeping cron retains it!
            )
            db.add(cust1)
            print(f"Customer No-Booking 1 seeded: {cust_nobook1_email}")

        cust_nobook2_email = "guest.nobooking2@gmail.com"
        cust2 = db.scalar(select(User).where(User.email == cust_nobook2_email))
        if not cust2:
            cust2 = User(
                email=cust_nobook2_email,
                username="guest_nobook2",
                full_name="Liam Gallagher",
                password_hash=hash_password("CustomerPass123!"),
                account_type=AccountType.SHORT_TERM_HOSTEL_GUEST,
                status=UserStatus.ACTIVE,
            )
            db.add(cust2)
            print(f"Customer No-Booking 2 seeded: {cust_nobook2_email}")

        # 7b. 1 Pending-activation resident linked to HQ-01
        res_email = "resident.pending@gmail.com"
        resident = db.scalar(select(User).where(User.email == res_email))
        if not resident:
            enc_doc, l4, l_hash = process_id_document("PASS987654321")
            resident = User(
                email=res_email,
                username="resident_alex",
                full_name="Alex Rivera",
                password_hash=hash_password("CustomerPass123!"),
                account_type=AccountType.LONG_TERM_RESIDENT,
                status=UserStatus.PENDING_ACTIVATION,
                id_document_type="PASSPORT",
                id_document_number_encrypted=enc_doc,
                id_document_last4=l4,
                id_document_lookup_hash=l_hash,
            )
            db.add(resident)
            db.flush()
            db.add(CustomerPropertyLink(user_id=resident.id, property_id=p1.id, source="MANUAL"))
            print(f"Pending Resident seeded: {res_email}")

        # 7c. 1 Hotel guest linked to HQ-01
        hg_email = "guest.hotel@gmail.com"
        hotel_guest = db.scalar(select(User).where(User.email == hg_email))
        if not hotel_guest:
            hotel_guest = User(
                email=hg_email,
                username="guest_hotel",
                full_name="Grace Hopper",
                password_hash=hash_password("CustomerPass123!"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=datetime.now(timezone.utc),
            )
            db.add(hotel_guest)
            db.flush()
            db.add(CustomerPropertyLink(user_id=hotel_guest.id, property_id=p1.id, source="BOOKING"))
            print(f"Hotel Guest linked to HQ-01: {hg_email}")

        # 7d. 1 Hostel guest linked to HQ-02
        hostel_email = "guest.hostel@gmail.com"
        hostel_guest = db.scalar(select(User).where(User.email == hostel_email))
        if not hostel_guest:
            hostel_guest = User(
                email=hostel_email,
                username="guest_hostel",
                full_name="Julian Thorne",
                password_hash=hash_password("CustomerPass123!"),
                account_type=AccountType.SHORT_TERM_HOSTEL_GUEST,
                status=UserStatus.ACTIVE,
            )
            db.add(hostel_guest)
            db.flush()
            db.add(CustomerPropertyLink(user_id=hostel_guest.id, property_id=p2.id, source="BOOKING"))
            print(f"Hostel Guest linked to HQ-02: {hostel_email}")

        db.commit()
        print("--- SEEDING COMPLETE SUCCESSFULLY ---")

    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_database()
