from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.db.models import Property, StaffProfile, User, UserPropertyAccess


def _admin_headers(db_session) -> dict[str, str]:
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    token = create_access_token(subject=admin.id, audience="admin", role=admin.role)
    return {"Authorization": f"Bearer {token}"}


def test_staff_attendance_prorated_payroll_and_disbursement(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    property_response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": "Payroll Test Property",
            "type": "HOTEL",
            "floors": 1,
            "address": "1 Payroll Road",
            "city": "Payroll City",
            "state": "Payroll State",
            "pincode": "10000",
            "contactPhone": "1234567890",
            "timezone": "Asia/Kolkata",
        },
    )
    assert property_response.status_code == 201, property_response.text
    property_id = property_response.json()["id"]

    account_response = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": "payroll.staff@example.com",
            "fullName": "Payroll Staff",
            "phone": "9876543210",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "AADHAAR",
            "idDocumentNumber": "123456789012",
            "role": "STAFF",
            "staffRole": "HOUSEKEEPING",
            "propertyIds": [property_id],
        },
    )
    assert account_response.status_code == 201, account_response.text
    assert account_response.json()["activationUrl"]

    eligible = client.get("/api/v1/staff/eligible-users", headers=headers)
    assert eligible.status_code == 200, eligible.text
    assert any(user["id"] == account_response.json()["id"] for user in eligible.json()["items"])

    staff_response = client.post(
        "/api/v1/staff/assign",
        headers=headers,
        json={
            "userId": account_response.json()["id"],
            "baseMonthlySalary": "1000.00",
        },
    )
    assert staff_response.status_code == 201, staff_response.text
    assert staff_response.json()["dateOfBirth"] == "1990-01-01"
    assert staff_response.json()["userId"] == account_response.json()["id"]
    assert staff_response.json()["designation"] == "Housekeeping"
    assert staff_response.json()["department"] == "Staff"
    assert staff_response.json()["joiningDate"]
    profile = db_session.scalar(
        select(StaffProfile).where(StaffProfile.property_id == property_id)
    )
    assert profile is not None
    duplicate_assignment = client.post(
        "/api/v1/staff/assign",
        headers=headers,
        json={
            "userId": account_response.json()["id"],
            "baseMonthlySalary": "1000.00",
        },
    )
    assert duplicate_assignment.status_code == 409
    assert duplicate_assignment.json()["error"]["code"] == "PAYROLL_PROFILE_EXISTS"
    assert not any(
        user["id"] == account_response.json()["id"]
        for user in client.get("/api/v1/staff/eligible-users", headers=headers).json()["items"]
    )

    invalid_attendance = client.post(
        f"/api/v1/staff/{profile.id}/attendance",
        headers=headers,
        json={"year": 2028, "month": 2, "workedDays": 30},
    )
    assert invalid_attendance.status_code == 400
    assert invalid_attendance.json()["error"]["code"] == "WORKED_DAYS_EXCEED_MONTH"

    attendance = client.post(
        f"/api/v1/staff/{profile.id}/attendance",
        headers=headers,
        json={"year": 2028, "month": 2, "workedDays": 10},
    )
    assert attendance.status_code == 200, attendance.text
    assert attendance.json()["totalDays"] == 29
    assert attendance.json()["payableSalary"] == "344.83"

    pending = client.post(
        "/api/v1/payroll/disburse",
        headers=headers,
        json={
            "staffId": profile.id,
            "year": 2028,
            "month": 2,
            "paymentStatus": "PENDING",
        },
    )
    assert pending.status_code == 200, pending.text
    assert pending.json()["paymentStatus"] == "PENDING"
    assert pending.json()["payableSalary"] == "344.83"

    paid = client.post(
        "/api/v1/payroll/disburse",
        headers=headers,
        json={
            "staffId": profile.id,
            "year": 2028,
            "month": 2,
            "paymentStatus": "PAID",
            "paymentMode": "BANK_TRANSFER",
            "transactionReference": "PAY-2028-02-001",
        },
    )
    assert paid.status_code == 200, paid.text
    assert paid.json()["paymentStatus"] == "PAID"
    assert paid.json()["paymentMode"] == "BANK_TRANSFER"
    assert paid.json()["transactionReference"] == "PAY-2028-02-001"
    assert paid.json()["paymentDate"]
    assert paid.json()["advanceDeduction"] == "0.00"
    assert paid.json()["paidAmount"] == "344.83"
    assert paid.json()["advanceBalance"] == "0.00"

    duplicate_payment = client.post(
        "/api/v1/payroll/disburse",
        headers=headers,
        json={
            "staffId": profile.id,
            "year": 2028,
            "month": 2,
            "paymentStatus": "PAID",
            "paymentMode": "CASH",
        },
    )
    assert duplicate_payment.status_code == 409
    assert duplicate_payment.json()["error"]["code"] == "SALARY_ALREADY_PAID"

    staff_list = client.get(
        "/api/v1/staff",
        headers=headers,
        params={"propertyId": property_id, "year": 2028, "month": 2},
    )
    assert staff_list.status_code == 200, staff_list.text
    assert staff_list.json()["total"] == 1
    assert staff_list.json()["items"][0]["paymentStatus"] == "PAID"
    assert staff_list.json()["items"][0]["payableSalary"] == "344.83"

    staff_user = db_session.get(User, profile.user_id)
    assert staff_user is not None
    staff_user.status = "ACTIVE"
    db_session.commit()
    staff_token = create_access_token(
        subject=staff_user.id, audience="admin", role=staff_user.role
    )
    forbidden_list = client.get(
        "/api/v1/staff",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert forbidden_list.status_code == 403

    profile_update = client.put(
        f"/api/v1/staff/{profile.id}",
        headers=headers,
        json={"isActive": False},
    )
    assert profile_update.status_code == 404, profile_update.text
    db_session.refresh(staff_user)
    assert staff_user.status == "ACTIVE"

    salary_update = client.post(
        "/api/v1/staff/assign/bulk",
        headers=headers,
        json={
            "salaryUpdates": [
                {"staffId": profile.id, "baseMonthlySalary": "1200.00"},
            ],
        },
    )
    assert salary_update.status_code == 201, salary_update.text
    assert salary_update.json()[0]["baseMonthlySalary"] == "1200.00"

    admin_account = client.post(
        "/api/v1/admin/users",
        headers=headers,
        json={
            "email": "payroll.admin@example.com",
            "fullName": "Payroll Administrator",
            "phone": "9876543212",
            "dateOfBirth": "1985-01-01",
            "idDocumentType": "PAN",
            "idDocumentNumber": "ABCDE1234F",
            "role": "ADMIN",
        },
    )
    assert admin_account.status_code == 201, admin_account.text
    salary_changes = client.post(
        "/api/v1/staff/assign/bulk",
        headers=headers,
        json={
            "assignments": [
                {"userId": admin_account.json()["id"], "baseMonthlySalary": "5000.00"},
            ],
            "salaryUpdates": [
                {"staffId": profile.id, "baseMonthlySalary": "1300.00"},
            ],
        },
    )
    assert salary_changes.status_code == 201, salary_changes.text
    salary_changes_by_user_id = {
        item["userId"]: item for item in salary_changes.json()
    }
    admin_assignment = salary_changes_by_user_id[admin_account.json()["id"]]
    updated_staff_profile = salary_changes_by_user_id[profile.user_id]
    assert admin_assignment["userId"] == admin_account.json()["id"]
    assert admin_assignment["designation"] == "Administrator"
    assert admin_assignment["department"] == "Administration"
    assert updated_staff_profile["baseMonthlySalary"] == "1300.00"

    profile.joining_date = datetime(2026, 1, 15, tzinfo=timezone.utc)
    admin_profile = db_session.get(StaffProfile, admin_assignment["id"])
    assert admin_profile is not None
    admin_profile.joining_date = datetime(2026, 3, 1, tzinfo=timezone.utc)
    db_session.commit()

    february_attendance = client.post(
        "/api/v1/staff/attendance/bulk",
        headers=headers,
        json={
            "year": 2026,
            "month": 2,
            "items": [{"staffId": profile.id, "workedDays": 10}],
        },
    )
    assert february_attendance.status_code == 200, february_attendance.text
    assert february_attendance.json()[0]["payableSalary"] == "464.29"

    advance_issue = client.post(
        "/api/v1/staff/assign/bulk",
        headers=headers,
        json={
            "advanceIssues": [{"staffId": profile.id, "amount": "600.00"}],
        },
    )
    assert advance_issue.status_code == 201, advance_issue.text
    assert advance_issue.json()[0]["advanceBalance"] == "600.00"

    changed_salary = client.post(
        "/api/v1/staff/assign/bulk",
        headers=headers,
        json={
            "salaryUpdates": [
                {"staffId": profile.id, "baseMonthlySalary": "2600.00"},
            ],
        },
    )
    assert changed_salary.status_code == 201, changed_salary.text
    february_payroll = client.get(
        "/api/v1/staff",
        headers=headers,
        params={"year": 2026, "month": 2},
    )
    assert february_payroll.status_code == 200, february_payroll.text
    assert february_payroll.json()["total"] == 1
    february_staff = february_payroll.json()["items"][0]
    assert february_staff["id"] == profile.id
    assert february_staff["baseMonthlySalary"] == "2600.00"
    assert february_staff["paymentStatus"] == "PENDING"
    assert february_staff["payableSalary"] == "464.29"
    assert february_staff["advanceBalance"] == "600.00"

    over_advance_deduction = client.post(
        "/api/v1/payroll/disburse",
        headers=headers,
        json={
            "staffId": profile.id,
            "year": 2026,
            "month": 2,
            "paymentStatus": "PAID",
            "paymentMode": "CASH",
            "advanceDeduction": "601.00",
        },
    )
    assert over_advance_deduction.status_code == 400
    assert over_advance_deduction.json()["error"]["code"] == "ADVANCE_DEDUCTION_EXCEEDS_BALANCE"

    over_salary_deduction = client.post(
        "/api/v1/payroll/disburse",
        headers=headers,
        json={
            "staffId": profile.id,
            "year": 2026,
            "month": 2,
            "paymentStatus": "PAID",
            "paymentMode": "CASH",
            "advanceDeduction": "500.00",
        },
    )
    assert over_salary_deduction.status_code == 400
    assert over_salary_deduction.json()["error"]["code"] == "ADVANCE_DEDUCTION_EXCEEDS_SALARY"

    paid_with_advance = client.post(
        "/api/v1/payroll/disburse",
        headers=headers,
        json={
            "staffId": profile.id,
            "year": 2026,
            "month": 2,
            "paymentStatus": "PAID",
            "paymentMode": "CASH",
            "advanceDeduction": "100.00",
        },
    )
    assert paid_with_advance.status_code == 200, paid_with_advance.text
    assert paid_with_advance.json()["payableSalary"] == "464.29"
    assert paid_with_advance.json()["advanceDeduction"] == "100.00"
    assert paid_with_advance.json()["paidAmount"] == "364.29"
    assert paid_with_advance.json()["advanceBalance"] == "500.00"
    february_paid_payroll = client.get(
        "/api/v1/staff",
        headers=headers,
        params={"year": 2026, "month": 2},
    )
    assert february_paid_payroll.status_code == 200, february_paid_payroll.text
    february_paid_staff = february_paid_payroll.json()["items"][0]
    assert february_paid_staff["paymentStatus"] == "PAID"
    assert february_paid_staff["advanceDeduction"] == "100.00"
    assert february_paid_staff["paidAmount"] == "364.29"
    assert february_paid_staff["advanceBalance"] == "500.00"

    march_payroll = client.get(
        "/api/v1/staff",
        headers=headers,
        params={"year": 2026, "month": 3},
    )
    assert march_payroll.status_code == 200, march_payroll.text
    march_staff = {item["id"]: item for item in march_payroll.json()["items"]}
    assert set(march_staff) == {profile.id, admin_profile.id}
    assert march_staff[admin_profile.id]["paymentStatus"] is None
    assert march_staff[admin_profile.id]["payableSalary"] is None

    restored_salary = client.post(
        "/api/v1/staff/assign/bulk",
        headers=headers,
        json={
            "salaryUpdates": [
                {"staffId": profile.id, "baseMonthlySalary": "1300.00"},
            ],
        },
    )
    assert restored_salary.status_code == 201, restored_salary.text

    bulk_attendance = client.post(
        "/api/v1/staff/attendance/bulk",
        headers=headers,
        json={
            "year": 2029,
            "month": 1,
            "items": [
                {"staffId": profile.id, "workedDays": 5},
                {"staffId": admin_assignment["id"], "workedDays": 10},
            ],
        },
    )
    assert bulk_attendance.status_code == 200, bulk_attendance.text
    attendance_by_staff = {
        item["staffId"]: item for item in bulk_attendance.json()
    }
    assert attendance_by_staff[profile.id]["payableSalary"] == "209.68"
    assert attendance_by_staff[admin_assignment["id"]]["payableSalary"] == "1612.90"

    saved_payroll = client.get(
        "/api/v1/staff",
        headers=headers,
        params={"year": 2029, "month": 1},
    )
    assert saved_payroll.status_code == 200, saved_payroll.text
    payroll_by_staff = {item["id"]: item for item in saved_payroll.json()["items"]}
    assert payroll_by_staff[profile.id]["paymentStatus"] == "PENDING"
    assert payroll_by_staff[admin_assignment["id"]]["paymentStatus"] == "PENDING"


def test_bulk_salary_assignment_distinguishes_accounts_with_matching_names(
    client: TestClient,
    db_session,
):
    headers = _admin_headers(db_session)
    property_response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": "Bulk Payroll Property",
            "type": "HOTEL",
            "floors": 1,
            "address": "2 Payroll Road",
            "city": "Payroll City",
            "state": "Payroll State",
            "pincode": "10001",
            "contactPhone": "1234567891",
            "timezone": "Asia/Kolkata",
        },
    )
    assert property_response.status_code == 201, property_response.text
    property_id = property_response.json()["id"]
    other_property_response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": "Bulk Payroll Secondary Property",
            "type": "HOTEL",
            "floors": 1,
            "address": "3 Payroll Road",
            "city": "Payroll City",
            "state": "Payroll State",
            "pincode": "10002",
            "contactPhone": "1234567892",
            "timezone": "Asia/Kolkata",
        },
    )
    assert other_property_response.status_code == 201, other_property_response.text

    accounts = []
    for suffix, staff_role, phone, id_number in (
        ("one", "HOUSEKEEPING", "9876543201", "223456789012"),
        ("two", "FRONT_DESK", "9876543202", "323456789012"),
    ):
        response = client.post(
            "/api/v1/admin/users",
            headers=headers,
            json={
                "email": f"jordan.{suffix}@example.com",
                "fullName": "Jordan Lee",
                "phone": phone,
                "dateOfBirth": "1990-01-01",
                "idDocumentType": "AADHAAR",
                "idDocumentNumber": id_number,
                "role": "STAFF",
                "staffRole": staff_role,
                "propertyIds": [
                    property_id,
                    *(
                        [other_property_response.json()["id"]]
                        if suffix == "two"
                        else []
                    ),
                ],
            },
        )
        assert response.status_code == 201, response.text
        accounts.append(response.json())

    eligible = client.get("/api/v1/staff/eligible-users", headers=headers)
    assert eligible.status_code == 200, eligible.text
    eligible_by_id = {user["id"]: user for user in eligible.json()["items"]}
    for account in accounts:
        account_details = eligible_by_id[account["id"]]
        assert account_details["email"] == account["email"]
        assert account_details["phone"] == account["phone"]
        assert account_details["role"] == "STAFF"
        assert account_details["staffRole"] == account["staffRole"]

    assigned = client.post(
        "/api/v1/staff/assign/bulk",
        headers=headers,
        json={
            "assignments": [
                {"userId": accounts[0]["id"], "baseMonthlySalary": "1000.00"},
                {"userId": accounts[1]["id"], "baseMonthlySalary": "1250.00"},
            ],
        },
    )
    assert assigned.status_code == 201, assigned.text
    assigned_by_user_id = {item["userId"]: item for item in assigned.json()}
    assert assigned_by_user_id[accounts[0]["id"]]["baseMonthlySalary"] == "1000.00"
    assert assigned_by_user_id[accounts[1]["id"]]["baseMonthlySalary"] == "1250.00"
    assert assigned_by_user_id[accounts[0]["id"]]["email"] != assigned_by_user_id[accounts[1]["id"]]["email"]
    assert set(assigned_by_user_id[accounts[1]["id"]]["assignedPropertyNames"]) >= {
        "Bulk Payroll Property",
        "Bulk Payroll Secondary Property",
    }

    all_properties = db_session.scalars(
        select(Property).where(Property.is_deleted.is_(False))
    ).all()
    existing_assignments = set(
        db_session.scalars(
            select(UserPropertyAccess.property_id).where(
                UserPropertyAccess.user_id == accounts[0]["id"]
            )
        ).all()
    )
    for property_record in all_properties:
        if property_record.id not in existing_assignments:
            db_session.add(
                UserPropertyAccess(
                    user_id=accounts[0]["id"],
                    property_id=property_record.id,
                )
            )
    db_session.commit()

    payroll = client.get("/api/v1/staff", headers=headers)
    assert payroll.status_code == 200, payroll.text
    payroll_by_user_id = {item["userId"]: item for item in payroll.json()["items"]}
    all_property_staff = payroll_by_user_id[accounts[0]["id"]]
    assert all_property_staff["allProperties"] is True
    assert set(all_property_staff["assignedPropertyNames"]) == {
        property_record.name for property_record in all_properties
    }

    other_property = next(
        property_record
        for property_record in all_properties
        if property_record.id != assigned_by_user_id[accounts[0]["id"]]["propertyId"]
    )
    scoped_payroll = client.get(
        "/api/v1/staff",
        headers={**headers, "X-Property-Id": other_property.id},
    )
    assert scoped_payroll.status_code == 200, scoped_payroll.text
    assert accounts[0]["id"] in {
        item["userId"] for item in scoped_payroll.json()["items"]
    }

    duplicate_ids = client.post(
        "/api/v1/staff/assign/bulk",
        headers=headers,
        json={
            "assignments": [
                {"userId": accounts[0]["id"], "baseMonthlySalary": "1000.00"},
                {"userId": accounts[0]["id"], "baseMonthlySalary": "1250.00"},
            ],
        },
    )
    assert duplicate_ids.status_code == 400
    assert duplicate_ids.json()["error"]["code"] == "DUPLICATE_STAFF_ASSIGNMENT"
