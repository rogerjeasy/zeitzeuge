"""Declarative base and the two portable column types.

Aurora PostgreSQL is the target (§9.1) and nothing here pretends otherwise —
but the type decorators below let the same models load on SQLite, which is what
keeps the unit-test suite a sub-second `pytest` rather than a docker-compose
ceremony. Postgres-only behaviour (row-level security, `pgvector`, `citext`)
lives in the migrations and is exercised by the `integration` marker.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum as PyEnum
from typing import Any, ClassVar

from sqlalchemy import CHAR, DateTime, Enum, MetaData, func
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.types import JSON, TypeDecorator

# Explicit naming, so Alembic autogenerate produces stable, reviewable names
# instead of anonymous constraints that churn on every diff.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class GUID(TypeDecorator[uuid.UUID]):
    """UUID on PostgreSQL, 36-character text everywhere else."""

    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.UUID(as_uuid=True))
        return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, uuid.UUID):
            value = uuid.UUID(str(value))
        return value if dialect.name == "postgresql" else str(value)

    def process_result_value(self, value: Any, dialect: Any) -> uuid.UUID | None:
        if value is None:
            return None
        return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


class JSONDict(TypeDecorator[dict]):
    """JSONB on PostgreSQL, JSON elsewhere."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Any) -> Any:
        if dialect.name == "postgresql":
            return dialect.type_descriptor(postgresql.JSONB())
        return dialect.type_descriptor(JSON())


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map: ClassVar[dict[Any, Any]] = {dict[str, Any]: JSONDict, uuid.UUID: GUID}


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


def uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(GUID(), primary_key=True, default=uuid.uuid4)


def enum_column(enum_cls: type[PyEnum], name: str, length: int = 32) -> Enum:
    """A VARCHAR + CHECK holding the enum's *value*, not its member name.

    Two decisions in one helper. `native_enum=False` because adding a value to
    a native PostgreSQL enum is a migration with a lock, and the role list will
    grow. `values_callable` because SQLAlchemy otherwise stores `ARCHIVIST`
    while every other layer — the Cognito group, the JSON body, the RLS
    setting — says `archivist`.
    """
    return Enum(
        enum_cls,
        name=name,
        native_enum=False,
        length=length,
        values_callable=lambda enum: [member.value for member in enum],
    )
