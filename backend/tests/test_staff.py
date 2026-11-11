from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.db.models import StaffProfile, User


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

    missing_dob_response = client.post(
        "/api/v1/staff",
        headers=headers,
        json={
            "email": "missing.dob.staff@example.com",
            "fullName": "Missing DOB Staff",
            "phone": "9876543211",
            "idDocumentType": "AADHAAR",
            "idDocumentNumber": "123456789012",
            "staffRole": "HOUSEKEEPING",
            "designation": "Room Attendant",
            "department": "Housekeeping",
            "propertyId": property_id,
            "baseMonthlySalary": "1000.00",
            "joiningDate": "2026-02-01T00:00:00Z",
        },
    )
    assert missing_dob_response.status_code == 422

    staff_response = client.post(
        "/api/v1/staff",
        headers=headers,
        json={
            "email": "payroll.staff@example.com",
            "fullName": "Payroll Staff",
            "phone": "9876543210",
            "dateOfBirth": "1990-01-01",
            "idDocumentType": "AADHAAR",
            "idDocumentNumber": "123456789012",
            "staffRole": "HOUSEKEEPING",
            "designation": "Room Attendant",
            "department": "Housekeeping",
            "propertyId": property_id,
            "baseMonthlySalary": "1000.00",
            "joiningDate": "2026-02-01T00:00:00Z",
        },
    )
    assert staff_response.status_code == 201, staff_response.text
    assert staff_response.json()["activationUrl"]
    assert staff_response.json()["dateOfBirth"] == "1990-01-01"
    profile = db_session.scalar(
        select(StaffProfile).where(StaffProfile.property_id == property_id)
    )
    assert profile is not None

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

    disabled = client.put(
        f"/api/v1/staff/{profile.id}",
        headers=headers,
        json={"isActive": False, "designation": "Senior Room Attendant"},
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["isActive"] is False
    db_session.refresh(staff_user)
    assert staff_user.status == "SUSPENDED"
