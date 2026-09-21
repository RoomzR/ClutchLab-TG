"""Roles, permission matrix, quota limits, FastAPI auth dependencies."""

from dataclasses import dataclass
from typing import Any

from fastapi import Depends, HTTPException, Request

from security import decode_access_token

ROLES = ["FREE", "PRO", "TEAM", "ORGANIZATION", "ANALYST", "COACH", "ADMIN", "SUPERADMIN"]

# Permission matrix per role. Higher tiers include lower-tier permissions.
_FREE = [
    "demo.upload",
    "heatmap.basic",
    "positions.view_own",
    "grenades.basic",
    "report.export",
]
_PRO = _FREE + [
    "heatmap.full",
    "players.compare",
    "grenades.trajectories",
    "habits.analysis",
    "smokes.heatmap",
    "report.export_unlimited",
    "matches.history",
    "matches.compare",
    "queue.priority",
]
_TEAM = _PRO + [
    "team.manage",
    "team.analytics",
    "team.share_reports",
    "team.dashboard",
]
_ORG = _TEAM + [
    "api.access",
    "webhooks.manage",
    "reports.custom",
    "sso.use",
]
_ANALYST_EXTRA = [
    "ai.tactics",
    "ai.predicted_positions",
    "pro.compare",
    "patterns.global",
    "breakdowns.create",
]
_COACH_EXTRA = [
    "training.plans",
    "training.progress",
    "breakdowns.team",
    "voice_notes.record",
]
_ADMIN = _ORG + _ANALYST_EXTRA + _COACH_EXTRA + [
    "admin.users",
    "admin.subscriptions",
    "admin.promo",
]

ROLE_PERMISSIONS: dict[str, list[str]] = {
    "FREE": _FREE,
    "PRO": _PRO,
    "TEAM": _TEAM,
    "ORGANIZATION": _ORG,
    "ANALYST": _PRO + _ANALYST_EXTRA,
    "COACH": _PRO + _COACH_EXTRA,
    "ADMIN": _ADMIN,
    "SUPERADMIN": _ADMIN + ["admin.super"],
}

# Monthly demo quota and max upload size per role.
ROLE_LIMITS: dict[str, dict[str, int]] = {
    "FREE": {"max_demos": 3, "max_file_mb": 200},
    "PRO": {"max_demos": 50, "max_file_mb": 600},
    "TEAM": {"max_demos": 200, "max_file_mb": 600},
    "ORGANIZATION": {"max_demos": 1000, "max_file_mb": 600},
    "ANALYST": {"max_demos": 50, "max_file_mb": 600},
    "COACH": {"max_demos": 50, "max_file_mb": 600},
    "ADMIN": {"max_demos": 100000, "max_file_mb": 2048},
    "SUPERADMIN": {"max_demos": 100000, "max_file_mb": 2048},
}


def permissions_for_role(role: str) -> list[str]:
    return ROLE_PERMISSIONS.get(role, _FREE)


def limits_for_role(role: str) -> dict[str, int]:
    return ROLE_LIMITS.get(role, ROLE_LIMITS["FREE"])


@dataclass
class AuthUser:
    id: str
    role: str
    permissions: list[str]

    def has(self, permission: str) -> bool:
        return permission in self.permissions


def _extract_bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


async def get_current_user(request: Request) -> AuthUser:
    """Dependency: requires a valid access token."""
    token = _extract_bearer(request)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    payload = decode_access_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return AuthUser(
        id=str(payload["sub"]),
        role=str(payload.get("role", "FREE")),
        permissions=list(payload.get("permissions", [])),
    )


async def get_optional_user(request: Request) -> AuthUser | None:
    """Dependency: returns user when a valid token is present, else None."""
    token = _extract_bearer(request)
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    return AuthUser(
        id=str(payload["sub"]),
        role=str(payload.get("role", "FREE")),
        permissions=list(payload.get("permissions", [])),
    )


def require_permission(permission: str) -> Any:
    """Dependency factory: 403 unless the user's role grants the permission."""

    async def checker(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if not user.has(permission):
            raise HTTPException(
                status_code=403,
                detail=f"Your plan does not include this feature ({permission}). Upgrade to unlock it.",
            )
        return user

    return checker


def require_role(*roles: str) -> Any:
    """Dependency factory: 403 unless the user has one of the given roles."""

    async def checker(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user

    return checker
