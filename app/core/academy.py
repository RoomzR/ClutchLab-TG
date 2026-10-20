"""Academy organization, roles and data access checks."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, Request

from config import settings
from core.permissions import get_optional_user
from postgres_repo import execute, fetchrow

logger = logging.getLogger(__name__)

ACADEMY_ROLES = ("admin", "manager", "coach", "analyst", "player")
STAFF_ROLES = ("admin", "manager", "coach", "analyst")

PLAN_ROLE_TO_ACADEMY = {
    "SUPERADMIN": "admin", "ADMIN": "admin", "COACH": "coach", "ANALYST": "analyst",
    "ORGANIZATION": "manager", "TEAM": "manager",
}

_default_org_id: str | None = None
_user_cache: dict[str, tuple[float, "AcademyUser"]] = {}
_match_org_cache: dict[str, tuple[float, str | None, str | None]] = {}
CACHE_TTL = 30.0


@dataclass
class AcademyUser:
    id: str | None
    username: str
    role: str
    academy_role: str
    org_id: str | None
    player_name: str | None
    is_guest: bool = False

    @property
    def is_staff(self) -> bool:
        return self.academy_role in STAFF_ROLES

    def as_dict(self) -> dict[str, Any]:
        return {"id": self.id, "username": self.username, "role": self.role, "academy_role": self.academy_role,
                "org_id": self.org_id, "player_name": self.player_name, "is_guest": self.is_guest}


async def ensure_default_org() -> str:
    global _default_org_id
    row = await fetchrow("SELECT id FROM organizations WHERE slug=$1", settings.academy_slug)
    if not row:
        row = await fetchrow(
            "INSERT INTO organizations (name, slug, retention_days) VALUES ($1,$2,$3) RETURNING id",
            settings.academy_name, settings.academy_slug, settings.demo_retention_days,
        )
    org_id = str(row["id"])
    _default_org_id = org_id
    # Users joining the academy for the first time get a role derived from their plan role.
    for plan_role, academy_role in PLAN_ROLE_TO_ACADEMY.items():
        await execute("UPDATE users SET academy_role=$1 WHERE role=$2 AND org_id IS NULL", academy_role, plan_role)
    await execute("UPDATE users SET org_id=$1::uuid WHERE org_id IS NULL", org_id)
    await execute("UPDATE matches SET org_id=$1::uuid WHERE org_id IS NULL", org_id)
    return org_id


def default_org_id() -> str | None:
    return _default_org_id


async def _load_user(user_id: str) -> AcademyUser | None:
    cached = _user_cache.get(user_id)
    if cached and time.monotonic() - cached[0] < CACHE_TTL:
        return cached[1]
    row = await fetchrow(
        "SELECT id, username, role, academy_role, org_id, player_name FROM users WHERE id=$1::uuid AND is_active", user_id,
    )
    if not row:
        return None
    if not row["org_id"] and _default_org_id:
        await execute("UPDATE users SET org_id=$2::uuid WHERE id=$1::uuid", user_id, _default_org_id)
    au = AcademyUser(id=str(row["id"]), username=row["username"], role=row["role"], academy_role=row["academy_role"] or "player",
                     org_id=str(row["org_id"]) if row["org_id"] else _default_org_id, player_name=row["player_name"])
    _user_cache[user_id] = (time.monotonic(), au)
    return au


def invalidate_user(user_id: str) -> None:
    _user_cache.pop(user_id, None)


async def get_academy_user(request: Request, user=Depends(get_optional_user)) -> AcademyUser:
    if user is not None:
        au = await _load_user(user.id)
        if au:
            return au
    if settings.auth_required:
        raise HTTPException(401, "Войдите в аккаунт академии")
    return AcademyUser(id=None, username="guest", role="FREE", academy_role="coach", org_id=_default_org_id,
                       player_name=None, is_guest=True)


def require_academy_role(*roles: str):
    async def checker(au: AcademyUser = Depends(get_academy_user)) -> AcademyUser:
        if au.academy_role not in roles and au.academy_role != "admin":
            raise HTTPException(403, "Недостаточно прав для этого действия")
        return au

    return checker


async def match_org(match_id: str) -> tuple[bool, str | None, str | None]:
    cached = _match_org_cache.get(match_id)
    if cached and time.monotonic() - cached[0] < CACHE_TTL:
        return True, cached[1], cached[2]
    row = await fetchrow("SELECT org_id, owner_id FROM matches WHERE match_id=$1", match_id)
    if not row:
        return False, None, None
    org = str(row["org_id"]) if row["org_id"] else None
    owner = str(row["owner_id"]) if row["owner_id"] else None
    _match_org_cache[match_id] = (time.monotonic(), org, owner)
    return True, org, owner


def can_access(au: AcademyUser, org: str | None, owner: str | None) -> bool:
    if au.role in ("SUPERADMIN",):
        return True
    if org and au.org_id and org == au.org_id:
        return True
    if owner and au.id and owner == au.id:
        return True
    return org is None and owner is None


async def ensure_match_access(match_id: str, au: AcademyUser) -> None:
    exists, org, owner = await match_org(match_id)
    if not exists:
        raise HTTPException(404, "Матч не найден")
    if not can_access(au, org, owner):
        raise HTTPException(403, "Этот матч принадлежит другой организации")


def jl(value: Any) -> Any:
    """asyncpg returns json/jsonb as str by default."""
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value
