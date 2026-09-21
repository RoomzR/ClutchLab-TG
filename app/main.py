import asyncio
import hashlib
import json
import logging
import math
import os
import time
import uuid
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from starlette.middleware.base import BaseHTTPMiddleware

from config import settings
from parser import ParseResult, compute_heatmap, compute_player_habits, parse_demo
from postgres_repo import bulk_copy, cleanup_old_matches, close_pool, execute, fetch, fetchrow, init_pool
from saas_schema import ensure_saas_schema
from seed_users import seed_demo_users
from auth_routes import router as auth_router
from billing_routes import router as billing_router
from clan_routes import router as clan_router
from gamification_routes import router as gamification_router
from admin_routes import router as admin_router
from apikey_routes import router as apikey_router
from challenge_routes import router as challenge_router
from social_routes import router as social_router
from social import publish_activity
from parse_queue import (
    enqueue_parse,
    is_priority_role,
    queue_depth,
    start_workers as start_parse_workers,
    stop_workers as stop_parse_workers,
)
from integrations import notify_demo_ready, router as integrations_router
from coach_routes import router as coach_router
from tournament_routes import router as tournament_router
from folder_routes import router as folder_router
from digest import weekly_digest_loop
from gamification import XP_PER_UPLOAD, award_xp, check_upload_achievements
from permissions import AuthUser, get_optional_user, limits_for_role
from rate_limit import check_rate_limit
from demo_storage import is_s3_enabled, upload_demo_file, download_demo_file, delete_demo_files

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)

if settings.sentry_dsn:
    try:
        import sentry_sdk

        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            traces_sample_rate=settings.sentry_traces_sample_rate,
            profiles_sample_rate=0.1,
            environment="production",
        )
        logger.info("Sentry monitoring enabled")
    except Exception as exc:
        logger.warning("Sentry init failed: %s", exc)

parse_semaphore = asyncio.Semaphore(settings.parse_semaphore_limit)

matches_cache: dict[str, dict[str, Any]] = {}


class RequestTimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        start = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start) * 1000
        logger.info("%s %s %.1fms", request.method, request.url.path, duration_ms)
        response.headers["X-Response-Time"] = f"{duration_ms:.1f}ms"
        return response


class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable):
        is_upload = request.url.path.endswith("/upload") and request.method == "POST"
        timeout = 600 if is_upload else 60
        try:
            return await asyncio.wait_for(call_next(request), timeout=timeout)
        except asyncio.TimeoutError:
            return JSONResponse({"detail": "Request timeout"}, status_code=504)


async def cleanup_loop() -> None:
    while True:
        try:
            await asyncio.sleep(24 * 3600)
            old_match_ids = await cleanup_old_matches(settings.demo_retention_days)
            count = len(old_match_ids)
            upload_path = Path(settings.upload_dir)
            local_deleted = 0
            if upload_path.exists():
                cutoff = time.time() - settings.demo_retention_days * 86400
                for file in upload_path.glob("*.dem"):
                    if file.stat().st_mtime < cutoff:
                        file.unlink(missing_ok=True)
                        local_deleted += 1

            if is_s3_enabled() and settings.s3_cleanup_enabled:
                deleted_s3 = await asyncio.to_thread(delete_demo_files, old_match_ids)
                logger.info(
                    "Cleanup removed %s old matches (local files: %s, S3 objects: %s)",
                    count,
                    local_deleted,
                    deleted_s3,
                )
            else:
                logger.info("Cleanup removed %s old matches (local files: %s)", count, local_deleted)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.exception("Cleanup error: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs(settings.upload_dir, exist_ok=True)
    os.makedirs(settings.voice_notes_dir, exist_ok=True)
    pool = await init_pool()
    await ensure_saas_schema(pool)
    await seed_demo_users(pool)
    cleanup_task = asyncio.create_task(cleanup_loop())
    start_parse_workers(_parse_demo_task, count=settings.parse_worker_count)
    digest_task = asyncio.create_task(weekly_digest_loop())
    yield
    cleanup_task.cancel()
    digest_task.cancel()
    for task in (cleanup_task, digest_task):
        try:
            await task
        except asyncio.CancelledError:
            pass
    await stop_parse_workers()
    await close_pool()


app = FastAPI(title="ClutchLab API", lifespan=lifespan)

app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(clan_router)
app.include_router(gamification_router)
app.include_router(admin_router)
app.include_router(apikey_router)
app.include_router(challenge_router)
app.include_router(social_router)
app.include_router(integrations_router)
app.include_router(coach_router)
app.include_router(tournament_router)
app.include_router(folder_router)


@app.get("/api/queue")
async def parse_queue_status():
    return await queue_depth()

trusted = [h.strip() for h in settings.trusted_hosts.split(",") if h.strip()]
if trusted and trusted != ["*"]:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted)

