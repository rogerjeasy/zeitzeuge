"""The tenant.

An *organization* is one archive: Staatsarchiv Schwyz, a Gemeindearchiv, a
museum, or the seeded demo tenant a judge lands in. It is the unit of row-level
security and the unit of the per-tenant KMS key (§10.5), which is why every
tenant-scoped table below carries `org_id` directly rather than reaching it
through a join — an RLS policy has to be checkable on the row itself.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from zeitzeuge_api.db.base import GUID, Base, JSONDict, TimestampMixin, enum_column, uuid_pk
from zeitzeuge_api.db.models.enums import OrganizationKind

if TYPE_CHECKING:  # pragma: no cover - import cycle broken for the type checker
    from zeitzeuge_api.db.models.user import User


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kind: Mapped[OrganizationKind] = mapped_column(
        enum_column(OrganizationKind, "organization_kind"),
        nullable=False,
        default=OrganizationKind.ARCHIVE,
    )
    canton: Mapped[str | None] = mapped_column(String(2))
    """Two-letter cantonal code — `SZ` for the customer in the brief."""

    isil: Mapped[str | None] = mapped_column(String(32))
    """ISIL code (ISO 15511), e.g. `CH-000015-2`. The identifier other archives
    already use for this institution — the key an export or an OAI-PMH harvest
    has to carry to be worth anything to a federated catalogue."""

    contact_email: Mapped[str | None] = mapped_column(String(320))
    is_demo: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    """Marks the tenant behind "Als Gast demo starten". Demo data never mixes
    with an archive's own holdings, and this flag is what keeps the eval and
    cost dashboards honest about which numbers came from real work."""

    settings: Mapped[dict[str, Any]] = mapped_column(JSONDict, nullable=False, default=dict)

    users: Mapped[list[User]] = relationship(
        back_populates="organization", lazy="raise"
    )

    __table_args__ = (Index("ix_organizations_kind_canton", "kind", "canton"),)

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<Organization {self.slug}>"


class OrganizationDomain(Base, TimestampMixin):
    """A mail domain that belongs to one archive.

    This is what decides whether a new registration *joins* an existing tenant
    or founds a new one. Matching on the organisation's display name would be a
    tenant-takeover waiting to happen — anyone who typed "Staatsarchiv Schwyz"
    would land inside Schwyz's data. A domain is at least a claim someone had
    to control a mail server to make, and `verified_at` records whether an
    administrator confirmed it.

    Public providers (gmail.com and friends) are refused at the service layer:
    a shared domain is not evidence of a shared employer.
    """

    __tablename__ = "organization_domains"

    id: Mapped[uuid.UUID] = uuid_pk()
    org_id: Mapped[uuid.UUID] = mapped_column(
        GUID(), ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False
    )
    domain: Mapped[str] = mapped_column(String(253), nullable=False, unique=True)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    default_role: Mapped[str] = mapped_column(String(32), nullable=False, default="reviewer")
    """What a self-registering colleague gets. Least privilege: a joiner can
    review, and an administrator promotes from `/settings/archive`."""
