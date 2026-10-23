"""Structured logging.

JSON to stdout, which is what the CloudWatch log driver on Fargate wants, and
what OpenTelemetry correlates against (§10.6: `run_id` as the trace root — the
same mechanism binds `request_id` here).

`REDACTED_KEYS` is the safety net, not the policy: the policy is that secrets
never reach a log call in the first place. The processor exists because one
careless `log.info("payload", **body)` would otherwise put a password in
CloudWatch for the retention period.
"""

from __future__ import annotations

import logging
import sys
from collections.abc import MutableMapping
from typing import Any

import structlog

REDACTED_KEYS = frozenset(
    {
        "password",
        "new_password",
        "current_password",
        "confirmation_code",
        "code",
        "secret",
        "client_secret",
        "access_token",
        "id_token",
        "refresh_token",
        "authorization",
        "api_key",
        "session",
    }
)


def _redact(
    _logger: Any, _name: str, event_dict: MutableMapping[str, Any]
) -> MutableMapping[str, Any]:
    for key in list(event_dict):
        if key.lower() in REDACTED_KEYS and event_dict[key] is not None:
            event_dict[key] = "«redacted»"
    return event_dict


def configure_logging(*, level: str = "INFO", json_output: bool = True) -> None:
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level.upper())
    # At DEBUG these produce a line per TCP packet and per TLS handshake step,
    # which buries the application's own log in connection tracing.
    for noisy in ("botocore", "boto3", "urllib3", "aiobotocore", "httpx", "httpcore", "s3transfer"):
        logging.getLogger(noisy).setLevel(logging.WARNING)

    renderer = (
        structlog.processors.JSONRenderer()
        if json_output
        else structlog.dev.ConsoleRenderer(colors=True)
    )

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            _redact,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            renderer,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping()[level.upper()]
        ),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.stdlib.BoundLogger:
    return structlog.get_logger(name)
