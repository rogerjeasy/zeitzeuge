"""Withdraw, restore, bulk actions and the export selection (batch-management note).

Built on the end-to-end fixtures of `test_investigation_api`: two photographs
are uploaded against moto, one is given a machine record, and the actions are
exercised through the HTTP API exactly as the web app calls them.
"""

# ruff: noqa: F811  (pytest fixtures imported from test_investigation_api)
from __future__ import annotations

import io

import boto3
import pytest
from openpyxl import load_workbook
from sqlalchemy import select
from tests.conftest import BUCKET, REGION
from tests.test_investigation_api import _machine_run, investigation  # noqa: F401

from zeitzeuge_api.db.models import Run, User
from zeitzeuge_api.db.models.enums import RunStatus, UserRole
from zeitzeuge_api.db.session import TenantContext


async def _batch_with_two(client) -> tuple[str, list[dict]]:
    batch_id = (await client.post("/api/v1/batches", json={"label": "prio1"})).json()["id"]
    files = (
        await client.post(
            f"/api/v1/batches/{batch_id}/assets",
            json={
                "files": [
                    {"filename": name, "content_type": "image/jpeg", "content_length": 10}
                    for name in ("SG.CIV.17.3.jpg", "SG.CIV.17.11.jpg")
                ]
            },
        )
    ).json()["files"]
    s3 = boto3.client("s3", region_name=REGION)
    committed = []
    for file in files:
        s3.put_object(
            Bucket=BUCKET,
            Key=file["upload"]["fields"]["key"],
            Body=b"x" * 10,
            ContentType="image/jpeg",
        )
        committed.append(
            {**file, **(await client.put(f"/api/v1/assets/{file['asset_id']}/commit")).json()}
        )
    return batch_id, committed


async def _set_role(app, email: str, role: UserRole) -> None:
    async with app.state.database.session(TenantContext.bootstrap()) as session:
        user = await session.scalar(select(User).where(User.email == email))
        assert user is not None
        user.role = role


async def test_withdraw_hides_cancels_and_restore_requeues(
    investigation,
    client,
    as_user,
) -> None:
    await _set_role(investigation, as_user["email"], UserRole.ARCHIVIST)
    batch_id, (first, _second) = await _batch_with_two(client)

    withdrawn = await client.request(
        "DELETE", f"/api/v1/assets/{first['asset_id']}", json={"reason": "Doppel"}
    )
    assert withdrawn.status_code == 200, withdrawn.text
    assert withdrawn.json()["succeeded"] == 1

    batch = (await client.get(f"/api/v1/batches/{batch_id}")).json()
    assert [a["external_ref"] for a in batch["assets"]] == ["SG.CIV.17.11.jpg"]
    assert batch["counts"]["total"] == 1 and batch["counts"]["deleted"] == 1
    trash = (await client.get(f"/api/v1/batches/{batch_id}?include_deleted=true")).json()
    gone = next(a for a in trash["assets"] if a["asset_id"] == first["asset_id"])
    assert gone["deleted_at"] and gone["deletion_reason"] == "Doppel"
    assert gone["deleted_by_name"]  # the Papierkorb says who
    assert trash["counts"]["total"] == 1  # listed, never counted

    async with investigation.state.database.session(TenantContext(role="worker")) as session:
        run = await session.scalar(select(Run).where(Run.public_id == first["run_id"]))
        assert run is not None and run.status is RunStatus.CANCELLED

    again = await client.request("DELETE", f"/api/v1/assets/{first['asset_id']}")
    assert again.json()["results"][0]["detail"] == "already_withdrawn"

    restored = await client.post(f"/api/v1/assets/{first['asset_id']}/restore")
    assert restored.json()["succeeded"] == 1
    batch = (await client.get(f"/api/v1/batches/{batch_id}")).json()
    assert batch["counts"]["total"] == 2 and batch["counts"]["deleted"] == 0
    assert batch["counts"]["queued"] == 2  # the cancelled run was replaced by a fresh one


async def test_bulk_accept_confirms_every_open_field_in_one_version(
    investigation,
    client,
    as_user,
) -> None:
    _batch_id, (first, second) = await _batch_with_two(client)
    await _machine_run(investigation, first["run_id"])
    before = (await client.get(f"/api/v1/assets/{first['asset_id']}/case")).json()

    result = await client.post(
        "/api/v1/assets/bulk",
        json={"action": "accept", "asset_ids": [first["asset_id"], second["asset_id"]]},
    )
    assert result.status_code == 200, result.text
    by_id = {r["asset_id"]: r for r in result.json()["results"]}
    assert by_id[first["asset_id"]]["ok"] is True
    assert by_id[second["asset_id"]]["detail"] == "no_record"

    after = (await client.get(f"/api/v1/assets/{first['asset_id']}/case")).json()
    assert after["version"] == before["version"] + 1
    assert after["qc_status"] == "geprüft"
    emitted = [f for f in after["fields"] if f["rank"] and f["decision"] != "abstain"]
    assert emitted and all(f["review_action"] == "accepted_unchanged" for f in emitted)
    empty = [f for f in after["fields"] if f["rank"] and f["decision"] == "abstain"]
    assert all(f["review_action"] is None for f in empty)  # nothing invented for empty fields

    twice = await client.post(
        "/api/v1/assets/bulk", json={"action": "accept", "asset_ids": [first["asset_id"]]}
    )
    assert twice.json()["results"][0]["detail"] == "nothing_to_accept"


