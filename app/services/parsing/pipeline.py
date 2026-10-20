"""Parse job → persist events → analysis (stats, mistakes, reviews, facts, comms).

Runs inside the dedicated worker process (worker.py) or in the API process when
PARSE_WORKERS_IN_API=true (local dev). Every run is recorded in parse_jobs.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import time
from pathlib import Path
from typing import Any

from config import settings
from postgres_repo import bulk_copy, execute, fetch, fetchrow
from services.ai.facts import build_facts
from services.ai.review import rules_review
from services.analysis.comms import build_report
from services.analysis.homework import verify_player_homework
from services.analysis.mistakes import detect, detect_late_rotations
from services.analytics.engine import MatchData, _Positions, compute
from services.analytics.metrics_registry import METRIC_VERSION
from services.parsing.parser import ParseResult, parse_demo
from services.storage.demo_storage import download_demo_file, is_s3_enabled

logger = logging.getLogger(__name__)

EVENT_TABLES = (
    "players", "rounds", "round_pauses", "positions", "grenades", "kills", "purchases", "bomb_events",
    "kill_details", "damages", "shots", "blinds", "round_economy", "chat_messages", "pings", "zone_time",
    "death_inventory", "early_places",
)
ANALYSIS_TABLES = ("player_match_stats", "round_summaries", "team_match_stats", "match_facts", "communication_reports")

POSITION_SAMPLE_TICKS = 8


async def delete_match_events(match_id: str) -> None:
    for table in EVENT_TABLES:
        await execute(f"DELETE FROM {table} WHERE match_id = $1", match_id)


async def delete_match_everything(match_id: str) -> None:
    """Legacy event tables have no FK to matches, so retention must delete them explicitly."""
    await delete_match_events(match_id)
    for table in ANALYSIS_TABLES + ("mistakes", "ai_round_reviews"):
        await execute(f"DELETE FROM {table} WHERE match_id = $1", match_id)
    await execute("DELETE FROM folder_matches WHERE match_id = $1", match_id)
    await execute("DELETE FROM tournament_matches WHERE match_id = $1", match_id)
    await execute("DELETE FROM matches WHERE match_id = $1", match_id)


async def _set_progress(match_id: str, pct: int) -> None:
    await execute("UPDATE matches SET progress=$2 WHERE match_id=$1", match_id, min(99, pct))


async def save_parse_result(match_id: str, result: ParseResult) -> None:
    await delete_match_events(match_id)
    await execute(
        """
        UPDATE matches SET map_name=$2, score_t=$3, score_ct=$4, team_t_name=$5, team_ct_name=$6,
               tick_rate=$7, position_tick_step=$8, parser_version=$9, has_voice=$10, voice_reason=$11,
               updated_at=NOW()
        WHERE match_id=$1
        """,
        match_id, result.map_name, result.score_t, result.score_ct, result.team_t_name, result.team_ct_name,
        result.tick_rate, result.position_tick_step, result.parser_version,
        bool(result.voice.get("available")), str(result.voice.get("reason") or ""),
    )

    link = await fetchrow("SELECT auto_tournament_id, auto_tournament_stage, auto_folder_id FROM matches WHERE match_id=$1", match_id)
    try:
        if link and link["auto_tournament_id"]:
            await execute(
                """INSERT INTO tournament_matches (tournament_id, match_id, stage) VALUES ($1::uuid, $2, $3)
                   ON CONFLICT (tournament_id, match_id) DO UPDATE SET stage = EXCLUDED.stage""",
                str(link["auto_tournament_id"]), match_id, link["auto_tournament_stage"] or "group",
            )
        if link and link["auto_folder_id"]:
            await execute(
                "INSERT INTO folder_matches (folder_id, match_id) VALUES ($1::uuid, $2) ON CONFLICT DO NOTHING",
                str(link["auto_folder_id"]), match_id,
            )
    except Exception as exc:
        logger.warning("Auto folder/tournament link failed for %s: %s", match_id, exc)

    await bulk_copy("players", ["match_id", "name", "team", "steam_id", "crosshair_code"],
                    [(match_id, p["name"], p["team"], p.get("steam_id"), p.get("crosshair_code")) for p in result.players])
    await bulk_copy(
        "rounds",
        ["match_id", "round_number", "winner", "win_type", "duration_seconds", "start_tick", "end_tick",
         "winner_team", "freeze_end_tick", "t_team", "ct_team"],
        [(match_id, r["round_number"], r["winner"], r["win_type"], r["duration_seconds"], r.get("start_tick"),
          r.get("end_tick"), r.get("winner_team"), r.get("freeze_end_tick"), r.get("t_team"), r.get("ct_team"))
         for r in result.rounds],
    )
    await bulk_copy("round_pauses", ["match_id", "round_number", "start_tick", "end_tick", "pause_type"],
                    [(match_id, *row) for row in result.round_pauses])

    def _pad_position(row: tuple | list) -> tuple:
        cols = list(row)
        while len(cols) < 13:
            cols.append(None)
        if cols[12] is None:
            cols[12] = False
        return (match_id, *cols[:13])

    await bulk_copy(
        "positions",
        ["match_id", "tick", "player_name", "team", "x", "y", "z", "round_number", "yaw", "health", "armor", "pitch", "weapon", "scoped"],
        [_pad_position(row) for row in result.positions],
    )
    await bulk_copy(
        "grenades",
        ["match_id", "grenade_type", "player_name", "team", "from_x", "from_y", "from_z", "to_x", "to_y", "to_z", "tick", "round_number"],
        [(match_id, *row) for row in result.grenades],
    )
    await bulk_copy("kills", ["match_id", "tick", "killer", "victim", "weapon", "headshot", "round_number"],
                    [(match_id, *row) for row in result.kills])
    await bulk_copy("purchases", ["match_id", "player_name", "tick", "round_number", "item", "cost"],
                    [(match_id, *row) for row in result.purchases])
    await bulk_copy("bomb_events", ["match_id", "event_type", "tick", "round_number", "site", "player_name", "x", "y"],
                    [(match_id, *row) for row in result.bomb_events])

    await bulk_copy(
        "kill_details",
        ["match_id", "tick", "round_number", "killer", "victim", "assister", "weapon", "headshot", "assisted_flash",
         "penetrated", "thrusmoke", "attacker_blind", "noscope", "attacker_in_air", "distance", "killer_side",
         "victim_side", "killer_x", "killer_y", "killer_z", "victim_x", "victim_y", "victim_z", "killer_place",
         "victim_place", "killer_speed", "killer_steamid", "victim_steamid"],
        [(match_id, *row) for row in result.kill_details],
    )
    await bulk_copy(
        "damages",
        ["match_id", "tick", "round_number", "attacker", "victim", "attacker_side", "victim_side", "weapon",
         "dmg_health", "dmg_armor", "health_after", "hitgroup", "attacker_x", "attacker_y", "victim_x", "victim_y",
         "attacker_place", "victim_place", "raw_dmg"],
        [(match_id, *row) for row in result.damages],
    )
    await bulk_copy("shots", ["match_id", "tick", "round_number", "player_name", "side", "weapon", "speed", "x", "y", "place"],
                    [(match_id, *row) for row in result.shots])
    await bulk_copy("blinds", ["match_id", "tick", "round_number", "flasher", "flasher_side", "victim", "victim_side", "duration"],
                    [(match_id, *row) for row in result.blinds])
    await bulk_copy(
        "round_economy",
        ["match_id", "round_number", "player_name", "side", "money_start", "cash_spent", "equip_value",
         "round_start_equip", "has_defuser", "has_helmet", "armor", "steam_id"],
        [(match_id, *row) for row in result.economy],
    )
    await bulk_copy("chat_messages", ["match_id", "tick", "round_number", "player_name", "side", "text"],
                    [(match_id, *row) for row in result.chat])
    await bulk_copy("pings", ["match_id", "tick", "round_number", "player_name", "side", "x", "y", "z", "player_place", "urgent"],
                    [(match_id, *row) for row in result.pings])
    await bulk_copy("zone_time", ["match_id", "round_number", "player_name", "side", "place", "seconds"],
                    [(match_id, *row) for row in result.zones])
    await bulk_copy("death_inventory", ["match_id", "tick", "round_number", "victim", "items", "value"],
                    [(match_id, r[0], r[1], r[2], list(r[3] or []), int(r[4] or 0)) for r in result.death_inventory])
    await bulk_copy("early_places", ["match_id", "round_number", "player_name", "side", "place"],
                    [(match_id, *row) for row in result.early_places])


def _records(rows: list[Any]) -> list[dict[str, Any]]:
    return [dict(r) for r in rows]


async def load_match_data(match_id: str) -> MatchData:
    m = await fetchrow("SELECT * FROM matches WHERE match_id=$1", match_id)
    if not m:
        raise ValueError(f"match {match_id} not found")
    q = lambda sql: fetch(sql, match_id)  # noqa: E731
    players, rounds, kd, kills_legacy, damages, shots, blinds, grenades, economy, bombs, zones, inv, early, pauses = await asyncio.gather(
        q("SELECT name, team, steam_id FROM players WHERE match_id=$1"),
        q("SELECT * FROM rounds WHERE match_id=$1 ORDER BY round_number"),
        q("SELECT * FROM kill_details WHERE match_id=$1 ORDER BY tick"),
        q("SELECT tick, killer, victim, weapon, headshot, round_number FROM kills WHERE match_id=$1 ORDER BY tick"),
        q("SELECT * FROM damages WHERE match_id=$1 ORDER BY tick"),
        q("SELECT * FROM shots WHERE match_id=$1 ORDER BY tick"),
        q("SELECT * FROM blinds WHERE match_id=$1 ORDER BY tick"),
        q("SELECT grenade_type, player_name, team, to_x, to_y, tick, round_number FROM grenades WHERE match_id=$1 ORDER BY tick"),
        q("SELECT * FROM round_economy WHERE match_id=$1"),
        q("SELECT * FROM bomb_events WHERE match_id=$1 ORDER BY tick"),
        q("SELECT * FROM zone_time WHERE match_id=$1"),
        q("SELECT * FROM death_inventory WHERE match_id=$1"),
        q("SELECT * FROM early_places WHERE match_id=$1"),
        q("SELECT * FROM round_pauses WHERE match_id=$1"),
    )
    pos_rows = await fetch(
        f"""SELECT tick, player_name, team, x, y, z, round_number, yaw, pitch, health FROM positions
            WHERE match_id=$1 AND tick % {POSITION_SAMPLE_TICKS} = 0 AND x IS NOT NULL AND y IS NOT NULL""",
        match_id,
    )
    kills = _records(kd)
    if not kills:
        kills = [{**dict(k), "killer_side": None, "victim_side": None} for k in kills_legacy]
    return MatchData(
        match_id=match_id, map_name=m["map_name"] or "", tick_rate=float(m["tick_rate"] or 64),
        team_t_name=m["team_t_name"], team_ct_name=m["team_ct_name"], score_t=m["score_t"] or 0, score_ct=m["score_ct"] or 0,
        players=_records(players), rounds=_records(rounds), kills=kills, damages=_records(damages), shots=_records(shots),
        blinds=_records(blinds), grenades=_records(grenades), economy=_records(economy), bombs=_records(bombs),
        zones=_records(zones), death_inventory=_records(inv), early_places=_records(early),
        positions=[tuple(r) for r in pos_rows], pauses=_records(pauses),
    )


async def analyze_match(match_id: str) -> dict[str, Any]:
    started = time.perf_counter()
    await execute("UPDATE matches SET analysis_status='running' WHERE match_id=$1", match_id)
    md = await load_match_data(match_id)
    result = await asyncio.to_thread(compute, md)
    meta = await fetchrow("SELECT org_id FROM matches WHERE match_id=$1", match_id)
    org_id = meta["org_id"] if meta else None

    for table in ANALYSIS_TABLES:
        await execute(f"DELETE FROM {table} WHERE match_id=$1", match_id)

    winner = result.winner_team
    rows = []
    for (name, side), counters in result.player_counters.items():
        team = result.player_team.get(name)
        rows.append((match_id, name, side, team, result.player_steam.get(name),
                     (team == winner) if winner else None, json.dumps(counters),
                     json.dumps(result.player_extras.get((name, side), {}), default=list), METRIC_VERSION))
    if rows:
        await bulk_copy("player_match_stats",
                        ["match_id", "player_name", "side", "team_name", "steam_id", "won", "counters", "extras", "metric_version"],
                        rows)
    await bulk_copy("round_summaries", ["match_id", "round_number", "data"],
                    [(match_id, rs["round"], json.dumps(rs)) for rs in result.round_summaries])
    await bulk_copy("team_match_stats", ["match_id", "team_name", "won", "data"],
                    [(match_id, t, (t == winner) if winner else None, json.dumps(ts)) for t, ts in result.team_counters.items()])

    lineups = _records(await fetch(
        "SELECT id, title, grenade_type, land_x, land_y FROM lineups WHERE map_name=$1 AND (org_id IS NOT DISTINCT FROM $2 OR org_id IS NULL)",
        md.map_name, org_id,
    ))
    found = detect(result, md.tick_rate, lineups)
    positions = _Positions(md.positions)
    found += detect_late_rotations(result, lambda n, t: positions.at(n, t), md.tick_rate)

    previous = {
        (r["type"], r["round_number"], r["player_name"]): dict(r)
        for r in await fetch("SELECT type, round_number, player_name, status, coach_comment, reviewed_by FROM mistakes WHERE match_id=$1", match_id)
    }
    await execute("DELETE FROM mistakes WHERE match_id=$1", match_id)
    mistake_rows = []
    for mk in found:
        prev = previous.get((mk["type"], mk["round_number"], mk["player_name"])) or {}
        mistake_rows.append((
            match_id, mk["round_number"], mk["player_name"], mk["team_name"], mk["side"], mk["type"], mk["category"],
            mk["severity"], mk["confidence"], mk["tick_start"], mk["tick_end"], mk["title"], mk["explanation"],
            mk["recommendation"], mk["solution_code"], json.dumps(mk["evidence"], default=str),
            prev.get("status") or "open", prev.get("coach_comment"),
        ))
    if mistake_rows:
        await bulk_copy("mistakes",
                        ["match_id", "round_number", "player_name", "team_name", "side", "type", "category", "severity",
                         "confidence", "tick_start", "tick_end", "title", "explanation", "recommendation", "solution_code",
                         "evidence", "status", "coach_comment"],
                        mistake_rows)

    await execute("DELETE FROM ai_round_reviews WHERE match_id=$1 AND source='rules'", match_id)
    llm_rounds = {r["round_number"] for r in await fetch("SELECT round_number FROM ai_round_reviews WHERE match_id=$1", match_id)}
    by_round: dict[int, list[dict]] = {}
    for mk in found:
        if mk["round_number"] is not None:
            by_round.setdefault(mk["round_number"], []).append(mk)
    review_rows = [
        (match_id, rs["round"], json.dumps(rules_review(rs, by_round.get(rs["round"], []))), "rules", None)
        for rs in result.round_summaries if rs["round"] not in llm_rounds
    ]
    if review_rows:
        await bulk_copy("ai_round_reviews", ["match_id", "round_number", "review", "source", "model"], review_rows)

    match_meta = {"map_name": md.map_name, "team_t_name": md.team_t_name, "team_ct_name": md.team_ct_name,
                  "score_t": md.score_t, "score_ct": md.score_ct}
    facts = build_facts(match_meta, result.round_summaries, found, result.player_counters, result.player_team, result.team_counters)
    if facts:
        await bulk_copy("match_facts", ["match_id", "kind", "round_number", "player_name", "tick", "text"],
                        [(match_id, f["kind"], f["round_number"], f["player_name"], f["tick"], f["text"]) for f in facts])
        await execute("UPDATE match_facts SET tsv = to_tsvector('simple', text) WHERE match_id=$1", match_id)

    pings = _records(await fetch("SELECT * FROM pings WHERE match_id=$1 ORDER BY tick", match_id))
    chat = _records(await fetch("SELECT * FROM chat_messages WHERE match_id=$1 ORDER BY tick", match_id))
    mrow = await fetchrow("SELECT has_voice, voice_reason FROM matches WHERE match_id=$1", match_id)
    report = build_report(md.tick_rate, pings, chat, md.damages, result.round_summaries,
                          bool(mrow["has_voice"]) if mrow else False, mrow["voice_reason"] if mrow else None)
    await execute(
        "INSERT INTO communication_reports (match_id, has_voice, voice_reason, report) VALUES ($1,$2,$3,$4::jsonb)",
        match_id, report["voice"]["available"], report["voice"]["reason"], json.dumps(report, default=str),
    )

    for name in result.player_team:
        try:
            await verify_player_homework(name)
        except Exception as exc:
            logger.warning("homework verification failed for %s: %s", name, exc)

    await execute(
        "UPDATE matches SET analysis_status='ready', analysis_version=$2, updated_at=NOW() WHERE match_id=$1",
        match_id, METRIC_VERSION,
    )
    took = int((time.perf_counter() - started) * 1000)
    logger.info("analysis done match=%s players=%s rounds=%s mistakes=%s facts=%s took_ms=%s",
                match_id, len(result.player_team), len(result.round_summaries), len(found), len(facts), took)
    return {"players": len(result.player_team), "rounds": len(result.round_summaries), "mistakes": len(found), "took_ms": took}


async def refund_quota(match_id: str) -> None:
    await execute("DELETE FROM demo_usage WHERE match_id=$1", match_id)


async def run_parse_job(match_id: str, file_path: str, kind: str = "parse") -> None:
    worker = f"{socket.gethostname()}:{os.getpid()}"
    queued = await fetchrow(
        "SELECT id FROM parse_jobs WHERE match_id=$1 AND status='queued' ORDER BY queued_at LIMIT 1", match_id,
    )
    if queued:
        job = await fetchrow(
            "UPDATE parse_jobs SET status='running', kind=$2, worker=$3, started_at=NOW() WHERE id=$1 RETURNING id",
            queued["id"], kind, worker,
        )
    else:
        attempt_row = await fetchrow("SELECT COUNT(*)::int AS n FROM parse_jobs WHERE match_id=$1", match_id)
        job = await fetchrow(
            "INSERT INTO parse_jobs (match_id, kind, status, attempt, worker, started_at) VALUES ($1,$2,'running',$3,$4,NOW()) RETURNING id",
            match_id, kind, (attempt_row["n"] if attempt_row else 0) + 1, worker,
        )
    job_id = job["id"]
    started = time.perf_counter()
    log = {"parse_job_id": str(job_id), "match_id": match_id, "kind": kind}
    logger.info("parse job start %s", json.dumps(log))
    try:
        if kind == "analyze":
            await execute("UPDATE matches SET status='analyzing', progress=95 WHERE match_id=$1", match_id)
            await analyze_match(match_id)
        else:
            await execute("UPDATE matches SET status='parsing', progress=10, message=NULL WHERE match_id=$1", match_id)
            loop = asyncio.get_running_loop()

            def on_progress(pct: int) -> None:
                loop.call_soon_threadsafe(lambda: asyncio.create_task(_set_progress(match_id, int(pct * 0.8))))

            if is_s3_enabled() and not os.path.exists(file_path):
                await asyncio.to_thread(download_demo_file, match_id, file_path)
            if not os.path.exists(file_path):
                raise FileNotFoundError("Файл демки больше не хранится (истёк срок хранения) — загрузите демку заново.")
            result = await asyncio.to_thread(parse_demo, file_path, on_progress)
            await execute("UPDATE matches SET status='saving', progress=82 WHERE match_id=$1", match_id)
            await save_parse_result(match_id, result)
            await execute("UPDATE matches SET status='analyzing', progress=92 WHERE match_id=$1", match_id)
            await analyze_match(match_id)
        await execute("UPDATE matches SET status='ready', progress=100, message=NULL WHERE match_id=$1", match_id)
        await execute("UPDATE parse_jobs SET status='done', finished_at=NOW(), duration_ms=$2 WHERE id=$1",
                      job_id, int((time.perf_counter() - started) * 1000))
        logger.info("parse job done %s", json.dumps({**log, "duration_ms": int((time.perf_counter() - started) * 1000)}))
        await _notify_ready(match_id)
    except Exception as exc:
        logger.exception("parse job failed %s", json.dumps(log))
        message = str(exc)[:2000]
        await execute("UPDATE matches SET status='error', message=$2, progress=0, analysis_status='error' WHERE match_id=$1",
                      match_id, message)
        await execute("UPDATE parse_jobs SET status='failed', error=$2, finished_at=NOW(), duration_ms=$3 WHERE id=$1",
                      job_id, message, int((time.perf_counter() - started) * 1000))
        if kind == "parse":
            await refund_quota(match_id)
    finally:
        if kind == "parse" and is_s3_enabled() and settings.s3_delete_local_after_parse:
            try:
                Path(file_path).unlink(missing_ok=True)
            except Exception:
                pass


async def _notify_ready(match_id: str) -> None:
    try:
        from integrations import notify_demo_ready
        from social import publish_activity

        owner = await fetchrow("SELECT owner_id, map_name FROM matches WHERE match_id=$1", match_id)
        if owner and owner["owner_id"]:
            await publish_activity(str(owner["owner_id"]), "demo_ready", {"match_id": match_id, "map_name": owner["map_name"]})
            await notify_demo_ready(str(owner["owner_id"]), match_id, owner["map_name"])
    except Exception as exc:
        logger.warning("ready notification failed for %s: %s", match_id, exc)
