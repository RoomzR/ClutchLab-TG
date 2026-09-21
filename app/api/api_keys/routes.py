"""API keys for ORGANIZATION plan: create, list, revoke + X-API-Key auth dependency."""

import hashlib
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from permissions import AuthUser, permissions_for_role, require_permission
from postgres_repo import execute, fetch, fetchrow

router = APIRouter(prefix="/api/keys", tags=["api-keys"])

api_access = require_permission("api.access")

MAX_KEYS = 10


class CreateKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=64)


def _hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


@router.get("")
async def list_keys(user: AuthUser = Depends(api_access)):
    rows = await fetch(
        """
        SELECT id, name, key_prefix, revoked, last_used_at, created_at
        FROM api_keys WHERE user_id = $1::uuid
        ORDER BY created_at DESC
        """,
        user.id,
    )
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "key_prefix": r["key_prefix"],
            "revoked": r["revoked"],
            "last_used_at": r["last_used_at"].isoformat() if r["last_used_at"] else None,
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


@router.post("")
async def create_key(body: CreateKeyRequest, user: AuthUser = Depends(api_access)):
    count = await fetchrow(
        "SELECT COUNT(*) AS n FROM api_keys WHERE user_id = $1::uuid AND NOT revoked",
        user.id,
    )
    if int(count["n"]) >= MAX_KEYS:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_KEYS} active keys allowed")

    raw = f"cs2a_{secrets.token_urlsafe(32)}"
    prefix = raw[:12]
    await execute(
        """
        INSERT INTO api_keys (user_id, name, key_prefix, key_hash)
        VALUES ($1::uuid, $2, $3, $4)
        """,
        user.id, body.name, prefix, _hash_key(raw),
    )
    # Full key is returned exactly once
    return {"key": raw, "key_prefix": prefix, "name": body.name}


@router.delete("/{key_id}")
async def revoke_key(key_id: str, user: AuthUser = Depends(api_access)):
    result = await execute(
        "UPDATE api_keys SET revoked = TRUE WHERE id = $1::uuid AND user_id = $2::uuid",
        key_id, user.id,
    )
    if result.endswith("0"):
        raise HTTPException(status_code=404, detail="Key not found")
    return {"detail": "Key revoked"}


async def get_api_key_user(request: Request) -> AuthUser | None:
    """Resolve an AuthUser from the X-API-Key header (for programmatic access)."""
    raw = request.headers.get("x-api-key")
    if not raw:
        return None
    row = await fetchrow(
        """
        SELECT ak.id, u.id AS user_id, u.role, u.is_active
        FROM api_keys ak
        JOIN users u ON u.id = ak.user_id
        WHERE ak.key_hash = $1 AND NOT ak.revoked
        """,
        _hash_key(raw),
    )
    if not row or not row["is_active"]:
        return None
    await execute("UPDATE api_keys SET last_used_at = NOW() WHERE id = $1", row["id"])
    role = str(row["role"])
    return AuthUser(id=str(row["user_id"]), role=role, permissions=permissions_for_role(role))