async def test_export_selection_and_withdrawn_photos_are_left_out(
    investigation,
    client,
    as_user,
) -> None:
    await _set_role(investigation, as_user["email"], UserRole.ARCHIVIST)
    batch_id, (_first, second) = await _batch_with_two(client)

    def rows(content: bytes) -> list[str]:
        sheet = load_workbook(io.BytesIO(content))["Ergebnisse"]
        return [r[0].value for r in sheet.iter_rows(min_row=2)]

    selected = await client.get(
        f"/api/v1/batches/{batch_id}/export?fmt=xlsx&asset_ids={second['asset_id']}"
    )
    assert rows(selected.content) == ["SG.CIV.17.11.jpg"]

    await client.request("DELETE", f"/api/v1/assets/{second['asset_id']}")
    whole = await client.get(f"/api/v1/batches/{batch_id}/export?fmt=xlsx")
    assert rows(whole.content) == ["SG.CIV.17.3.jpg"]


async def test_a_batch_withdraws_and_restores_with_its_photos(
    investigation,
    client,
    as_user,
) -> None:
    await _set_role(investigation, as_user["email"], UserRole.ARCHIVIST)
    batch_id, (first, _second) = await _batch_with_two(client)
    # One photo withdrawn on its own first: restoring the batch must not bring it back.
    await client.request("DELETE", f"/api/v1/assets/{first['asset_id']}")

    gone = await client.request("DELETE", f"/api/v1/batches/{batch_id}")
    assert gone.status_code == 200 and gone.json()["assets"] == 1
    assert batch_id not in [b["id"] for b in (await client.get("/api/v1/batches")).json()]
    listed = (await client.get("/api/v1/batches?include_deleted=true")).json()
    assert next(b for b in listed if b["id"] == batch_id)["deleted_at"]

    back = await client.post(f"/api/v1/batches/{batch_id}/restore")
    assert back.json()["assets"] == 1
    batch = (await client.get(f"/api/v1/batches/{batch_id}")).json()
    assert [a["external_ref"] for a in batch["assets"]] == ["SG.CIV.17.11.jpg"]


@pytest.mark.parametrize("role", [UserRole.REVIEWER, UserRole.OPERATOR])
async def test_only_archivists_withdraw_but_reviewers_may_rerun(
    investigation,
    client,
    as_user,
    role: UserRole,
) -> None:
    batch_id, (first, _) = await _batch_with_two(client)
    await _set_role(investigation, as_user["email"], role)

    denied = await client.request("DELETE", f"/api/v1/assets/{first['asset_id']}")
    assert denied.status_code == 403
    denied_batch = await client.request("DELETE", f"/api/v1/batches/{batch_id}")
    assert denied_batch.status_code == 403
    rerun = await client.post(
        "/api/v1/assets/bulk", json={"action": "rerun", "asset_ids": [first["asset_id"]]}
    )
    assert rerun.status_code == 200
    assert rerun.json()["results"][0]["detail"] == "running"  # still queued from the upload


async def test_a_withdrawn_photo_cannot_be_committed_reviewed_or_accepted(
    investigation, client, as_user
) -> None:
    await _set_role(investigation, as_user["email"], UserRole.ARCHIVIST)
    _batch_id, (first, _second) = await _batch_with_two(client)
    await _machine_run(investigation, first["run_id"])
    case = (await client.get(f"/api/v1/assets/{first['asset_id']}/case")).json()
    await client.request("DELETE", f"/api/v1/assets/{first['asset_id']}")

    assert (await client.put(f"/api/v1/assets/{first['asset_id']}/commit")).status_code == 409
    review = await client.patch(
        f"/api/v1/records/{case['record_id']}/fields/locality", json={"action": "accept"}
    )
    assert review.status_code == 409
    bulk = await client.post(
        "/api/v1/assets/bulk", json={"action": "accept", "asset_ids": [first["asset_id"]]}
    )
    assert bulk.json()["results"][0]["detail"] == "withdrawn"


async def test_an_operator_does_not_decide_on_fields(investigation, client, as_user) -> None:
    _batch_id, (first, _second) = await _batch_with_two(client)
    await _machine_run(investigation, first["run_id"])
    case = (await client.get(f"/api/v1/assets/{first['asset_id']}/case")).json()
    await _set_role(investigation, as_user["email"], UserRole.OPERATOR)

    bulk = await client.post(
        "/api/v1/assets/bulk", json={"action": "accept", "asset_ids": [first["asset_id"]]}
    )
    assert bulk.status_code == 403
    review = await client.patch(
        f"/api/v1/records/{case['record_id']}/fields/locality", json={"action": "accept"}
    )
    assert review.status_code == 403
