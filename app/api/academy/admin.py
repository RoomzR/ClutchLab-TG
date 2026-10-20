"""Academy administration: organization settings, members & roles, roster, teams."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.academy.common import iso, invalidate_population
from core.academy import ACADEMY_ROLES, AcademyUser, get_academy_user, invalidate_user, require_academy_role
from postgres_repo import execute, fetch, fetchrow

router = APIRouter(prefix="/api/academy", tags=["academy-admin"])


@router.get("/org")
async def org(au: AcademyUser = Depends(get_academy_user)):
    row = await fetchrow("SELECT * FROM organizations WHERE id=$1::uuid", au.org_id)
    if not row:
        raise HTTPException(404, "Организация не найдена")
    counts = await fetchrow(
        """SELECT (SELECT COUNT(*)::int FROM matches WHERE org_id=$1::uuid) AS matches,
                  (SELECT COUNT(*)::int FROM matches WHERE org_id=$1::uuid AND status='error') AS failed,
                  (SELECT COUNT(*)::int FROM users WHERE org_id=$1::uuid) AS members,
                  (SELECT COUNT(*)::int FROM academy_roster WHERE org_id=$1::uuid AND active) AS roster,
                  (SELECT COALESCE(SUM(file_size_bytes),0)::bigint FROM demo_usage du JOIN matches m ON m.match_id = du.match_id
                     WHERE m.org_id=$1::uuid AND NOT m.file_deleted) AS storage_bytes""",
        au.org_id,
    )
    return {**{k: iso(v) for k, v in dict(row).items()}, "id": str(row["id"]), "counts": dict(counts)}


class OrgUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=80)
    retention_days: int | None = Field(None, ge=7, le=3650)


@router.patch("/org")
async def update_org(body: OrgUpdate, au: AcademyUser = Depends(require_academy_role("admin"))):
    await execute("UPDATE organizations SET name=COALESCE($2,name), retention_days=COALESCE($3,retention_days) WHERE id=$1::uuid",
                  au.org_id, body.name, body.retention_days)
    return {"ok": True}


@router.get("/members")
async def members(au: AcademyUser = Depends(require_academy_role("admin", "manager", "coach"))):
    rows = await fetch(
        """SELECT id, username, email, role, academy_role, player_name, last_login_at, created_at FROM users
           WHERE org_id=$1::uuid ORDER BY academy_role, username""",
        au.org_id,
    )
    return [{**{k: iso(v) for k, v in dict(r).items()}, "id": str(r["id"])} for r in rows]


class MemberUpdate(BaseModel):
    academy_role: str | None = None
    player_name: str | None = None


@router.patch("/members/{user_id}")
async def update_member(user_id: str, body: MemberUpdate, au: AcademyUser = Depends(require_academy_role("admin"))):
    if body.academy_role and body.academy_role not in ACADEMY_ROLES:
        raise HTTPException(400, "Неизвестная роль")
    await execute("UPDATE users SET academy_role=COALESCE($2,academy_role), player_name=COALESCE($3,player_name) WHERE id=$1::uuid AND org_id=$4::uuid",
                  user_id, body.academy_role, body.player_name, au.org_id)
    invalidate_user(user_id)
    return {"ok": True}


class RosterIn(BaseModel):
    player_name: str = Field(..., min_length=1, max_length=64)
    steam_id: str | None = None
    team_id: str | None = None
    ingame_role: str | None = None
    user_id: str | None = None


@router.get("/roster")
async def roster(au: AcademyUser = Depends(get_academy_user)):
    rows = await fetch(
        """SELECT r.*, t.name AS team_name, u.username FROM academy_roster r
           LEFT JOIN academy_teams t ON t.id = r.team_id LEFT JOIN users u ON u.id = r.user_id
           WHERE r.org_id=$1::uuid ORDER BY r.active DESC, r.player_name""",
        au.org_id,
    )
    return [_ids(r) for r in rows]


def _ids(r: Any) -> dict[str, Any]:
    d = {k: iso(v) for k, v in dict(r).items()}
    for k in ("id", "org_id", "team_id", "user_id"):
        if d.get(k):
            d[k] = str(d[k])
    return d


@router.post("/roster")
async def add_roster(body: RosterIn, au: AcademyUser = Depends(require_academy_role("admin", "manager", "coach"))):
    row = await fetchrow(
        """INSERT INTO academy_roster (org_id, team_id, player_name, steam_id, user_id, ingame_role)
           VALUES ($1::uuid,$2::uuid,$3,$4,$5::uuid,$6)
           ON CONFLICT (org_id, player_name) DO UPDATE SET team_id=EXCLUDED.team_id, steam_id=EXCLUDED.steam_id,
             user_id=COALESCE(EXCLUDED.user_id, academy_roster.user_id), ingame_role=EXCLUDED.ingame_role, active=TRUE
           RETURNING *""",
        au.org_id, body.team_id, body.player_name, body.steam_id, body.user_id, body.ingame_role,
    )
    if body.user_id:
        await execute("UPDATE users SET player_name=$2 WHERE id=$1::uuid", body.user_id, body.player_name)
        invalidate_user(body.user_id)
    invalidate_population()
    return _ids(row)


@router.delete("/roster/{roster_id}")
async def remove_roster(roster_id: str, au: AcademyUser = Depends(require_academy_role("admin", "manager", "coach"))):
    await execute("UPDATE academy_roster SET active=FALSE WHERE id=$1::uuid AND org_id=$2::uuid", roster_id, au.org_id)
    return {"ok": True}


class TeamIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    tag: str | None = None
    demo_names: list[str] = []


@router.get("/academy-teams")
async def academy_teams(au: AcademyUser = Depends(get_academy_user)):
    rows = await fetch("SELECT * FROM academy_teams WHERE org_id=$1::uuid ORDER BY name", au.org_id)
    return [_ids(r) for r in rows]


@router.post("/academy-teams")
async def create_team(body: TeamIn, au: AcademyUser = Depends(require_academy_role("admin", "manager", "coach"))):
    names = sorted({body.name, *body.demo_names})
    row = await fetchrow(
        """INSERT INTO academy_teams (org_id, name, tag, demo_names) VALUES ($1::uuid,$2,$3,$4)
           ON CONFLICT (org_id, name) DO UPDATE SET tag=EXCLUDED.tag, demo_names=EXCLUDED.demo_names RETURNING *""",
        au.org_id, body.name, body.tag, names,
    )
    return _ids(row)


@router.delete("/academy-teams/{team_id}")
async def delete_team(team_id: str, au: AcademyUser = Depends(require_academy_role("admin", "manager"))):
    await execute("DELETE FROM academy_teams WHERE id=$1::uuid AND org_id=$2::uuid", team_id, au.org_id)
    return {"ok": True}
