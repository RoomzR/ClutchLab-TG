"""Academy match endpoints: list, hub summary, rounds, duels, jobs, re-parse."""

from __future__ import annotations

import os
from collections import defaultdict
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from api.academy.common import iso, invalidate_population
from core.academy import (
    STAFF_ROLES, AcademyUser, ensure_match_access, get_academy_user, jl, require_academy_role,
)
from postgres_repo import execute, fetch, fetchrow
from services.analytics.metrics_registry import derive
from services.parsing.pipeline import delete_match_everything
from services.parsing.queue import enqueue_parse, queue_depth

router = APIRouter(prefix="/api/academy", tags=["academy-matches"])

MATCH_TYPES = ("scrim", "official", "faceit", "pug", "opponent")


@router.get("/me")
async def me(au: AcademyUser = Depends(get_academy_user)):
    org = await fetchrow("SELECT id, name, slug, retention_days FROM organizations WHERE id=$1::uuid", au.org_id) if au.org_id else None
    return {"user": au.as_dict(), "org": {**dict(org), "id": str(org["id"])} if org else None}


async def _academy_names(org_id: str | None) -> tuple[set[str], set[str]]:
    roster = {r["player_name"] for r in await fetch("SELECT player_name FROM academy_roster WHERE org_id=$1::uuid AND active", org_id)} if org_id else set()
    teams: set[str] = set()
    if org_id:
        for r in await fetch("SELECT name, demo_names FROM academy_teams WHERE org_id=$1::uuid", org_id):
            teams.add(r["name"])
            teams.update(r["demo_names"] or [])
    return roster, teams


@router.get("/matches")
async def list_matches(
    au: AcademyUser = Depends(get_academy_user),
    map_name: str | None = None,
    match_type: str | None = None,
    team: str | None = None,
    q: str | None = None,
    status: str | None = None,
    reviewed: bool | None = None,
    open_mistakes: bool | None = None,
    limit: int = Query(60, le=200),
    offset: int = 0,
):
    clauses = ["(m.org_id = $1::uuid OR ($1::uuid IS NULL))"]
    params: list[Any] = [au.org_id]

    def p(v: Any) -> str:
        params.append(v)
        return f"${len(params)}"

    if map_name:
        clauses.append(f"m.map_name = {p(map_name)}")
    if match_type:
        clauses.append(f"m.match_type = {p(match_type)}")
    if team:
        clauses.append(f"(m.team_t_name = {p(team)} OR m.team_ct_name = ${len(params)})")
    if status:
        clauses.append(f"m.status = {p(status)}")
    if reviewed is not None:
        clauses.append(f"m.reviewed_by_analyst = {p(reviewed)}")
    if q:
        clauses.append(
            f"(m.team_t_name ILIKE {p('%' + q + '%')} OR m.team_ct_name ILIKE ${len(params)} OR m.opponent_name ILIKE ${len(params)}"
            f" OR m.map_name ILIKE ${len(params)} OR m.original_filename ILIKE ${len(params)}"
            f" OR EXISTS (SELECT 1 FROM players pl WHERE pl.match_id = m.match_id AND pl.name ILIKE ${len(params)}))"
        )
    having = ""
    if open_mistakes:
        having = "HAVING COUNT(mi.id) FILTER (WHERE mi.status = 'open') > 0"
    rows = await fetch(
        f"""
        SELECT m.match_id, m.map_name, m.score_t, m.score_ct, m.team_t_name, m.team_ct_name, m.status, m.progress,
               m.message, m.match_type, m.opponent_name, m.created_at, m.played_at, m.analysis_status,
               m.reviewed_by_analyst, m.has_voice, m.original_filename,
               (SELECT COUNT(*)::int FROM rounds r WHERE r.match_id = m.match_id) AS rounds,
               COUNT(mi.id) FILTER (WHERE mi.status = 'open')::int AS open_mistakes,
               COUNT(mi.id)::int AS mistakes,
               (SELECT array_agg(pl.name ORDER BY pl.name) FROM players pl WHERE pl.match_id = m.match_id) AS players
        FROM matches m LEFT JOIN mistakes mi ON mi.match_id = m.match_id
        WHERE {' AND '.join(clauses)}
        GROUP BY m.match_id
        {having}
        ORDER BY COALESCE(m.played_at, m.created_at) DESC
        LIMIT {int(limit)} OFFSET {int(offset)}
        """,
        *params,
    )
    roster, teams = await _academy_names(au.org_id)
    out = []
    for r in rows:
        item = {k: iso(v) for k, v in dict(r).items()}
        item["players"] = item.get("players") or []
        ours = None
        if r["team_t_name"] in teams:
            ours = r["team_t_name"]
        elif r["team_ct_name"] in teams:
            ours = r["team_ct_name"]
        item["academy_team"] = ours
        item["academy_players"] = [n for n in item["players"] if n in roster]
        if ours:
            mine = r["score_t"] if ours == r["team_t_name"] else r["score_ct"]
            theirs = r["score_ct"] if ours == r["team_t_name"] else r["score_t"]
            item["result"] = "W" if mine > theirs else ("L" if mine < theirs else "D")
        out.append(item)
    return out


