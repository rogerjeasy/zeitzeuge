"""The profile surface: `/users/me`, preferences, avatar, sessions."""

from __future__ import annotations

import io

import boto3
import pytest
from sqlalchemy import select

from zeitzeuge_api.db.models import AuditLog, User
from zeitzeuge_api.db.session import TenantContext

REGION = "eu-central-2"


async def test_profile_is_everything_the_header_needs(as_user, client) -> None:
    response = await client.get("/api/v1/users/me")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["email"] == as_user["email"]
    assert body["full_name"] == "Andrea Betschart"
    assert body["initials"] == "AB"
    assert body["organization"]["name"] == "Staatsarchiv Schwyz"
    assert body["organization"]["canton"] == "SZ"
    assert body["role"] == "admin"
    assert body["avatar_url"] is None


async def test_update_profile(as_user, client, app) -> None:
    response = await client.patch(
        "/api/v1/users/me",
        json={"full_name": "Dr. Andrea Betschart", "job_title": "Leiterin Fotoarchiv"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["full_name"] == "Dr. Andrea Betschart"
    assert response.json()["initials"] == "DB"

    async with app.state.database.session(TenantContext.bootstrap()) as session:
        actions = [
            row.action
            for row in await session.scalars(select(AuditLog))
        ]
    assert "user.profile_updated" in actions


async def test_profile_update_cannot_promote_or_move_tenant(as_user, client) -> None:
    """`role` and `org_id` are not fields on the request model, so they are refused."""
    response = await client.patch(
        "/api/v1/users/me", json={"role": "admin", "org_id": "11111111-1111-1111-1111-111111111111"}
    )
    assert response.status_code == 422


async def test_email_is_not_changed_through_the_profile(as_user, client) -> None:
    response = await client.patch("/api/v1/users/me", json={"email": "andere@sz.ch"})
    assert response.status_code == 422


@pytest.mark.parametrize("phone", ["+41 41 819 20 65", "041/8192065", None])
async def test_phone_accepts_swiss_formats(as_user, client, phone) -> None:
    response = await client.patch("/api/v1/users/me", json={"phone": phone})
    assert response.status_code == 200


async def test_preferences_round_trip(as_user, client) -> None:
    defaults = await client.get("/api/v1/users/me/preferences")
    assert defaults.status_code == 200
    body = defaults.json()
    assert body["cataloguing"]["auto_accept_threshold"] == 0.92
    assert body["cataloguing"]["allow_abstention"] is True

    updated = await client.patch(
        "/api/v1/users/me/preferences",
        json={
            "appearance": {"theme": "dark", "reduced_motion": True, "high_contrast": False},
            "cataloguing": {
                "default_run_mode": "deep",
                "auto_accept_threshold": 0.97,
                "allow_abstention": False,
                "default_export_format": "ead",
            },
        },
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["appearance"]["theme"] == "dark"
    assert body["cataloguing"]["default_run_mode"] == "deep"
    assert body["cataloguing"]["auto_accept_threshold"] == 0.97
    # Unchanged group keeps its values.
    assert body["notifications"]["email_queue_ready"] is True


async def test_auto_accept_threshold_has_a_floor(as_user, client) -> None:
    """Below 0.5 bulk-accept would be a coin toss with a signature on it."""
    response = await client.patch(
        "/api/v1/users/me/preferences",
        json={"cataloguing": {"auto_accept_threshold": 0.2}},
    )
    assert response.status_code == 422


async def test_disabling_abstention_is_recorded(as_user, client, app) -> None:
    await client.patch(
        "/api/v1/users/me/preferences", json={"cataloguing": {"allow_abstention": False}}
    )
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        rows = list(
            await session.scalars(
                select(AuditLog).where(AuditLog.action == "user.preferences_updated")
            )
        )
    assert any(row.details.get("abstention_disabled") for row in rows)


# --- avatar ---------------------------------------------------------------


async def test_avatar_upload_ticket_is_bounded(as_user, client, settings) -> None:
    response = await client.post(
        "/api/v1/users/me/avatar/ticket",
        json={"content_type": "image/jpeg", "content_length": 120_000},
    )
    assert response.status_code == 200, response.text
    ticket = response.json()
    assert ticket["key"].startswith("avatars/")
    assert ticket["fields"]["Content-Type"] == "image/jpeg"
    # The browser cannot choose the key: it is signed into the policy.
    assert ticket["fields"]["key"] == ticket["key"]
    assert ticket["max_bytes"] == settings.avatar_max_bytes


async def test_avatar_rejects_a_pdf_and_a_huge_file(as_user, client) -> None:
    bad_type = await client.post(
        "/api/v1/users/me/avatar/ticket",
        json={"content_type": "application/pdf", "content_length": 1000},
    )
    assert bad_type.status_code == 422  # rejected by the schema, before S3

    too_big = await client.post(
        "/api/v1/users/me/avatar/ticket",
        json={"content_type": "image/jpeg", "content_length": 40_000_000},
    )
    assert too_big.status_code == 422


async def test_avatar_commit_and_removal(as_user, client, settings, app) -> None:
    ticket = (
        await client.post(
            "/api/v1/users/me/avatar/ticket",
            json={"content_type": "image/png", "content_length": 2048},
        )
    ).json()

    # Stand in for the browser's direct POST to S3.
    s3 = boto3.client("s3", region_name=REGION)
    s3.upload_fileobj(
        io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 2040),
        settings.assets_bucket,
        ticket["key"],
        ExtraArgs={"ContentType": "image/png"},
    )

    committed = await client.put("/api/v1/users/me/avatar", json={"key": ticket["key"]})
    assert committed.status_code == 200, committed.text
    assert committed.json()["avatar_url"]

    profile = await client.get("/api/v1/users/me")
    assert profile.json()["avatar_url"]

    removed = await client.delete("/api/v1/users/me/avatar")
    assert removed.status_code == 200
    assert removed.json()["avatar_url"] is None

    async with app.state.database.session(TenantContext.bootstrap()) as session:
        user = await session.scalar(select(User).where(User.email == as_user["email"]))
    assert user is not None and user.avatar_key is None


async def test_avatar_commit_refuses_another_users_key(as_user, client) -> None:
    """A guessed key under someone else's prefix is refused before S3 is touched."""
    other = "avatars/11111111-1111-1111-1111-111111111111"
    response = await client.put(
        "/api/v1/users/me/avatar",
        json={"key": f"{other}/22222222-2222-2222-2222-222222222222/x.jpg"},
    )
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


async def test_avatar_commit_refuses_a_key_that_was_never_uploaded(as_user, client) -> None:
    ticket = (
        await client.post(
            "/api/v1/users/me/avatar/ticket",
            json={"content_type": "image/jpeg", "content_length": 1024},
        )
    ).json()
    response = await client.put("/api/v1/users/me/avatar", json={"key": ticket["key"]})
    assert response.status_code == 404


# --- sessions --------------------------------------------------------------


async def test_sessions_lists_the_current_device(as_user, client) -> None:
    response = await client.get("/api/v1/users/me/sessions")
    assert response.status_code == 200, response.text
    sessions = response.json()
    assert len(sessions) == 1
    assert sessions[0]["current"] is True
    assert sessions[0]["device"] == "Firefox · Windows"


async def test_revoking_an_unknown_session_is_a_404_not_a_403(as_user, client) -> None:
    """A caller must not learn that someone else's session id exists."""
    response = await client.delete(
        "/api/v1/users/me/sessions/00000000-0000-0000-0000-000000000000"
    )
    assert response.status_code == 404
    malformed = await client.delete("/api/v1/users/me/sessions/not-a-uuid")
    assert malformed.status_code == 404


async def test_revoking_a_session_ends_it(as_user, client) -> None:
    sessions = (await client.get("/api/v1/users/me/sessions")).json()
    response = await client.delete(f"/api/v1/users/me/sessions/{sessions[0]['id']}")
    assert response.status_code == 204
    assert (await client.get("/api/v1/users/me/sessions")).json() == []


async def test_unauthenticated_requests_are_refused(client) -> None:
    for method, path in (
        ("get", "/api/v1/users/me"),
        ("get", "/api/v1/users/me/preferences"),
        ("get", "/api/v1/api-keys"),
    ):
        response = await getattr(client, method)(path)
        assert response.status_code == 401, path
