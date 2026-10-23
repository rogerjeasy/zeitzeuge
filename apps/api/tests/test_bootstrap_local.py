"""`bootstrap_local.write_env` — it edits a developer's `.env`, so it must not mangle it."""

from __future__ import annotations

from pathlib import Path

from zeitzeuge_api.scripts.bootstrap_local import write_env


def test_replaces_in_place_and_keeps_everything_else(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("# comment\nZZ_ENV=local\nZZ_COGNITO_USER_POOL_ID=old\nOTHER=1\n")

    write_env(env, {"ZZ_COGNITO_USER_POOL_ID": "eu-central-2_new"})

    assert env.read_text() == (
        "# comment\nZZ_ENV=local\nZZ_COGNITO_USER_POOL_ID=eu-central-2_new\nOTHER=1\n"
    )


def test_appends_a_missing_key(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("ZZ_ENV=local")

    write_env(env, {"ZZ_COGNITO_CLIENT_ID": "abc"})

    assert env.read_text() == "ZZ_ENV=local\nZZ_COGNITO_CLIENT_ID=abc\n"


def test_a_value_with_backslashes_is_written_literally(tmp_path: Path) -> None:
    env = tmp_path / ".env"
    env.write_text("ZZ_GUEST_PASSWORD_REF=\n")

    write_env(env, {"ZZ_GUEST_PASSWORD_REF": r"Demo-\1\g<0>!7"})

    assert env.read_text() == "ZZ_GUEST_PASSWORD_REF=Demo-\\1\\g<0>!7\n"
