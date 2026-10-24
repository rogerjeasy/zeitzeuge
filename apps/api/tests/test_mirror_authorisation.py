"""Only the Staatsarchiv the seed created may publish into the demo archive."""

from __future__ import annotations

import uuid

import pytest

from zeitzeuge_api.core import errors
from zeitzeuge_api.db.models import Organization
from zeitzeuge_api.db.models.enums import OrganizationKind
from zeitzeuge_api.db.session import TenantContext
from zeitzeuge_api.services.mirror import DEMO_SLUG, mirror_batch


@pytest.mark.parametrize(
    ("slug", "isil"),
    [("someone", None), ("stasz", None), ("stasz", "CH-999"), ("someone", "CH-000015-0")],
)
async def test_any_other_archive_is_refused(app, slug: str, isil: str | None) -> None:
    db = app.state.database
    async with db.session(TenantContext.bootstrap()) as session:
        session.add(
            Organization(slug=DEMO_SLUG, name="Demo", kind=OrganizationKind.DEMO, is_demo=True)
        )
        source = Organization(slug=slug, name="X", kind=OrganizationKind.ARCHIVE, isil=isil)
        session.add(source)
        await session.flush()
        source_id = source.id
    with pytest.raises(errors.ForbiddenError):
        await mirror_batch(db, source_org=source_id, batch_id=uuid.uuid4())


async def test_a_copy_lands_only_in_a_demo_archive_or_a_visitors_sandbox(app) -> None:
    db = app.state.database
    async with db.session(TenantContext.bootstrap()) as session:
        source = Organization(
            slug="stasz", name="StASZ", kind=OrganizationKind.ARCHIVE, isil="CH-000015-0"
        )
        ordinary = Organization(slug="other", name="Other", kind=OrganizationKind.ARCHIVE)
        # A sign-up can neither set `settings.sandbox` nor `is_demo`.
        sandbox = Organization(
            slug="demo-1a2b3c4d5e",
            name="Sandbox",
            kind=OrganizationKind.DEMO,
            settings={"sandbox": True},
        )
        session.add_all([source, ordinary, sandbox])
        await session.flush()
        ids = source.id, ordinary.id, sandbox.id
    with pytest.raises(errors.ForbiddenError):
        await mirror_batch(db, source_org=ids[0], batch_id=uuid.uuid4(), target_id=ids[1])
    # The sandbox passes authorisation; the made-up batch then does not exist.
    with pytest.raises(errors.NotFoundError):
        await mirror_batch(db, source_org=ids[0], batch_id=uuid.uuid4(), target_id=ids[2])


async def test_a_sandbox_is_seeded_only_from_a_published_live_batch(app) -> None:
    from datetime import UTC, datetime

    from zeitzeuge_api.db.models import UploadBatch
    from zeitzeuge_api.db.models.enums import BatchSource
    from zeitzeuge_api.services.mirror import seed_sandbox

    db = app.state.database
    async with db.session(TenantContext.bootstrap()) as session:
        source = Organization(
            slug="stasz", name="StASZ", kind=OrganizationKind.ARCHIVE, isil="CH-000015-0"
        )
        demo = Organization(slug=DEMO_SLUG, name="Demo", kind=OrganizationKind.DEMO, is_demo=True)
        sandbox = Organization(
            slug="demo-0f0f0f0f0f",
            name="Sandbox",
            kind=OrganizationKind.DEMO,
            settings={"sandbox": True},
        )
        session.add_all([source, demo, sandbox])
        await session.flush()
        source_id, demo_id, sandbox_id = source.id, demo.id, sandbox.id
    async with db.session(TenantContext(org_id=source_id, role="test")) as s:
        unpublished = UploadBatch(org_id=source_id, label="unreviewed", source=BatchSource.BROWSER)
        s.add(unpublished)
        await s.flush()
        unpublished_id = unpublished.id
    # Nothing published to the guests: the sandbox stays empty, never unreviewed work.
    assert await seed_sandbox(db, target_id=sandbox_id) is None

    async with db.session(TenantContext(org_id=demo_id, role="test")) as s:
        s.add(
            UploadBatch(
                org_id=demo_id,
                label="prio1",
                source=BatchSource.BROWSER,
                mirrored_from_id=unpublished_id,
                mirrored_at=datetime.now(UTC),
            )
        )
    async with db.session(TenantContext(org_id=source_id, role="test")) as s:
        original = await s.get(UploadBatch, unpublished_id)
        assert original is not None
        original.deleted_at = datetime.now(UTC)
    # Published once, withdrawn since: not republished.
    assert await seed_sandbox(db, target_id=sandbox_id) is None
    with pytest.raises(errors.ConflictError):
        await mirror_batch(db, source_org=source_id, batch_id=unpublished_id, target_id=sandbox_id)
