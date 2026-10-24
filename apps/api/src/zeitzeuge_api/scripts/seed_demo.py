"""Create the demo tenant and the guest identity behind "Als Gast demo starten".

Idempotent: run it as often as you like, on a laptop or against dev. It is the
first half of the promise in §9.2 screen 2 — a judge who does not want to
create an account still lands in a populated archive — and the seeded user is a
real Cognito user with a real password, because the demo must not be a second
authentication path with its own bugs and its own hole.

    poetry run python -m zeitzeuge_api.scripts.seed_demo

The guest password comes from `ZZ_GUEST_PASSWORD_REF` (Secrets Manager in AWS)
or, locally, from `ZZ_GUEST_PASSWORD`. Nothing is ever written back to disk.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import sys
from typing import Any

from sqlalchemy import select

from zeitzeuge_api.core.config import get_settings
from zeitzeuge_api.core.logging import configure_logging, get_logger
from zeitzeuge_api.db.models import (
    Organization,
    OrganizationKind,
    User,
    UserPreferences,
    UserRole,
    UserStatus,
)
from zeitzeuge_api.db.session import Database, TenantContext, build_dsn, create_engine
from zeitzeuge_api.integrations.aws.clients import AwsClients, call
from zeitzeuge_api.integrations.aws.secrets import SecretsResolver

log = get_logger(__name__)

DEMO_SLUG = "demo-staatsarchiv-schwyz"
DEMO_NAME = "Staatsarchiv Schwyz (Demo)"


async def _ensure_cognito_user(
    clients: AwsClients, *, pool_id: str, email: str, password: str, org_id: str
) -> str:
    """Create (or adopt) the guest user and give it a permanent password."""
    cognito = clients.cognito
    try:
        await call(
            cognito.admin_create_user,
            UserPoolId=pool_id,
            Username=email,
            # No invitation mail: nobody reads the demo account's inbox.
            MessageAction="SUPPRESS",
            UserAttributes=[
                {"Name": "email", "Value": email},
                {"Name": "email_verified", "Value": "true"},
                {"Name": "name", "Value": "Gast · Demo"},
                {"Name": "locale", "Value": "de"},
                {"Name": "custom:tenant_id", "Value": org_id},
                {"Name": "custom:role", "Value": str(UserRole.GUEST)},
            ],
        )
        log.info("seed.cognito_user_created", email=email)
    except cognito.exceptions.UsernameExistsException:
        log.info("seed.cognito_user_exists", email=email)
        await call(
            cognito.admin_update_user_attributes,
            UserPoolId=pool_id,
            Username=email,
            UserAttributes=[
                {"Name": "custom:tenant_id", "Value": org_id},
                {"Name": "custom:role", "Value": str(UserRole.GUEST)},
            ],
        )

    # Permanent, so the account never meets a NEW_PASSWORD_REQUIRED challenge
    # in front of a judge.
    await call(
        cognito.admin_set_user_password,
        UserPoolId=pool_id,
        Username=email,
        Password=password,
        Permanent=True,
    )

    try:
        await call(
            cognito.admin_add_user_to_group,
            UserPoolId=pool_id,
            Username=email,
            GroupName=str(UserRole.GUEST),
        )
    except Exception as exc:  # the group may not exist yet in a fresh pool
        log.warning("seed.group_missing", error=str(exc), group=str(UserRole.GUEST))

    response = await call(cognito.admin_get_user, UserPoolId=pool_id, Username=email)
    attributes = {a["Name"]: a["Value"] for a in response.get("UserAttributes", [])}
    return str(attributes.get("sub", ""))


async def main() -> int:
    settings = get_settings()
    configure_logging(level=settings.log_level, json_output=False)

    clients = AwsClients(settings)
    resolver = SecretsResolver(clients)

    password = os.environ.get("ZZ_GUEST_PASSWORD") or await resolver.resolve(
        settings.guest_password_ref
    )
    if not password:
        # Generating one and printing it is more useful than failing: it makes
        # the first local run work, and the value is meant to be stored in
        # Secrets Manager afterwards.
        password = f"Demo-{secrets.token_urlsafe(12)}!7"
        log.warning("seed.generated_password", hint="store this in Secrets Manager")
        print(f"\n  guest password: {password}\n", file=sys.stderr)

    credentials = (
        await resolver.resolve_json(settings.database_secret_ref)
        if settings.database_secret_ref
        else {}
    )
    database = Database(create_engine(build_dsn(settings, credentials), settings))

    async with database.session(TenantContext.bootstrap()) as session:
        organization = await session.scalar(
            select(Organization).where(Organization.slug == DEMO_SLUG)
        )
        if organization is None:
            organization = Organization(
                slug=DEMO_SLUG,
                name=DEMO_NAME,
                kind=OrganizationKind.DEMO,
                canton="SZ",
                isil="CH-000015-2",
                is_demo=True,
                contact_email=settings.guest_username,
            )
            session.add(organization)
            await session.flush()
            log.info("seed.organization_created", slug=DEMO_SLUG)

        sub = ""
        if settings.cognito_user_pool_id:
            sub = await _ensure_cognito_user(
                clients,
                pool_id=settings.cognito_user_pool_id,
                email=settings.guest_username,
                password=password,
                org_id=str(organization.id),
            )
        else:
            log.warning("seed.no_user_pool", hint="set ZZ_COGNITO_USER_POOL_ID")

        email = settings.guest_username.lower()
        user = await session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                org_id=organization.id,
                cognito_sub=sub or f"local-{secrets.token_hex(8)}",
                cognito_username=email,
                email=email,
                email_verified=True,
                full_name="Gast · Demo",
                job_title="Demozugang",
                locale="de",
                role=UserRole.GUEST,
                status=UserStatus.ACTIVE,
            )
            user.preferences = UserPreferences(allow_abstention=True)
            session.add(user)
            log.info("seed.user_created", email=email)
        elif sub:
            user.cognito_sub = sub
            user.org_id = organization.id

        await session.flush()
        await _seed_staatsarchiv(session)

    await database.dispose()
    log.info("seed.done", organization=DEMO_SLUG, user=settings.guest_username)
    return 0


STASZ_SLUG = "stasz"


async def _seed_staatsarchiv(session: Any) -> None:
    """The Staatsarchiv tenant the Prio-1 set is processed in (design note D9).

    Minimal sign-up captures no archive, so the team's accounts are attached
    here: every address in `ZZ_STASZ_MEMBERS` (comma-separated, set outside the
    repository) that has already signed up joins `stasz` as an archivist. An
    address that has not signed up yet is skipped and picked up on the next
    deploy's seed. Idempotent.
    """
    organization = await session.scalar(select(Organization).where(Organization.slug == STASZ_SLUG))
    if organization is None:
        organization = Organization(
            slug=STASZ_SLUG,
            name="Staatsarchiv Schwyz",
            kind=OrganizationKind.ARCHIVE,
            canton="SZ",
            isil="CH-000015-0",
            contact_email="staatsarchiv@sz.ch",
        )
        session.add(organization)
        await session.flush()
        log.info("seed.organization_created", slug=STASZ_SLUG)

    members = [m.strip().lower() for m in os.environ.get("ZZ_STASZ_MEMBERS", "").split(",")]
    for email in filter(None, members):
        user = await session.scalar(select(User).where(User.email == email))
        # Only a confirmed, active account: an address in the list must not let
        # whoever registers it first, unverified, into the Staatsarchiv tenant.
        if user is None or not user.email_verified or user.status is not UserStatus.ACTIVE:
            log.info("seed.stasz_member_pending", email=email)
            continue
        if user.org_id != organization.id or not user.role.can_approve:
            user.org_id = organization.id
            user.role = UserRole.ARCHIVIST if user.role is not UserRole.ADMIN else user.role
            log.info("seed.stasz_member_attached", email=email)
    await session.flush()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
