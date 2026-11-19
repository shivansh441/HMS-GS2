import re
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_CLIENT_APPLICATIONS = {"admin-panel", "public-website"}
_MAX_METRICS = 500
_DYNAMIC_ID = re.compile(
    r"/(?:[0-9a-f]{8}-[0-9a-f-]{27,}|\d+|[^/]*@[^/]*|[^/]*%40[^/]*)"
    r"(?=/|$)",
    re.IGNORECASE,
)


def _normalize_path(path: str) -> str:
    return _DYNAMIC_ID.sub("/:id", path)


@dataclass
class ApiHealthMetric:
    method: str
    path: str
    status_code: int | None
    latency_ms: int
    request_count: int
    client_error_count: int
    server_error_count: int
    last_checked_at: str


_metrics: dict[tuple[str, str, str], ApiHealthMetric] = {}
_metrics_lock = threading.Lock()


def _record_request(
    client_application: str,
    method: str,
    path: str,
    status_code: int,
    latency_ms: int,
) -> None:
    key = (client_application, method, path)
    with _metrics_lock:
        metric = _metrics.get(key)
        if metric is None:
            if len(_metrics) >= _MAX_METRICS:
                return
            metric = ApiHealthMetric(
                method=method,
                path=path,
                status_code=status_code,
                latency_ms=latency_ms,
                request_count=0,
                client_error_count=0,
                server_error_count=0,
                last_checked_at="",
            )
            _metrics[key] = metric

        metric.status_code = status_code
        metric.latency_ms = max(0, latency_ms)
        metric.request_count += 1
        metric.client_error_count += int(400 <= status_code < 500)
        metric.server_error_count += int(status_code >= 500)
        metric.last_checked_at = datetime.now(timezone.utc).isoformat()


def get_api_health_snapshot(client_application: str) -> list[dict[str, Any]]:
    with _metrics_lock:
        metrics = [
            asdict(metric)
            for (application, _, _), metric in _metrics.items()
            if application == client_application
        ]
    return sorted(metrics, key=lambda metric: metric["last_checked_at"], reverse=True)


class ApiHealthMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        client_application = headers.get(b"x-client-application", b"").decode(
            "latin-1"
        ).strip()
        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()
        if (
            client_application not in _CLIENT_APPLICATIONS
            or method == "OPTIONS"
            or not path.startswith("/api/v1/")
        ):
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        metric_path = _normalize_path(path)
        status_code = 500
        recorded = False

        async def record_response(message: Message) -> None:
            nonlocal status_code, recorded
            if message["type"] == "http.response.start":
                status_code = message["status"]
            if (
                message["type"] == "http.response.body"
                and not message.get("more_body", False)
                and not recorded
            ):
                _record_request(
                    client_application,
                    method,
                    metric_path,
                    status_code,
                    round((time.perf_counter() - started) * 1000),
                )
                recorded = True
            await send(message)

        try:
            await self.app(scope, receive, record_response)
        except Exception:
            if not recorded:
                _record_request(
                    client_application,
                    method,
                    metric_path,
                    status_code,
                    round((time.perf_counter() - started) * 1000),
                )
            raise
