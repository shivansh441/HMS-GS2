from sqlalchemy import select

from app.core.security import create_access_token
from app.db.models import AuditLog, User, WebsitePageView
from app.modules.website import router as website_module


def _admin_headers(db_session) -> dict[str, str]:
    admin = db_session.scalar(select(User).where(User.role == "ADMIN"))
    assert admin is not None
    token = create_access_token(subject=admin.id, audience="admin", role=admin.role)
    return {"Authorization": f"Bearer {token}"}


def _staff_headers(db_session) -> dict[str, str]:
    staff = db_session.scalar(select(User).where(User.role == "STAFF"))
    assert staff is not None
    token = create_access_token(subject=staff.id, audience="admin", role=staff.role)
    return {"Authorization": f"Bearer {token}"}


def test_public_page_view_masks_ip_and_keeps_only_referrer_host(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(website_module.settings, "TRUST_CLOUDFLARE_HEADERS", True)
    response = client.post(
        "/api/v1/website/analytics/page-view",
        headers={
            "X-Forwarded-For": "198.51.100.42",
            "CF-IPCountry": "us",
            "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
        },
        json={
            "path": "/properties?secret=not-stored",
            "referrer": "https://search.example/results?q=private",
        },
    )

    assert response.status_code == 202
    visit = db_session.scalar(
        select(WebsitePageView).where(WebsitePageView.path == "/properties")
    )
    assert visit is not None
    assert visit.visitor_ip_masked == "198.51.100.0/24"
    assert visit.country_code == "US"
    assert visit.referrer_host == "search.example"
    assert visit.device_type == "Mobile"
    assert visit.browser == "Safari"
    assert "secret" not in visit.path
    assert (
        db_session.scalar(
            select(AuditLog.id).where(
                AuditLog.request_url == "/api/v1/website/analytics/page-view"
            )
        )
        is None
    )


def test_monitor_is_admin_only_and_reports_privacy_safe_recent_visits(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(website_module.settings, "TRUST_CLOUDFLARE_HEADERS", True)
    visit_response = client.post(
        "/api/v1/website/analytics/page-view",
        headers={"X-Forwarded-For": "203.0.113.47", "CF-IPCountry": "CA"},
        json={"path": "/about"},
    )
    assert visit_response.status_code == 202

    unauthorized = client.get("/api/v1/website/monitor")
    assert unauthorized.status_code == 401

    forbidden = client.get(
        "/api/v1/website/monitor",
        headers=_staff_headers(db_session),
    )
    assert forbidden.status_code == 403

    admin_response = client.get(
        "/api/v1/website/monitor",
        headers=_admin_headers(db_session),
    )
    assert admin_response.status_code == 200, admin_response.text
    data = admin_response.json()
    assert data["pageViews30d"] >= 1
    assert any(visit["path"] == "/about" for visit in data["recentVisits"])
    assert any(
        visit["visitorIp"] == "203.0.113.0/24"
        for visit in data["recentVisits"]
        if visit["path"] == "/about"
    )
    assert any(country["country"] == "CA" for country in data["topCountries"])


def test_uptime_reports_live_status_for_each_service(client, db_session, monkeypatch):
    monkeypatch.setattr(website_module, "_check_admin_panel", lambda: ("up", 8))
    monkeypatch.setattr(website_module, "_check_public_website", lambda: ("up", 12))

    unauthorized = client.get("/api/v1/website/uptime")
    assert unauthorized.status_code == 401

    forbidden = client.get(
        "/api/v1/website/uptime",
        headers=_staff_headers(db_session),
    )
    assert forbidden.status_code == 403

    response = client.get(
        "/api/v1/website/uptime",
        headers=_admin_headers(db_session),
    )

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["historicalUptimeAvailable"] is False
    services = {service["service"]: service for service in data["services"]}
    assert set(services) == {"Admin panel", "Public website", "Backend API", "Database"}
    assert services["Admin panel"]["status"] == "up"
    assert services["Admin panel"]["responseMs"] == 8
    assert services["Public website"]["status"] == "up"
    assert services["Public website"]["responseMs"] == 12
    assert services["Backend API"]["status"] == "up"
    assert services["Database"]["status"] == "up"


def test_api_health_groups_observed_requests_by_frontend(client, db_session):
    admin_call = client.get(
        "/api/v1/health",
        headers={"X-Client-Application": "admin-panel"},
    )
    public_call = client.get(
        "/api/v1/health",
        headers={"X-Client-Application": "public-website"},
    )
    assert admin_call.status_code == public_call.status_code == 200

    unauthorized = client.get("/api/v1/website/api-health")
    assert unauthorized.status_code == 401

    response = client.get(
        "/api/v1/website/api-health",
        headers=_admin_headers(db_session),
    )

    assert response.status_code == 200, response.text
    data = response.json()
    admin_health = next(
        (
            metric
            for metric in data["adminPanel"]
            if metric["method"] == "GET" and metric["path"] == "/api/v1/health"
        ),
        None,
    )
    public_health = next(
        (
            metric
            for metric in data["publicWebsite"]
            if metric["method"] == "GET" and metric["path"] == "/api/v1/health"
        ),
        None,
    )
    assert admin_health is not None, data
    assert public_health is not None, data
    assert admin_health["statusCode"] == public_health["statusCode"] == 200
    assert admin_health["requestCount"] >= 1
    assert public_health["requestCount"] >= 1
