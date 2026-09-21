"""Seed verified demo accounts for every role (dev / staging only)."""

import logging

import asyncpg

from config import settings
from security import hash_password

logger = logging.getLogger(__name__)

# Same password for all demo accounts — override via DEMO_USER_PASSWORD env.
DEFAULT_DEMO_PASSWORD = "Demo2026!"

DEMO_ACCOUNTS: list[tuple[str, str, str]] = [
    ("FREE", "free@demo.clutchlab.gg", "demo_free"),
    ("PRO", "pro@demo.clutchlab.gg", "demo_pro"),
    ("TEAM", "team@demo.clutchlab.gg", "demo_team"),
    ("ORGANIZATION", "org@demo.clutchlab.gg", "demo_org"),
    ("ANALYST", "analyst@demo.clutchlab.gg", "demo_analyst"),
    ("COACH", "coach@demo.clutchlab.gg", "demo_coach"),
    ("ADMIN", "admin@demo.clutchlab.gg", "demo_admin"),
    ("SUPERADMIN", "superadmin@demo.clutchlab.gg", "demo_superadmin"),
]


async def seed_demo_users(pool: asyncpg.Pool) -> None:
    if not settings.seed_demo_users:
        return

    password = settings.demo_user_password or DEFAULT_DEMO_PASSWORD
    password_hash = hash_password(password)

    async with pool.acquire() as conn:
        for role, email, username in DEMO_ACCOUNTS:
            await conn.execute(
                """
                INSERT INTO users (email, username, password_hash, role, is_verified, is_active, xp)
                VALUES ($1, $2, $3, $4, TRUE, TRUE, 500)
                ON CONFLICT (email) DO UPDATE SET
                    username = EXCLUDED.username,
                    password_hash = EXCLUDED.password_hash,
                    role = EXCLUDED.role,
                    is_verified = TRUE,
                    is_active = TRUE
                """,
                email,
                username,
                password_hash,
                role,
            )

        # Demo clan owned by TEAM user for quick Team Hub testing.
        team_row = await conn.fetchrow(
            "SELECT id FROM users WHERE email = $1", "team@demo.clutchlab.gg",
        )
        if team_row:
            clan = await conn.fetchrow(
                "SELECT id FROM clans WHERE tag = $1", "DEMO",
            )
            if not clan:
                clan = await conn.fetchrow(
                    """
                    INSERT INTO clans (name, tag, description, owner_id)
                    VALUES ($1, $2, $3, $4::uuid)
                    RETURNING id
                    """,
                    "Demo Squad",
                    "DEMO",
                    "Seeded demo clan for testing Team features.",
                    str(team_row["id"]),
                )
            if clan:
                await conn.execute(
                    """
                    INSERT INTO clan_members (clan_id, user_id, role)
                    VALUES ($1::uuid, $2::uuid, 'owner')
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    str(clan["id"]),
                    str(team_row["id"]),
                )

    logger.info("Demo accounts seeded (password: %s)", password)
    for role, email, username in DEMO_ACCOUNTS:
        logger.info("  [%s] %s / %s", role, email, username)
