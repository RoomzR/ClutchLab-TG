"""Clan / team endpoints: create, invites, members, stats."""

import logging
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from gamification import grant_achievement
from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetch, fetchrow
from social import publish_activity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/clans", tags=["clans"])

TAG_RE = re.compile(r"^[A-Za-z0-9]{2,6}$")
MAX_MEMBERS = 20


class CreateClanRequest(BaseModel):
    name: str = Field(min_length=3, max_length=32)
    tag: str = Field(min_length=2, max_length=6)
    description: str | None = Field(default=None, max_length=300)
    logo_url: str | None = Field(default=None, max_length=500)


class UpdateClanRequest(BaseModel):
    description: str | None = Field(default=None, max_length=300)
    logo_url: str | None = Field(default=None, max_length=500)
    is_public: bool | None = None


class JoinRequest(BaseModel):
    code: str


class MemberActionRequest(BaseModel):
    user_id: str


async def _membership(user_id: str):
    return await fetchrow(
        """
        SELECT cm.*, c.name, c.tag, c.owner_id FROM clan_members cm
        JOIN clans c ON c.id = cm.clan_id
        WHERE cm.user_id = $1::uuid
        """,
        user_id,
    )


def _can_manage(membership) -> bool:
    return membership is not None and membership["role"] in ("owner", "admin")


async def _clan_payload(clan_id) -> dict:
    clan = await fetchrow("SELECT * FROM clans WHERE id = $1", clan_id)
    if not clan:
        raise HTTPException(status_code=404, detail="Clan not found")
    members = await fetch(
        """
        SELECT cm.role, cm.joined_at, u.id, u.username, u.avatar_url, u.xp, u.role AS plan_role
        FROM clan_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.clan_id = $1
        ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, cm.joined_at
        """,
        clan_id,
    )
    # Aggregate stats from members' uploaded matches
    stats = await fetchrow(
        """
        SELECT COUNT(DISTINCT m.match_id)::int AS demos,
               COALESCE(SUM(u.xp), 0)::int AS total_xp
        FROM clan_members cm
        JOIN users u ON u.id = cm.user_id
        LEFT JOIN matches m ON m.owner_id = u.id AND m.status = 'ready'
        WHERE cm.clan_id = $1
        """,
        clan_id,
    )
    top_maps = await fetch(
        """
        SELECT m.map_name, COUNT(*)::int AS games
        FROM matches m
        JOIN clan_members cm ON cm.user_id = m.owner_id
        WHERE cm.clan_id = $1 AND m.status = 'ready' AND m.map_name IS NOT NULL
        GROUP BY m.map_name ORDER BY games DESC LIMIT 5
        """,
        clan_id,
    )
    return {
        "id": str(clan["id"]),
        "name": clan["name"],
        "tag": clan["tag"],
        "description": clan["description"],
        "logo_url": clan["logo_url"],
        "is_public": clan["is_public"],
        "owner_id": str(clan["owner_id"]),
        "created_at": clan["created_at"].isoformat(),
        "members": [
            {
                "user_id": str(m["id"]),
                "username": m["username"],
                "avatar_url": m["avatar_url"],
                "clan_role": m["role"],
                "plan_role": m["plan_role"],
                "xp": int(m["xp"]),
                "joined_at": m["joined_at"].isoformat(),
            }
            for m in members
        ],
        "stats": {
            "member_count": len(members),
            "demos_analyzed": int(stats["demos"]) if stats else 0,
            "total_xp": int(stats["total_xp"]) if stats else 0,
            "top_maps": [{"map": r["map_name"], "games": r["games"]} for r in top_maps],
        },
    }


@router.post("")
async def create_clan(body: CreateClanRequest, user: AuthUser = Depends(get_current_user)):
    if not TAG_RE.match(body.tag):
        raise HTTPException(status_code=422, detail="Tag must be 2-6 letters/digits")

    if await _membership(user.id):
        raise HTTPException(status_code=409, detail="You are already in a clan. Leave it first.")

    taken = await fetchrow(
        "SELECT id FROM clans WHERE LOWER(name) = LOWER($1) OR LOWER(tag) = LOWER($2)",
        body.name, body.tag,
    )
    if taken:
        raise HTTPException(status_code=409, detail="Clan name or tag already taken")

    clan = await fetchrow(
        """
        INSERT INTO clans (name, tag, description, logo_url, owner_id)
        VALUES ($1, $2, $3, $4, $5::uuid)
        RETURNING id
        """,
        body.name, body.tag.upper(), body.description, body.logo_url, user.id,
    )
    await execute(
        "INSERT INTO clan_members (clan_id, user_id, role) VALUES ($1, $2::uuid, 'owner')",
        clan["id"], user.id,
    )
    await grant_achievement(user.id, "clan_founder")
    await publish_activity(
        user.id, "clan_created", {"name": body.name, "tag": body.tag.upper()},
    )
    return await _clan_payload(clan["id"])


@router.get("/mine")
async def my_clan(user: AuthUser = Depends(get_current_user)):
    membership = await _membership(user.id)
    if not membership:
        return {"clan": None}
    payload = await _clan_payload(membership["clan_id"])
    payload["my_role"] = membership["role"]
    return {"clan": payload}


@router.get("/public")
async def list_public_clans():
    rows = await fetch(
        """
        SELECT c.id, c.name, c.tag, c.logo_url, c.description,
               COUNT(cm.id)::int AS members,
               COALESCE(SUM(u.xp), 0)::int AS total_xp
        FROM clans c
        LEFT JOIN clan_members cm ON cm.clan_id = c.id
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE c.is_public
        GROUP BY c.id
        ORDER BY total_xp DESC LIMIT 50
        """
    )
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "tag": r["tag"],
            "logo_url": r["logo_url"],
            "description": r["description"],
            "members": r["members"],
            "total_xp": r["total_xp"],
        }
        for r in rows
    ]


