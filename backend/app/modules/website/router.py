import asyncio
import ipaddress
import time
from datetime import datetime, timedelta, timezone
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request as UrlRequest
from urllib.request import urlopen

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.errors import ForbiddenError
from app.core.logging import logger
from app.core.permissions import Role
from app.core.rate_limit import get_client_ip, rate_limiter
from app.db.models import User, WebsitePageView
from app.db.session import get_db
from app.modules.auth.deps import get_current_admin_user
from app.modules.website.api_health import get_api_health_snapshot

website_router = APIRouter(prefix="/website", tags=["Website Monitor"])
RETENTION_DAYS = 30


class PageViewRequest(BaseModel):
    path: str = Field(min_length=1, max_length=512)
    referrer: str | None = Field(default=None, max_length=2048)
    model_config = ConfigDict(str_strip_whitespace=True)

    @field_validator("path")
    @classmethod
    def clean_path(cls, value: str) -> str:
        path = value.split("?", 1)[0].split("#", 1)[0]
        if not path.startswith("/"):
            raise ValueError("Path must be relative to the website root")
        return path


class WebsiteVisitItem(BaseModel):
    id: str
    path: str
    visitor_ip: str = Field(alias="visitorIp")
    country_code: str | None = Field(alias="countryCode")
    referrer_host: str | None = Field(alias="referrerHost")
    browser: str
    device_type: str = Field(alias="deviceType")
    visited_at: datetime = Field(alias="visitedAt")
    model_config = ConfigDict(populate_by_name=True)


class WebsiteMonitorResponse(BaseModel):
    checked_at: datetime = Field(alias="checkedAt")
    page_views_24h: int = Field(alias="pageViews24h")
    page_views_30d: int = Field(alias="pageViews30d")
    unique_visitors_30d: int = Field(alias="uniqueVisitors30d")
    top_pages: list[dict[str, str | int]] = Field(alias="topPages")
    top_countries: list[dict[str, str | int]] = Field(alias="topCountries")
    recent_visits: list[WebsiteVisitItem] = Field(alias="recentVisits")
    model_config = ConfigDict(populate_by_name=True)


class WebsiteServiceHealth(BaseModel):
    service: str
    url: str
    status: str
    response_ms: int | None = Field(alias="responseMs")
    model_config = ConfigDict(populate_by_name=True)


class WebsiteUptimeResponse(BaseModel):
    checked_at: datetime = Field(alias="checkedAt")
    historical_uptime_available: bool = Field(alias="historicalUptimeAvailable")
    services: list[WebsiteServiceHealth]
    model_config = ConfigDict(populate_by_name=True)


class WebsiteApiHealthMetric(BaseModel):
    method: str
    path: str
    status_code: int | None = Field(alias="statusCode")
    latency_ms: int = Field(alias="latencyMs")
    request_count: int = Field(alias="requestCount")
    client_error_count: int = Field(alias="clientErrorCount")
    server_error_count: int = Field(alias="serverErrorCount")
    last_checked_at: datetime = Field(alias="lastCheckedAt")
    model_config = ConfigDict(populate_by_name=True)


class WebsiteApiHealthResponse(BaseModel):
    checked_at: datetime = Field(alias="checkedAt")
    admin_panel: list[WebsiteApiHealthMetric] = Field(alias="adminPanel")
    public_website: list[WebsiteApiHealthMetric] = Field(alias="publicWebsite")
    model_config = ConfigDict(populate_by_name=True)


def _mask_ip(value: str) -> str:
    try:
        address = ipaddress.ip_address(value.strip())
    except ValueError:
        return "Unknown"
    prefix = 24 if address.version == 4 else 48
    network = ipaddress.ip_network(f"{address}/{prefix}", strict=False)
    return f"{network.network_address}/{prefix}"


def _country_code(request: Request) -> str | None:
    if not settings.TRUST_CLOUDFLARE_HEADERS:
        return None
    value = request.headers.get("cf-ipcountry", "").strip().upper()
    return value if len(value) == 2 and value.isalpha() else None


def _browser_and_device(user_agent: str) -> tuple[str, str]:
    agent = user_agent.lower()
    if "ipad" in agent or "tablet" in agent:
        device = "Tablet"
    elif "mobile" in agent or "iphone" in agent or "android" in agent:
        device = "Mobile"
    else:
        device = "Desktop"

    if "edg/" in agent:
        browser = "Edge"
    elif "firefox/" in agent:
        browser = "Firefox"
    elif "opr/" in agent or "opera" in agent:
        browser = "Opera"
    elif "chrome/" in agent or "chromium/" in agent:
        browser = "Chrome"
    elif "safari/" in agent:
        browser = "Safari"
    else:
        browser = "Other"
    return browser, device


def _referrer_host(referrer: str | None) -> str | None:
    if not referrer:
        return None
    try:
        return urlsplit(referrer).hostname
    except ValueError:
        return None


def _purge_expired_visits(db: Session, now: datetime) -> None:
    db.execute(
        delete(WebsitePageView).where(
            WebsitePageView.created_at < now - timedelta(days=RETENTION_DAYS)
        )
    )
    db.commit()


def _require_admin(user: User) -> None:
    if user.role != Role.ADMIN:
        raise ForbiddenError("Website monitoring is restricted to Admin")


def _check_url(url: str, service: str) -> tuple[str, int | None]:
    started = time.perf_counter()
    try:
        with urlopen(
            UrlRequest(url, headers={"Accept": "application/json"}),
            timeout=3,
        ) as response:
            status = response.status
    except HTTPError as error:
        status = error.code
    except (URLError, TimeoutError, OSError, ValueError) as error:
        logger.warning("%s live check failed: %s", service, error)
        return "down", None

    elapsed_ms = round((time.perf_counter() - started) * 1000)
    return ("up" if 200 <= status < 400 else "down"), elapsed_ms


