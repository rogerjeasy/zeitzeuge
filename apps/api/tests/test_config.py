"""Settings parsing — specifically the list-valued ones.

These exist because the documented quick start broke on them: an ECS task
definition and a `.env` file both hand every value over as a plain string, and
pydantic-settings JSON-decodes list fields before a validator can see them. A
service that refuses to start because its CORS origin was not written as JSON
is a deployment outage with a very confusing traceback, so both spellings are
now pinned by a test.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from zeitzeuge_api.core.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://localhost:3000", ["http://localhost:3000"]),
        (
            "http://localhost:3000,https://zeitzeuge.ch",
            ["http://localhost:3000", "https://zeitzeuge.ch"],
        ),
        ("  http://a.ch , https://b.ch  ", ["http://a.ch", "https://b.ch"]),
        ('["http://a.ch","https://b.ch"]', ["http://a.ch", "https://b.ch"]),
    ],
)
def test_cors_origins_from_the_environment(monkeypatch, raw: str, expected: list[str]) -> None:
    monkeypatch.setenv("ZZ_CORS_ORIGINS", raw)
    assert Settings(_env_file=None).cors_origins == expected


def test_list_settings_from_a_dotenv_file(tmp_path: Path, monkeypatch) -> None:
    """The exact file `cp .env.example .env` produces."""
    monkeypatch.delenv("ZZ_CORS_ORIGINS", raising=False)
    env_file = tmp_path / ".env"
    env_file.write_text(
        "ZZ_ENV=local\n"
        "ZZ_CORS_ORIGINS=http://localhost:3000\n"
        "ZZ_TRUSTED_HOSTS=api.zeitzeuge.ch,localhost\n"
        "ZZ_AVATAR_ALLOWED_TYPES=image/jpeg,image/png\n",
        encoding="utf-8",
    )

    settings = Settings(_env_file=env_file)

    assert settings.cors_origins == ["http://localhost:3000"]
    assert settings.trusted_hosts == ["api.zeitzeuge.ch", "localhost"]
    assert settings.avatar_allowed_types == ["image/jpeg", "image/png"]


def test_defaults_hold_without_any_environment(monkeypatch) -> None:
    for key in ("ZZ_CORS_ORIGINS", "ZZ_TRUSTED_HOSTS", "ZZ_AVATAR_ALLOWED_TYPES"):
        monkeypatch.delenv(key, raising=False)
    settings = Settings(_env_file=None)
    assert settings.cors_origins == ["http://localhost:3000"]
    assert settings.avatar_allowed_types == ["image/jpeg", "image/png", "image/webp"]


def test_derived_cognito_urls(monkeypatch) -> None:
    monkeypatch.setenv("ZZ_REGION", "eu-central-2")
    monkeypatch.setenv("ZZ_COGNITO_USER_POOL_ID", "eu-central-2_ABC123")
    settings = Settings(_env_file=None)
    assert settings.cognito_issuer.endswith("/eu-central-2_ABC123")
    assert settings.cognito_jwks_url.endswith("/.well-known/jwks.json")
    assert settings.resource_prefix == "zeitzeuge-local"


def test_jwks_comes_from_the_emulator_when_one_is_configured(monkeypatch) -> None:
    """moto signs its tokens with its own key; AWS's JWKS cannot verify them."""
    monkeypatch.setenv("ZZ_COGNITO_USER_POOL_ID", "eu-central-2_abc")
    monkeypatch.setenv("ZZ_AWS_ENDPOINT_URL", "http://localhost:5001/")
    settings = Settings(_env_file=None)
    assert settings.cognito_jwks_url == "http://localhost:5001/eu-central-2_abc/.well-known/jwks.json"
    # The issuer is what moto writes into `iss`, which is AWS's form either way.
    assert settings.cognito_issuer.startswith("https://cognito-idp.eu-central-2.amazonaws.com/")
    assert settings.cognito_jwks_headers == {
        "X-Amz-Target": "AWSCognitoIdentityProviderService.GetJwks"
    }


def test_jwks_comes_from_aws_by_default(monkeypatch) -> None:
    monkeypatch.setenv("ZZ_COGNITO_USER_POOL_ID", "eu-central-2_abc")
    monkeypatch.setenv("ZZ_AWS_ENDPOINT_URL", "")
    settings = Settings(_env_file=None)
    assert settings.cognito_jwks_url == (
        "https://cognito-idp.eu-central-2.amazonaws.com/eu-central-2_abc/.well-known/jwks.json"
    )
    assert settings.cognito_jwks_headers == {}
