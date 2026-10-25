import time
from typing import Dict, List
from fastapi import Request
from app.core.errors import AppException

class RateLimiter:
    """
    In-memory token bucket / sliding window rate limiter.
    Enforces per-key limits and returns 429 with Retry-After header.
    """
    def __init__(self):
        # key -> list of timestamp floats
        self._records: Dict[str, List[float]] = {}
        # key -> float timestamp of last event (for cooldowns)
        self._last_event: Dict[str, float] = {}

    def clear(self) -> None:
        self._records.clear()
        self._last_event.clear()

    def check(self, key: str, max_requests: int, window_seconds: int, cooldown_seconds: int = 0) -> None:
        now = time.time()
        
        # Check cooldown if required (e.g. 60s resend cooldown)
        if cooldown_seconds > 0 and key in self._last_event:
            elapsed = now - self._last_event[key]
            if elapsed < cooldown_seconds:
                retry_after = int(cooldown_seconds - elapsed) + 1
                raise AppException(
                    status_code=429,
                    code="RATE_LIMIT_EXCEEDED",
                    message=f"Please wait {retry_after} seconds before requesting again.",
                    headers={"Retry-After": str(retry_after)}
                )

        # Sliding window check
        cutoff = now - window_seconds
        timestamps = [t for t in self._records.get(key, []) if t > cutoff]
        
        if len(timestamps) >= max_requests:
            earliest = timestamps[0]
            retry_after = int(earliest + window_seconds - now) + 1
            raise AppException(
                status_code=429,
                code="RATE_LIMIT_EXCEEDED",
                message=f"Rate limit exceeded. Try again in {retry_after} seconds.",
                headers={"Retry-After": str(max(1, retry_after))}
            )

        timestamps.append(now)
        self._records[key] = timestamps
        self._last_event[key] = now

rate_limiter = RateLimiter()

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"