@router.get("/{clan_id}")
async def get_clan(clan_id: str):
    return await _clan_payload(clan_id)


@router.patch("/mine")
async def update_clan(body: UpdateClanRequest, user: AuthUser = Depends(get_current_user)):
    membership = await _membership(user.id)
    if not _can_manage(membership):
        raise HTTPException(status_code=403, detail="Only clan owner or admin can edit the clan")

    if body.description is not None:
        await execute(
            "UPDATE clans SET description = $2 WHERE id = $1",
            membership["clan_id"], body.description,
        )
    if body.logo_url is not None:
        await execute(
            "UPDATE clans SET logo_url = $2 WHERE id = $1",
            membership["clan_id"], body.logo_url,
        )
    if body.is_public is not None:
        await execute(
            "UPDATE clans SET is_public = $2 WHERE id = $1",
            membership["clan_id"], body.is_public,
        )
    return await _clan_payload(membership["clan_id"])


@router.post("/invite")
async def create_invite(user: AuthUser = Depends(get_current_user)):
    membership = await _membership(user.id)
    if not _can_manage(membership):
        raise HTTPException(status_code=403, detail="Only clan owner or admin can invite")

    code = secrets.token_hex(4).upper()
    await execute(
        """
        INSERT INTO clan_invites (clan_id, code, created_by, expires_at)
        VALUES ($1, $2, $3::uuid, $4)
        """,
        membership["clan_id"], code, user.id,
        datetime.now(timezone.utc) + timedelta(days=7),
    )
    return {"code": code, "expires_in_days": 7, "max_uses": 10}


@router.post("/join")
async def join_clan(body: JoinRequest, user: AuthUser = Depends(get_current_user)):
    if await _membership(user.id):
        raise HTTPException(status_code=409, detail="You are already in a clan")

    invite = await fetchrow(
        "SELECT * FROM clan_invites WHERE code = $1", body.code.strip().upper(),
    )
    if not invite:
        raise HTTPException(status_code=404, detail="Invite code not found")
    if invite["expires_at"] < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Invite code expired")
    if invite["uses"] >= invite["max_uses"]:
        raise HTTPException(status_code=400, detail="Invite code usage limit reached")

    member_count = await fetchrow(
        "SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = $1", invite["clan_id"],
    )
    if int(member_count["n"]) >= MAX_MEMBERS:
        raise HTTPException(status_code=400, detail=f"Clan is full (max {MAX_MEMBERS} members)")

    await execute(
        "INSERT INTO clan_members (clan_id, user_id, role) VALUES ($1, $2::uuid, 'member')",
        invite["clan_id"], user.id,
    )
    await execute("UPDATE clan_invites SET uses = uses + 1 WHERE id = $1", invite["id"])
    await grant_achievement(user.id, "clan_member")
    clan_row = await fetchrow("SELECT name, tag FROM clans WHERE id = $1", invite["clan_id"])
    if clan_row:
        await publish_activity(
            user.id, "clan_joined", {"name": clan_row["name"], "tag": clan_row["tag"]},
        )
    return await _clan_payload(invite["clan_id"])


@router.post("/leave")
async def leave_clan(user: AuthUser = Depends(get_current_user)):
    membership = await _membership(user.id)
    if not membership:
        raise HTTPException(status_code=404, detail="You are not in a clan")
    if membership["role"] == "owner":
        others = await fetchrow(
            "SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = $1 AND user_id != $2::uuid",
            membership["clan_id"], user.id,
        )
        if int(others["n"]) > 0:
            raise HTTPException(
                status_code=400,
                detail="Transfer ownership or kick all members before leaving, or disband the clan",
            )
        await execute("DELETE FROM clans WHERE id = $1", membership["clan_id"])
        return {"detail": "Clan disbanded"}

    await execute("DELETE FROM clan_members WHERE user_id = $1::uuid", user.id)
    return {"detail": "You left the clan"}


@router.post("/kick")
async def kick_member(body: MemberActionRequest, user: AuthUser = Depends(get_current_user)):
    membership = await _membership(user.id)
    if not _can_manage(membership):
        raise HTTPException(status_code=403, detail="Only clan owner or admin can kick")

    target = await fetchrow(
        "SELECT * FROM clan_members WHERE user_id = $1::uuid AND clan_id = $2",
        body.user_id, membership["clan_id"],
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in your clan")
    if target["role"] == "owner":
        raise HTTPException(status_code=403, detail="Cannot kick the clan owner")
    if target["role"] == "admin" and membership["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the owner can kick an admin")

    await execute("DELETE FROM clan_members WHERE id = $1", target["id"])
    return {"detail": "Member kicked"}


@router.post("/promote")
async def promote_member(body: MemberActionRequest, user: AuthUser = Depends(get_current_user)):
    membership = await _membership(user.id)
    if not membership or membership["role"] != "owner":
        raise HTTPException(status_code=403, detail="Only the clan owner can promote members")

    target = await fetchrow(
        "SELECT * FROM clan_members WHERE user_id = $1::uuid AND clan_id = $2",
        body.user_id, membership["clan_id"],
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found in your clan")

    new_role = "member" if target["role"] == "admin" else "admin"
    await execute("UPDATE clan_members SET role = $2 WHERE id = $1", target["id"], new_role)
    return {"detail": f"Member is now {new_role}"}
