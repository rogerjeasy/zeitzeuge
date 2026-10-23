"""Profile pictures in S3 — uploaded by the browser, never through this API.

The bytes go straight from the browser to S3 with a presigned POST. The API
issues a **narrow** ticket and never becomes a file proxy, which matters for
three reasons: a Fargate task with a 512 MB memory reservation is a poor place
to buffer uploads; §9.2 already specifies presigned direct upload for scans, so
avatars use the same mechanism; and the policy conditions below let S3 itself
enforce the size and type limits, before a byte is stored.

The ticket is deliberately tight:

* the exact key — the browser cannot choose where the object lands, so no user
  can write over another user's avatar;
* a content-length range — a 4 GB "profile picture" is rejected by S3;
* the declared content type;
* SSE-KMS with the per-tenant CMK (§10.5), enforced as a condition rather than
  hoped for, so an upload that omits the header simply fails.

Serving is presigned GET rather than a public object: an archivist's photograph
is personal data under nDSG, and a public bucket would make it world-readable
for as long as the key survives.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from botocore.exceptions import BotoCoreError, ClientError

from zeitzeuge_api.core import errors
from zeitzeuge_api.core.logging import get_logger
from zeitzeuge_api.integrations.aws.clients import AwsClients, call

log = get_logger(__name__)

_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


@dataclass(frozen=True, slots=True)
class UploadTicket:
    url: str
    fields: dict[str, str]
    key: str
    expires_in: int
    max_bytes: int


class AvatarStorage:
    def __init__(
        self,
        clients: AwsClients,
        *,
        bucket: str,
        prefix: str = "avatars",
        kms_key_id: str = "",
        max_bytes: int = 5 * 1024 * 1024,
        allowed_types: tuple[str, ...] = ("image/jpeg", "image/png", "image/webp"),
        upload_ttl: int = 900,
        view_ttl: int = 3600,
        cdn_domain: str = "",
    ) -> None:
        self._clients = clients
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        self._kms_key_id = kms_key_id
        self._max_bytes = max_bytes
        self._allowed = tuple(allowed_types)
        self._upload_ttl = upload_ttl
        self._view_ttl = view_ttl
        self._cdn_domain = cdn_domain

    # --- keys -------------------------------------------------------------

    def build_key(
        self, *, org_id: uuid.UUID | str, user_id: uuid.UUID | str, content_type: str
    ) -> str:
        extension = _EXTENSIONS.get(content_type, "bin")
        # A fresh object id per upload, so a replaced avatar is a new URL and
        # no CDN or browser cache can serve the previous face.
        return f"{self._prefix}/{org_id}/{user_id}/{uuid.uuid4().hex}.{extension}"

    def owns_key(self, key: str, *, org_id: uuid.UUID | str, user_id: uuid.UUID | str) -> bool:
        return key.startswith(f"{self._prefix}/{org_id}/{user_id}/")

    # --- upload -----------------------------------------------------------

    def create_upload_ticket(
        self,
        *,
        org_id: uuid.UUID | str,
        user_id: uuid.UUID | str,
        content_type: str,
        content_length: int,
    ) -> UploadTicket:
        if content_type not in self._allowed:
            raise errors.UnsupportedMediaTypeError(
                f"Accepted image types: {', '.join(self._allowed)}."
            )
        if content_length <= 0 or content_length > self._max_bytes:
            raise errors.PayloadTooLargeError(
                f"The image must be between 1 byte and {self._max_bytes // 1024} kB."
            )

        key = self.build_key(org_id=org_id, user_id=user_id, content_type=content_type)
        fields: dict[str, Any] = {"Content-Type": content_type}
        conditions: list[Any] = [
            {"Content-Type": content_type},
            ["content-length-range", 1, self._max_bytes],
        ]
        if self._kms_key_id:
            fields["x-amz-server-side-encryption"] = "aws:kms"
            fields["x-amz-server-side-encryption-aws-kms-key-id"] = self._kms_key_id
            conditions.append({"x-amz-server-side-encryption": "aws:kms"})
            conditions.append(
                {"x-amz-server-side-encryption-aws-kms-key-id": self._kms_key_id}
            )

        try:
            presigned = self._clients.s3.generate_presigned_post(
                Bucket=self._bucket,
                Key=key,
                Fields=fields,
                Conditions=conditions,
                ExpiresIn=self._upload_ttl,
            )
        except (ClientError, BotoCoreError) as exc:  # pragma: no cover - transport
            log.error("s3.presign_failed", error=str(exc), bucket=self._bucket)
            raise errors.UpstreamError() from exc

        return UploadTicket(
            url=str(presigned["url"]),
            fields={str(k): str(v) for k, v in presigned["fields"].items()},
            key=key,
            expires_in=self._upload_ttl,
            max_bytes=self._max_bytes,
        )

    async def verify_uploaded(self, key: str) -> int:
        """Confirm the object really arrived, and really is what was promised.

        The presigned conditions are enforced by S3, but the *commit* still has
        to be checked here: a client could call the commit endpoint with a key
        it never uploaded to, and we would otherwise record a dangling avatar.
        """
        try:
            head = await call(self._clients.s3.head_object, Bucket=self._bucket, Key=key)
        except ClientError as exc:
            code = exc.response.get("Error", {}).get("Code", "")
            if code in {"404", "NoSuchKey", "NotFound"}:
                raise errors.NotFoundError("No uploaded image was found for that ticket.") from exc
            raise errors.UpstreamError() from exc
        except BotoCoreError as exc:  # pragma: no cover - transport
            raise errors.UpstreamError() from exc

        size = int(head.get("ContentLength", 0))
        content_type = str(head.get("ContentType", ""))
        if size > self._max_bytes:
            raise errors.PayloadTooLargeError()
        if content_type not in self._allowed:
            raise errors.UnsupportedMediaTypeError()
        return size

    # --- read / delete ----------------------------------------------------

    def view_url(self, key: str | None) -> str | None:
        if not key:
            return None
        if self._cdn_domain:
            # CloudFront in front of the bucket (OAC + signed cookies at the
            # edge). Still not a public object.
            return f"https://{self._cdn_domain}/{key}"
        try:
            return str(
                self._clients.s3.generate_presigned_url(
                    "get_object",
                    Params={"Bucket": self._bucket, "Key": key},
                    ExpiresIn=self._view_ttl,
                )
            )
        except (ClientError, BotoCoreError) as exc:  # pragma: no cover - transport
            log.warning("s3.view_url_failed", error=str(exc))
            return None

    async def delete(self, key: str | None) -> None:
        if not key:
            return
        try:
            await call(self._clients.s3.delete_object, Bucket=self._bucket, Key=key)
        except (ClientError, BotoCoreError) as exc:  # pragma: no cover - transport
            # A stranded object costs a fraction of a cent; failing the user's
            # request over it costs the demo.
            log.warning("s3.delete_failed", error=str(exc), key=key)
