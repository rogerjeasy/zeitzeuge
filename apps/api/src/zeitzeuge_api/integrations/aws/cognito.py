"""Amazon Cognito — the only place that holds a credential.

ZEITZEUGE never stores a password, never hashes one, and never sees one at
rest. Cognito owns the credential, the MFA secret, the mail with the
confirmation code, and the lockout counters. This module is a thin, typed,
*error-translating* wrapper around `cognito-idp`.

Design notes worth defending in a review:

* **Admin flows, with context.** The API is a confidential server-side client
  with a client secret, so it uses `AdminInitiateAuth` rather than the public
  flow, and forwards the caller's IP and user agent as `ContextData`. That is
  what lets Cognito's adaptive authentication see the real client instead of a
  Fargate task's ENI address — without it, advanced security is scoring us.
* **One translation layer.** Every `ClientError` becomes an `AppError` here,
  once. No route, and no service, ever catches a botocore exception. That is
  how the "nothing internal leaks" rule in `core.errors` stays true.
* **Enumeration.** `UserNotFoundException` maps to the same error as a wrong
  password. Pair that with `PreventUserExistenceErrors = ENABLED` on the app
  client and neither layer can betray whether an address is registered.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.integrations.aws.clients import AwsClients, call

log = get_logger(__name__)

# What the app client may write on a user's behalf — must equal
# `write_attributes` on the web client in infra/modules/auth (plus `email`,
# which SignUp always carries). Everything else goes through the admin API.
SELF_SERVICE_ATTRIBUTES = frozenset({"name", "locale"})

# Cognito error code → the error this API reports. Anything unmapped is an
# upstream failure, which is the correct default: we do not invent a meaning
# for a code we have not thought about.
_ERROR_MAP: dict[str, type[errors.AppError]] = {
    "NotAuthorizedException": errors.InvalidCredentialsError,
    "UserNotFoundException": errors.InvalidCredentialsError,
    "UserNotConfirmedException": errors.EmailNotVerifiedError,
    "PasswordResetRequiredException": errors.PasswordResetRequiredError,
    "UsernameExistsException": errors.EmailInUseError,
    "CodeMismatchException": errors.CodeMismatchError,
    "ExpiredCodeException": errors.CodeExpiredError,
    "InvalidPasswordException": errors.WeakPasswordError,
    "InvalidParameterException": errors.InvalidRequestError,
    "UserLambdaValidationException": errors.InvalidRequestError,
    "LimitExceededException": errors.RateLimitedError,
    "TooManyRequestsException": errors.RateLimitedError,
    "TooManyFailedAttemptsException": errors.RateLimitedError,
    "ResourceNotFoundException": errors.ConfigurationError,
    "AliasExistsException": errors.EmailInUseError,
    "EnableSoftwareTokenMFAException": errors.CodeMismatchError,
    "SoftwareTokenMFANotFoundException": errors.InvalidRequestError,
    "ConcurrentModificationException": errors.ConflictError,
}


@dataclass(frozen=True, slots=True)
class AuthContext:
    """What the browser looked like, forwarded to Cognito adaptive auth."""

    ip_address: str | None = None
    user_agent: str | None = None
    server_name: str = "api.zeitzeuge.ch"
    server_path: str = "/api/v1/auth/login"


@dataclass(frozen=True, slots=True)
class TokenBundle:
    access_token: str
    id_token: str
    refresh_token: str | None
    expires_in: int
    token_type: str = "Bearer"


@dataclass(frozen=True, slots=True)
class AuthOutcome:
    """Either Cognito authenticated the user, or it wants something more."""

    tokens: TokenBundle | None = None
    challenge_name: str | None = None
    challenge_session: str | None = None
    challenge_parameters: dict[str, str] = field(default_factory=dict)

    @property
    def is_challenge(self) -> bool:
        return self.tokens is None


@dataclass(frozen=True, slots=True)
class CognitoUser:
    """The authoritative record, read back from the pool rather than a token."""

    sub: str
    username: str
    email: str
    email_verified: bool
    enabled: bool
    status: str
    attributes: dict[str, str]
    mfa_enabled: bool = False

    def attr(self, name: str, default: str = "") -> str:
        return self.attributes.get(name, default)


@contextmanager
def _translate(operation: str) -> Iterator[None]:
    try:
        yield
    except ClientError as exc:
        code = exc.response.get("Error", {}).get("Code", "Unknown")
        request_id = exc.response.get("ResponseMetadata", {}).get("RequestId")
        log.warning(
            "cognito.error",
            operation=operation,
            aws_error_code=code,
            aws_request_id=request_id,
        )
        raise _ERROR_MAP.get(code, errors.UpstreamError)() from exc
    except BotoCoreError as exc:
        log.error("cognito.transport_error", operation=operation, error=str(exc))
        raise errors.UpstreamError() from exc


class CognitoIdentityProvider:
    def __init__(
        self,
        clients: AwsClients,
        *,
        user_pool_id: str,
        client_id: str,
        client_secret: str = "",
    ) -> None:
        self._clients = clients
        self._pool = user_pool_id
        self._client_id = client_id
        self._client_secret = client_secret

    # --- helpers ---------------------------------------------------------

    def _secret_hash(self, username: str) -> str | None:
        """HMAC(username + client_id) — required whenever the client has a secret."""
        if not self._client_secret:
            return None
        digest = hmac.new(
            self._client_secret.encode("utf-8"),
            (username + self._client_id).encode("utf-8"),
            hashlib.sha256,
        ).digest()
        return base64.b64encode(digest).decode()

    def _with_secret(self, username: str, params: dict[str, Any]) -> dict[str, Any]:
        secret = self._secret_hash(username)
        if secret:
            params["SecretHash"] = secret
        return params

    def _auth_params(self, username: str, params: dict[str, str]) -> dict[str, str]:
        secret = self._secret_hash(username)
        if secret:
            params["SECRET_HASH"] = secret
        return params

    @staticmethod
    def _context_data(context: AuthContext | None) -> dict[str, Any]:
        if context is None or not context.ip_address:
            return {}
        return {
            "ContextData": {
                "IpAddress": context.ip_address,
                "ServerName": context.server_name,
                "ServerPath": context.server_path,
                "HttpHeaders": (
                    [{"headerName": "User-Agent", "headerValue": context.user_agent}]
                    if context.user_agent
                    else []
                ),
            }
        }

    @staticmethod
    def _bundle(result: dict[str, Any]) -> TokenBundle:
        return TokenBundle(
            access_token=result["AccessToken"],
            id_token=result["IdToken"],
            refresh_token=result.get("RefreshToken"),
            expires_in=int(result.get("ExpiresIn", 3600)),
            token_type=result.get("TokenType", "Bearer"),
        )

    @staticmethod
    def _outcome(response: dict[str, Any]) -> AuthOutcome:
        if "AuthenticationResult" in response:
            return AuthOutcome(
                tokens=CognitoIdentityProvider._bundle(response["AuthenticationResult"])
            )
        return AuthOutcome(
            challenge_name=response.get("ChallengeName"),
            challenge_session=response.get("Session"),
            challenge_parameters=response.get("ChallengeParameters", {}) or {},
        )

    # --- registration -----------------------------------------------------

    async def sign_up(
        self,
        *,
        email: str,
        password: str,
        attributes: dict[str, str],
    ) -> str:
        """Create the account. Returns the Cognito `sub`.

        `SignUp` is a client call, bound by the app client's `write_attributes`
        — which deliberately exclude `custom:tenant_id` and `custom:role`, so a
        user can never choose their own archive. Those are set straight after
        with the admin API. If that second step fails, the account is deleted
        again: an identity without a tenant authenticates into nowhere.
        """
        own = {k: v for k, v in attributes.items() if v and k in SELF_SERVICE_ATTRIBUTES}
        protected = {k: v for k, v in attributes.items() if v and k not in SELF_SERVICE_ATTRIBUTES}

        params = self._with_secret(
            email,
            {
                "ClientId": self._client_id,
                "Username": email,
                "Password": password,
                "UserAttributes": [
                    {"Name": name, "Value": value}
                    for name, value in {"email": email, **own}.items()
                ],
            },
        )
        with _translate("sign_up"):
            response = await call(self._clients.cognito.sign_up, **params)

        if protected:
            try:
                await self.update_attributes(username=email, attributes=protected)
            except errors.AppError:
                try:
                    await self.delete_user(username=email)
                except errors.AppError:
                    log.error("cognito.sign_up_orphaned", reason="compensation failed")
                raise
        return str(response["UserSub"])

    async def create_confirmed_user(
        self, *, email: str, password: str, attributes: dict[str, str]
    ) -> str:
        """An account that can sign in at once: the «Start demo» visitor. Returns the `sub`.

        AdminCreateUser with no invitation (`SUPPRESS`) and the address marked
        verified (it is a reserved `.invalid` address nobody can receive mail at),
        then a permanent password, so the next step is an ordinary sign-in through
        the same flow as every other user.
        """
        params: dict[str, Any] = {
            "UserPoolId": self._pool,
            "Username": email,
            "MessageAction": "SUPPRESS",
            "UserAttributes": [
                {"Name": name, "Value": value}
                for name, value in {"email": email, "email_verified": "true", **attributes}.items()
                if value
            ],
        }
        with _translate("admin_create_user"):
            response = await call(self._clients.cognito.admin_create_user, **params)
        try:
            with _translate("admin_set_user_password"):
                await call(
                    self._clients.cognito.admin_set_user_password,
                    UserPoolId=self._pool,
                    Username=email,
                    Password=password,
                    Permanent=True,
                )
        except errors.AppError:
            try:
                await self.delete_user(username=email)
            except errors.AppError:
                log.error("cognito.demo_user_orphaned", reason="compensation failed")
            raise
        created = response.get("User", {}).get("Attributes", [])
        sub = next((a["Value"] for a in created if a["Name"] == "sub"), None)
        if not sub:
            sub = (await self.get_user(username=email)).sub
        return str(sub)

    async def resend_confirmation_code(self, *, email: str) -> None:
        params = self._with_secret(email, {"ClientId": self._client_id, "Username": email})
        with _translate("resend_confirmation_code"):
            await call(self._clients.cognito.resend_confirmation_code, **params)

    async def confirm_sign_up(self, *, email: str, code: str) -> None:
        params = self._with_secret(
            email,
            {"ClientId": self._client_id, "Username": email, "ConfirmationCode": code},
        )
        with _translate("confirm_sign_up"):
            await call(self._clients.cognito.confirm_sign_up, **params)

    # --- sign-in ----------------------------------------------------------

    async def authenticate(
        self,
        *,
        email: str,
        password: str,
        context: AuthContext | None = None,
    ) -> AuthOutcome:
        params: dict[str, Any] = {
            "UserPoolId": self._pool,
            "ClientId": self._client_id,
            "AuthFlow": "ADMIN_USER_PASSWORD_AUTH",
            "AuthParameters": self._auth_params(email, {"USERNAME": email, "PASSWORD": password}),
            **self._context_data(context),
        }
        with _translate("admin_initiate_auth"):
            response = await call(self._clients.cognito.admin_initiate_auth, **params)
        return self._outcome(response)

    async def respond_to_challenge(
        self,
        *,
        challenge_name: str,
        session: str,
        username: str,
        responses: dict[str, str],
        context: AuthContext | None = None,
    ) -> AuthOutcome:
        params: dict[str, Any] = {
            "UserPoolId": self._pool,
            "ClientId": self._client_id,
            "ChallengeName": challenge_name,
            "Session": session,
            "ChallengeResponses": self._auth_params(username, {"USERNAME": username, **responses}),
            **self._context_data(context),
        }
        with _translate("admin_respond_to_auth_challenge"):
            response = await call(self._clients.cognito.admin_respond_to_auth_challenge, **params)
        return self._outcome(response)

    async def refresh(self, *, refresh_token: str, username: str) -> TokenBundle:
        """Exchange a refresh token. `username` is the Cognito sub, not the e-mail.

        The SECRET_HASH for this flow must be computed over the *username* the
        pool knows, which for a token issued by `ADMIN_USER_PASSWORD_AUTH` is
        the sub. Passing the e-mail here fails with `NotAuthorized`, which is a
        confusing hour to lose at 03:00.
        """
        params: dict[str, Any] = {
            "UserPoolId": self._pool,
            "ClientId": self._client_id,
            "AuthFlow": "REFRESH_TOKEN_AUTH",
            "AuthParameters": self._auth_params(username, {"REFRESH_TOKEN": refresh_token}),
        }
        with _translate("refresh"):
            response = await call(self._clients.cognito.admin_initiate_auth, **params)
        result = response.get("AuthenticationResult")
        if not result:
            raise errors.UnauthenticatedError("The refresh token is no longer valid.")
        return self._bundle(result)

    async def revoke_refresh_token(self, *, refresh_token: str) -> None:
        params: dict[str, Any] = {"Token": refresh_token, "ClientId": self._client_id}
        if self._client_secret:
            params["ClientSecret"] = self._client_secret
        with _translate("revoke_token"):
            await call(self._clients.cognito.revoke_token, **params)

    async def global_sign_out(self, *, username: str) -> None:
        """Invalidate every refresh token this user holds, on every device."""
        with _translate("admin_user_global_sign_out"):
            await call(
                self._clients.cognito.admin_user_global_sign_out,
                UserPoolId=self._pool,
                Username=username,
            )

    # --- password ---------------------------------------------------------

    async def forgot_password(self, *, email: str) -> None:
        params = self._with_secret(email, {"ClientId": self._client_id, "Username": email})
        with _translate("forgot_password"):
            await call(self._clients.cognito.forgot_password, **params)

    async def confirm_forgot_password(self, *, email: str, code: str, new_password: str) -> None:
        params = self._with_secret(
            email,
            {
                "ClientId": self._client_id,
                "Username": email,
                "ConfirmationCode": code,
                "Password": new_password,
            },
        )
        with _translate("confirm_forgot_password"):
            await call(self._clients.cognito.confirm_forgot_password, **params)

    async def change_password(
        self, *, access_token: str, current_password: str, new_password: str
    ) -> None:
        with _translate("change_password"):
            await call(
                self._clients.cognito.change_password,
                AccessToken=access_token,
                PreviousPassword=current_password,
                ProposedPassword=new_password,
            )

    # --- profile ----------------------------------------------------------

    async def get_user(self, *, username: str) -> CognitoUser:
        with _translate("admin_get_user"):
            response = await call(
                self._clients.cognito.admin_get_user,
                UserPoolId=self._pool,
                Username=username,
            )
        attributes = {a["Name"]: a["Value"] for a in response.get("UserAttributes", [])}
        mfa = response.get("UserMFASettingList") or []
        return CognitoUser(
            sub=attributes.get("sub", ""),
            username=str(response["Username"]),
            email=attributes.get("email", ""),
            email_verified=attributes.get("email_verified", "false") == "true",
            enabled=bool(response.get("Enabled", True)),
            status=str(response.get("UserStatus", "UNKNOWN")),
            attributes=attributes,
            mfa_enabled=bool(mfa),
        )

    async def update_attributes(self, *, username: str, attributes: dict[str, str]) -> None:
        if not attributes:
            return
        with _translate("admin_update_user_attributes"):
            await call(
                self._clients.cognito.admin_update_user_attributes,
                UserPoolId=self._pool,
                Username=username,
                UserAttributes=[
                    {"Name": name, "Value": value} for name, value in attributes.items()
                ],
            )

    async def request_email_change(self, *, access_token: str, new_email: str) -> None:
        """Self-service change: Cognito mails a code to the *new* address.

        Done with the caller's own access token rather than an admin call, so
        the new address is held unverified until the code comes back. An admin
        update would mark it verified immediately and hand anyone with a
        hijacked session a password-reset channel.
        """
        with _translate("update_user_attributes"):
            await call(
                self._clients.cognito.update_user_attributes,
                AccessToken=access_token,
                UserAttributes=[{"Name": "email", "Value": new_email}],
            )

    async def confirm_email_change(self, *, access_token: str, code: str) -> None:
        with _translate("verify_user_attribute"):
            await call(
                self._clients.cognito.verify_user_attribute,
                AccessToken=access_token,
                AttributeName="email",
                Code=code,
            )

    async def set_enabled(self, *, username: str, enabled: bool) -> None:
        operation = (
            self._clients.cognito.admin_enable_user
            if enabled
            else self._clients.cognito.admin_disable_user
        )
        with _translate("admin_set_enabled"):
            await call(operation, UserPoolId=self._pool, Username=username)

    async def delete_user(self, *, username: str) -> None:
        with _translate("admin_delete_user"):
            await call(
                self._clients.cognito.admin_delete_user,
                UserPoolId=self._pool,
                Username=username,
            )

    async def add_to_group(self, *, username: str, group: str) -> None:
        with _translate("admin_add_user_to_group"):
            await call(
                self._clients.cognito.admin_add_user_to_group,
                UserPoolId=self._pool,
                Username=username,
                GroupName=group,
            )

    # --- MFA ---------------------------------------------------------------

    async def begin_totp_enrolment(self, *, access_token: str) -> str:
        """Returns the shared secret to render as a QR code."""
        with _translate("associate_software_token"):
            response = await call(
                self._clients.cognito.associate_software_token, AccessToken=access_token
            )
        return str(response["SecretCode"])

    async def confirm_totp_enrolment(
        self, *, access_token: str, code: str, device_name: str
    ) -> None:
        with _translate("verify_software_token"):
            response = await call(
                self._clients.cognito.verify_software_token,
                AccessToken=access_token,
                UserCode=code,
                FriendlyDeviceName=device_name,
            )
        if response.get("Status") != "SUCCESS":
            raise errors.CodeMismatchError()

    async def set_totp_preference(self, *, username: str, enabled: bool) -> None:
        with _translate("admin_set_user_mfa_preference"):
            await call(
                self._clients.cognito.admin_set_user_mfa_preference,
                UserPoolId=self._pool,
                Username=username,
                SoftwareTokenMfaSettings={"Enabled": enabled, "PreferredMfa": enabled},
            )
