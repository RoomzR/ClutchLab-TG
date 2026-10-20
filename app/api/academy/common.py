"""Shared query helpers for academy endpoints: filtered match sets, counter
aggregation across matches, academy percentiles."""

from __future__ import annotations

import time
from collections import Counter, defaultdict
from datetime import date, datetime
from typing import Any

from core.academy import jl
from postgres_repo import fetch
from services.analytics.metrics_registry import all_metrics, derive

KEY_METRICS = [m["id"] for m in all_metrics() if m["key"]]
METRIC_META = {m["id"]: m for m in all_metrics()}

_pop_cache: dict[str, tuple[float, dict[str, dict[str, float | None]]]] = {}


def iso(v: Any) -> Any:
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def merge_extras(items: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for ex in items:
        ex = jl(ex) or {}
        for bucket, values in ex.items():
            if isinstance(values, dict):
                acc = out.setdefault(bucket, Counter())
                for k, v in values.items():
                    if isinstance(v, (int, float)):
                        acc[k] += v
            elif isinstance(values, list):
                out.setdefault(bucket, []).extend(values)
    return {k: (dict(v) if isinstance(v, Counter) else v) for k, v in out.items()}


def sum_counters(items: list[Any]) -> dict[str, float]:
    total: Counter = Counter()
    for c in items:
        c = jl(c) or {}
        for k, v in c.items():
            if isinstance(v, (int, float)):
                total[k] += v
    return dict(total)


async def player_stat_rows(org_id: str | None, *, side: str = "all", player: str | None = None,
                           map_name: str | None = None, match_type: str | None = None,
                           date_from: str | None = None, date_to: str | None = None,
                           team: str | None = None) -> list[dict[str, Any]]:
    clauses = ["m.status = 'ready'", "pms.side = $1"]
    params: list[Any] = [side]

    def p(value: Any) -> str:
        params.append(value)
        return f"${len(params)}"

    if org_id:
        clauses.append(f"m.org_id = {p(org_id)}::uuid")
    if player:
        clauses.append(f"pms.player_name = {p(player)}")
    if map_name:
        clauses.append(f"m.map_name = {p(map_name)}")
    if match_type:
        clauses.append(f"m.match_type = {p(match_type)}")
    if team:
        clauses.append(f"pms.team_name = {p(team)}")
    if date_from:
        clauses.append(f"COALESCE(m.played_at, m.created_at) >= {p(datetime.fromisoformat(date_from))}")
    if date_to:
        clauses.append(f"COALESCE(m.played_at, m.created_at) <= {p(datetime.fromisoformat(date_to))}")
    rows = await fetch(
        f"""
        SELECT pms.player_name, pms.team_name, pms.steam_id, pms.won, pms.counters, pms.extras,
               m.match_id, m.map_name, m.match_type, m.opponent_name, m.score_t, m.score_ct,
               m.team_t_name, m.team_ct_name, m.reviewed_by_analyst,
               COALESCE(m.played_at, m.created_at) AS played_at
        FROM player_match_stats pms JOIN matches m ON m.match_id = pms.match_id
        WHERE {' AND '.join(clauses)}
        ORDER BY COALESCE(m.played_at, m.created_at) DESC
        """,
        *params,
    )
    return [dict(r) for r in rows]


def group_last(rows: list[dict[str, Any]], last: int | None) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in rows:
        if last and len(grouped[r["player_name"]]) >= last:
            continue
        grouped[r["player_name"]].append(r)
    return grouped


async def population(org_id: str | None, side: str, last: int | None, map_name: str | None,
                     match_type: str | None, min_matches: int = 1) -> dict[str, dict[str, float | None]]:
    key = f"{org_id}|{side}|{last}|{map_name}|{match_type}|{min_matches}"
    hit = _pop_cache.get(key)
    if hit and time.monotonic() - hit[0] < 60:
        return hit[1]
    rows = await player_stat_rows(org_id, side=side, map_name=map_name, match_type=match_type)
    grouped = group_last(rows, last)
    out = {
        name: derive(sum_counters([r["counters"] for r in items]))
        for name, items in grouped.items() if len(items) >= min_matches
    }
    _pop_cache[key] = (time.monotonic(), out)
    return out


def invalidate_population() -> None:
    _pop_cache.clear()


def percentile(value: float | None, values: list[float], better: str) -> float | None:
    if value is None or not values:
        return None
    below = sum(1 for v in values if v < value)
    equal = sum(1 for v in values if v == value)
    pct = 100.0 * (below + 0.5 * equal) / len(values)
    if better == "lower":
        pct = 100.0 - pct
    return round(pct, 1)


def percentiles_for(metrics: dict[str, float | None], pop: dict[str, dict[str, float | None]]) -> dict[str, float | None]:
    out: dict[str, float | None] = {}
    for mid, value in metrics.items():
        meta = METRIC_META.get(mid)
        if not meta or meta["better"] == "neutral":
            out[mid] = None
            continue
        vals = [m.get(mid) for m in pop.values() if m.get(mid) is not None]
        out[mid] = percentile(value, vals, meta["better"]) if len(vals) >= 2 else None
    return out


def average_metrics(items: list[dict[str, float | None]]) -> dict[str, float | None]:
    if not items:
        return {}
    keys = set().union(*[m.keys() for m in items])
    out: dict[str, float | None] = {}
    for k in keys:
        vals = [m[k] for m in items if m.get(k) is not None]
        out[k] = round(sum(vals) / len(vals), 4) if vals else None
    return out
