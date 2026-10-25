import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

SENSITIVE_KEYS = {
    "password", "secret", "token", "access_token", "refresh_token",
    "authorization", "cookie", "id_document", "id_document_number",
    "mfa_secret", "hs_admin_rt", "hs_cust_rt"
}

def sanitize_data(data: Any) -> Any:
    if isinstance(data, dict):
        sanitized = {}
        for k, v in data.items():
            if str(k).lower() in SENSITIVE_KEYS or any(s in str(k).lower() for s in ("password", "secret", "token")):
                sanitized[k] = "[REDACTED]"
            else:
                sanitized[k] = sanitize_data(v)
        return sanitized
    elif isinstance(data, list):
        return [sanitize_data(item) for item in data]
    return data

class JSONLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_obj = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if hasattr(record, "extra") and isinstance(record.extra, dict): # type: ignore
            log_obj["extra"] = sanitize_data(record.extra) # type: ignore
        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_obj)

def setup_logging() -> logging.Logger:
    logger = logging.getLogger("haven_stays")
    logger.setLevel(logging.INFO)
    logger.propagate = False
    
    # Avoid duplicate handlers
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONLogFormatter())
        logger.addHandler(handler)
    return logger

logger = setup_logging()
