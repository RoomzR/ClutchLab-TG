"""Admin endpoints: platform stats, user management, promo codes."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from permissions import ROLES, AuthUser, require_role
from postgres_repo import execute, fetch, fetchrow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])

admin_only = require_role("ADMIN", "SUPERADMIN")


class ChangeRoleRequest(BaseModel):
    user_id: str
    role: str


class SetActiveRequest(BaseModel):
    user_id: str
    is_active: bool


class CreatePromoRequest(BaseModel):
    code: str = Field(min_length=3, max_length=32)
    discount_percent: int = Field(ge=1, le=100)
    max_uses: int = Field(default=100, ge=1)
    plan_type: str | None = None
    expires_at: datetime | None = None


class GrantDemosRequest(BaseModel):
    user_id: str
    amount: int = Field(ge=1, le=1000)
    reason: str = "admin_grant"


class SetProRequest(BaseModel):
    is_pro: bool


@router.patch("/matches/{match_id}/pro")
async def set_match_pro(
    match_id: str, body: SetProRequest, user: AuthUser = Depends(require_role("ADMIN", "SUPERADMIN")),
):
    """Mark a parsed match as a pro demo — it becomes available for pro comparison."""
    row = await fetchrow("SELECT match_id, status FROM matches WHERE match_id = $1", match_id)
    if not row:
        raise HTTPException(status_code=404, detail="Match not found")
    if body.is_pro and row["status"] != "ready":
        raise HTTPException(status_code=400, detail="Match must be fully parsed first")
    await execute("UPDATE matches SET is_pro = $2 WHERE match_id = $1", match_id, body.is_pro)
    return {"detail": f"Match {'marked as pro' if body.is_pro else 'unmarked'}"}


@router.get("/stats")
async def platform_stats(user: AuthUser = Depends(admin_only)):
    users_row = await fetchrow(
        """
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE created_at >= NOW() - interval '7 days')::int AS new_week,
               COUNT(*) FILTER (WHERE is_verified)::int AS verified
        FROM users
        """
    )
    subs = await fetch(
        """
        SELECT plan_type, COUNT(*)::int AS n FROM subscriptions
        WHERE status IN ('active', 'trialing') GROUP BY plan_type
        """
    )
    demos_row = await fetchrow(
        """
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE uploaded_at >= date_trunc('month', NOW()))::int AS this_month
        FROM demo_usage
        """
    )
    matches_row = await fetchrow(
        """
        SELECT COUNT(*)::int AS total,
               COUNT(*) FILTER (WHERE status = 'ready')::int AS ready,
               COUNT(*) FILTER (WHERE status = 'error')::int AS failed
        FROM matches
        """
    )
    revenue_row = await fetchrow(
        """
        SELECT COALESCE(SUM(amount), 0) AS total,
               COALESCE(SUM(amount) FILTER (WHERE created_at >= date_trunc('month', NOW())), 0) AS this_month
        FROM payments WHERE status = 'succeeded'
        """
    )
    return {
        "users": dict(users_row) if users_row else {},
        "subscriptions": {r["plan_type"]: r["n"] for r in subs},
        "demo_uploads": dict(demos_row) if demos_row else {},
        "matches": dict(matches_row) if matches_row else {},
        "revenue": {
            "total": float(revenue_row["total"]) if revenue_row else 0,
            "this_month": float(revenue_row["this_month"]) if revenue_row else 0,
        },
    }


@router.get("/users")
async def list_users(
    search: str = Query("", max_length=100),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    user: AuthUser = Depends(admin_only),
):
    pattern = f"%{search}%" if search else "%"
    rows = await fetch(
        """
        SELECT id, email, username, role, is_active, is_verified, xp,
               last_login_at, created_at
        FROM users
        WHERE email ILIKE $1 OR username ILIKE $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        """,
        pattern, limit, offset,
    )
    return [
        {
            "id": str(r["id"]),
            "email": r["email"],
            "username": r["username"],
            "role": r["role"],
            "is_active": r["is_active"],
            "is_verified": r["is_verified"],
            "xp": int(r["xp"]),
            "last_login_at": r["last_login_at"].isoformat() if r["last_login_at"] else None,
            "created_at": r["created_at"].isoformat(),
        }
        for r in rows
    ]


@router.post("/users/role")
async def change_role(body: ChangeRoleRequest, user: AuthUser = Depends(admin_only)):
    if body.role not in ROLES:
        raise HTTPException(status_code=422, detail=f"Unknown role: {body.role}")
    if body.role == "SUPERADMIN" and user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Only SUPERADMIN can grant SUPERADMIN")

    target = await fetchrow("SELECT role FROM users WHERE id = $1::uuid", body.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] == "SUPERADMIN" and user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Cannot modify a SUPERADMIN")

    await execute(
        "UPDATE users SET role = $2, updated_at = NOW() WHERE id = $1::uuid",
        body.user_id, body.role,
    )
    return {"detail": f"Role changed to {body.role}"}


@router.post("/users/active")
async def set_active(body: SetActiveRequest, user: AuthUser = Depends(admin_only)):
    target = await fetchrow("SELECT role FROM users WHERE id = $1::uuid", body.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target["role"] in ("ADMIN", "SUPERADMIN") and user.role != "SUPERADMIN":
        raise HTTPException(status_code=403, detail="Cannot deactivate an admin")

    await execute(
        "UPDATE users SET is_active = $2, updated_at = NOW() WHERE id = $1::uuid",
        body.user_id, body.is_active,
    )
    if not body.is_active:
        await execute(
            "UPDATE refresh_tokens SET revoked = TRUE WHERE user_id = $1::uuid", body.user_id,
        )
    return {"detail": "User updated"}


@router.post("/users/grant-demos")
async def grant_demos(body: GrantDemosRequest, user: AuthUser = Depends(admin_only)):
    target = await fetchrow("SELECT id FROM users WHERE id = $1::uuid", body.user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    await execute(
        "INSERT INTO demo_bonuses (user_id, amount, reason) VALUES ($1::uuid, $2, $3)",
        body.user_id, body.amount, body.reason,
    )
    return {"detail": f"Granted {body.amount} bonus demos"}


@router.get("/promo")
async def list_promo_codes(user: AuthUser = Depends(admin_only)):
    rows = await fetch("SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 100")
    return [
        {
            "id": str(r["id"]),
            "code": r["code"],
            "discount_percent": r["discount_percent"],
            "max_uses": r["max_uses"],
            "current_uses": r["current_uses"],
            "plan_type": r["plan_type"],
            "expires_at": r["expires_at"].isoformat() if r["expires_at"] else None,
        }
        for r in rows
    ]


@router.post("/promo")
async def create_promo(body: CreatePromoRequest, user: AuthUser = Depends(admin_only)):
    code = body.code.strip().upper()
    existing = await fetchrow("SELECT id FROM promo_codes WHERE code = $1", code)
    if existing:
        raise HTTPException(status_code=409, detail="Promo code already exists")

    expires = body.expires_at
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)

    await execute(
        """
        INSERT INTO promo_codes (code, discount_percent, max_uses, plan_type, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        """,
        code, body.discount_percent, body.max_uses, body.plan_type, expires,
    )
    return {"detail": f"Promo {code} created"}


@router.delete("/promo/{promo_id}")
async def delete_promo(promo_id: str, user: AuthUser = Depends(admin_only)):
    await execute("DELETE FROM promo_codes WHERE id = $1::uuid", promo_id)
    return {"detail": "Promo deleted"}
