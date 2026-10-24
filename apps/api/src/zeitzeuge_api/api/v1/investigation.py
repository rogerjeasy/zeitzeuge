"""Batches, uploads, the case file, field reviews, the workbook and the live stream.

The investigation surface of architecture §10.2, in the subset P0 serves.
Writes need a writing role (`WriteIdentity`): the demo guest can watch and
download, never change a record.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from collections.abc import AsyncIterator
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Header, Request, Response
from fastapi.responses import StreamingResponse

from zeitzeuge_api.api.deps import CurrentIdentity, Identity, WriteIdentity, resolve_identity
from zeitzeuge_api.core import errors
from zeitzeuge_api.schemas import investigation as schemas
from zeitzeuge_api.services.investigation_service import InvestigationService
from zeitzeuge_api.services.mirror import mirror_batch

router = APIRouter(tags=["investigation"])

HEARTBEAT_SECONDS = 15
"""Below CloudFront's 30 s origin read timeout, so an idle stream stays open."""


def get_service(request: Request) -> InvestigationService:
    service = getattr(request.app.state, "investigation_service", None)
    if service is None:
        raise errors.ConfigurationError("The investigation service is not configured.")
    return service


Service = Annotated[InvestigationService, Depends(get_service)]


@router.get("/batches", response_model=list[schemas.BatchSummary], summary="This archive's batches")
async def list_batches(
    identity: CurrentIdentity, service: Service, include_deleted: bool = False
) -> list[schemas.BatchSummary]:
    return await service.list_batches(identity.session, include_deleted=include_deleted)


@router.post(
    "/batches",
    response_model=schemas.BatchSummary,
    status_code=201,
    summary="Open a batch (e.g. the 50 Prio-1 photos)",
)
async def create_batch(
    body: schemas.CreateBatchRequest, identity: WriteIdentity, service: Service
) -> schemas.BatchSummary:
    return await service.create_batch(
        identity.session, user=identity.user, data=body, context=identity.context
    )


@router.post(
    "/batches/{batch_id}/assets",
    response_model=schemas.RegisterFilesResponse,
    summary="Register files and get one presigned upload per file",
)
async def register_files(
    batch_id: uuid.UUID,
    body: schemas.RegisterFilesRequest,
    identity: WriteIdentity,
    service: Service,
) -> schemas.RegisterFilesResponse:
    return await service.register_files(
        identity.session, user=identity.user, batch_id=batch_id, data=body
    )


@router.put(
    "/assets/{asset_id}/commit",
    response_model=schemas.CommitResponse,
    summary="Confirm an upload arrived; queues the investigation",
)
async def commit_upload(
    asset_id: uuid.UUID, identity: WriteIdentity, service: Service
) -> schemas.CommitResponse:
    return await service.commit_upload(identity.session, user=identity.user, asset_id=asset_id)


@router.post(
    "/assets/{asset_id}/rerun",
    summary="Investigate a photograph again (a new run; the old ledger stays)",
)
async def rerun(asset_id: uuid.UUID, identity: WriteIdentity, service: Service) -> dict[str, str]:
    return {"run_id": await service.rerun(identity.session, user=identity.user, asset_id=asset_id)}


@router.post(
    "/batches/{batch_id}/mirror",
    summary="Copy this batch into the demo archive, for the read-only guest (design note D9)",
)
async def mirror(batch_id: uuid.UUID, request: Request, identity: WriteIdentity) -> dict[str, Any]:
    if not identity.user.role.can_approve:
        raise errors.ForbiddenError("Only an archivist or admin may publish a mirror.")
    await identity.session.commit()  # the mirror opens its own tenant-scoped transactions
    return await mirror_batch(
        request.app.state.database, source_org=identity.user.org_id, batch_id=batch_id
    )


@router.get("/batches/{batch_id}", response_model=schemas.BatchOut, summary="Progress per photo")
async def read_batch(
    batch_id: uuid.UUID, identity: CurrentIdentity, service: Service, include_deleted: bool = False
) -> schemas.BatchOut:
    return await service.batch(identity.session, batch_id, include_deleted=include_deleted)


@router.get(
    "/batches/{batch_id}/qc", response_model=schemas.QcSummaryOut, summary="Prio-1 QC panel"
)
async def read_qc(batch_id: uuid.UUID, identity: CurrentIdentity, service: Service) -> Any:
    return await service.qc(identity.session, batch_id)


@router.get(
    "/batches/{batch_id}/export",
    summary="The Excel workbook: one row per photo (Ergebnisse, Belege, Methode, Spalten)",
    response_class=Response,
)
async def export_batch(
    batch_id: uuid.UUID,
    identity: CurrentIdentity,
    service: Service,
    fmt: str = "xlsx",
    asset_ids: str | None = None,
) -> Response:
    if fmt != "xlsx":
        raise errors.InvalidRequestError("P0 exports xlsx only.")
    selection: list[uuid.UUID] | None = None
    if asset_ids:
        try:
            selection = [uuid.UUID(part) for part in asset_ids.split(",") if part.strip()][:600]
        except ValueError as exc:
            raise errors.InvalidRequestError("asset_ids must be comma-separated UUIDs.") from exc
    content, filename = await service.export_xlsx(
        identity.session, user=identity.user, batch_id=batch_id, asset_ids=selection
    )
    return Response(
        content=content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/assets/{asset_id}/case",
    response_model=schemas.CaseFile,
    summary="The case file: five fields, evidence, hypotheses, objections, events",
)
async def read_case(
    asset_id: uuid.UUID, identity: CurrentIdentity, service: Service
) -> schemas.CaseFile:
    return await service.case_file(identity.session, asset_id)


