"""Academy statistics: metric registry, players, profiles, compare, teams, scouting."""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from api.academy.common import (
    KEY_METRICS, METRIC_META, average_metrics, group_last, iso, merge_extras, percentiles_for, player_stat_rows,
    population, sum_counters,
)
from core.academy import AcademyUser, get_academy_user, jl
from postgres_repo import fetch
from services.analysis.solutions import catalogue
from services.analytics.engine import derive_team
from services.analytics.metrics_registry import GROUPS, METRIC_VERSION, TEAM_METRICS, all_metrics, derive

router = APIRouter(prefix="/api/academy", tags=["academy-stats"])

TREND_METRICS = ["rating", "adr", "kd", "kast_pct", "hs_pct", "opening_success_pct", "counter_strafe_pct",
                 "crosshair_deg", "traded_death_pct", "utility_damage_per_round", "accuracy_pct",
                 "enemies_flashed_per_round", "unused_util_value_per_death"]


@router.get("/metrics")
async def metrics_registry():
    return {"version": METRIC_VERSION, "groups": GROUPS, "metrics": all_metrics(), "team_metrics": TEAM_METRICS,
            "mistakes": catalogue()}


def _roster_flag(rows: list[dict[str, Any]]) -> set[str]:
    return {r["player_name"] for r in rows}


@router.get("/players")
async def players(au: AcademyUser = Depends(get_academy_user), last: int = Query(10, ge=1, le=200),
                  map_name: str | None = None, match_type: str | None = None, side: str = "all",
                  roster_only: bool = False):
    rows = await player_stat_rows(au.org_id, side=side, map_name=map_name, match_type=match_type)
    grouped = group_last(rows, last)
    roster = {r["player_name"]: dict(r) for r in await fetch(
        "SELECT player_name, ingame_role, team_id FROM academy_roster WHERE org_id=$1::uuid AND active", au.org_id)} if au.org_id else {}
    open_m = {r["player_name"]: r["n"] for r in await fetch(
        """SELECT mi.player_name, COUNT(*)::int AS n FROM mistakes mi JOIN matches m ON m.match_id = mi.match_id
           WHERE mi.status='open' AND (m.org_id = $1::uuid OR $1::uuid IS NULL) GROUP BY mi.player_name""", au.org_id)}
    hw = {r["player_name"]: r["n"] for r in await fetch(
        "SELECT player_name, COUNT(*)::int AS n FROM homework WHERE status IN ('assigned','in_progress') GROUP BY player_name")}
    out = []
    for name, items in grouped.items():
        if roster_only and roster and name not in roster:
            continue
        metrics = derive(sum_counters([r["counters"] for r in items]))
        teams = Counter(r["team_name"] for r in items)
        out.append({
            "name": name, "team": teams.most_common(1)[0][0] if teams else None, "matches": len(items),
            "wins": sum(1 for r in items if r["won"]), "last_played": iso(items[0]["played_at"]),
            "metrics": {k: metrics.get(k) for k in KEY_METRICS + ["rounds_played"] if k in metrics},
            "in_roster": name in roster, "ingame_role": (roster.get(name) or {}).get("ingame_role"),
            "open_mistakes": open_m.get(name, 0), "active_homework": hw.get(name, 0),
            "steam_id": next((r["steam_id"] for r in items if r["steam_id"]), None),
        })
    out.sort(key=lambda p: (-int(p["in_roster"]), -(p["metrics"].get("rating") or 0)))
    return out


def _strengths(metrics: dict[str, float | None], pct: dict[str, float | None]) -> tuple[list[dict], list[dict]]:
    scored = [(mid, p) for mid, p in pct.items() if p is not None and mid in METRIC_META and METRIC_META[mid]["key"]]
    scored += [(mid, p) for mid, p in pct.items() if p is not None and mid in METRIC_META and not METRIC_META[mid]["key"]
               and METRIC_META[mid]["group"] in ("aim", "utility", "trades", "duels")]
    seen: set[str] = set()
    uniq = []
    for mid, p in scored:
        if mid not in seen:
            seen.add(mid)
            uniq.append((mid, p))
    uniq.sort(key=lambda x: -x[1])
    fmt = lambda mid, p: {"metric": mid, "name": METRIC_META[mid]["ru"], "value": metrics.get(mid), "percentile": p}  # noqa: E731
    strengths = [fmt(m, p) for m, p in uniq if p >= 60][:3]
    weaknesses = [fmt(m, p) for m, p in reversed(uniq) if p <= 40][:3]
    return strengths, weaknesses


