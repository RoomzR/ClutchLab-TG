"""Homework verification: did the metric attached to a homework improve on matches
played after it was assigned? Also aggregates player counters across matches."""

from __future__ import annotations

import json
import logging
from collections import Counter
from typing import Any

from postgres_repo import execute, fetch
from services.analytics.metrics_registry import derive

logger = logging.getLogger(__name__)

MIN_MATCHES_TO_VERIFY = 2


def _passes(value: float | None, op: str | None, threshold: float | None) -> bool | None:
    if value is None or threshold is None or not op:
        return None
    return value >= threshold if op == ">=" else value <= threshold


def sum_counters(rows: list[dict[str, Any]]) -> dict[str, float]:
    total: Counter = Counter()
    for r in rows:
        c = r["counters"]
        if isinstance(c, str):
            c = json.loads(c)
        for k, v in c.items():
            if isinstance(v, (int, float)):
                total[k] += v
    return dict(total)


async def verify_player_homework(player_name: str) -> int:
    hws = await fetch(
        """SELECT * FROM homework WHERE player_name = $1 AND status IN ('assigned','in_progress','done')
           AND check_metric IS NOT NULL""",
        player_name,
    )
    changed = 0
    for hw in hws:
        rows = await fetch(
            """
            SELECT pms.counters, m.match_id FROM player_match_stats pms
            JOIN matches m ON m.match_id = pms.match_id
            WHERE pms.player_name = $1 AND pms.side = 'all' AND m.status = 'ready'
              AND COALESCE(m.played_at, m.created_at) > $2
            """,
            player_name, hw["created_at"],
        )
        if not rows:
            continue
        value = derive(sum_counters([dict(r) for r in rows])).get(hw["check_metric"])
        recurring = 0
        if hw["mistake_type"]:
            rec = await fetch(
                """SELECT COUNT(*)::int AS n FROM mistakes mi JOIN matches m ON m.match_id = mi.match_id
                   WHERE mi.player_name = $1 AND mi.type = $2 AND COALESCE(m.played_at, m.created_at) > $3""",
                player_name, hw["mistake_type"], hw["created_at"],
            )
            recurring = rec[0]["n"] if rec else 0
        verdict = _passes(value, hw["check_op"], hw["check_threshold"])
        status = hw["status"]
        if len(rows) >= MIN_MATCHES_TO_VERIFY and verdict is True:
            status = "verified"
        elif len(rows) >= MIN_MATCHES_TO_VERIFY and verdict is False and recurring >= 2:
            status = "recurring"
        verification = {"matches": [r["match_id"] for r in rows], "value": value, "recurring_mistakes": recurring,
                        "passes": verdict}
        await execute(
            """UPDATE homework SET last_value=$2, last_checked_at=NOW(), status=$3, verification=$4::jsonb,
               completed_at = CASE WHEN $3 = 'verified' THEN NOW() ELSE completed_at END WHERE id=$1""",
            hw["id"], value, status, json.dumps(verification),
        )
        if status != hw["status"]:
            changed += 1
            if hw["mistake_id"]:
                await execute("UPDATE mistakes SET status=$2 WHERE id=$1", hw["mistake_id"],
                              "fixed" if status == "verified" else "recurring")
    return changed