@router.patch(
    "/records/{record_id}/fields/{field_key}",
    response_model=schemas.CaseFile,
    summary="Accept, correct or reject one field (writes a new version)",
)
async def review_field(
    record_id: uuid.UUID,
    field_key: str,
    body: schemas.FieldReviewRequest,
    identity: WriteIdentity,
    service: Service,
    if_match: Annotated[str | None, Header()] = None,
) -> schemas.CaseFile:
    version = int(if_match.strip('"')) if if_match and if_match.strip('"').isdigit() else None
    return await service.review_field(
        identity.session,
        user=identity.user,
        record_id=record_id,
        field_key=field_key,
        data=body,
        if_match=version,
    )


# --- batch management (batch-management note §3) -------------------------------


def _approver(identity: Identity) -> Identity:
    if not identity.user.role.can_approve:
        raise errors.ForbiddenError("Only an archivist or admin may withdraw or restore.")
    return identity


@router.delete(
    "/assets/{asset_id}",
    response_model=schemas.BulkResult,
    summary="Withdraw a photograph (it leaves every view; the master stays in storage)",
)
async def withdraw_asset(
    asset_id: uuid.UUID,
    identity: WriteIdentity,
    service: Service,
    body: schemas.WithdrawRequest | None = None,
) -> schemas.BulkResult:
    _approver(identity)
    return await service.bulk(
        identity.session,
        user=identity.user,
        action="delete",
        asset_ids=[asset_id],
        reason=body.reason if body else None,
    )


@router.post(
    "/assets/{asset_id}/restore", response_model=schemas.BulkResult, summary="Undo a withdrawal"
)
async def restore_asset(
    asset_id: uuid.UUID, identity: WriteIdentity, service: Service
) -> schemas.BulkResult:
    _approver(identity)
    return await service.bulk(
        identity.session, user=identity.user, action="restore", asset_ids=[asset_id]
    )


@router.post(
    "/assets/bulk",
    response_model=schemas.BulkResult,
    summary="Withdraw, restore, re-investigate or accept many photographs at once",
)
async def bulk_assets(
    body: schemas.BulkRequest, identity: WriteIdentity, service: Service
) -> schemas.BulkResult:
    if body.action in {"delete", "restore"}:
        _approver(identity)
    return await service.bulk(
        identity.session,
        user=identity.user,
        action=body.action,
        asset_ids=body.asset_ids,
        reason=body.reason,
    )


@router.delete(
    "/batches/{batch_id}",
    response_model=schemas.BatchWithdrawResult,
    summary="Withdraw a batch and every photograph in it",
)
async def withdraw_batch(
    batch_id: uuid.UUID,
    identity: WriteIdentity,
    service: Service,
    body: schemas.WithdrawRequest | None = None,
) -> schemas.BatchWithdrawResult:
    _approver(identity)
    return await service.withdraw_batch(
        identity.session,
        user=identity.user,
        batch_id=batch_id,
        reason=body.reason if body else None,
    )


@router.post(
    "/batches/{batch_id}/restore",
    response_model=schemas.BatchWithdrawResult,
    summary="Undo a batch withdrawal",
)
async def restore_batch(
    batch_id: uuid.UUID, identity: WriteIdentity, service: Service
) -> schemas.BatchWithdrawResult:
    _approver(identity)
    return await service.restore_batch(identity.session, user=identity.user, batch_id=batch_id)


# The identity's transaction must end before the stream starts: an open
# transaction per viewer would pin a pooled connection for the life of the tab.
StreamIdentity = Annotated[Identity, Depends(resolve_identity, scope="function")]


@router.get("/batches/{batch_id}/stream", summary="Live progress (Server-Sent Events)")
async def stream_batch(
    batch_id: uuid.UUID, request: Request, identity: StreamIdentity, service: Service
) -> StreamingResponse:
    await service.batch(identity.session, batch_id)  # 404 unless this archive can see it
    notifier = getattr(request.app.state, "notifier", None)
    org_id = str(identity.user.org_id)
    key = str(batch_id)

    async def events() -> AsyncIterator[bytes]:
        yield b"retry: 5000\n\n"
        yield _sse("hello", {"batch_id": key, "live": bool(notifier and notifier.live)})
        if notifier is None or not notifier.live:
            return  # the client falls back to polling
        queue = notifier.subscribe(key)
        try:
            while not await request.is_disconnected():
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=HEARTBEAT_SECONDS)
                except TimeoutError:
                    yield b": keep-alive\n\n"
                    continue
                if event.get("closing"):
                    yield _sse("bye", {"reason": "server shutting down"})
                    return
                if event.get("org_id") != org_id:
                    continue
                yield _sse(
                    "run",
                    {k: event.get(k) for k in ("run_id", "stage", "state")},
                )
        finally:
            notifier.unsubscribe(key, queue)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


def _sse(event: str, data: dict[str, Any]) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()