def _check_public_website() -> tuple[str, int | None]:
    url = f"{settings.PUBLIC_WEBSITE_URL.rstrip('/')}/api/health"
    return _check_url(url, "Public website")


def _check_admin_panel() -> tuple[str, int | None]:
    url = f"{settings.ADMIN_PANEL_URL.rstrip('/')}/"
    return _check_url(url, "Admin panel")


@website_router.post("/analytics/page-view", status_code=202)
def record_page_view(
    payload: PageViewRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    client_ip = get_client_ip(request)
    masked_ip = _mask_ip(client_ip)
    rate_limiter.check(
        key=f"website_page_view:{masked_ip}",
        max_requests=120,
        window_seconds=60,
    )
    now = datetime.now(timezone.utc)
    user_agent = request.headers.get("user-agent", "")[:512]
    browser, device = _browser_and_device(user_agent)
    visit = WebsitePageView(
        path=payload.path,
        visitor_ip_masked=masked_ip,
        country_code=_country_code(request),
        referrer_host=_referrer_host(payload.referrer),
        browser=browser,
        device_type=device,
        created_at=now,
    )
    _purge_expired_visits(db, now)
    db.add(visit)
    db.commit()
    return {"status": "recorded"}


@website_router.get("/monitor", response_model=WebsiteMonitorResponse)
async def get_website_monitor(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    now = datetime.now(timezone.utc)
    _purge_expired_visits(db, now)
    cutoff_24h = now - timedelta(hours=24)
    cutoff_30d = now - timedelta(days=RETENTION_DAYS)

    page_views_24h = db.scalar(
        select(func.count(WebsitePageView.id)).where(
            WebsitePageView.created_at >= cutoff_24h
        )
    ) or 0
    page_views_30d = db.scalar(
        select(func.count(WebsitePageView.id)).where(
            WebsitePageView.created_at >= cutoff_30d
        )
    ) or 0
    unique_visitors_30d = db.scalar(
        select(func.count(func.distinct(WebsitePageView.visitor_ip_masked))).where(
            WebsitePageView.created_at >= cutoff_30d,
            WebsitePageView.visitor_ip_masked != "Unknown",
        )
    ) or 0

    pages = db.execute(
        select(WebsitePageView.path, func.count(WebsitePageView.id).label("views"))
        .where(WebsitePageView.created_at >= cutoff_30d)
        .group_by(WebsitePageView.path)
        .order_by(func.count(WebsitePageView.id).desc())
        .limit(5)
    ).all()
    countries = db.execute(
        select(
            WebsitePageView.country_code,
            func.count(WebsitePageView.id).label("views"),
        )
        .where(WebsitePageView.created_at >= cutoff_30d)
        .group_by(WebsitePageView.country_code)
        .order_by(func.count(WebsitePageView.id).desc())
        .limit(5)
    ).all()
    visits = db.scalars(
        select(WebsitePageView)
        .order_by(WebsitePageView.created_at.desc())
        .limit(100)
    ).all()

    return WebsiteMonitorResponse(
        checkedAt=now,
        pageViews24h=page_views_24h,
        pageViews30d=page_views_30d,
        uniqueVisitors30d=unique_visitors_30d,
        topPages=[{"path": path, "views": count} for path, count in pages],
        topCountries=[
            {"country": country or "Unknown", "views": count}
            for country, count in countries
        ],
        recentVisits=[
            WebsiteVisitItem(
                id=visit.id,
                path=visit.path,
                visitorIp=visit.visitor_ip_masked,
                countryCode=visit.country_code,
                referrerHost=visit.referrer_host,
                browser=visit.browser,
                deviceType=visit.device_type,
                visitedAt=visit.created_at,
            )
            for visit in visits
        ],
    )


@website_router.get("/uptime", response_model=WebsiteUptimeResponse)
async def get_website_uptime(
    admin_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db),
):
    _require_admin(admin_user)
    checked_at = datetime.now(timezone.utc)
    admin_panel, public_website = await asyncio.gather(
        asyncio.to_thread(_check_admin_panel),
        asyncio.to_thread(_check_public_website),
    )

    database_started = time.perf_counter()
    try:
        db.execute(select(1))
        database_status = "up"
        database_response_ms = round((time.perf_counter() - database_started) * 1000)
    except SQLAlchemyError as error:
        db.rollback()
        logger.error("Website monitor database health check failed: %s", error)
        database_status = "down"
        database_response_ms = None

    return WebsiteUptimeResponse(
        checkedAt=checked_at,
        historicalUptimeAvailable=False,
        services=[
            WebsiteServiceHealth(
                service="Admin panel",
                url=settings.ADMIN_PANEL_URL,
                status=admin_panel[0],
                responseMs=admin_panel[1],
            ),
            WebsiteServiceHealth(
                service="Public website",
                url=settings.PUBLIC_WEBSITE_URL,
                status=public_website[0],
                responseMs=public_website[1],
            ),
            WebsiteServiceHealth(
                service="Backend API",
                url="Current API instance",
                status="up",
                responseMs=None,
            ),
            WebsiteServiceHealth(
                service="Database",
                url="Configured database",
                status=database_status,
                responseMs=database_response_ms,
            ),
        ],
    )


@website_router.get("/api-health", response_model=WebsiteApiHealthResponse)
def get_website_api_health(
    admin_user: User = Depends(get_current_admin_user),
):
    _require_admin(admin_user)
    return WebsiteApiHealthResponse(
        checkedAt=datetime.now(timezone.utc),
        adminPanel=get_api_health_snapshot("admin-panel"),
        publicWebsite=get_api_health_snapshot("public-website"),
    )
