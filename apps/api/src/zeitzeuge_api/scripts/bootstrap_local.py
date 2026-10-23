"""Create, in the local AWS emulator, what `infra/` creates in AWS.

`make up` starts moto with nothing in it, and moto forgets everything when its
container stops — so the user pool id in `.env` is stale after every restart.
This script recreates the pool, the app client, the role groups, the avatar
bucket and the rate-limit table to the contract in the README, then writes the
two ids that change back into `.env`:

    poetry run python -m zeitzeuge_api.scripts.bootstrap_local

It refuses to run unless `ZZ_AWS_ENDPOINT_URL` is set. Pointed at real AWS it
would create a second, unmanaged user pool beside Terraform's.

Idempotent: an existing pool of the same name is reused, not duplicated.
"""

from __future__ import annotations

import re
import secrets
import sys
from pathlib import Path
from typing import Any

from zeitzeuge_api.core.config import Settings, get_settings
from zeitzeuge_api.db.models import UserRole
from zeitzeuge_api.integrations.aws.clients import AwsClients

POOL_NAME = "zeitzeuge-local"
CLIENT_NAME = "web"
ENV_FILE = Path(".env")


def _ensure_pool(cognito: Any) -> str:
    for pool in cognito.list_user_pools(MaxResults=60)["UserPools"]:
        if pool["Name"] == POOL_NAME:
            return str(pool["Id"])
    created = cognito.create_user_pool(
        PoolName=POOL_NAME,
        UsernameAttributes=["email"],
        AutoVerifiedAttributes=["email"],
        # Must match `schemas/password.py` and `apps/web/src/lib/auth/password.ts`.
        Policies={
            "PasswordPolicy": {
                "MinimumLength": 8,
                "RequireUppercase": True,
                "RequireLowercase": True,
                "RequireNumbers": True,
                "RequireSymbols": True,
            }
        },
        Schema=[
            {"Name": "tenant_id", "AttributeDataType": "String", "Mutable": True},
            {"Name": "role", "AttributeDataType": "String", "Mutable": True},
        ],
    )
    return str(created["UserPool"]["Id"])


def _ensure_client(cognito: Any, pool_id: str) -> str:
    for client in cognito.list_user_pool_clients(UserPoolId=pool_id, MaxResults=60)[
        "UserPoolClients"
    ]:
        if client["ClientName"] == CLIENT_NAME:
            return str(client["ClientId"])
    created = cognito.create_user_pool_client(
        UserPoolId=pool_id,
        ClientName=CLIENT_NAME,
        # The deployed client has a secret held in Secrets Manager. Locally
        # there is nothing to protect it from, and no secret means no SECRET_HASH.
        GenerateSecret=False,
        ExplicitAuthFlows=["ALLOW_ADMIN_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"],
        PreventUserExistenceErrors="ENABLED",
    )
    return str(created["UserPoolClient"]["ClientId"])


def _ensure_groups(cognito: Any, pool_id: str) -> None:
    existing = {g["GroupName"] for g in cognito.list_groups(UserPoolId=pool_id)["Groups"]}
    for role in UserRole:
        if str(role) not in existing:
            cognito.create_group(GroupName=str(role), UserPoolId=pool_id)


def _ensure_bucket(s3: Any, settings: Settings) -> None:
    if not settings.assets_bucket:
        return
    names = {b["Name"] for b in s3.list_buckets().get("Buckets", [])}
    if settings.assets_bucket not in names:
        s3.create_bucket(
            Bucket=settings.assets_bucket,
            CreateBucketConfiguration={"LocationConstraint": settings.region},
        )


def _ensure_table(dynamodb: Any, settings: Settings) -> None:
    if not settings.rate_limit_table:
        return
    if settings.rate_limit_table in dynamodb.list_tables()["TableNames"]:
        return
    dynamodb.create_table(
        TableName=settings.rate_limit_table,
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}],
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}],
        BillingMode="PAY_PER_REQUEST",
    )


def write_env(path: Path, values: dict[str, str]) -> None:
    """Replace `KEY=…` lines in place, appending keys the file does not have."""
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    for key, value in values.items():
        line = f"{key}={value}"
        pattern = re.compile(rf"^{re.escape(key)}=.*$", re.MULTILINE)
        match = pattern.search(text)
        if match:
            # Sliced rather than `sub`bed: a replacement string would expand
            # any backslash a generated password happens to contain.
            text = text[: match.start()] + line + text[match.end() :]
        else:
            text = text.rstrip("\n") + f"\n{line}\n"
    path.write_text(text, encoding="utf-8")


def main() -> int:
    settings = get_settings()
    if settings.env != "local" or not settings.aws_endpoint_url:
        print(
            "Refusing to run: this creates emulator resources and needs ZZ_ENV=local "
            "and ZZ_AWS_ENDPOINT_URL set.",
            file=sys.stderr,
        )
        return 2

    clients = AwsClients(settings)
    pool_id = _ensure_pool(clients.cognito)
    client_id = _ensure_client(clients.cognito, pool_id)
    _ensure_groups(clients.cognito, pool_id)
    _ensure_bucket(clients.s3, settings)
    _ensure_table(clients.dynamodb, settings)

    values = {"ZZ_COGNITO_USER_POOL_ID": pool_id, "ZZ_COGNITO_CLIENT_ID": client_id}
    if not settings.guest_password_ref:
        # A literal is a valid "reference" locally (see `SecretsResolver`), and
        # `.env` is git-ignored. In AWS this is a Secrets Manager ARN.
        values["ZZ_GUEST_PASSWORD_REF"] = f"Demo-{secrets.token_urlsafe(12)}!7"
    write_env(ENV_FILE, values)

    print(f"pool {pool_id} · client {client_id} → {ENV_FILE}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
