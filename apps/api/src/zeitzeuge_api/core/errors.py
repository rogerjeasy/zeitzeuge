"""The error contract.

One shape for every failure — RFC 9457 `application/problem+json` — with a
stable machine-readable `code`. The web app already has a closed set of auth
error codes (`apps/web/src/lib/auth/client.ts`); the codes below are a superset
of it, so the UI can keep mapping `code` straight to a translation key.

Two rules this module exists to enforce:

1. **Nothing internal leaks.** `detail` is written for the archivist, not for
   the operator. Stack traces, driver messages and AWS request ids go to the
   log with the same `request_id` the client is handed, and stay there.
2. **No account enumeration.** Registration, password reset and verification
   all answer identically whether or not the address exists — the only channel
   that may confirm an address is the mail sent to it.
"""

from __future__ import annotations

from typing import Any

from fastapi import status


class AppError(Exception):
    """Base class for every failure the API reports deliberately."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str = "unknown"
    title: str = "Unexpected error"
    detail: str = "The request could not be completed."

    def __init__(
        self,
        detail: str | None = None,
        *,
        code: str | None = None,
        title: str | None = None,
        status_code: int | None = None,
        headers: dict[str, str] | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        self.detail = detail or self.detail
        self.code = code or self.code
        self.title = title or self.title
        self.status_code = status_code or self.status_code
        self.headers = headers or {}
        self.extra = extra or {}
        super().__init__(self.detail)

    def to_problem(self, *, instance: str, request_id: str) -> dict[str, Any]:
        problem: dict[str, Any] = {
            "type": f"https://docs.zeitzeuge.ch/errors/{self.code}",
            "title": self.title,
            "status": self.status_code,
            "detail": self.detail,
            "code": self.code,
            "instance": instance,
            "request_id": request_id,
        }
        problem.update(self.extra)
        return problem


# --- 400 / 422 ------------------------------------------------------------


class ValidationError(AppError):
    # Written as a literal: Starlette renamed the 422 and 413 constants and
    # the name to use depends on the version installed. The number does not.
    status_code = 422
    code = "validation_failed"
    title = "Validation failed"
    detail = "One or more fields are invalid."


class WeakPasswordError(AppError):
    status_code = 422
    code = "weak_password"
    title = "Password does not meet the policy"
    detail = "The password must satisfy every rule in the checklist."


class InvalidRequestError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "invalid_request"
    title = "Invalid request"
    detail = "The request could not be understood."


# --- 401 / 403 ------------------------------------------------------------


class InvalidCredentialsError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "invalid_credentials"
    title = "Sign-in failed"
    # Deliberately identical for "no such user" and "wrong password".
    detail = "E-mail address or password is incorrect."


class UnauthenticatedError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthenticated"
    title = "Authentication required"
    detail = "A valid access token is required."


class TokenExpiredError(AppError):
    status_code = status.HTTP_401_UNAUTHORIZED
    code = "token_expired"
    title = "Session expired"
    detail = "The access token has expired. Refresh it and retry."


class EmailNotVerifiedError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "email_not_verified"
    title = "E-mail not verified"
    detail = "Confirm the address with the code that was sent to it."


class PasswordResetRequiredError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "password_reset_required"
    title = "Password reset required"
    detail = "This account must set a new password before signing in."


class ForbiddenError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"
    title = "Not permitted"
    detail = "This account may not perform that action."


class AccountDisabledError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "account_disabled"
    title = "Account disabled"
    detail = "This account has been disabled. Contact your archive administrator."


class CodeMismatchError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "code_mismatch"
    title = "Wrong confirmation code"
    detail = "That code does not match. Request a new one if it was mistyped."


class CodeExpiredError(AppError):
    status_code = status.HTTP_400_BAD_REQUEST
    code = "code_expired"
    title = "Confirmation code expired"
    detail = "That code has expired. Request a new one."


# --- 404 / 409 ------------------------------------------------------------


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    title = "Not found"
    detail = "The requested resource does not exist."


class EmailInUseError(AppError):
    """Only ever raised where the caller already proved control of the address."""

    status_code = status.HTTP_409_CONFLICT
    code = "email_in_use"
    title = "Address already registered"
    detail = "An account already exists for this e-mail address."


class ConflictError(AppError):
    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    title = "Conflict"
    detail = "The resource changed since it was read."


# --- 413 / 429 ------------------------------------------------------------


class PayloadTooLargeError(AppError):
    status_code = 413
    code = "payload_too_large"
    title = "File too large"
    detail = "The uploaded file exceeds the permitted size."


class UnsupportedMediaTypeError(AppError):
    status_code = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE
    code = "unsupported_media_type"
    title = "Unsupported file type"
    detail = "That file type is not accepted."


class RateLimitedError(AppError):
    status_code = status.HTTP_429_TOO_MANY_REQUESTS
    code = "rate_limited"
    title = "Too many attempts"
    detail = "Too many attempts. Wait a moment and try again."

    def __init__(self, retry_after: int = 60, **kwargs: Any) -> None:
        super().__init__(headers={"Retry-After": str(retry_after)}, **kwargs)
        self.extra.setdefault("retry_after", retry_after)


# --- 5xx -------------------------------------------------------------------


class UpstreamError(AppError):
    """An AWS call failed in a way the caller can only retry."""

    status_code = status.HTTP_502_BAD_GATEWAY
    code = "upstream_unavailable"
    title = "Upstream service unavailable"
    detail = "A dependency is temporarily unavailable. Please retry."


class DatabaseUnavailableError(AppError):
    """Aurora is unreachable — connection refused, timed out, pool exhausted.

    A distinct code from `upstream_unavailable` because the client's correct
    behaviour differs: this one is worth retrying in a few seconds, and it is
    the single most useful thing to see in a log at 03:00 when the answer is
    "the database is still starting", not "the code is broken".
    """

    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    code = "database_unavailable"
    title = "Database unavailable"
    detail = "The service cannot reach its database. Please retry shortly."

    def __init__(self, retry_after: int = 5, **kwargs: Any) -> None:
        super().__init__(headers={"Retry-After": str(retry_after)}, **kwargs)


class ConfigurationError(AppError):
    status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
    code = "misconfigured"
    title = "Service misconfigured"
    detail = "The service is not configured correctly."
