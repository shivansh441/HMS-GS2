from datetime import date, timedelta
from uuid import uuid4

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.core.security import create_access_token
from app.db.models import MessFacility, User


def _admin_headers(db_session) -> dict[str, str]:
    admin = db_session.scalar(select(User).where(User.email == "admin@havenstays.local"))
    assert admin is not None
    token = create_access_token(subject=admin.id, audience="admin", role=admin.role)
    return {"Authorization": f"Bearer {token}"}


def _create_mess_enabled_hostel(client: TestClient, headers: dict[str, str]) -> dict:
    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": f"Mess Test {suffix}",
            "type": "HOSTEL_BOYS",
            "floors": 1,
            "address": "1 Mess Road",
            "city": f"Mess{suffix}",
            "state": "Test State",
            "pincode": "10000",
            "contactPhone": "1234567890",
            "timezone": "Asia/Kolkata",
            "hasMessFacility": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_mess_facility_default_meals_and_future_menu(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    prop = _create_mess_enabled_hostel(client, headers)
    facilities_response = client.get(
        "/api/v1/mess/facilities",
        headers=headers,
        params={"propertyId": prop["id"]},
    )
    assert facilities_response.status_code == 200, facilities_response.text
    facilities = facilities_response.json()
    assert len(facilities) == 1
    assert facilities[0]["isDefault"] is True
    snake_case_facilities = client.get(
        "/api/v1/mess/facilities",
        headers=headers,
        params={"property_id": prop["id"]},
    )
    assert snake_case_facilities.status_code == 200
    assert len(snake_case_facilities.json()) == 1

    second_facility_response = client.post(
        "/api/v1/mess/facilities",
        headers=headers,
        json={"propertyId": prop["id"], "name": "Annex Mess", "capacity": 40},
    )
    assert second_facility_response.status_code == 201, second_facility_response.text
    second_facility = second_facility_response.json()
    assert second_facility["isDefault"] is False
    make_default_response = client.put(
        f"/api/v1/mess/facilities/{second_facility['id']}",
        headers=headers,
        json={"isDefault": True},
    )
    assert make_default_response.status_code == 200, make_default_response.text
    assert make_default_response.json()["isDefault"] is True
    assert db_session.scalar(
        select(MessFacility).where(
            MessFacility.property_id == prop["id"],
            MessFacility.is_default.is_(True),
        )
    ).id == second_facility["id"]
    restore_default_response = client.put(
        f"/api/v1/mess/facilities/{facilities[0]['id']}",
        headers=headers,
        json={"isDefault": True},
    )
    assert restore_default_response.status_code == 200, restore_default_response.text
    assert db_session.scalar(
        select(MessFacility).where(
            MessFacility.property_id == prop["id"],
            MessFacility.is_default.is_(True),
        )
    ).id == facilities[0]["id"]

    meal_response = client.post(
        "/api/v1/mess/meals",
        headers=headers,
        json={
            "name": "Vegetable Poha",
            "category": "BREAKFAST",
            "dietaryType": "VEG",
            "ingredients": "Rice flakes, vegetables",
        },
    )
    assert meal_response.status_code == 201, meal_response.text
    meal = meal_response.json()
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    menu_response = client.post(
        f"/api/v1/mess/{second_facility['id']}/menu",
        headers=headers,
        json={"scheduledDate": tomorrow, "mealItemIds": [meal["id"]]},
    )
    assert menu_response.status_code == 200, menu_response.text
    assert menu_response.json()["items"][0]["mealItem"]["name"] == "Vegetable Poha"
    repeated_menu_response = client.post(
        f"/api/v1/mess/{second_facility['id']}/menu",
        headers=headers,
        json={"scheduledDate": tomorrow, "mealItemIds": [meal["id"]]},
    )
    assert repeated_menu_response.status_code == 200, repeated_menu_response.text
    assert len(repeated_menu_response.json()["items"]) == 1
    fetched_menu = client.get(
        f"/api/v1/mess/{second_facility['id']}/menu",
        headers=headers,
        params={"date": tomorrow},
    )
    assert fetched_menu.status_code == 200
    assert fetched_menu.json()["items"][0]["mealCategory"] == "BREAKFAST"

    past_menu_response = client.post(
        f"/api/v1/mess/{second_facility['id']}/menu",
        headers=headers,
        json={"scheduledDate": (date.today() - timedelta(days=1)).isoformat(), "mealItemIds": []},
    )
    assert past_menu_response.status_code == 400

    update_meal_response = client.put(
        f"/api/v1/mess/meals/{meal['id']}",
        headers=headers,
        json={"dietaryType": "EGGETARIAN"},
    )
    assert update_meal_response.status_code == 200, update_meal_response.text
    assert update_meal_response.json()["dietaryType"] == "EGGETARIAN"
    delete_scheduled_meal = client.delete(
        f"/api/v1/mess/meals/{meal['id']}",
        headers=headers,
    )
    assert delete_scheduled_meal.status_code == 409


def test_mess_menu_rejects_non_admin_and_non_mess_property(client: TestClient, db_session):
    headers = _admin_headers(db_session)
    suffix = uuid4().hex[:8]
    response = client.post(
        "/api/v1/properties",
        headers=headers,
        json={
            "name": f"Not Mess {suffix}",
            "type": "HOTEL",
            "floors": 1,
            "address": "1 Hotel Road",
            "city": f"Hotel{suffix}",
            "state": "Test State",
            "pincode": "10000",
            "contactPhone": "1234567890",
            "timezone": "Asia/Kolkata",
        },
    )
    assert response.status_code == 201, response.text
    create_facility = client.post(
        "/api/v1/mess/facilities",
        headers=headers,
        json={"propertyId": response.json()["id"], "name": "Hotel Mess"},
    )
    assert create_facility.status_code == 400

    staff = db_session.scalar(select(User).where(User.role == "STAFF"))
    assert staff is not None
    staff_token = create_access_token(subject=staff.id, audience="admin", role=staff.role)
    staff_response = client.get(
        "/api/v1/mess/facilities",
        headers={"Authorization": f"Bearer {staff_token}"},
    )
    assert staff_response.status_code == 403
