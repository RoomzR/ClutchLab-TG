"""Gamification endpoints: XP/level, achievements, leaderboards."""

from fastapi import APIRouter, Depends, Query

from gamification import get_user_achievements, level_from_xp, level_progress
from permissions import AuthUser, get_current_user
from postgres_repo import fetch, fetchrow

router = APIRouter(prefix="/api", tags=["gamification"])


@router.get("/me/xp")
async def my_xp(user: AuthUser = Depends(get_current_user)):
    row = await fetchrow("SELECT xp FROM users WHERE id = $1::uuid", user.id)
    xp = int(row["xp"]) if row else 0
    recent = await fetch(
        """
        SELECT amount, reason, created_at FROM xp_events
        WHERE user_id = $1::uuid ORDER BY created_at DESC LIMIT 15
        """,
        user.id,
    )
    return {
        **level_progress(xp),
        "recent_events": [
            {
                "amount": r["amount"],
                "reason": r["reason"],
                "created_at": r["created_at"].isoformat(),
            }
            for r in recent
        ],
    }


@router.get("/me/achievements")
async def my_achievements(user: AuthUser = Depends(get_current_user)):
    achievements = await get_user_achievements(user.id)
    earned = [a for a in achievements if a["earned"]]
    return {
        "total": len(achievements),
        "earned_count": len(earned),
        "achievements": achievements,
    }


@router.get("/leaderboards")
async def leaderboards(board: str = Query("xp", pattern="^(xp|uploads|clans)$")):
    if board == "xp":
        rows = await fetch(
            """
            SELECT username, avatar_url, role, xp FROM users
            WHERE is_active AND xp > 0
            ORDER BY xp DESC LIMIT 50
            """
        )
        return {
            "board": "xp",
            "entries": [
                {
                    "rank": i + 1,
                    "username": r["username"],
                    "avatar_url": r["avatar_url"],
                    "role": r["role"],
                    "value": int(r["xp"]),
                    "level": level_from_xp(int(r["xp"])),
                }
                for i, r in enumerate(rows)
            ],
        }

    if board == "uploads":
        rows = await fetch(
            """
            SELECT u.username, u.avatar_url, u.role, COUNT(d.id)::int AS uploads
            FROM demo_usage d
            JOIN users u ON u.id = d.user_id
            WHERE d.uploaded_at >= date_trunc('month', NOW()) AND u.is_active
            GROUP BY u.id
            ORDER BY uploads DESC LIMIT 50
            """
        )
        return {
            "board": "uploads",
            "entries": [
                {
                    "rank": i + 1,
                    "username": r["username"],
                    "avatar_url": r["avatar_url"],
                    "role": r["role"],
                    "value": r["uploads"],
                    "level": None,
                }
                for i, r in enumerate(rows)
            ],
        }

    # clans: total XP of members
    rows = await fetch(
        """
        SELECT c.name, c.tag, c.logo_url,
               COUNT(cm.id)::int AS members,
               COALESCE(SUM(u.xp), 0)::int AS total_xp
        FROM clans c
        JOIN clan_members cm ON cm.clan_id = c.id
        JOIN users u ON u.id = cm.user_id
        GROUP BY c.id
        ORDER BY total_xp DESC LIMIT 50
        """
    )
    return {
        "board": "clans",
        "entries": [
            {
                "rank": i + 1,
                "username": f"[{r['tag']}] {r['name']}",
                "avatar_url": r["logo_url"],
                "role": f"{r['members']} members",
                "value": r["total_xp"],
                "level": None,
            }
            for i, r in enumerate(rows)
        ],
    }
