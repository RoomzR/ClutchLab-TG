import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Sequence

import asyncpg

from config import settings

logger = logging.getLogger(__name__)

_pool: asyncpg.Pool | None = None
MAX_RETRIES = 3
RETRY_DELAY = 1.0


async def init_pool() -> asyncpg.Pool:
    global _pool
    if _pool is not None:
        return _pool

    last_error: Exception | None = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            _pool = await asyncpg.create_pool(
                dsn=settings.database_url,
                min_size=5,
                max_size=20,
                command_timeout=30,
                timeout=30,
            )
            await _ensure_schema(_pool)
            logger.info("PostgreSQL pool initialized")
            return _pool
        except Exception as exc:
            last_error = exc
            logger.warning("DB connection attempt %s failed: %s", attempt, exc)
            await asyncio.sleep(RETRY_DELAY * attempt)

    raise RuntimeError(f"Failed to connect to database: {last_error}")


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


@asynccontextmanager
async def acquire() -> AsyncIterator[asyncpg.Connection]:
    pool = await init_pool()
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            async with pool.acquire() as conn:
                yield conn
                return
        except (asyncpg.PostgresConnectionError, asyncpg.InterfaceError) as exc:
            logger.warning("Connection retry %s: %s", attempt, exc)
            await asyncio.sleep(RETRY_DELAY * attempt)
    raise RuntimeError("Could not acquire database connection")


async def _ensure_schema(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS matches (
                match_id TEXT PRIMARY KEY,
                map_name TEXT,
                score_t INT DEFAULT 0,
                score_ct INT DEFAULT 0,
                team_t_name TEXT DEFAULT 'Terrorists',
                team_ct_name TEXT DEFAULT 'Counter-Terrorists',
                tick_rate REAL DEFAULT 64,
                status TEXT DEFAULT 'pending',
                progress INT DEFAULT 0,
                message TEXT,
                file_path TEXT,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS players (
                id SERIAL PRIMARY KEY,
                match_id TEXT REFERENCES matches(match_id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                team TEXT NOT NULL,
                steam_id TEXT,
                crosshair_code TEXT
            );

            CREATE TABLE IF NOT EXISTS rounds (
                id SERIAL PRIMARY KEY,
                match_id TEXT REFERENCES matches(match_id) ON DELETE CASCADE,
                round_number INT,
                winner TEXT,
                win_type TEXT,
                duration_seconds FLOAT,
                start_tick INT,
                end_tick INT,
                winner_team TEXT
            );

            CREATE TABLE IF NOT EXISTS positions (
                id BIGSERIAL PRIMARY KEY,
                match_id TEXT,
                tick INT,
                player_name TEXT,
                team TEXT,
                x FLOAT, y FLOAT, z FLOAT,
                round_number INT,
                yaw FLOAT
            );

            CREATE TABLE IF NOT EXISTS grenades (
                id BIGSERIAL PRIMARY KEY,
                match_id TEXT,
                grenade_type TEXT,
                player_name TEXT,
                team TEXT,
                from_x FLOAT, from_y FLOAT, from_z FLOAT,
                to_x FLOAT, to_y FLOAT, to_z FLOAT,
                tick INT,
                round_number INT
            );

            CREATE TABLE IF NOT EXISTS kills (
                id BIGSERIAL PRIMARY KEY,
                match_id TEXT,
                tick INT,
                killer TEXT,
                victim TEXT,
                weapon TEXT,
                headshot BOOLEAN,
                round_number INT
            );

            CREATE TABLE IF NOT EXISTS purchases (
                id BIGSERIAL PRIMARY KEY,
                match_id TEXT,
                player_name TEXT,
                tick INT,
                round_number INT,
                item TEXT,
                cost INT DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS bomb_events (
                id BIGSERIAL PRIMARY KEY,
                match_id TEXT,
                event_type TEXT,
                tick INT,
                round_number INT,
                site TEXT,
                player_name TEXT,
                x FLOAT,
                y FLOAT
            );

            CREATE TABLE IF NOT EXISTS round_pauses (
                id BIGSERIAL PRIMARY KEY,
                match_id TEXT REFERENCES matches(match_id) ON DELETE CASCADE,
                round_number INT,
                start_tick INT,
                end_tick INT,
                pause_type TEXT
            );
            """
        )
        await conn.execute(
            """
            ALTER TABLE matches ADD COLUMN IF NOT EXISTS tick_rate REAL DEFAULT 64;
            ALTER TABLE matches ADD COLUMN IF NOT EXISTS position_tick_step INT DEFAULT 2;
            ALTER TABLE rounds ADD COLUMN IF NOT EXISTS start_tick INT;
            ALTER TABLE rounds ADD COLUMN IF NOT EXISTS end_tick INT;
            ALTER TABLE rounds ADD COLUMN IF NOT EXISTS winner_team TEXT;
            ALTER TABLE rounds ADD COLUMN IF NOT EXISTS freeze_end_tick INT;
            ALTER TABLE positions ADD COLUMN IF NOT EXISTS yaw FLOAT;
            ALTER TABLE positions ADD COLUMN IF NOT EXISTS health INT;
            ALTER TABLE positions ADD COLUMN IF NOT EXISTS armor INT;
            ALTER TABLE positions ADD COLUMN IF NOT EXISTS pitch FLOAT;
            ALTER TABLE positions ADD COLUMN IF NOT EXISTS weapon TEXT;
            ALTER TABLE positions ADD COLUMN IF NOT EXISTS scoped BOOLEAN DEFAULT FALSE;
            ALTER TABLE players ADD COLUMN IF NOT EXISTS crosshair_code TEXT;
            """
        )


async def bulk_copy(
    table: str,
    columns: Sequence[str],
    records: Sequence[Sequence[Any]],
) -> None:
    if not records:
        return

    async with acquire() as conn:
        await conn.copy_records_to_table(
            table,
            records=records,
            columns=list(columns),
        )


async def execute(query: str, *args: Any) -> str:
    async with acquire() as conn:
        return await conn.execute(query, *args)


async def fetch(query: str, *args: Any) -> list[asyncpg.Record]:
    async with acquire() as conn:
        return await conn.fetch(query, *args)


async def fetchrow(query: str, *args: Any) -> asyncpg.Record | None:
    async with acquire() as conn:
        return await conn.fetchrow(query, *args)


async def cleanup_old_matches(retention_days: int) -> list[str]:
    rows = await fetch(
        """
        SELECT match_id, file_path FROM matches
        WHERE created_at < NOW() - make_interval(days => $1)
        """,
        retention_days,
    )
    match_ids = [str(row["match_id"]) for row in rows]
    for mid in match_ids:
        await execute("DELETE FROM matches WHERE match_id = $1", mid)
    return match_ids