class MatchMetaUpdate(BaseModel):
    match_type: str | None = None
    opponent_name: str | None = None
    played_at: datetime | None = None


@router.patch("/matches/{match_id}")
async def update_match(match_id: str, body: MatchMetaUpdate, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    await ensure_match_access(match_id, au)
    if body.match_type and body.match_type not in MATCH_TYPES:
        raise HTTPException(400, "Неизвестный тип матча")
    await execute(
        """UPDATE matches SET match_type=COALESCE($2, match_type), opponent_name=COALESCE($3, opponent_name),
           played_at=COALESCE($4, played_at), updated_at=NOW() WHERE match_id=$1""",
        match_id, body.match_type, body.opponent_name, body.played_at,
    )
    invalidate_population()
    return {"ok": True}


@router.delete("/matches/{match_id}")
async def delete_match(match_id: str, au: AcademyUser = Depends(require_academy_role("admin", "manager"))):
    await ensure_match_access(match_id, au)
    row = await fetchrow("SELECT file_path FROM matches WHERE match_id=$1", match_id)
    await delete_match_everything(match_id)
    if row and row["file_path"]:
        try:
            os.remove(row["file_path"])
        except OSError:
            pass
    invalidate_population()
    return {"ok": True}


@router.post("/matches/{match_id}/reparse")
async def reparse(match_id: str, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    await ensure_match_access(match_id, au)
    row = await fetchrow("SELECT file_path, file_deleted FROM matches WHERE match_id=$1", match_id)
    if not row or not row["file_path"] or row["file_deleted"]:
        raise HTTPException(409, "Файл демки уже удалён по сроку хранения — загрузите демку заново")
    await execute("UPDATE matches SET status='pending', progress=0, message=NULL WHERE match_id=$1", match_id)
    lane = await enqueue_parse(match_id, row["file_path"], priority=True, kind="parse")
    return {"queued": lane}


@router.post("/matches/{match_id}/reanalyze")
async def reanalyze(match_id: str, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    await ensure_match_access(match_id, au)
    row = await fetchrow("SELECT file_path FROM matches WHERE match_id=$1", match_id)
    lane = await enqueue_parse(match_id, row["file_path"] or "", priority=True, kind="analyze")
    invalidate_population()
    return {"queued": lane}


def _player_block(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_player: dict[str, dict[str, Any]] = {}
    for r in rows:
        p = by_player.setdefault(r["player_name"], {"name": r["player_name"], "team": r["team_name"],
                                                    "steam_id": r["steam_id"], "won": r["won"], "sides": {}, "extras": {}})
        counters = jl(r["counters"]) or {}
        p["sides"][r["side"]] = {"metrics": derive(counters), "rounds": counters.get("rounds", 0)}
        if r["side"] == "all":
            p["extras"] = jl(r["extras"]) or {}
            p["counters"] = counters
    return sorted(by_player.values(), key=lambda p: -(p["sides"].get("all", {}).get("metrics", {}).get("rating") or 0))


@router.get("/matches/{match_id}/summary")
async def match_summary(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    m = await fetchrow("SELECT * FROM matches WHERE match_id=$1", match_id)
    stats = [dict(r) for r in await fetch("SELECT * FROM player_match_stats WHERE match_id=$1", match_id)]
    teams = [dict(r) for r in await fetch("SELECT team_name, won, data FROM team_match_stats WHERE match_id=$1", match_id)]
    rounds = [jl(r["data"]) for r in await fetch("SELECT data FROM round_summaries WHERE match_id=$1 ORDER BY round_number", match_id)]
    mistakes = await fetch(
        "SELECT player_name, team_name, type, severity, status, round_number FROM mistakes WHERE match_id=$1", match_id,
    )
    report = await fetchrow("SELECT status FROM analyst_reports WHERE match_id=$1 ORDER BY updated_at DESC LIMIT 1", match_id)
    by_player: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    by_round: dict[int, int] = defaultdict(int)
    for mi in mistakes:
        key = mi["player_name"] or mi["team_name"] or "team"
        by_player[key][mi["severity"]] += 1
        by_player[key]["total"] += 1
        if mi["status"] == "open":
            by_player[key]["open"] += 1
        if mi["round_number"]:
            by_round[mi["round_number"]] += 1
    for rs in rounds:
        rs["mistakes"] = by_round.get(rs["round"], 0)

    meta = {k: iso(v) for k, v in dict(m).items() if k not in ("file_path",)}
    roster, academy_teams = await _academy_names(au.org_id)
    return {
        "match": meta,
        "players": _player_block(stats),
        "teams": [{"name": t["team_name"], "won": t["won"], **(jl(t["data"]) or {})} for t in teams],
        "rounds": rounds,
        "mistakes_by_player": {k: dict(v) for k, v in by_player.items()},
        "mistakes_total": len(mistakes),
        "analyst_report_status": report["status"] if report else None,
        "academy_teams": sorted(academy_teams),
        "roster": sorted(roster),
    }


@router.get("/matches/{match_id}/rounds/{round_number}")
async def round_detail(match_id: str, round_number: int, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    rs = await fetchrow("SELECT data FROM round_summaries WHERE match_id=$1 AND round_number=$2", match_id, round_number)
    if not rs:
        raise HTTPException(404, "Раунд не найден")
    review = await fetchrow("SELECT review, source, model FROM ai_round_reviews WHERE match_id=$1 AND round_number=$2", match_id, round_number)
    mistakes = await fetch("SELECT * FROM mistakes WHERE match_id=$1 AND round_number=$2 ORDER BY tick_start", match_id, round_number)
    notes = await fetch("SELECT * FROM coach_text_notes WHERE match_id=$1 AND round_number=$2 ORDER BY tick", match_id, round_number)
    damages = await fetch(
        """SELECT attacker, victim, SUM(dmg_health)::int AS dmg, COUNT(*)::int AS hits FROM damages
           WHERE match_id=$1 AND round_number=$2 AND attacker_side IS DISTINCT FROM victim_side GROUP BY attacker, victim""",
        match_id, round_number,
    )
    return {
        "summary": jl(rs["data"]),
        "review": {"data": jl(review["review"]), "source": review["source"], "model": review["model"]} if review else None,
        "mistakes": [_mistake_out(r) for r in mistakes],
        "notes": [{k: iso(v) for k, v in dict(n).items()} for n in notes],
        "damage": [dict(d) for d in damages],
    }


def _mistake_out(r: Any) -> dict[str, Any]:
    d = {k: iso(v) for k, v in dict(r).items()}
    d["id"] = str(r["id"])
    d["evidence"] = jl(r["evidence"]) or {}
    if d.get("reviewed_by"):
        d["reviewed_by"] = str(d["reviewed_by"])
    return d


@router.get("/matches/{match_id}/duels")
async def match_duels(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    kills = await fetch(
        """SELECT killer, victim, COUNT(*)::int AS kills, COUNT(*) FILTER (WHERE headshot)::int AS hs
           FROM kill_details WHERE match_id=$1 AND killer_side IS DISTINCT FROM victim_side AND killer <> victim
           GROUP BY killer, victim""",
        match_id,
    )
    dmg = await fetch(
        """SELECT attacker, victim, SUM(dmg_health)::int AS dmg FROM damages
           WHERE match_id=$1 AND attacker_side IS DISTINCT FROM victim_side AND attacker <> victim GROUP BY attacker, victim""",
        match_id,
    )
    weapons = await fetch(
        """SELECT k.killer, k.weapon, COUNT(*)::int AS kills FROM kill_details k
           WHERE k.match_id=$1 AND k.killer_side IS DISTINCT FROM k.victim_side GROUP BY k.killer, k.weapon""",
        match_id,
    )
    distance = await fetch(
        """SELECT killer, victim, distance, weapon, round_number, tick FROM kill_details
           WHERE match_id=$1 AND killer_side IS DISTINCT FROM victim_side""",
        match_id,
    )
    buckets = defaultdict(lambda: defaultdict(lambda: {"kills": 0, "deaths": 0}))
    for d in distance:
        dist = d["distance"] or 0
        b = "близко (<10 м)" if dist < 10 else "средне (10–25 м)" if dist < 25 else "далеко (>25 м)"
        buckets[d["killer"]][b]["kills"] += 1
        buckets[d["victim"]][b]["deaths"] += 1
    return {
        "kills": [dict(r) for r in kills],
        "damage": [dict(r) for r in dmg],
        "weapons": [dict(r) for r in weapons],
        "distance": {p: dict(v) for p, v in buckets.items()},
    }


@router.get("/matches/{match_id}/heatmap")
async def match_heatmap(match_id: str, kind: str = "deaths", player: str | None = None, side: str | None = None,
                        round_number: int | None = None, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    if kind not in ("kills", "deaths", "damage", "shots", "pings"):
        raise HTTPException(400, "kind: kills | deaths | damage | shots | pings")
    params: list[Any] = [match_id]
    where = ["match_id=$1"]
    if round_number:
        params.append(round_number)
        where.append(f"round_number=${len(params)}")
    if kind in ("kills", "deaths"):
        who, x, y, s, pl = ("killer", "killer_x", "killer_y", "killer_side", "killer_place") if kind == "kills" else \
            ("victim", "victim_x", "victim_y", "victim_side", "victim_place")
        table = "kill_details"
    elif kind == "damage":
        who, x, y, s, pl, table = "attacker", "attacker_x", "attacker_y", "attacker_side", "attacker_place", "damages"
    elif kind == "shots":
        who, x, y, s, pl, table = "player_name", "x", "y", "side", "place", "shots"
    else:
        who, x, y, s, pl, table = "player_name", "x", "y", "side", "player_place", "pings"
    if player:
        params.append(player)
        where.append(f"{who}=${len(params)}")
    if side:
        params.append(side)
        where.append(f"{s}=${len(params)}")
    rows = await fetch(
        f"SELECT {who} AS player, {x} AS x, {y} AS y, {s} AS side, {pl} AS place, round_number, tick FROM {table} "
        f"WHERE {' AND '.join(where)} AND {x} IS NOT NULL LIMIT 5000",
        *params,
    )
    return [dict(r) for r in rows]


@router.get("/jobs")
async def jobs(au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES)), status: str | None = None, limit: int = 50):
    rows = await fetch(
        f"""SELECT j.*, m.map_name, m.team_t_name, m.team_ct_name, m.original_filename, m.status AS match_status
            FROM parse_jobs j JOIN matches m ON m.match_id = j.match_id
            WHERE (m.org_id = $1::uuid OR $1::uuid IS NULL) {"AND j.status = $2" if status else ""}
            ORDER BY j.queued_at DESC LIMIT {min(int(limit), 200)}""",
        *([au.org_id, status] if status else [au.org_id]),
    )
    return {"jobs": [{**{k: iso(v) for k, v in dict(r).items()}, "id": str(r["id"])} for r in rows], "queue": await queue_depth()}


@router.get("/matches/{match_id}/status")
async def status(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    row = await fetchrow("SELECT status, progress, message, analysis_status FROM matches WHERE match_id=$1", match_id)
    job = await fetchrow("SELECT status, attempt, error, started_at FROM parse_jobs WHERE match_id=$1 ORDER BY queued_at DESC LIMIT 1", match_id)
    depth = await queue_depth()
    return {**dict(row), "job": {k: iso(v) for k, v in dict(job).items()} if job else None, "queue": depth}
