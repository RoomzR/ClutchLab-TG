"""Weekly digest: per-user activity summary emailed every Monday."""

import asyncio
import logging
from datetime import datetime, time, timedelta, timezone

from services.notifications.email import _BTN_STYLE, _send, _wrap
from config import settings
from postgres_repo import execute, fetch, fetchrow

logger = logging.getLogger(__name__)

CHECK_INTERVAL_SECONDS = 3600  # hourly check; sends once per week


async def _build_user_digest(user_id: str, week_start: datetime) -> dict | None:
    uploads = await fetchrow(
        """
        SELECT COUNT(*)::int AS n FROM demo_usage
        WHERE user_id = $1::uuid AND uploaded_at >= $2
        """,
        user_id, week_start,
    )
    xp = await fetchrow(
        """
        SELECT COALESCE(SUM(amount), 0)::int AS n FROM xp_events
        WHERE user_id = $1::uuid AND created_at >= $2
        """,
        user_id, week_start,
    )
    achievements = await fetch(
        """
        SELECT a.name FROM user_achievements ua
        JOIN achievements a ON a.code = ua.achievement_code
        WHERE ua.user_id = $1::uuid AND ua.earned_at >= $2
        """,
        user_id, week_start,
    )
    stats = {
        "uploads": int(uploads["n"]),
        "xp": int(xp["n"]),
        "achievements": [r["name"] for r in achievements],
    }
    if stats["uploads"] == 0 and stats["xp"] == 0 and not stats["achievements"]:
        return None
    return stats


async def send_weekly_digests() -> int:
    """Send a digest to every active, verified user with weekly activity."""
    now = datetime.now(timezone.utc)
    week_start = datetime.combine(
        (now - timedelta(days=now.weekday() + 7)).date(), time.min, tzinfo=timezone.utc,
    )

    users = await fetch(
        "SELECT id, email, username FROM users WHERE is_active AND is_verified",
    )
    sent = 0
    for user in users:
        try:
            stats = await _build_user_digest(str(user["id"]), week_start)
            if stats is None:
                continue
            achievements_html = (
                "".join(f"<li>{name}</li>" for name in stats["achievements"])
                if stats["achievements"]
                else "<li>No new achievements — this week is your chance!</li>"
            )
            html = _wrap(
                "Your week on ClutchLab",
                f"""
                <p>Hey {user['username']}, here's your weekly recap:</p>
                <ul style="line-height:1.9">
                  <li><b>{stats['uploads']}</b> demos analyzed</li>
                  <li><b>{stats['xp']}</b> XP earned</li>
                </ul>
                <p style="margin-top:12px"><b>New achievements:</b></p>
                <ul style="line-height:1.8">{achievements_html}</ul>
                <a href="{settings.frontend_base_url}/dashboard" style="{_BTN_STYLE}">Open Dashboard</a>
                """,
            )
            if await _send(user["email"], "Your weekly recap — ClutchLab", html):
                sent += 1
        except Exception as exc:
            logger.warning("Digest failed for %s: %s", user["email"], exc)
    return sent


async def weekly_digest_loop() -> None:
    """Runs in the API process; fires on Mondays, deduplicated via digest_log."""
    while True:
        try:
            now = datetime.now(timezone.utc)
            if now.weekday() == 0 and now.hour >= 9:
                week_start = (now - timedelta(days=now.weekday())).date()
                claimed = await fetchrow(
                    """
                    INSERT INTO digest_log (week_start) VALUES ($1)
                    ON CONFLICT (week_start) DO NOTHING
                    RETURNING id
                    """,
                    week_start,
                )
                if claimed:
                    sent = await send_weekly_digests()
                    await execute(
                        "UPDATE digest_log SET recipients = $2 WHERE id = $1",
                        claimed["id"], sent,
                    )
                    logger.info("Weekly digest sent to %d users", sent)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Weekly digest loop error")
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