app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(TimeoutMiddleware)
app.add_middleware(RequestTimingMiddleware)

cors_origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins if cors_origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _sanitize_for_json(value: Any) -> Any:
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return None
        return value
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, dict):
        return {key: _sanitize_for_json(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_sanitize_for_json(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_for_json(item) for item in value]
    return value


POSITIONS_SELECT = """
    SELECT tick, player_name, team, x, y, z, round_number, yaw, health, armor, pitch, weapon, scoped
    FROM positions
    WHERE match_id=$1
      AND x IS NOT NULL AND y IS NOT NULL
      AND x::text NOT IN ('NaN', 'nan', 'Infinity', '-Infinity')
      AND y::text NOT IN ('NaN', 'nan', 'Infinity', '-Infinity')
"""


def _etag_for_payload(payload: Any) -> str:
    raw = json.dumps(_sanitize_for_json(payload), sort_keys=True, default=str).encode()
    return hashlib.md5(raw).hexdigest()


def _cached_json(
    payload: Any,
    cache_control: str,
    request: Request,
) -> Response:
    clean_payload = _sanitize_for_json(payload)
    etag = _etag_for_payload(clean_payload)
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304, headers={"ETag": etag, "Cache-Control": cache_control})
    return JSONResponse(
        clean_payload,
        headers={"ETag": etag, "Cache-Control": cache_control},
    )


async def _save_parse_result(match_id: str, result: ParseResult) -> None:
    await execute(
        """
        UPDATE matches SET map_name=$2, score_t=$3, score_ct=$4,
        team_t_name=$5, team_ct_name=$6, tick_rate=$7, position_tick_step=$8,
        status='ready', progress=100
        WHERE match_id=$1
        """,
        match_id,
        result.map_name,
        result.score_t,
        result.score_ct,
        result.team_t_name,
        result.team_ct_name,
        result.tick_rate,
        result.position_tick_step,
    )

    # Auto-link to tournament after parse (set at upload time)
    try:
        link = await fetchrow(
            """
            SELECT auto_tournament_id, auto_tournament_stage, auto_folder_id
            FROM matches WHERE match_id = $1
            """,
            match_id,
        )
        if link and link["auto_tournament_id"]:
            await execute(
                """
                INSERT INTO tournament_matches (tournament_id, match_id, stage)
                VALUES ($1::uuid, $2, $3)
                ON CONFLICT (tournament_id, match_id) DO UPDATE SET stage = EXCLUDED.stage
                """,
                str(link["auto_tournament_id"]),
                match_id,
                link["auto_tournament_stage"] or "group",
            )
        if link and link["auto_folder_id"]:
            await execute(
                """
                INSERT INTO folder_matches (folder_id, match_id)
                VALUES ($1::uuid, $2)
                ON CONFLICT DO NOTHING
                """,
                str(link["auto_folder_id"]),
                match_id,
            )
    except Exception as exc:
        logger.warning("Auto folder/tournament link failed for %s: %s", match_id, exc)

    for player in result.players:
        await execute(
            """
            INSERT INTO players (match_id, name, team, steam_id, crosshair_code)
            VALUES ($1, $2, $3, $4, $5)
            """,
            match_id,
            player["name"],
            player["team"],
            player.get("steam_id"),
            player.get("crosshair_code"),
        )

    if result.rounds:
        await bulk_copy(
            "rounds",
            [
                "match_id",
                "round_number",
                "winner",
                "win_type",
                "duration_seconds",
                "start_tick",
                "end_tick",
                "winner_team",
                "freeze_end_tick",
            ],
            [
                (
                    match_id,
                    r["round_number"],
                    r["winner"],
                    r["win_type"],
                    r["duration_seconds"],
                    r.get("start_tick"),
                    r.get("end_tick"),
                    r.get("winner_team"),
                    r.get("freeze_end_tick"),
                )
                for r in result.rounds
            ],
        )

    if result.round_pauses:
        await bulk_copy(
            "round_pauses",
            ["match_id", "round_number", "start_tick", "end_tick", "pause_type"],
            [(match_id, *row) for row in result.round_pauses],
        )

    if result.positions:
        def _pad_position(row: tuple | list) -> tuple:
            cols = list(row)
            # tick,name,team,x,y,z,round,yaw[,health,armor,pitch,weapon,scoped]
            while len(cols) < 13:
                cols.append(None)
            if cols[12] is None:
                cols[12] = False
            return (match_id, *cols[:13])

        await bulk_copy(
            "positions",
            [
                "match_id",
                "tick",
                "player_name",
                "team",
                "x",
                "y",
                "z",
                "round_number",
                "yaw",
                "health",
                "armor",
                "pitch",
                "weapon",
                "scoped",
            ],
            [_pad_position(row) for row in result.positions],
        )

    if result.grenades:
        await bulk_copy(
            "grenades",
            [
                "match_id", "grenade_type", "player_name", "team",
                "from_x", "from_y", "from_z", "to_x", "to_y", "to_z", "tick", "round_number",
            ],
            [(match_id, *row) for row in result.grenades],
        )

    if result.kills:
        await bulk_copy(
            "kills",
            ["match_id", "tick", "killer", "victim", "weapon", "headshot", "round_number"],
            [(match_id, *row) for row in result.kills],
        )

    if result.purchases:
        await bulk_copy(
            "purchases",
            ["match_id", "player_name", "tick", "round_number", "item", "cost"],
            [(match_id, *row) for row in result.purchases],
        )

    if result.bomb_events:
        await bulk_copy(
            "bomb_events",
            ["match_id", "event_type", "tick", "round_number", "site", "player_name", "x", "y"],
            [(match_id, *row) for row in result.bomb_events],
        )

    matches_cache[match_id] = {
        "positions": result.positions,
        "grenades": result.grenades,
        "kills": result.kills,
    }


async def _parse_demo_task(match_id: str, file_path: str) -> None:
    async with parse_semaphore:
        try:
            await execute(
                "UPDATE matches SET status='parsing', progress=10 WHERE match_id=$1",
                match_id,
            )

            loop = asyncio.get_running_loop()

            def on_progress(pct: int) -> None:
                async def _update() -> None:
                    await execute(
                        "UPDATE matches SET progress=$2 WHERE match_id=$1",
                        match_id,
                        min(99, pct),
                    )

                loop.call_soon_threadsafe(lambda: asyncio.create_task(_update()))

            # When using S3 storage the worker may receive a file_path that was deleted
            # after upload. Fetch it back for parsing.
            if is_s3_enabled() and not os.path.exists(file_path):
                await asyncio.to_thread(download_demo_file, match_id, file_path)

            result = await asyncio.to_thread(parse_demo, file_path, on_progress)
            await _save_parse_result(match_id, result)

            owner_row = await fetchrow(
                "SELECT owner_id, map_name FROM matches WHERE match_id = $1", match_id,
            )
            if owner_row and owner_row["owner_id"]:
                await publish_activity(
                    str(owner_row["owner_id"]),
                    "demo_ready",
                    {"match_id": match_id, "map_name": owner_row["map_name"]},
                )
                await notify_demo_ready(
                    str(owner_row["owner_id"]), match_id, owner_row["map_name"],
                )
        except Exception as exc:
            logger.exception("Parse failed for %s", match_id)
            await execute(
                "UPDATE matches SET status='error', message=$2, progress=0 WHERE match_id=$1",
                match_id,
                str(exc),
            )
        finally:
            if is_s3_enabled() and settings.s3_delete_local_after_parse:
                try:
                    Path(file_path).unlink(missing_ok=True)
                except Exception:
                    pass


DEM_MAGIC_PREFIXES = (b"PBDEMS2", b"HL2DEMO")


async def _check_upload_quota(user: AuthUser, size_bytes: int) -> None:
    limits = limits_for_role(user.role)
    max_bytes = limits["max_file_mb"] * 1024 * 1024
    if size_bytes > max_bytes:
        raise HTTPException(
            413,
            f"File exceeds your plan limit of {limits['max_file_mb']} MB. Upgrade to upload larger demos.",
        )

    used_row = await fetchrow(
        """
        SELECT COUNT(*) AS used FROM demo_usage
        WHERE user_id = $1::uuid AND uploaded_at >= date_trunc('month', NOW())
        """,
        user.id,
    )
    bonus_row = await fetchrow(
        "SELECT COALESCE(SUM(amount), 0) AS bonus FROM demo_bonuses WHERE user_id = $1::uuid",
        user.id,
    )
    used = int(used_row["used"]) if used_row else 0
    quota = limits["max_demos"] + (int(bonus_row["bonus"]) if bonus_row else 0)
    if used >= quota:
        raise HTTPException(
            402,
            f"Monthly demo quota reached ({quota}). Upgrade your plan for more uploads.",
        )


@app.post("/api/matches/upload")
async def upload_demo(
    request: Request,
    file: UploadFile = File(...),
    folder_id: str | None = Form(None),
    tournament_id: str | None = Form(None),
    stage: str = Form("group"),
    user: AuthUser | None = Depends(get_optional_user),
):
    await check_rate_limit(request, "general")

    if settings.auth_required and user is None:
        raise HTTPException(401, "Log in to upload demos")

    if not file.filename or not file.filename.endswith(".dem"):
        raise HTTPException(400, "Only .dem files are allowed")

    content = await file.read()
    if len(content) > settings.max_upload_bytes:
        raise HTTPException(413, "File exceeds 600 MB limit")

    # Validate .dem signature (Source 2 / Source 1 demo headers)
    if not content[:8].startswith(DEM_MAGIC_PREFIXES):
        raise HTTPException(400, "File is not a valid CS2 demo (.dem signature mismatch)")

    if user is not None:
        await _check_upload_quota(user, len(content))

    # Validate optional folder / tournament targets (owner-only)
    auto_folder_id = None
    auto_tournament_id = None
    auto_stage = stage if stage in ("group", "quarter", "semi", "final", "other") else "group"
    if user is not None and folder_id:
        folder = await fetchrow(
            "SELECT id FROM demo_folders WHERE id = $1::uuid AND owner_id = $2::uuid",
            folder_id, user.id,
        )
        if not folder:
            raise HTTPException(404, "Folder not found")
        auto_folder_id = folder_id
    if user is not None and tournament_id:
        t = await fetchrow(
            "SELECT id FROM tournaments WHERE id = $1::uuid AND owner_id = $2::uuid",
            tournament_id, user.id,
        )
        if not t:
            raise HTTPException(404, "Tournament not found")
        auto_tournament_id = tournament_id

    match_id = str(uuid.uuid4())
    file_path = os.path.join(settings.upload_dir, f"{match_id}.dem")

    with open(file_path, "wb") as f:
        f.write(content)

    if is_s3_enabled():
        try:
            await asyncio.to_thread(upload_demo_file, file_path, match_id)
            if settings.s3_delete_local_after_upload:
                Path(file_path).unlink(missing_ok=True)
        except Exception as exc:
            logger.warning("S3 upload failed for %s: %s", match_id, exc)

    await execute(
        """
        INSERT INTO matches (match_id, status, progress, file_path, owner_id,
                             auto_folder_id, auto_tournament_id, auto_tournament_stage)
        VALUES ($1, 'pending', 0, $2, $3::uuid, $4::uuid, $5::uuid, $6)
        """,
        match_id,
        file_path,
        user.id if user else None,
        auto_folder_id,
        auto_tournament_id,
        auto_stage,
    )

    if auto_folder_id:
        await execute(
            """
            INSERT INTO folder_matches (folder_id, match_id)
            VALUES ($1::uuid, $2)
            ON CONFLICT DO NOTHING
            """,
            auto_folder_id, match_id,
        )

    new_achievements: list[dict] = []
    if user is not None:
        await execute(
            "INSERT INTO demo_usage (user_id, match_id, file_size_bytes) VALUES ($1::uuid, $2, $3)",
            user.id, match_id, len(content),
        )
        try:
            await award_xp(user.id, XP_PER_UPLOAD, "demo_upload")
            new_achievements = await check_upload_achievements(user.id)
        except Exception as exc:
            logger.warning("Gamification update failed: %s", exc)

    lane = await enqueue_parse(
        match_id, file_path, priority=is_priority_role(user.role if user else None),
    )
    return {
        "match_id": match_id,
        "queue": lane,
        "folder_id": auto_folder_id,
        "tournament_id": auto_tournament_id,
        "xp_awarded": XP_PER_UPLOAD if user else 0,
        "new_achievements": [
            {"code": a["code"], "name": a["name"], "xp_reward": a["xp_reward"], "tier": a["tier"]}
            for a in new_achievements
        ],
    }


@app.get("/api/matches")
async def list_matches(request: Request, limit: int = 40, pro: bool | None = None):
    pro_filter = "" if pro is None else ("AND is_pro" if pro else "AND NOT is_pro")
    rows = await fetch(
        f"""
        SELECT match_id, map_name, score_t, score_ct, team_t_name, team_ct_name, created_at, is_pro,
               (SELECT COUNT(*)::int FROM players WHERE players.match_id = matches.match_id) AS player_count
        FROM matches
        WHERE status = 'ready' {pro_filter}
        ORDER BY created_at DESC
        LIMIT $1
        """,
        min(limit, 100),
    )
    payload = [dict(r) for r in rows]
    return _cached_json(payload, "public, max-age=60", request)


@app.get("/api/history/players")
async def list_history_players(request: Request, limit: int = 80):
    rows = await fetch(
        """
        SELECT p.name, COUNT(DISTINCT p.match_id)::int AS match_count
        FROM players p
        JOIN matches m ON m.match_id = p.match_id AND m.status = 'ready'
        GROUP BY p.name
        ORDER BY match_count DESC, p.name
        LIMIT $1
        """,
        min(limit, 200),
    )
    payload = [dict(r) for r in rows]
    return _cached_json(payload, "public, max-age=120", request)


@app.get("/api/history/players/{player_name}")
async def get_player_history(player_name: str, request: Request):
    rows = await fetch(
        """
        SELECT m.match_id, m.map_name, m.score_t, m.score_ct, m.team_t_name, m.team_ct_name,
               p.team, m.created_at
        FROM players p
        JOIN matches m ON m.match_id = p.match_id AND m.status = 'ready'
        WHERE p.name = $1
        ORDER BY m.created_at DESC
        """,
        player_name,
    )
    if not rows:
        raise HTTPException(404, "Player not found in any match")

    match_ids = [r["match_id"] for r in rows]
    kill_rows = await fetch(
        """
        SELECT match_id, killer, victim FROM kills
        WHERE match_id = ANY($1::text[]) AND (killer = $2 OR victim = $2)
        """,
        match_ids,
        player_name,
    )
    kills_by_match: dict[str, dict[str, int]] = defaultdict(lambda: {"kills": 0, "deaths": 0})
    for kr in kill_rows:
        mid = kr["match_id"]
        if kr["killer"] == player_name:
            kills_by_match[mid]["kills"] += 1
        if kr["victim"] == player_name:
            kills_by_match[mid]["deaths"] += 1

    matches_out: list[dict[str, Any]] = []
    by_map: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"games": 0, "wins": 0, "kills": 0, "deaths": 0},
    )
    total_wins = 0
    total_kills = 0
    total_deaths = 0

    for row in rows:
        mid = row["match_id"]
        kd = kills_by_match[mid]
        team = row["team"]
        won = (team == "T" and row["score_t"] > row["score_ct"]) or (
            team == "CT" and row["score_ct"] > row["score_t"]
        )
        map_key = row["map_name"] or "unknown"

        by_map[map_key]["games"] += 1
        by_map[map_key]["kills"] += kd["kills"]
        by_map[map_key]["deaths"] += kd["deaths"]
        if won:
            by_map[map_key]["wins"] += 1
            total_wins += 1
        total_kills += kd["kills"]
        total_deaths += kd["deaths"]

        matches_out.append(
            {
                "match_id": mid,
                "map_name": map_key,
                "score_t": row["score_t"],
                "score_ct": row["score_ct"],
                "team": team,
                "won": won,
                "kills": kd["kills"],
                "deaths": kd["deaths"],
                "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            }
        )

    by_map_out = {
        map_name: {
            **stats,
            "winrate": round(stats["wins"] / stats["games"] * 100) if stats["games"] else 0,
            "kd": round(stats["kills"] / stats["deaths"], 2) if stats["deaths"] else stats["kills"],
        }
        for map_name, stats in by_map.items()
    }

    payload = {
        "player_name": player_name,
        "match_count": len(rows),
        "wins": total_wins,
        "winrate": round(total_wins / len(rows) * 100) if rows else 0,
        "kills": total_kills,
        "deaths": total_deaths,
        "kd": round(total_kills / total_deaths, 2) if total_deaths else float(total_kills),
        "matches": matches_out,
        "by_map": by_map_out,
    }
    return _cached_json(payload, "public, max-age=120", request)


@app.get("/api/matches/{match_id}/status")
async def get_status(match_id: str):
    row = await fetchrow(
        "SELECT status, progress, message FROM matches WHERE match_id=$1",
        match_id,
    )
    if not row:
        raise HTTPException(404, "Match not found")
    return {
        "status": row["status"],
        "progress": row["progress"],
        "message": row["message"],
    }


@app.get("/api/matches/{match_id}")
async def get_overview(match_id: str, request: Request):
    row = await fetchrow("SELECT * FROM matches WHERE match_id=$1", match_id)
    if not row:
        raise HTTPException(404, "Match not found")

    players = await fetch(
        "SELECT name, team, steam_id, crosshair_code FROM players WHERE match_id=$1",
        match_id,
    )
    payload = {
        "match_id": row["match_id"],
        "map_name": row["map_name"] or "de_dust2",
        "score_t": row["score_t"],
        "score_ct": row["score_ct"],
        "team_t_name": row["team_t_name"],
        "team_ct_name": row["team_ct_name"],
        "tick_rate": float(row["tick_rate"] or 64),
        "position_tick_step": int(row["position_tick_step"] or 2),
        "players": [dict(p) for p in players],
        "status": row["status"],
        "progress": row["progress"],
    }
    return _cached_json(payload, "public, max-age=300", request)


@app.get("/api/matches/{match_id}/positions")
async def get_positions(
    match_id: str,
    request: Request,
    round_number: int | None = None,
    round_numbers: str | None = None,
    tick_start: int | None = None,
    tick_end: int | None = None,
    player_names: str | None = None,
    team: str | None = None,
):
    query = POSITIONS_SELECT
    params: list[Any] = [match_id]
    has_round_filter = round_number is not None or bool(round_numbers)

    if round_numbers:
        nums = [int(n) for n in round_numbers.split(",") if n]
        query += f" AND round_number = ANY(${len(params)+1})"
        params.append(nums)
    elif round_number is not None:
        query += f" AND round_number = ${len(params)+1}"
        params.append(round_number)

    if tick_start is not None:
        query += f" AND tick >= ${len(params)+1}"
        params.append(tick_start)
    if tick_end is not None:
        query += f" AND tick <= ${len(params)+1}"
        params.append(tick_end)

    if player_names:
        names = player_names.split(",")
        query += f" AND player_name = ANY(${len(params)+1})"
        params.append(names)

    if team:
        query += f" AND team = ${len(params)+1}"
        params.append(team)

    limit = 350_000 if has_round_filter else 120_000
    query += f" ORDER BY tick LIMIT {limit}"

    rows = await fetch(query, *params)
    payload = [dict(r) for r in rows]
    return _cached_json(payload, "public, max-age=3600", request)


@app.get("/api/matches/{match_id}/grenades")
async def get_grenades(
    match_id: str,
    round_number: int | None = None,
    round_numbers: str | None = None,
    grenade_types: str | None = None,
    team: str | None = None,
    player_name: str | None = None,
):
    query = """
        SELECT grenade_type, player_name, team,
               from_x, from_y, from_z, to_x, to_y, to_z, tick, round_number
        FROM grenades WHERE match_id=$1
    """
    params: list[Any] = [match_id]

    if round_numbers:
        nums = [int(n) for n in round_numbers.split(",") if n]
        query += f" AND round_number = ANY(${len(params)+1})"
        params.append(nums)
    elif round_number is not None:
        query += f" AND round_number = ${len(params)+1}"
        params.append(round_number)

    if grenade_types:
        types = grenade_types.split(",")
        query += f" AND grenade_type = ANY(${len(params)+1})"
        params.append(types)

    if team:
        query += f" AND team = ${len(params)+1}"
        params.append(team)

    if player_name:
        query += f" AND player_name = ${len(params)+1}"
        params.append(player_name)

    query += """
        AND from_x IS NOT NULL AND to_x IS NOT NULL
        AND from_x::text NOT IN ('NaN', 'nan')
        AND to_x::text NOT IN ('NaN', 'nan')
        ORDER BY tick
        LIMIT 5000
    """

    rows = await fetch(query, *params)
    payload = []
    for row in rows:
        item = dict(row)
        try:
            if not all(
                isinstance(item.get(key), (int, float))
                and item[key] == item[key]  # NaN check
                for key in ("from_x", "from_y", "to_x", "to_y")
            ):
                continue
        except TypeError:
            continue
        payload.append(item)
    return payload


@app.get("/api/matches/{match_id}/kills")
async def get_kills(match_id: str):
    rows = await fetch(
        "SELECT tick, killer, victim, weapon, headshot, round_number FROM kills WHERE match_id=$1",
        match_id,
    )
    return [dict(r) for r in rows]


@app.get("/api/matches/{match_id}/bomb-events")
async def get_bomb_events(match_id: str, request: Request):
    rows = await fetch(
        """
        SELECT event_type, tick, round_number, site, player_name, x, y
        FROM bomb_events WHERE match_id=$1 ORDER BY tick
        """,
        match_id,
    )
    payload = [dict(r) for r in rows]
    return _cached_json(payload, "public, max-age=300", request)


@app.get("/api/matches/{match_id}/rounds")
async def get_rounds(match_id: str, request: Request):
    rows = await fetch(
        "SELECT round_number, winner, win_type, duration_seconds, start_tick, end_tick, winner_team, freeze_end_tick FROM rounds WHERE match_id=$1 ORDER BY round_number",
        match_id,
    )
    payload = [dict(r) for r in rows]
    return _cached_json(payload, "public, max-age=300", request)


@app.get("/api/matches/{match_id}/round-pauses")
async def get_round_pauses(match_id: str, request: Request):
    rows = await fetch(
        "SELECT round_number, start_tick, end_tick, pause_type FROM round_pauses WHERE match_id=$1 ORDER BY round_number, start_tick",
        match_id,
    )
    payload = [dict(r) for r in rows]
    return _cached_json(payload, "public, max-age=300", request)


@app.get("/api/matches/{match_id}/heatmap/{player_name}")
async def get_heatmap(match_id: str, player_name: str, round_number: int | None = None, round_numbers: str | None = None):
    cache = matches_cache.get(match_id, {})
    positions = cache.get("positions")

    if positions is None:
        query = "SELECT tick, player_name, team, x, y, z, round_number, yaw FROM positions WHERE match_id=$1"
        params: list[Any] = [match_id]
        if round_numbers:
            nums = [int(n) for n in round_numbers.split(",") if n]
            query += " AND round_number = ANY($2)"
            params.append(nums)
        elif round_number is not None:
            query += " AND round_number = $2"
            params.append(round_number)
        rows = await fetch(query, *params)
        positions = [
            (r["tick"], r["player_name"], r["team"], r["x"], r["y"], r["z"], r["round_number"], r.get("yaw"))
            for r in rows
        ]

    return compute_heatmap(positions, player_name)


@app.get("/api/matches/{match_id}/players/{player_name}/habits")
async def get_habits(match_id: str, player_name: str):
    cache = matches_cache.get(match_id, {})
    positions = cache.get("positions", [])
    grenades = cache.get("grenades", [])
    kills = cache.get("kills", [])

    if not positions:
        pos_rows = await fetch(
            "SELECT tick, player_name, team, x, y, z, round_number, yaw FROM positions WHERE match_id=$1",
            match_id,
        )
        positions = [
            (r["tick"], r["player_name"], r["team"], r["x"], r["y"], r["z"], r["round_number"], r.get("yaw"))
            for r in pos_rows
        ]

    if not grenades:
        gr_rows = await fetch(
            "SELECT grenade_type, player_name, team, from_x, from_y, from_z, to_x, to_y, to_z, tick, round_number FROM grenades WHERE match_id=$1",
            match_id,
        )
        grenades = [(r["grenade_type"], r["player_name"], r["team"], r["from_x"], r["from_y"], r["from_z"], r["to_x"], r["to_y"], r["to_z"], r["tick"], r["round_number"]) for r in gr_rows]

    if not kills:
        kill_rows = await fetch(
            "SELECT tick, killer, victim, weapon, headshot, round_number FROM kills WHERE match_id=$1",
            match_id,
        )
        kills = [(r["tick"], r["killer"], r["victim"], r["weapon"], r["headshot"], r["round_number"]) for r in kill_rows]

    return compute_player_habits(match_id, player_name, positions, grenades, kills)


@app.get("/api/matches/{match_id}/purchases")
async def get_match_purchases(match_id: str, request: Request):
    rows = await fetch(
        """
        SELECT p.player_name, p.tick, p.round_number, p.item, p.cost, pl.team
        FROM purchases p
        LEFT JOIN players pl ON pl.match_id = p.match_id AND pl.name = p.player_name
        WHERE p.match_id = $1
        ORDER BY p.round_number, p.tick
        """,
        match_id,
    )
    payload = [dict(r) for r in rows]
    return _cached_json(payload, "public, max-age=300", request)


@app.get("/api/matches/{match_id}/players/{player_name}/purchases")
async def get_purchases(match_id: str, player_name: str):
    rows = await fetch(
        "SELECT tick, round_number, item, cost FROM purchases WHERE match_id=$1 AND player_name=$2",
        match_id,
        player_name,
    )
    return [dict(r) for r in rows]


@app.get("/api/matches/{match_id}/players/{player_name}/flash-events")
async def get_flash_events(match_id: str, player_name: str):
    return []


@app.get("/api/matches/{match_id}/players/{player_name}/stats")
async def get_player_stats(match_id: str, player_name: str):
    kills = await fetch(
        "SELECT tick, killer, victim, weapon, headshot, round_number FROM kills WHERE match_id=$1",
        match_id,
    )
    player_kills = [k for k in kills if k["killer"] == player_name]
    player_deaths = [k for k in kills if k["victim"] == player_name]
    headshots = sum(1 for k in player_kills if k["headshot"])

    weapon_kills: dict[str, int] = {}
    for k in player_kills:
        weapon_kills[k["weapon"]] = weapon_kills.get(k["weapon"], 0) + 1

    favorite = max(weapon_kills, key=weapon_kills.get) if weapon_kills else "—"

    return {
        "kills": len(player_kills),
        "deaths": len(player_deaths),
        "assists": 0,
        "headshot_pct": round(headshots / len(player_kills) * 100) if player_kills else 0,
        "favorite_weapon": favorite,
        "avg_blind_duration_ms": 0,
        "weapon_kills": weapon_kills,
    }


@app.get("/api/matches/{match_id}/players/{player_name}/duels")
async def get_duels(match_id: str, player_name: str):
    kills = await fetch(
        "SELECT killer, victim FROM kills WHERE match_id=$1",
        match_id,
    )
    duels: dict[str, dict[str, int]] = {}
    for k in kills:
        if k["killer"] == player_name and k["victim"] != player_name:
            duels.setdefault(k["victim"], {"kills": 0, "deaths": 0})["kills"] += 1
        if k["victim"] == player_name and k["killer"] != player_name:
            duels.setdefault(k["killer"], {"kills": 0, "deaths": 0})["deaths"] += 1

    return [{"opponent": o, **stats} for o, stats in duels.items()]


@app.get("/api/matches/{match_id}/players/{player_name}/grenade-spots")
async def get_grenade_spots(match_id: str, player_name: str):
    rows = await fetch(
        """
        SELECT grenade_type, to_x, to_y, COUNT(*) as frequency
        FROM grenades WHERE match_id=$1 AND player_name=$2
        GROUP BY grenade_type, to_x, to_y
        ORDER BY frequency DESC LIMIT 20
        """,
        match_id,
        player_name,
    )
    return [
        {
            "grenade_type": r["grenade_type"],
            "zone": f"({int(r['to_x'])}, {int(r['to_y'])})",
            "frequency": r["frequency"],
            "to_x": r["to_x"],
            "to_y": r["to_y"],
        }
        for r in rows
    ]


class UtilityLabRequest(BaseModel):
    match_ids: list[str] = Field(..., min_length=1, max_length=40)
    player_name: str = Field(..., min_length=1, max_length=64)
    team: str = Field(..., pattern="^(CT|T)$")
    grenade_types: list[str] | None = None
    cluster_size: float = Field(220.0, ge=80.0, le=800.0)


@app.post("/api/utility-lab/aggregate")
async def utility_lab_aggregate(body: UtilityLabRequest):
    """ESL-style multi-demo utility average for one player on one side."""
    match_ids = list(dict.fromkeys(body.match_ids))
    types = body.grenade_types or ["smoke", "flash", "he", "molotov", "incendiary", "decoy"]

    maps = await fetch(
        """
        SELECT match_id, map_name FROM matches
        WHERE match_id = ANY($1::text[]) AND status = 'ready'
        """,
        match_ids,
    )
    if not maps:
        raise HTTPException(404, "No ready matches found")

    map_names = {r["map_name"] for r in maps}
    if len(map_names) > 1:
        raise HTTPException(400, f"All demos must be the same map, got: {', '.join(sorted(map_names))}")

    map_name = next(iter(map_names))
    valid_ids = [r["match_id"] for r in maps]

    rows = await fetch(
        """
        SELECT match_id, grenade_type, player_name, team,
               from_x, from_y, from_z, to_x, to_y, to_z, tick, round_number
        FROM grenades
        WHERE match_id = ANY($1::text[])
          AND player_name = $2
          AND team = $3
          AND grenade_type = ANY($4::text[])
          AND from_x IS NOT NULL AND to_x IS NOT NULL
        ORDER BY tick
        LIMIT 8000
        """,
        valid_ids,
        body.player_name,
        body.team,
        types,
    )

    throws = [dict(r) for r in rows]
    cell = float(body.cluster_size)
    clusters: dict[tuple[str, int, int], list[dict[str, Any]]] = defaultdict(list)
    for g in throws:
        key = (
            str(g["grenade_type"]),
            int(float(g["to_x"]) // cell),
            int(float(g["to_y"]) // cell),
        )
        clusters[key].append(g)

    averages = []
    for (gtype, _cx, _cy), group in clusters.items():
        n = len(group)
        avg = {
            "grenade_type": gtype,
            "count": n,
            "match_count": len({g["match_id"] for g in group}),
            "from_x": sum(float(g["from_x"]) for g in group) / n,
            "from_y": sum(float(g["from_y"]) for g in group) / n,
            "from_z": sum(float(g.get("from_z") or 0) for g in group) / n,
            "to_x": sum(float(g["to_x"]) for g in group) / n,
            "to_y": sum(float(g["to_y"]) for g in group) / n,
            "to_z": sum(float(g.get("to_z") or 0) for g in group) / n,
            "player_name": body.player_name,
            "team": body.team,
        }
        averages.append(avg)

    averages.sort(key=lambda item: -item["count"])

    return {
        "map_name": map_name,
        "player_name": body.player_name,
        "team": body.team,
        "match_ids": valid_ids,
        "throw_count": len(throws),
        "cluster_count": len(averages),
        "throws": throws,
        "averages": averages[:80],
    }


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now(timezone.utc).isoformat()}
