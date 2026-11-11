import calendar
import hashlib
import hmac
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.config import settings
from app.core.permissions import Role
from app.core.security import create_access_token
from app.db.models import DepositEscrow, MonthlyInvoice, PaymentReceipt, Unit, User
from app.modules.billing import service as billing_service


def _token(user: User, audience: str) -> dict[str, str]:
    token = create_access_token(subject=user.id, audience=audience, role=user.role)
    return {"Authorization": f"Bearer {token}"}


def _admin_headers(db_session) -> dict[str, str]:
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    return _token(admin, "admin")


def _billing_property(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": f"Billing Test {uuid4().hex[:8]}",
            "type": "HOSTEL_BOYS",
            "floors": 1,
            "address": "1 Ledger Lane",
            "city": "Ledger City",
            "state": "Ledger State",
            "pincode": "10000",
            "contactPhone": "1234567890",
            "timezone": "Asia/Kolkata",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def _configure_fee(
    client: TestClient,
    headers: dict[str, str],
    property_id: str,
    fee_type: str,
    name: str,
    amount: str = "0",
    rate: str | None = None,
    unit: str | None = None,
) -> None:
    payload = {
        "feeType": fee_type,
        "name": name,
        "amount": amount,
        "isActive": True,
    }
    if rate is not None:
        payload.update(
            {
                "pricingBasis": "METERED",
                "billingTiming": "ARREARS",
                "ratePerUnit": rate,
                "unitOfMeasure": unit,
            }
        )
    response = client.post(
        f"/api/v1/properties/{property_id}/fee-configs",
        headers=headers,
        json=payload,
    )
    assert response.status_code == 201, response.text


def test_monthly_invoice_arrears_receipts_and_deposit_escrow(
    client: TestClient, db_session, monkeypatch
):
    headers = _admin_headers(db_session)
    prop = _billing_property(client, headers)
    _configure_fee(client, headers, prop["id"], "MESS_FEE", "Mess", "1000")
    _configure_fee(client, headers, prop["id"], "SECURITY_DEPOSIT", "Deposit", "5000")
    _configure_fee(
        client, headers, prop["id"], "ELECTRICITY_FEE", "Electricity", rate="8", unit="KWH"
    )
    _configure_fee(client, headers, prop["id"], "WATER_CHARGE", "Water", rate="2", unit="LITER")

    room_response = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "A1",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "sharingType": "SINGLE",
            "capacity": 1,
            "bedsPerRoom": 1,
            "baseRateMonthly": "7000",
        },
    )
    assert room_response.status_code == 201, room_response.text
    bed = db_session.scalar(
        select(Unit).where(Unit.property_id == prop["id"], Unit.type == "BED")
    )
    assert bed is not None
    customer = User(
        email=f"ledger-{uuid4().hex[:8]}@example.test",
        full_name="Ledger Customer",
        password_hash="not-used",
        role=Role.CUSTOMER,
        status="ACTIVE",
    )
    db_session.add(customer)
    db_session.commit()
    assignment_response = client.post(
        "/api/v1/stay/assignments",
        headers=headers,
        json={
            "unitId": bed.id,
            "userId": customer.id,
            "expectedCheckIn": (datetime.now(timezone.utc) - timedelta(days=14)).isoformat(),
            "billingStrategy": "RECURRING_MONTHLY",
            "agreedRate": "6500",
            "rateOverrideReason": "Long-term lease discount",
            "depositPaymentAmount": "5000",
            "depositPaymentMethod": "CASH",
        },
    )
    assert assignment_response.status_code == 201, assignment_response.text
    assignment_id = assignment_response.json()["id"]
    escrow = db_session.scalar(
        select(DepositEscrow).where(DepositEscrow.unit_assignment_id == assignment_id)
    )
    assert escrow is not None
    assert escrow.amount == 5000
    assert escrow.status == "HELD"
    assert escrow.collected_amount == 5000
    deposit_receipt = db_session.scalar(
        select(PaymentReceipt).where(PaymentReceipt.deposit_escrow_id == escrow.id)
    )
    assert deposit_receipt is not None
    assert deposit_receipt.payment_method == "CASH"

    today = datetime.now(ZoneInfo("Asia/Kolkata")).date()
    billing_month = today.replace(day=1)
    previous_month = billing_month - timedelta(days=1)
    period_start = previous_month.replace(day=1)
    period_end = previous_month.replace(
        day=calendar.monthrange(previous_month.year, previous_month.month)[1]
    )
    for fee_type, last_reading in (("ELECTRICITY_FEE", "120"), ("WATER_CHARGE", "110")):
        reading_response = client.post(
            "/api/v1/billing/utility-readings",
            headers=headers,
            json={
                "propertyId": prop["id"],
                "unitAssignmentId": assignment_id,
                "feeType": fee_type,
                "periodStart": period_start.isoformat(),
                "periodEnd": period_end.isoformat(),
                "previousReading": "100",
                "currentReading": last_reading,
            },
        )
        assert reading_response.status_code == 201, reading_response.text

    generation = client.post(
        "/api/v1/billing/invoices/generate-monthly",
        headers=headers,
        params={"billingMonth": billing_month.strftime("%Y-%m"), "propertyId": prop["id"]},
    )
    assert generation.status_code == 200, generation.text
    invoice = generation.json()["invoices"][0]
    assert generation.json()["createdCount"] == 1
    assert invoice["unitFee"] == "6500.00"
    assert invoice["messFee"] == "1000.00"
    assert invoice["electricityArrears"] == "160.00"
    assert invoice["waterArrears"] == "20.00"
    assert invoice["totalAmount"] == "7680.00"

    rerun = client.post(
        "/api/v1/billing/invoices/generate-monthly",
        headers=headers,
        params={"billingMonth": billing_month.strftime("%Y-%m"), "propertyId": prop["id"]},
    )
    assert rerun.status_code == 200, rerun.text
    assert rerun.json()["createdCount"] == 0
    assert rerun.json()["skippedCount"] == 1
    stored_invoice = db_session.get(MonthlyInvoice, invoice["id"])
    assert stored_invoice is not None
    assert stored_invoice.status == "UNPAID"

    receipt_response = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments",
        headers=headers,
        json={"amount": "500", "paymentMethod": "UPI", "reference": "UPI-123"},
    )
    assert receipt_response.status_code == 201, receipt_response.text
    assert receipt_response.json()["paymentMethod"] == "UPI"
    assert receipt_response.json()["receiptNumber"].startswith("RCT-")
    db_session.expire_all()
    assert db_session.get(MonthlyInvoice, invoice["id"]).status == "PARTIALLY_PAID"

    customer_invoices = client.get(
        "/api/v1/billing/me/invoices", headers=_token(customer, "customer")
    )
    assert customer_invoices.status_code == 200, customer_invoices.text
    assert customer_invoices.json()[0]["balance"] == "7180.00"

    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "test_key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "test_secret")
    order_id = "order_test_123"
    payment_id = "pay_test_456"
    order_data = {
        "id": order_id,
        "amount": 718000,
        "receipt": invoice["id"],
        "currency": prop["currency"],
        "notes": {"invoiceId": invoice["id"], "customerId": customer.id},
    }

    def fake_razorpay_request(method, path, payload=None):
        if method == "POST":
            assert path == "/orders"
            assert payload["amount"] == 718000
            return order_data
        if path == f"/orders/{order_id}":
            return order_data
        if path == f"/payments/{payment_id}":
            return {
                "order_id": order_id,
                "status": "captured",
                "amount": 718000,
                "currency": prop["currency"],
                "method": "upi",
            }
        raise AssertionError(f"Unexpected Razorpay request: {method} {path}")

    monkeypatch.setattr(billing_service, "_razorpay_request", fake_razorpay_request)
    customer_headers = _token(customer, "customer")
    checkout = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/checkout",
        headers=customer_headers,
    )
    assert checkout.status_code == 200, checkout.text
    assert checkout.json()["orderId"] == order_id

    signature = hmac.new(
        b"test_secret",
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    verify_payload = {
        "razorpay_order_id": order_id,
        "razorpay_payment_id": payment_id,
        "razorpay_signature": signature,
    }
    verified = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments/verify",
        headers=customer_headers,
        json=verify_payload,
    )
    assert verified.status_code == 201, verified.text
    assert verified.json()["paymentMethod"] == "UPI"
    assert verified.json()["receiptNumber"].startswith("RCT-")
    repeated = client.post(
        f"/api/v1/billing/invoices/{invoice['id']}/payments/verify",
        headers=customer_headers,
        json=verify_payload,
    )
    assert repeated.status_code == 201, repeated.text
    assert repeated.json()["id"] == verified.json()["id"]
    db_session.expire_all()
    paid_invoice = db_session.get(MonthlyInvoice, invoice["id"])
    assert paid_invoice is not None
    assert paid_invoice.status == "PAID"
    assert paid_invoice.paid_amount == Decimal("7680.00")

    duplicate_deposit_payment = client.post(
        f"/api/v1/billing/deposits/{escrow.id}/payments",
        headers=headers,
        json={"amount": "1", "paymentMethod": "CASH"},
    )
    assert duplicate_deposit_payment.status_code == 400


