"""Structured logging with correlation ID support."""

import json
import logging
import sys
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

# ContextVar to maintain request correlation IDs across async task boundaries
correlation_id_ctx: ContextVar[str] = ContextVar("correlation_id", default="")


class StructuredJsonFormatter(logging.Formatter):
    """Formats log records as structured JSON for log aggregators (Datadog, GCP Cloud Logging)."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": datetime.now(UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "correlation_id": correlation_id_ctx.get() or getattr(record, "correlation_id", "-"),
            "location": f"{record.pathname}:{record.lineno}",
            "function": record.funcName,
        }

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        # Include custom extra fields if provided
        for key, value in record.__dict__.items():
            if key not in [
                "args",
                "asctime",
                "created",
                "exc_info",
                "exc_text",
                "filename",
                "funcName",
                "id",
                "levelname",
                "levelno",
                "lineno",
                "module",
                "msecs",
                "message",
                "msg",
                "name",
                "pathname",
                "process",
                "processName",
                "relativeCreated",
                "stack_info",
                "thread",
                "threadName",
                "correlation_id",
            ]:
                log_entry[key] = value

        return json.dumps(log_entry)


def setup_logging(log_level: str = "INFO", log_format: str = "console") -> None:
    """Initialize structured application logging."""
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level.upper())

    # Clear existing handlers to prevent duplicates
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)

    console_handler = logging.StreamHandler(sys.stdout)
    if log_format.lower() == "json":
        console_handler.setFormatter(StructuredJsonFormatter())
    else:
        standard_format = (
            "[%(asctime)s] [%(levelname)s] [cid:%(correlation_id)s] %(name)s: %(message)s"
        )

        class ContextAwareFormatter(logging.Formatter):
            def format(self, record: logging.LogRecord) -> str:
                if not hasattr(record, "correlation_id"):
                    record.correlation_id = correlation_id_ctx.get() or "-"
                return super().format(record)

        console_handler.setFormatter(ContextAwareFormatter(standard_format))

    root_logger.addHandler(console_handler)

    # Suppress overly verbose third-party loggers
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)


logger = logging.getLogger("grandstay")
