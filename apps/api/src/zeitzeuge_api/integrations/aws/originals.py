"""Photographs in S3 — uploaded by the browser straight into `originals`.

The same narrow-ticket pattern as profile pictures (`s3.py`, §9.2): the API
issues a presigned POST pinned to one key, one content type, a size range and
SSE-KMS, and never proxies a byte. The key is chosen here, never by the
browser: `orgs/{org}/assets/{asset}/recto/master.{ext}` (data-model §13.1), so
a tenant cannot write into another tenant's prefix.

Viewing never serves the master: the review screen gets a presigned GET on the
access copy the pipeline writes to `derivatives`.
"""

from __future__ import annotations

import uuid
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.integrations.aws.clients import AwsClients, call
from zeitzeuge_api.integrations.aws.s3 import UploadTicket

log = get_logger(__name__)

ACCEPTED_TYPES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/tiff": "tif",
    "image/webp": "webp",
}


def master_key(org_id: uuid.UUID, asset_id: uuid.UUID, content_type: str) -> str:
    return f"orgs/{org_id}/assets/{asset_id}/recto/master.{ACCEPTED_TYPES[content_type]}"


def access_key(org_id: uuid.UUID, asset_id: uuid.UUID) -> str:
    return f"orgs/{org_id}/assets/{asset_id}/recto/access.jpg"


class OriginalsStorage:
    def __init__(
        self,
        clients: AwsClients,
        *,
        bucket: str,
        derivatives_bucket: str,
        kms_key_id: str = "",
        max_bytes: int = 209_715_200,
        upload_ttl: int = 1800,
        view_ttl: int = 3600,
    ) -> None:
        self._clients = clients
        self.bucket = bucket
        self.derivatives_bucket = derivatives_bucket
        self._kms_key_id = kms_key_id
        self._max_bytes = max_bytes
        self._upload_ttl = upload_ttl
        self._view_ttl = view_ttl

    def ticket(self, *, key: str, content_type: str, content_length: int) -> UploadTicket:
        if content_type not in ACCEPTED_TYPES:
            raise errors.UnsupportedMediaTypeError(
                f"Accepted image types: {', '.join(ACCEPTED_TYPES)}."
            )
        if content_length <= 0 or content_length > self._max_bytes:
            raise errors.PayloadTooLargeError(
                f"A photograph must be between 1 byte and {self._max_bytes // 1_048_576} MB."
            )
        fields: dict[str, Any] = {"Content-Type": content_type}
        conditions: list[Any] = [
            {"Content-Type": content_type},
            ["content-length-range", 1, self._max_bytes],
        ]
        if self._kms_key_id:
            fields["x-amz-server-side-encryption"] = "aws:kms"
            fields["x-amz-server-side-encryption-aws-kms-key-id"] = self._kms_key_id
            conditions.append({"x-amz-server-side-encryption": "aws:kms"})
            conditions.append({"x-amz-server-side-encryption-aws-kms-key-id": self._kms_key_id})
        try:
            presigned = self._clients.s3.generate_presigned_post(
                Bucket=self.bucket,
                Key=key,
                Fields=fields,
                Conditions=conditions,
                ExpiresIn=self._upload_ttl,
            )
        except (ClientError, BotoCoreError) as exc:  # pragma: no cover - transport
            log.error("s3.presign_failed", error=str(exc), bucket=self.bucket)
            raise errors.UpstreamError() from exc
        return UploadTicket(
            url=str(presigned["url"]),
            fields={str(k): str(v) for k, v in presigned["fields"].items()},
            key=key,
            expires_in=self._upload_ttl,
            max_bytes=self._max_bytes,
        )

    async def head(self, key: str) -> tuple[int, str]:
        """(size, content type) of an uploaded master, or NotFound."""
        try:
            head = await call(self._clients.s3.head_object, Bucket=self.bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise errors.NotFoundError("The photograph has not arrived in storage.") from exc
            raise errors.UpstreamError() from exc
        return int(head.get("ContentLength", 0)), str(head.get("ContentType", ""))

    def view_url(self, key: str | None, *, bucket: str | None = None) -> str | None:
        if not key:
            return None
        try:
            return str(
                self._clients.s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": bucket or self.derivatives_bucket, "Key": key},
                    ExpiresIn=self._view_ttl,
                )
            )
        except (ClientError, BotoCoreError) as exc:  # pragma: no cover - transport
            log.warning("s3.view_url_failed", error=str(exc))
            return None
