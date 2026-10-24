"""The v1 surface, assembled.

Route order follows §9.3: identity first, because everything else in the
pipeline — assets, runs, records, exports — hangs off an authenticated
archivist in a tenant.
"""

from __future__ import annotations

from fastapi import APIRouter

from zeitzeuge_api.api.v1 import api_keys, auth, investigation, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(api_keys.router)
api_router.include_router(investigation.router)