def test_razorpay_verifies_and_captures_authorized_payments(monkeypatch):
    monkeypatch.setattr(settings, "RAZORPAY_KEY_ID", "test_key")
    monkeypatch.setattr(settings, "RAZORPAY_KEY_SECRET", "test_secret")
    invoice = SimpleNamespace(id="invoice-id", user_id="customer-id")
    prop = SimpleNamespace(currency="INR")
    order_id = "order_authorized"
    payment_id = "payment_authorized"
    order = {
        "receipt": invoice.id,
        "notes": {"invoiceId": invoice.id, "customerId": invoice.user_id},
        "currency": "INR",
        "amount": 12345,
    }
    authorized_payment = {
        "order_id": order_id,
        "status": "authorized",
        "amount": 12345,
        "currency": "INR",
        "method": "card",
    }
    captured_payment = {**authorized_payment, "status": "captured"}
    calls = []

    def fake_razorpay_request(method, path, payload=None):
        calls.append((method, path, payload))
        if path == f"/orders/{order_id}":
            return order
        if path == f"/payments/{payment_id}":
            return authorized_payment
        if path == f"/payments/{payment_id}/capture":
            assert payload == {"amount": 12345, "currency": "INR"}
            return captured_payment
        raise AssertionError(f"Unexpected Razorpay request: {method} {path}")

    monkeypatch.setattr(billing_service, "_razorpay_request", fake_razorpay_request)
    signature = hmac.new(
        b"test_secret",
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    amount, payment_method = billing_service.verify_razorpay_payment(
        invoice, order_id, payment_id, signature, prop
    )

    assert amount == Decimal("123.45")
    assert payment_method == "CARD"
    assert calls[-1][0] == "POST"


def test_reservation_checkin_collects_configured_security_deposit(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    prop = _billing_property(client, headers)
    _configure_fee(client, headers, prop["id"], "SECURITY_DEPOSIT", "Deposit", "2500")
    room_response = client.post(
        f"/api/v1/properties/{prop['id']}/units",
        headers=headers,
        json={
            "unitNumber": "B1",
            "floor": 1,
            "type": "ROOM",
            "category": "CLASSIC",
            "sharingType": "SINGLE",
            "capacity": 1,
            "bedsPerRoom": 1,
            "baseRateMonthly": "6000",
        },
    )
    assert room_response.status_code == 201, room_response.text
    bed = db_session.scalar(
        select(Unit).where(Unit.property_id == prop["id"], Unit.type == "BED")
    )
    assert bed is not None
    check_in = datetime.now(ZoneInfo("Asia/Kolkata")).date() + timedelta(days=14)
    reservation_response = client.post(
        "/api/v1/reservations",
        json={
            "propertyId": prop["id"],
            "guestName": "Deposit Guest",
            "mobile": f"+1555{uuid4().int % 10000000:07d}",
            "requestedCategory": "CLASSIC",
            "requestedType": "BED",
            "expectedCheckIn": check_in.isoformat(),
            "expectedCheckOut": (check_in + timedelta(days=30)).isoformat(),
            "occupants": [
                {
                    "isPrimary": True,
                    "firstName": "Deposit",
                    "lastName": "Guest",
                    "idType": "AADHAAR",
                    "idNumber": "123456789012",
                }
            ],
        },
    )
    assert reservation_response.status_code == 201, reservation_response.text
    reservation_id = reservation_response.json()["id"]
    approved = client.patch(
        f"/api/v1/reservations/{reservation_id}/status",
        headers=headers,
        json={"status": "APPROVED"},
    )
    assert approved.status_code == 200, approved.text

    conversion = client.post(
        f"/api/v1/reservations/{reservation_id}/convert",
        headers=headers,
        json={
            "unitId": bed.id,
            "initialDeposit": "2500",
            "paymentConfirmed": True,
            "paymentMethod": "UPI",
            "paymentReference": "UPI-DEPOSIT-1",
        },
    )
    assert conversion.status_code == 200, conversion.text
    assignment_id = conversion.json()["assignmentIds"][0]
    escrow = db_session.scalar(
        select(DepositEscrow).where(DepositEscrow.unit_assignment_id == assignment_id)
    )
    assert escrow is not None
    assert escrow.status == "HELD"
    receipt = db_session.scalar(
        select(PaymentReceipt).where(PaymentReceipt.deposit_escrow_id == escrow.id)
    )
    assert receipt is not None
    assert receipt.payment_method == "UPI"
    assert receipt.reference == "UPI-DEPOSIT-1"
