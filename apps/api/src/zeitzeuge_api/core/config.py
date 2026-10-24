"""Runtime configuration.

Every value arrives from the environment, and every *secret* value arrives as a
**reference** (`secretsmanager://…`, `ssm://…`) rather than as the secret itself
— see `integrations.aws.secrets`. Task definitions therefore carry ARNs, never
credentials, which is what makes the "no long-lived secrets anywhere" claim in
PROPOSED_SOLUTION §10.5 true of the code and not only of the diagram.

Naming follows the Terraform convention `${project}-${env}-…` (infra/envs/*),
so a deployed task needs almost no explicit configuration: the defaults below
reconstruct the resource names Terraform produced.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import AliasChoices, Field, computed_field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["local", "dev", "prod"]

# A list-valued setting arriving from the environment (or a `.env` file) is
# JSON-decoded by pydantic-settings *before* any validator runs, so
# `ZZ_CORS_ORIGINS=http://localhost:3000` fails with a JSONDecodeError rather
# than reaching `_split_csv`. `NoDecode` hands the raw string to the validator
# instead, which is what lets both forms work:
#
#     ZZ_CORS_ORIGINS=http://localhost:3000,https://zeitzeuge.ch
#     ZZ_CORS_ORIGINS=["http://localhost:3000","https://zeitzeuge.ch"]
#
# An ECS task definition writes the first; a Terraform `jsonencode` writes the
# second. Neither should be a deployment that fails to start.
StringList = Annotated[list[str], NoDecode]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ZZ_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Identity of this deployment -------------------------------------
    project: str = "zeitzeuge"
    env: Environment = "local"
    service_name: str = "api"
    region: str = "eu-central-2"  # §10.3 — Swiss scans stay in Zurich.
    log_level: str = "INFO"
    debug: bool = False

    # --- HTTP -------------------------------------------------------------
    api_prefix: str = "/api/v1"
    cors_origins: StringList = Field(default_factory=lambda: ["http://localhost:3000"])
    trusted_hosts: StringList = Field(default_factory=lambda: ["*"])
    root_path: str = ""

    # --- Cognito (infra/modules/auth) ------------------------------------
    cognito_user_pool_id: str = ""
    cognito_client_id: str = ""
    # Reference, not a value: "secretsmanager://arn:…:zeitzeuge/prod/cognito/web-…#client_secret"
    cognito_client_secret_ref: str = ""
    cognito_domain: str = ""
    # The demo identity behind "Als Gast demo starten" (§9.2 screen 2). The
    # password lives in Secrets Manager; the API never holds it at rest.
    guest_username: str = "demo@zeitzeuge.ch"
    guest_password_ref: str = ""

    # --- Database (infra/modules/database) --------------------------------
    # Either a full DSN (local dev) or an Aurora secret + host, which is what
    # Terraform hands the task definition.
    database_dsn: str = ""
    database_secret_ref: str = ""
    # Migrate task only: the application role's credential, so the migration
    # can create (or re-sync) `zeitzeuge_app` before granting it anything.
    app_db_secret_ref: str = ""
    database_host: str = ""
    database_port: int = 5432
    database_name: str = "zeitzeuge"
    database_pool_size: int = 5
    database_max_overflow: int = 5
    database_statement_timeout_ms: int = 15_000
    database_echo: bool = False

    # --- Storage (infra/modules/storage) ----------------------------------
    assets_bucket: str = ""
    avatar_prefix: str = "avatars"
    avatar_max_bytes: int = 5 * 1024 * 1024
    avatar_allowed_types: StringList = Field(
        default_factory=lambda: ["image/jpeg", "image/png", "image/webp"]
    )
    avatar_upload_ttl_seconds: int = 900
    avatar_view_ttl_seconds: int = 3600
    assets_kms_key_id: str = ""
    cdn_domain: str = ""
    originals_bucket: str = ""
    """Photographs as delivered (versioned, Object Lock). Browser uploads land here."""
    derivatives_bucket: str = ""
    """Access copies the review screen shows; regenerable from the master."""
    original_max_bytes: int = 209_715_200
    original_upload_ttl_seconds: int = 1800

    # --- Investigation (design note D1) ------------------------------------
    worker_enabled: bool = False
    """Run the investigation worker inside this API process."""
    worker_concurrency: int = 4
    tool_cache_dir: str = ""
    """Directory for the lookup cache; empty = in-memory only."""
    openai_api_key: str = Field(
        default="", validation_alias=AliasChoices("ZZ_OPENAI_API_KEY", "OPENAI_API_KEY")
    )
    """Local development: the key itself, from `.env`. Never set in AWS."""
    openai_key_ref: str = ""
    """In AWS: a reference such as `secretsmanager://…/external/api-keys#openai`.
    Empty means the conventional `{project}/{env}/external/api-keys#openai`."""

    # --- Key-value (infra/modules/keyvalue) -------------------------------
    rate_limit_table: str = ""

    # --- Local development -------------------------------------------------
    # Points boto3 at moto/LocalStack. Never set outside local.
    aws_endpoint_url: str = ""

    # --- Auth policy -------------------------------------------------------
    jwks_cache_seconds: int = 3600
    jwt_leeway_seconds: int = 30
    session_idle_days: int = 30
    api_key_default_ttl_days: int = 365

    @field_validator("cors_origins", "trusted_hosts", "avatar_allowed_types", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Accept `a,b,c` and `["a","b","c"]` alike. See `StringList` above."""
        if not isinstance(value, str):
            return value
        text = value.strip()
        if text.startswith("["):
            return json.loads(text)
        return [item.strip() for item in text.split(",") if item.strip()]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def resource_prefix(self) -> str:
        return f"{self.project}-{self.env}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cognito_issuer(self) -> str:
        return f"https://cognito-idp.{self.region}.amazonaws.com/{self.cognito_user_pool_id}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def cognito_jwks_url(self) -> str:
        # Against the emulator the token is signed with *its* key, published at
        # the same path under its own host. The issuer stays AWS's form either
        # way, because that is what both write into `iss`.
        if self.aws_endpoint_url:
            base = self.aws_endpoint_url.rstrip("/")
            return f"{base}/{self.cognito_user_pool_id}/.well-known/jwks.json"
        return f"{self.cognito_issuer}/.well-known/jwks.json"

    @property
    def cognito_jwks_headers(self) -> dict[str, str]:
        """moto routes by service, and an unsigned GET names none. This header
        names it; AWS ignores it, but it is only ever sent to the emulator."""
        if self.aws_endpoint_url:
            return {"X-Amz-Target": "AWSCognitoIdentityProviderService.GetJwks"}
        return {}

    @property
    def is_local(self) -> bool:
        return self.env == "local"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