@router.get("/players/{name}")
async def player_profile(name: str, au: AcademyUser = Depends(get_academy_user), last: int = Query(20, ge=1, le=500),
                         map_name: str | None = None, match_type: str | None = None,
                         date_from: str | None = None, date_to: str | None = None):
    sides: dict[str, Any] = {}
    all_rows: list[dict[str, Any]] = []
    for side in ("all", "CT", "T"):
        rows = await player_stat_rows(au.org_id, side=side, player=name, map_name=map_name, match_type=match_type,
                                      date_from=date_from, date_to=date_to)
        rows = rows[:last]
        if side == "all":
            all_rows = rows
        sides[side] = {"metrics": derive(sum_counters([r["counters"] for r in rows])),
                       "counters": sum_counters([r["counters"] for r in rows])}
    if not all_rows:
        raise HTTPException(404, "Игрок не найден в матчах академии")

    pop = await population(au.org_id, "all", last, map_name, match_type)
    metrics = sides["all"]["metrics"]
    pct = percentiles_for(metrics, pop)
    team_names = Counter(r["team_name"] for r in all_rows)
    team = team_names.most_common(1)[0][0] if team_names else None
    mates_rows = await player_stat_rows(au.org_id, side="all", team=team, map_name=map_name, match_type=match_type) if team else []
    mates = group_last([r for r in mates_rows if r["player_name"] != name], last)
    team_avg = average_metrics([derive(sum_counters([r["counters"] for r in items])) for items in mates.values()])
    academy_avg = average_metrics([m for n, m in pop.items() if n != name])

    extras = merge_extras([r["extras"] for r in all_rows])
    by_map: dict[str, list[dict]] = defaultdict(list)
    for r in all_rows:
        by_map[r["map_name"]].append(r)
    maps = []
    for mname, items in by_map.items():
        mm = derive(sum_counters([r["counters"] for r in items]))
        maps.append({"map": mname, "matches": len(items), "wins": sum(1 for r in items if r["won"]),
                     "metrics": {k: mm.get(k) for k in ("rating", "adr", "kd", "kast_pct", "hs_pct", "opening_success_pct", "utility_damage_per_round")}})
    maps.sort(key=lambda x: -x["matches"])

    match_ids = [r["match_id"] for r in all_rows]
    mistakes = await fetch(
        """SELECT mi.match_id, mi.type, mi.category, mi.severity, mi.status, mi.title FROM mistakes mi
           WHERE mi.player_name = $1 AND mi.match_id = ANY($2::text[])""",
        name, match_ids,
    )
    per_match_mistakes: dict[str, Counter] = defaultdict(Counter)
    type_stats: dict[str, dict[str, Any]] = {}
    for mi in mistakes:
        per_match_mistakes[mi["match_id"]][mi["type"]] += 1
        ts = type_stats.setdefault(mi["type"], {"type": mi["type"], "title": mi["title"], "category": mi["category"],
                                                "count": 0, "open": 0, "fixed": 0, "high": 0})
        ts["count"] += 1
        if mi["status"] == "open":
            ts["open"] += 1
        if mi["status"] == "fixed":
            ts["fixed"] += 1
        if mi["severity"] == "high":
            ts["high"] += 1

    trend = []
    cards = []
    for r in reversed(all_rows):
        mm = derive(jl(r["counters"]) or {})
        trend.append({"match_id": r["match_id"], "date": iso(r["played_at"]), "map": r["map_name"], "won": r["won"],
                      "mistakes": sum(per_match_mistakes[r["match_id"]].values()),
                      **{k: mm.get(k) for k in TREND_METRICS}})
    for r in all_rows:
        mm = derive(jl(r["counters"]) or {})
        counters = jl(r["counters"]) or {}
        cards.append({
            "match_id": r["match_id"], "date": iso(r["played_at"]), "map": r["map_name"], "won": r["won"],
            "team": r["team_name"], "score_t": r["score_t"], "score_ct": r["score_ct"], "team_t_name": r["team_t_name"],
            "team_ct_name": r["team_ct_name"], "match_type": r["match_type"], "reviewed_by_analyst": r["reviewed_by_analyst"],
            "kills": counters.get("kills", 0), "deaths": counters.get("deaths", 0), "assists": counters.get("assists", 0),
            "rating": mm.get("rating"), "adr": mm.get("adr"), "kast_pct": mm.get("kast_pct"), "hs_pct": mm.get("hs_pct"),
            "mistakes": sum(per_match_mistakes[r["match_id"]].values()),
            "top_mistake": per_match_mistakes[r["match_id"]].most_common(1)[0][0] if per_match_mistakes[r["match_id"]] else None,
        })

    strengths, weaknesses = _strengths(metrics, pct)
    form = [c["rating"] for c in cards[:5] if c["rating"] is not None]
    return {
        "name": name, "team": team, "matches": len(all_rows), "wins": sum(1 for r in all_rows if r["won"]),
        "steam_id": next((r["steam_id"] for r in all_rows if r["steam_id"]), None),
        "sides": sides, "percentiles": pct, "team_avg": team_avg, "academy_avg": academy_avg,
        "population_size": len(pop), "extras": extras, "maps": maps, "trend": trend, "cards": cards,
        "mistake_types": sorted(type_stats.values(), key=lambda x: -x["count"]),
        "strengths": strengths, "weaknesses": weaknesses,
        "form": round(sum(form) / len(form), 3) if form else None,
    }


