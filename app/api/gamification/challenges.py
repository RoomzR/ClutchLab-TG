"""Weekly challenges: deterministic weekly rotation, live progress, claimable rewards."""

import hashlib
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from gamification import award_xp
from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetch, fetchrow

router = APIRouter(prefix="/api/challenges", tags=["challenges"])

# Challenge pool. metric: uploads | map_uploads | xp | days_active
CHALLENGE_POOL: list[dict] = [
    {
        "code": "upload_3",
        "name": "Demo Machine",
        "description": "Upload 3 demos this week",
        "metric": "uploads",
        "target": 3,
        "reward_xp": 200,
        "reward_demos": 2,
    },
    {
        "code": "upload_5",
        "name": "Grind Week",
        "description": "Upload 5 demos this week",
        "metric": "uploads",
        "target": 5,
        "reward_xp": 350,
        "reward_demos": 3,
    },
    {
        "code": "mirage_2",
        "name": "Mirage Specialist",
        "description": "Upload 2 demos on Mirage this week",
        "metric": "map_uploads",
        "map": "de_mirage",
        "target": 2,
        "reward_xp": 250,
        "reward_demos": 2,
    },
    {
        "code": "dust2_2",
        "name": "Dust Devil",
        "description": "Upload 2 demos on Dust II this week",
        "metric": "map_uploads",
        "map": "de_dust2",
        "target": 2,
        "reward_xp": 250,
        "reward_demos": 2,
    },
    {
        "code": "inferno_2",
        "name": "Banana Control",
        "description": "Upload 2 demos on Inferno this week",
        "metric": "map_uploads",
        "map": "de_inferno",
        "target": 2,
        "reward_xp": 250,
        "reward_demos": 2,
    },
    {
        "code": "xp_300",
        "name": "XP Hunter",
        "description": "Earn 300 XP this week",
        "metric": "xp",
        "target": 300,
        "reward_xp": 150,
        "reward_demos": 1,
    },
    {
        "code": "active_3",
        "name": "Stay Sharp",
        "description": "Be active on 3 different days this week",
        "metric": "days_active",
        "target": 3,
        "reward_xp": 200,
        "reward_demos": 1,
    },
    {
        "code": "ancient_2",
        "name": "Temple Runner",
        "description": "Upload 2 demos on Ancient this week",
        "metric": "map_uploads",
        "map": "de_ancient",
        "target": 2,
        "reward_xp": 250,
        "reward_demos": 2,
    },
]

CHALLENGES_PER_WEEK = 3


def current_week_start(now: datetime | None = None) -> date:
    now = now or datetime.now(timezone.utc)
    return (now - timedelta(days=now.weekday())).date()


def challenges_for_week(week_start: date) -> list[dict]:
    """Deterministically pick weekly challenges so all users see the same set."""
    seed = hashlib.sha256(week_start.isoformat().encode()).digest()
    indexed = sorted(
        range(len(CHALLENGE_POOL)),
        key=lambda i: hashlib.sha256(seed + bytes([i])).digest(),
    )
    return [CHALLENGE_POOL[i] for i in indexed[:CHALLENGES_PER_WEEK]]


async def _progress(user_id: str, challenge: dict, week_start: date) -> int:
    start_dt = datetime.combine(week_start, time.min, tzinfo=timezone.utc)
    metric = challenge["metric"]

    if metric == "uploads":
        row = await fetchrow(
            "SELECT COUNT(*) AS n FROM demo_usage WHERE user_id = $1::uuid AND uploaded_at >= $2",
            user_id, start_dt,
        )
        return int(row["n"])

    if metric == "map_uploads":
        row = await fetchrow(
            """
            SELECT COUNT(*) AS n FROM demo_usage d
            JOIN matches m ON m.match_id = d.match_id
            WHERE d.user_id = $1::uuid AND d.uploaded_at >= $2 AND m.map_name = $3
            """,
            user_id, start_dt, challenge["map"],
        )
        return int(row["n"])

    if metric == "xp":
        row = await fetchrow(
            """
            SELECT COALESCE(SUM(amount), 0) AS n FROM xp_events
            WHERE user_id = $1::uuid AND created_at >= $2
            """,
            user_id, start_dt,
        )
        return int(row["n"])

    if metric == "days_active":
        row = await fetchrow(
            """
            SELECT COUNT(DISTINCT created_at::date) AS n FROM xp_events
            WHERE user_id = $1::uuid AND created_at >= $2
            """,
            user_id, start_dt,
        )
        return int(row["n"])

    return 0


@router.get("/current")
async def current_challenges(user: AuthUser = Depends(get_current_user)):
    week_start = current_week_start()
    week_end = week_start + timedelta(days=7)
    challenges = challenges_for_week(week_start)

    claimed_rows = await fetch(
        """
        SELECT challenge_code FROM user_challenges
        WHERE user_id = $1::uuid AND week_start = $2
        """,
        user.id, week_start,
    )
    claimed = {r["challenge_code"] for r in claimed_rows}

    result = []
    for challenge in challenges:
        progress = await _progress(user.id, challenge, week_start)
        result.append(
            {
                "code": challenge["code"],
                "name": challenge["name"],
                "description": challenge["description"],
                "target": challenge["target"],
                "progress": min(progress, challenge["target"]),
                "completed": progress >= challenge["target"],
                "claimed": challenge["code"] in claimed,
                "reward_xp": challenge["reward_xp"],
                "reward_demos": challenge["reward_demos"],
            }
        )

    now = datetime.now(timezone.utc)
    ends_at = datetime.combine(week_end, time.min, tzinfo=timezone.utc)
    return {
        "week_start": week_start.isoformat(),
        "ends_in_hours": max(0, int((ends_at - now).total_seconds() // 3600)),
        "challenges": result,
    }


@router.post("/{code}/claim")
async def claim_challenge(code: str, user: AuthUser = Depends(get_current_user)):
    week_start = current_week_start()
    challenge = next(
        (c for c in challenges_for_week(week_start) if c["code"] == code), None,
    )
    if not challenge:
        raise HTTPException(status_code=404, detail="Challenge is not active this week")

    progress = await _progress(user.id, challenge, week_start)
    if progress < challenge["target"]:
        raise HTTPException(
            status_code=400,
            detail=f"Challenge not completed yet ({progress}/{challenge['target']})",
        )

    inserted = await fetchrow(
        """
        INSERT INTO user_challenges (user_id, challenge_code, week_start)
        VALUES ($1::uuid, $2, $3)
        ON CONFLICT (user_id, challenge_code, week_start) DO NOTHING
        RETURNING id
        """,
        user.id, code, week_start,
    )
    if not inserted:
        raise HTTPException(status_code=400, detail="Reward already claimed")

    await award_xp(user.id, challenge["reward_xp"], f"challenge:{code}")
    if challenge["reward_demos"] > 0:
        await execute(
            "INSERT INTO demo_bonuses (user_id, amount, reason) VALUES ($1::uuid, $2, $3)",
            user.id, challenge["reward_demos"], f"challenge:{code}",
        )
    return {
        "detail": f"Claimed! +{challenge['reward_xp']} XP, +{challenge['reward_demos']} bonus demos",
        "reward_xp": challenge["reward_xp"],
        "reward_demos": challenge["reward_demos"],
    }
