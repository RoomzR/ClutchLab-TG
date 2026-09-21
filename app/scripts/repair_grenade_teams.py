"""Repair grenades.team to the thrower's side at (or before) grenade tick.

Uses positions as source of truth so T/CT filters match the map at throw time,
including after half-time side swaps.
"""

from __future__ import annotations

import asyncio
import os
import sys

import asyncpg


DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://cs2:cs2@db:5432/cs2_analyzer",
)


async def repair_match(conn: asyncpg.Connection, match_id: str) -> tuple[int, int]:
    rows = await conn.fetch(
        """
        SELECT player_name, tick, team
        FROM positions
        WHERE match_id = $1
        ORDER BY player_name, tick
        """,
        match_id,
    )
    tracks: dict[str, list[tuple[int, str]]] = {}
    for row in rows:
        tracks.setdefault(row["player_name"], []).append((row["tick"], row["team"]))

    grenades = await conn.fetch(
        """
        SELECT id, player_name, tick, team
        FROM grenades
        WHERE match_id = $1
        """,
        match_id,
    )

    def team_at(player: str, tick: int) -> str | None:
        track = tracks.get(player)
        if not track:
            return None
        best: str | None = None
        for t, team in track:
            if t <= tick:
                best = team
            else:
                break
        return best

    updates: list[tuple[str, int]] = []
    for g in grenades:
        correct = team_at(g["player_name"], g["tick"])
        if correct and correct != g["team"]:
            updates.append((correct, g["id"]))

    if updates:
        await conn.executemany(
            "UPDATE grenades SET team = $1 WHERE id = $2",
            updates,
        )
    return len(updates), len(grenades)


async def main() -> int:
    match_filter = sys.argv[1] if len(sys.argv) > 1 else None
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        if match_filter:
            match_ids = [match_filter]
        else:
            match_ids = [
                r["match_id"]
                for r in await conn.fetch("SELECT match_id FROM matches ORDER BY created_at")
            ]

        total_fixed = 0
        total_rows = 0
        for match_id in match_ids:
            fixed, rows = await repair_match(conn, match_id)
            total_fixed += fixed
            total_rows += rows
            print(f"{match_id}: fixed {fixed}/{rows}")

        print(f"Done. Fixed {total_fixed}/{total_rows} grenades across {len(match_ids)} matches.")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
