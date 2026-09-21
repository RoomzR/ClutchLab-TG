"""XP, levels, achievement awarding logic."""

import logging
import math

from postgres_repo import execute, fetch, fetchrow

logger = logging.getLogger(__name__)

XP_PER_UPLOAD = 50
XP_PER_REFERRAL_SIGNUP = 100

# Level curve: level N requires 100 * (N-1)^2 total XP.
# L1=0, L2=100, L3=400, L4=900, L5=1600 ...


def level_from_xp(xp: int) -> int:
    return int(math.floor(math.sqrt(max(0, xp) / 100))) + 1


def xp_for_level(level: int) -> int:
    return 100 * (level - 1) ** 2


def level_progress(xp: int) -> dict:
    level = level_from_xp(xp)
    current_floor = xp_for_level(level)
    next_floor = xp_for_level(level + 1)
    span = next_floor - current_floor
    return {
        "level": level,
        "xp": xp,
        "xp_into_level": xp - current_floor,
        "xp_for_next_level": span,
        "progress_percent": round((xp - current_floor) / span * 100, 1) if span else 100,
    }


async def award_xp(user_id: str, amount: int, reason: str) -> None:
    from social import publish_activity

    before = await fetchrow("SELECT xp FROM users WHERE id = $1::uuid", user_id)
    await execute(
        "INSERT INTO xp_events (user_id, amount, reason) VALUES ($1::uuid, $2, $3)",
        user_id, amount, reason,
    )
    await execute(
        "UPDATE users SET xp = xp + $2 WHERE id = $1::uuid", user_id, amount,
    )
    if before is not None:
        old_level = level_from_xp(int(before["xp"]))
        new_level = level_from_xp(int(before["xp"]) + amount)
        if new_level > old_level:
            await publish_activity(user_id, "level_up", {"level": new_level})


async def grant_achievement(user_id: str, code: str) -> dict | None:
    """Grant an achievement once; returns the achievement dict when newly earned."""
    from social import publish_activity

    inserted = await fetchrow(
        """
        INSERT INTO user_achievements (user_id, achievement_code)
        VALUES ($1::uuid, $2)
        ON CONFLICT (user_id, achievement_code) DO NOTHING
        RETURNING id
        """,
        user_id, code,
    )
    if not inserted:
        return None
    achievement = await fetchrow("SELECT * FROM achievements WHERE code = $1", code)
    if achievement:
        await award_xp(user_id, achievement["xp_reward"], f"achievement:{code}")
        await publish_activity(
            user_id,
            "achievement",
            {"code": code, "name": achievement["name"], "tier": achievement["tier"]},
        )
        return dict(achievement)
    return None


async def check_upload_achievements(user_id: str) -> list[dict]:
    """Evaluate upload-count and streak achievements; returns newly earned ones."""
    earned: list[dict] = []

    counts = await fetchrow(
        """
        SELECT COUNT(*) AS total,
               COUNT(DISTINCT uploaded_at::date) AS active_days
        FROM demo_usage WHERE user_id = $1::uuid
        """,
        user_id,
    )
    total = int(counts["total"]) if counts else 0
    days = int(counts["active_days"]) if counts else 0

    thresholds = [
        (1, "first_upload"),
        (10, "uploads_10"),
        (50, "uploads_50"),
        (100, "uploads_100"),
    ]
    for needed, code in thresholds:
        if total >= needed:
            result = await grant_achievement(user_id, code)
            if result:
                earned.append(result)

    for needed, code in [(3, "streak_3"), (7, "streak_7")]:
        if days >= needed:
            result = await grant_achievement(user_id, code)
            if result:
                earned.append(result)

    return earned


async def check_referral_achievements(referrer_id: str) -> list[dict]:
    earned: list[dict] = []
    row = await fetchrow(
        "SELECT uses FROM referral_codes WHERE user_id = $1::uuid", referrer_id,
    )
    uses = int(row["uses"]) if row else 0
    if uses >= 1:
        result = await grant_achievement(referrer_id, "referral_1")
        if result:
            earned.append(result)
    if uses >= 5:
        result = await grant_achievement(referrer_id, "referral_5")
        if result:
            earned.append(result)
    return earned


async def get_user_achievements(user_id: str) -> list[dict]:
    rows = await fetch(
        """
        SELECT a.code, a.name, a.description, a.icon, a.xp_reward, a.tier, ua.earned_at
        FROM achievements a
        LEFT JOIN user_achievements ua
            ON ua.achievement_code = a.code AND ua.user_id = $1::uuid
        ORDER BY a.xp_reward
        """,
        user_id,
    )
    return [
        {
            "code": r["code"],
            "name": r["name"],
            "description": r["description"],
            "icon": r["icon"],
            "xp_reward": r["xp_reward"],
            "tier": r["tier"],
            "earned": r["earned_at"] is not None,
            "earned_at": r["earned_at"].isoformat() if r["earned_at"] else None,
        }
        for r in rows
    ]