@router.get("/players/{name}/heatmap")
async def player_heatmap(name: str, map_name: str, kind: str = "deaths", side: str | None = None, last: int = 30,
                         au: AcademyUser = Depends(get_academy_user)):
    if kind not in ("kills", "deaths"):
        raise HTTPException(400, "kind: kills | deaths")
    who, x, y, s, pl = ("killer", "killer_x", "killer_y", "killer_side", "killer_place") if kind == "kills" else \
        ("victim", "victim_x", "victim_y", "victim_side", "victim_place")
    rows = await fetch(
        f"""
        WITH ms AS (
          SELECT m.match_id FROM matches m JOIN players p ON p.match_id = m.match_id AND p.name = $1
          WHERE m.map_name = $2 AND m.status='ready' AND (m.org_id = $3::uuid OR $3::uuid IS NULL)
          ORDER BY COALESCE(m.played_at, m.created_at) DESC LIMIT {int(last)}
        )
        SELECT k.match_id, k.round_number, k.tick, k.{x} AS x, k.{y} AS y, k.{s} AS side, k.{pl} AS place, k.weapon
        FROM kill_details k JOIN ms ON ms.match_id = k.match_id
        WHERE k.{who} = $1 AND k.killer_side IS DISTINCT FROM k.victim_side {"AND k." + s + " = $4" if side else ""}
        """,
        *([name, map_name, au.org_id, side] if side else [name, map_name, au.org_id]),
    )
    return [dict(r) for r in rows]


@router.get("/compare")
async def compare(players: str, au: AcademyUser = Depends(get_academy_user), last: int = Query(20, ge=1, le=500),
                  map_name: str | None = None, side: str = "all"):
    names = [n for n in players.split(",") if n][:5]
    if len(names) < 2:
        raise HTTPException(400, "Нужно минимум 2 игрока")
    pop = await population(au.org_id, side, last, map_name, None)
    out = []
    for n in names:
        rows = (await player_stat_rows(au.org_id, side=side, player=n, map_name=map_name))[:last]
        metrics = derive(sum_counters([r["counters"] for r in rows]))
        pct = percentiles_for(metrics, pop)
        radar = {}
        for g in GROUPS:
            vals = [pct[m["id"]] for m in all_metrics() if m["group"] == g["id"] and pct.get(m["id"]) is not None]
            radar[g["id"]] = round(sum(vals) / len(vals), 1) if vals else None
        out.append({"name": n, "matches": len(rows), "metrics": metrics, "percentiles": pct, "radar": radar})
    return {"players": out, "groups": GROUPS, "population_size": len(pop)}


@router.get("/compare/periods")
async def compare_periods(player: str, a_from: str, a_to: str, b_from: str, b_to: str,
                          au: AcademyUser = Depends(get_academy_user)):
    res = {}
    for key, f, t in (("a", a_from, a_to), ("b", b_from, b_to)):
        rows = await player_stat_rows(au.org_id, player=player, date_from=f, date_to=t)
        res[key] = {"matches": len(rows), "metrics": derive(sum_counters([r["counters"] for r in rows]))}
    return res


