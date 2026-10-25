import os
import sys
from datetime import datetime, timedelta, timezone

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select

from app.core.crypto import encrypt_data, process_id_document
from app.core.permissions import AccountType, StaffRole, UserStatus
from app.core.security import generate_mfa_secret, generate_one_time_token, hash_password, hash_token
from app.db.base import Base
from app.db.models import (
    CustomerPropertyLink,
    MfaRecoveryCode,
    Property,
    User,
    UserPropertyAccess,
    VerificationToken,
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
        print(f"Properties: {p1.code} ({p1.id}), {p2.code} ({p2.id})")

        now = datetime.now(timezone.utc)

        # 2. Super Admins
        # Primary spec: superadmin@havenstays.local / SuperAdmin2026!#
        sa = db.scalar(select(User).where(User.email == "superadmin@havenstays.local"))
        if not sa:
            sa = User(
                email="superadmin@havenstays.local",
                username="superadmin",
                full_name="Super Administrator",
                password_hash=hash_password("SuperAdmin2026!#"),
                account_type=AccountType.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(sa)
            print("Super Admin: superadmin@havenstays.local / SuperAdmin2026!#")

        # Legacy admin with MFA enforced: admin@havenstays.com / AdminSecurePass123!
        legacy_admin = db.scalar(select(User).where(User.email == "admin@havenstays.com"))
        if not legacy_admin:
            mfa_sec = generate_mfa_secret()
            legacy_admin = User(
                email="admin@havenstays.com",
                username="admin_legacy",
                full_name="Admin Legacy",
                password_hash=hash_password("AdminSecurePass123!"),
                account_type=AccountType.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
                mfa_enabled=True,
                mfa_enforced=True,
                mfa_secret_encrypted=encrypt_data(mfa_sec),
                email_verified_at=now,
            )
            db.add(legacy_admin)

        # 3. Managers
        # manager.grand@havenstays.local / ManagerGrand2026!# (HQ-01)
        mgr = db.scalar(select(User).where(User.email == "manager.grand@havenstays.local"))
        if not mgr:
            mgr = User(
                email="manager.grand@havenstays.local",
                username="manager_grand",
                full_name="Marcus Vance (Manager)",
                password_hash=hash_password("ManagerGrand2026!#"),
                account_type=AccountType.MANAGER,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(mgr)
            db.flush()
            db.add(UserPropertyAccess(user_id=mgr.id, property_id=p1.id))

        # manager.hq01@havenstays.com / ManagerSecurePass123!
        mgr1 = db.scalar(select(User).where(User.email == "manager.hq01@havenstays.com"))
        if not mgr1:
            mgr1 = User(
                email="manager.hq01@havenstays.com",
                username="manager_hq01",
                full_name="Marcus Vance (HQ-01 Mgr)",
                password_hash=hash_password("ManagerSecurePass123!"),
                account_type=AccountType.MANAGER,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(mgr1)
            db.flush()
            db.add(UserPropertyAccess(user_id=mgr1.id, property_id=p1.id))

        # manager.all@havenstays.com / ManagerSecurePass123!
        mgr_all = db.scalar(select(User).where(User.email == "manager.all@havenstays.com"))
        if not mgr_all:
            mgr_all = User(
                email="manager.all@havenstays.com",
                username="manager_all",
                full_name="Elena Rostova (Dual Mgr)",
                password_hash=hash_password("ManagerSecurePass123!"),
                account_type=AccountType.MANAGER,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(mgr_all)
            db.flush()
            db.add(UserPropertyAccess(user_id=mgr_all.id, property_id=p1.id))
            db.add(UserPropertyAccess(user_id=mgr_all.id, property_id=p2.id))

        # 4. Staff
        # staff.desk@havenstays.local / StaffDesk2026!# (HQ-01)
        stf = db.scalar(select(User).where(User.email == "staff.desk@havenstays.local"))
        if not stf:
            stf = User(
                email="staff.desk@havenstays.local",
                username="staff_desk",
                full_name="Chloe Bennett (Front Desk)",
                password_hash=hash_password("StaffDesk2026!#"),
                account_type=AccountType.STAFF,
                staff_role=StaffRole.FRONT_DESK,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(stf)
            db.flush()
            db.add(UserPropertyAccess(user_id=stf.id, property_id=p1.id))

        # frontdesk@havenstays.com / StaffSecurePass123!
        fd = db.scalar(select(User).where(User.email == "frontdesk@havenstays.com"))
        if not fd:
            fd = User(
                email="frontdesk@havenstays.com",
                username="frontdesk_hq01",
                full_name="Chloe Bennett (Front Desk)",
                password_hash=hash_password("StaffSecurePass123!"),
                account_type=AccountType.STAFF,
                staff_role=StaffRole.FRONT_DESK,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(fd)
            db.flush()
            db.add(UserPropertyAccess(user_id=fd.id, property_id=p1.id))

        # housekeeping@havenstays.com / StaffSecurePass123!
        hk = db.scalar(select(User).where(User.email == "housekeeping@havenstays.com"))
        if not hk:
            hk = User(
                email="housekeeping@havenstays.com",
                username="housekeeping_hq02",
                full_name="David Chen (Housekeeping)",
                password_hash=hash_password("StaffSecurePass123!"),
                account_type=AccountType.STAFF,
                staff_role=StaffRole.HOUSEKEEPING,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(hk)
            db.flush()
            db.add(UserPropertyAccess(user_id=hk.id, property_id=p2.id))

        # staff.temp@havenstays.local / TempStaff2026!# (must_change_password=True)
        temp_staff = db.scalar(select(User).where(User.email == "staff.temp@havenstays.local"))
        if not temp_staff:
            temp_staff = User(
                email="staff.temp@havenstays.local",
                username="staff_temp",
                full_name="Temp Staff Member",
                password_hash=hash_password("TempStaff2026!#"),
                account_type=AccountType.STAFF,
                staff_role=StaffRole.FRONT_DESK,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
                must_change_password=True,
            )
            db.add(temp_staff)
            db.flush()
            db.add(UserPropertyAccess(user_id=temp_staff.id, property_id=p1.id))

        # 5. Customers
        # guest.alice@example.com / AliceGuest2026!# (HQ-01)
        alice = db.scalar(select(User).where(User.email == "guest.alice@example.com"))
        if not alice:
            alice = User(
                email="guest.alice@example.com",
                username="guest_alice",
                full_name="Alice Smith",
                phone="+15551234567",
                password_hash=hash_password("AliceGuest2026!#"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
                phone_verified_at=now,
            )
            db.add(alice)
            db.flush()
            db.add(CustomerPropertyLink(user_id=alice.id, property_id=p1.id, source="BOOKING"))

        # resident.bob@example.com / BobResident2026!# (HQ-01)
        bob = db.scalar(select(User).where(User.email == "resident.bob@example.com"))
        if not bob:
            bob = User(
                email="resident.bob@example.com",
                username="resident_bob",
                full_name="Bob Jones",
                phone="+15559876543",
                password_hash=hash_password("BobResident2026!#"),
                account_type=AccountType.LONG_TERM_RESIDENT,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
                phone_verified_at=now,
            )
            db.add(bob)
            db.flush()
            db.add(CustomerPropertyLink(user_id=bob.id, property_id=p1.id, source="MANUAL"))

        # guest.nobooking1@gmail.com / CustomerPass123!@
        cust1 = db.scalar(select(User).where(User.email == "guest.nobooking1@gmail.com"))
        if not cust1:
            cust1 = User(
                email="guest.nobooking1@gmail.com",
                username="guest_nobook1",
                full_name="Sophia Martinez",
                password_hash=hash_password("CustomerPass123!@"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(cust1)

        # guest.nobooking2@gmail.com / CustomerPass123!@
        cust2 = db.scalar(select(User).where(User.email == "guest.nobooking2@gmail.com"))
        if not cust2:
            cust2 = User(
                email="guest.nobooking2@gmail.com",
                username="guest_nobook2",
                full_name="Liam Gallagher",
                password_hash=hash_password("CustomerPass123!@"),
                account_type=AccountType.SHORT_TERM_HOSTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(cust2)

        # resident.pending@gmail.com / CustomerPass123!@
        resident_p = db.scalar(select(User).where(User.email == "resident.pending@gmail.com"))
        if not resident_p:
            enc_doc, l4, l_hash = process_id_document("PASS987654321")
            resident_p = User(
                email="resident.pending@gmail.com",
                username="resident_alex",
                full_name="Alex Rivera",
                password_hash=hash_password("CustomerPass123!@"),
                account_type=AccountType.LONG_TERM_RESIDENT,
                status=UserStatus.PENDING_ACTIVATION,
                id_document_type="PASSPORT",
                id_document_number_encrypted=enc_doc,
                id_document_last4=l4,
                id_document_lookup_hash=l_hash,
            )
            db.add(resident_p)
            db.flush()
            db.add(CustomerPropertyLink(user_id=resident_p.id, property_id=p1.id, source="MANUAL"))

        # guest.hotel@gmail.com / CustomerPass123!@
        hotel_guest = db.scalar(select(User).where(User.email == "guest.hotel@gmail.com"))
        if not hotel_guest:
            hotel_guest = User(
                email="guest.hotel@gmail.com",
                username="guest_hotel",
                full_name="Grace Hopper",
                password_hash=hash_password("CustomerPass123!@"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(hotel_guest)
            db.flush()
            db.add(CustomerPropertyLink(user_id=hotel_guest.id, property_id=p1.id, source="BOOKING"))

        # guest.hostel@gmail.com / CustomerPass123!@
        hostel_guest = db.scalar(select(User).where(User.email == "guest.hostel@gmail.com"))
        if not hostel_guest:
            hostel_guest = User(
                email="guest.hostel@gmail.com",
                username="guest_hostel",
                full_name="Julian Thorne",
                password_hash=hash_password("CustomerPass123!@"),
                account_type=AccountType.SHORT_TERM_HOSTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
            )
            db.add(hostel_guest)
            db.flush()
            db.add(CustomerPropertyLink(user_id=hostel_guest.id, property_id=p2.id, source="BOOKING"))

        # 6. Additional Required Test Accounts
        # unverified.carol@example.com
        carol = db.scalar(select(User).where(User.email == "unverified.carol@example.com"))
        if not carol:
            carol = User(
                email="unverified.carol@example.com",
                username="unverified_carol",
                full_name="Carol Miller",
                password_hash=hash_password("CarolUnverified2026!#"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.PENDING_ACTIVATION,
                email_verified_at=None,
            )
            db.add(carol)
            db.flush()
            raw_t, t_hash = generate_one_time_token()
            db.add(VerificationToken(
                user_id=carol.id,
                token_hash=t_hash,
                token_type="EMAIL_VERIFY",
                expires_at=now + timedelta(hours=24),
            ))

        # locked.dan@example.com
        dan = db.scalar(select(User).where(User.email == "locked.dan@example.com"))
        if not dan:
            dan = User(
                email="locked.dan@example.com",
                username="locked_dan",
                full_name="Dan Locked",
                password_hash=hash_password("DanLocked2026!#"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
                failed_login_count=5,
                locked_until=now + timedelta(minutes=15),
                lockout_count=1,
            )
            db.add(dan)

        # mfa.eve@example.com
        eve = db.scalar(select(User).where(User.email == "mfa.eve@example.com"))
        eve_secret = "JBSWY3DPEHPK3PXP"
        if not eve:
            raw_codes = ["11111111", "22222222", "33333333", "44444444", "55555555", "66666666", "77777777", "88888888"]
            eve = User(
                email="mfa.eve@example.com",
                username="mfa_eve",
                full_name="Eve Authenticator",
                password_hash=hash_password("EveMfa2026!#"),
                account_type=AccountType.HOTEL_GUEST,
                status=UserStatus.ACTIVE,
                email_verified_at=now,
                mfa_enabled=True,
                mfa_secret_encrypted=encrypt_data(eve_secret),
            )
            db.add(eve)
            db.flush()
            for c in raw_codes:
                db.add(MfaRecoveryCode(
                    user_id=eve.id,
                    code_hash=hash_token(c),
                    is_used=False,
                ))

        # pending.frank@example.com
        frank = db.scalar(select(User).where(User.email == "pending.frank@example.com"))
        if not frank:
            frank = User(
                email="pending.frank@example.com",
                username="pending_frank",
                full_name="Frank Residence",
                password_hash=hash_password("FrankPending2026!#"),
                account_type=AccountType.LONG_TERM_RESIDENT,
                status=UserStatus.PENDING_ACTIVATION,
            )
            db.add(frank)
            db.flush()
            raw_inv, inv_hash = generate_one_time_token()
            db.add(VerificationToken(
                user_id=frank.id,
                token_hash=inv_hash,
                token_type="ACTIVATION",
                expires_at=now + timedelta(days=7),
            ))

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