async def _team_rows(org_id: str | None, team: str, map_name: str | None, last: int | None) -> list[dict[str, Any]]:
    rows = await fetch(
        f"""SELECT t.match_id, t.won, t.data, m.map_name, m.team_t_name, m.team_ct_name, m.score_t, m.score_ct,
                   m.match_type, COALESCE(m.played_at, m.created_at) AS played_at
            FROM team_match_stats t JOIN matches m ON m.match_id = t.match_id
            WHERE t.team_name = $1 AND m.status='ready' AND (m.org_id = $2::uuid OR $2::uuid IS NULL)
            {"AND m.map_name = $3" if map_name else ""}
            ORDER BY COALESCE(m.played_at, m.created_at) DESC {f"LIMIT {int(last)}" if last else ""}""",
        *([team, org_id, map_name] if map_name else [team, org_id]),
    )
    return [{**dict(r), "data": jl(r["data"]) or {}} for r in rows]


@router.get("/teams")
async def teams(au: AcademyUser = Depends(get_academy_user)):
    rows = await fetch(
        """SELECT t.team_name, COUNT(*)::int AS matches, COUNT(*) FILTER (WHERE t.won)::int AS wins,
                  MAX(COALESCE(m.played_at, m.created_at)) AS last_played, array_agg(DISTINCT m.map_name) AS maps
           FROM team_match_stats t JOIN matches m ON m.match_id = t.match_id
           WHERE m.status='ready' AND (m.org_id = $1::uuid OR $1::uuid IS NULL)
           GROUP BY t.team_name ORDER BY matches DESC""",
        au.org_id,
    )
    academy = {r["name"] for r in await fetch("SELECT name FROM academy_teams WHERE org_id=$1::uuid", au.org_id)} if au.org_id else set()
    return [{**{k: iso(v) for k, v in dict(r).items()}, "is_academy": r["team_name"] in academy} for r in rows]


def _team_profile(rows: list[dict[str, Any]]) -> dict[str, Any]:
    total: Counter = Counter()
    sites: Counter = Counter()
    reasons: Counter = Counter()
    by_map: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        d = r["data"]
        for k, v in (d.get("counters") or {}).items():
            if isinstance(v, (int, float)):
                total[k] += v
        sites.update(d.get("sites") or {})
        reasons.update(d.get("win_reasons") or {})
        by_map[r["map_name"]].append(r)
    maps = []
    for mname, items in by_map.items():
        c: Counter = Counter()
        for it in items:
            c.update({k: v for k, v in (it["data"].get("counters") or {}).items() if isinstance(v, (int, float))})
        maps.append({"map": mname, "matches": len(items), "wins": sum(1 for it in items if it["won"]), "metrics": derive_team(c)})
    maps.sort(key=lambda m: -m["matches"])
    return {"matches": len(rows), "wins": sum(1 for r in rows if r["won"]), "counters": dict(total),
            "metrics": derive_team(total), "sites": dict(sites), "win_reasons": dict(reasons), "maps": maps,
            "recent": [{"match_id": r["match_id"], "map": r["map_name"], "won": r["won"], "date": iso(r["played_at"]),
                        "team_t_name": r["team_t_name"], "team_ct_name": r["team_ct_name"], "score_t": r["score_t"],
                        "score_ct": r["score_ct"], "series": r["data"].get("series", [])} for r in rows[:15]]}


@router.get("/teams/{team}")
async def team_profile(team: str, au: AcademyUser = Depends(get_academy_user), map_name: str | None = None, last: int = 30):
    rows = await _team_rows(au.org_id, team, map_name, last)
    if not rows:
        raise HTTPException(404, "Команда не найдена")
    prof = _team_profile(rows)
    prow = await player_stat_rows(au.org_id, side="all", team=team, map_name=map_name)
    grouped = group_last(prow, last)
    prof["players"] = sorted([
        {"name": n, "matches": len(items), **{"metrics": {k: v for k, v in derive(sum_counters([r["counters"] for r in items])).items()
                                                         if k in KEY_METRICS + ["trade_kills", "awp_kills", "entry_success_pct", "flash_assists"]}}}
        for n, items in grouped.items()
    ], key=lambda p: -(p["metrics"].get("rating") or 0))
    prof["team"] = team
    return prof


def _cluster(points: list[dict[str, Any]], cell: float = 250.0) -> list[dict[str, Any]]:
    buckets: dict[tuple[str, int, int], list[dict]] = defaultdict(list)
    for p in points:
        if p["to_x"] is None:
            continue
        buckets[(p["grenade_type"], int(p["to_x"] // cell), int(p["to_y"] // cell))].append(p)
    out = []
    for (gtype, _, _), items in buckets.items():
        n = len(items)
        out.append({"grenade_type": gtype, "count": n, "x": sum(i["to_x"] for i in items) / n, "y": sum(i["to_y"] for i in items) / n,
                    "from_x": sum(i["from_x"] for i in items) / n, "from_y": sum(i["from_y"] for i in items) / n,
                    "players": dict(Counter(i["player_name"] for i in items)),
                    "matches": len({i["match_id"] for i in items})})
    out.sort(key=lambda c: -c["count"])
    return out[:60]


@router.get("/scouting")
async def scouting(opponent: str, au: AcademyUser = Depends(get_academy_user), map_name: str | None = None, last: int = 20):
    rows = await _team_rows(au.org_id, opponent, map_name, last)
    if not rows:
        raise HTTPException(404, "Нет демок этой команды — загрузите их матчи в папку соперника")
    prof = _team_profile(rows)
    match_ids = [r["match_id"] for r in rows]
    players = [r["player_name"] for r in await fetch(
        "SELECT DISTINCT player_name FROM player_match_stats WHERE team_name=$1 AND match_id = ANY($2::text[])", opponent, match_ids)]
    gren = await fetch(
        """SELECT g.match_id, g.grenade_type, g.player_name, g.from_x, g.from_y, g.to_x, g.to_y, g.team, m.map_name
           FROM grenades g JOIN matches m ON m.match_id = g.match_id
           WHERE g.match_id = ANY($1::text[]) AND g.player_name = ANY($2::text[]) AND g.grenade_type <> 'decoy'""",
        match_ids, players,
    )
    utility: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for g in gren:
        utility[g["map_name"]][g["team"]].append(dict(g))
    early = await fetch(
        """SELECT e.side, e.place, m.map_name, COUNT(*)::int AS n FROM early_places e JOIN matches m ON m.match_id = e.match_id
           WHERE e.match_id = ANY($1::text[]) AND e.player_name = ANY($2::text[]) GROUP BY e.side, e.place, m.map_name
           ORDER BY n DESC""",
        match_ids, players,
    )
    kills = await fetch(
        """SELECT k.killer, k.weapon, k.killer_place, k.killer_side, m.map_name, k.round_number, k.tick, k.killer_x, k.killer_y
           FROM kill_details k JOIN matches m ON m.match_id = k.match_id
           WHERE k.match_id = ANY($1::text[]) AND k.killer = ANY($2::text[]) AND k.killer_side IS DISTINCT FROM k.victim_side""",
        match_ids, players,
    )
    opening = await fetch(
        """SELECT (data->'opening'->>'killer') AS killer, (data->'opening'->>'killer_side') AS side, m.map_name
           FROM round_summaries rs JOIN matches m ON m.match_id = rs.match_id
           WHERE rs.match_id = ANY($1::text[]) AND data->'opening' IS NOT NULL AND data->'opening' <> 'null'::jsonb""",
        match_ids,
    )
    open_count = Counter(o["killer"] for o in opening if o["killer"] in players)
    awp = Counter(k["killer"] for k in kills if k["weapon"] == "awp")
    pistol = await fetch(
        """SELECT rs.round_number, rs.data->>'winner_team' AS winner, m.map_name, rs.match_id
           FROM round_summaries rs JOIN matches m ON m.match_id = rs.match_id
           WHERE rs.match_id = ANY($1::text[]) AND (rs.data->'buy'->'T'->>'type') = 'pistol'""",
        match_ids,
    )
    prof.update({
        "team": opponent,
        "players": players,
        "utility_clusters": {m: {side: _cluster(items) for side, items in sides.items()} for m, sides in utility.items()},
        "early_positions": [dict(e) for e in early[:80]],
        "awp_players": dict(awp.most_common(5)),
        "opening_players": dict(open_count.most_common(5)),
        "kill_places": dict(Counter(f"{k['map_name']}:{k['killer_side']}:{k['killer_place']}" for k in kills).most_common(25)),
        "pistols": [{"round": p["round_number"], "won": p["winner"] == opponent, "map": p["map_name"], "match_id": p["match_id"]} for p in pistol],
        "kill_points": [dict(k) for k in kills[:3000]],
    })
    return prof
