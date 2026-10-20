"""Lineup catalogue: CRUD, video upload, create from a demo grenade, throw comparison."""

from __future__ import annotations

import math
import os
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from api.academy.common import iso
from config import settings
from core.academy import STAFF_ROLES, AcademyUser, ensure_match_access, get_academy_user, require_academy_role
from postgres_repo import execute, fetch, fetchrow

router = APIRouter(prefix="/api/academy", tags=["academy-lineups"])

GRENADES = ("smoke", "flash", "he", "molotov", "incendiary", "decoy")
TECHNIQUES = ("stand", "jump-throw", "run-throw", "walk-throw", "crouch", "right-click", "jump-right-click")
VIDEO_EXT = {".mp4": "video/mp4", ".webm": "video/webm", ".mov": "video/quicktime"}
HIT_RADIUS = 120.0
NEAR_RADIUS = 450.0


def _out(r: Any) -> dict[str, Any]:
    d = {k: iso(v) for k, v in dict(r).items()}
    d["id"] = str(r["id"])
    for k in ("org_id", "created_by"):
        if d.get(k):
            d[k] = str(d[k])
    if d.get("video_path"):
        d["video_src"] = f"/api/academy/lineups/{d['id']}/video"
    d.pop("video_path", None)
    return d


class LineupIn(BaseModel):
    map_name: str
    side: str = Field(..., pattern="^(CT|T)$")
    grenade_type: str
    title: str = Field(..., min_length=2, max_length=120)
    target: str = ""
    role: str | None = None
    technique: str = "stand"
    throw_x: float | None = None
    throw_y: float | None = None
    throw_z: float | None = None
    land_x: float | None = None
    land_y: float | None = None
    land_z: float | None = None
    steps: str = ""
    video_url: str | None = None
    tags: list[str] = []


@router.get("/lineups")
async def list_lineups(au: AcademyUser = Depends(get_academy_user), map_name: str | None = None, side: str | None = None,
                       grenade_type: str | None = None, q: str | None = None, role: str | None = None):
    clauses = ["(org_id = $1::uuid OR org_id IS NULL)"]
    params: list[Any] = [au.org_id]
    for col, val in (("map_name", map_name), ("side", side), ("grenade_type", grenade_type), ("role", role)):
        if val:
            params.append(val)
            clauses.append(f"{col} = ${len(params)}")
    if q:
        params.append(f"%{q}%")
        clauses.append(f"(title ILIKE ${len(params)} OR target ILIKE ${len(params)} OR array_to_string(tags, ' ') ILIKE ${len(params)})")
    rows = await fetch(f"SELECT * FROM lineups WHERE {' AND '.join(clauses)} ORDER BY map_name, grenade_type, title", *params)
    return [_out(r) for r in rows]


@router.post("/lineups")
async def create_lineup(body: LineupIn, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    if body.grenade_type not in GRENADES:
        raise HTTPException(400, "Неизвестный тип гранаты")
    row = await fetchrow(
        """INSERT INTO lineups (org_id, map_name, side, grenade_type, title, target, role, technique, throw_x, throw_y, throw_z,
                                land_x, land_y, land_z, steps, video_url, tags, created_by)
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::uuid) RETURNING *""",
        au.org_id, body.map_name, body.side, body.grenade_type, body.title, body.target, body.role, body.technique,
        body.throw_x, body.throw_y, body.throw_z, body.land_x, body.land_y, body.land_z, body.steps, body.video_url,
        body.tags, au.id,
    )
    return _out(row)


@router.patch("/lineups/{lineup_id}")
async def update_lineup(lineup_id: str, body: LineupIn, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    row = await fetchrow(
        """UPDATE lineups SET map_name=$2, side=$3, grenade_type=$4, title=$5, target=$6, role=$7, technique=$8, throw_x=$9,
           throw_y=$10, throw_z=$11, land_x=$12, land_y=$13, land_z=$14, steps=$15, video_url=$16, tags=$17
           WHERE id=$1::uuid RETURNING *""",
        lineup_id, body.map_name, body.side, body.grenade_type, body.title, body.target, body.role, body.technique,
        body.throw_x, body.throw_y, body.throw_z, body.land_x, body.land_y, body.land_z, body.steps, body.video_url, body.tags,
    )
    if not row:
        raise HTTPException(404, "Раскидка не найдена")
    return _out(row)


@router.delete("/lineups/{lineup_id}")
async def delete_lineup(lineup_id: str, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    row = await fetchrow("DELETE FROM lineups WHERE id=$1::uuid RETURNING video_path", lineup_id)
    if row and row["video_path"]:
        Path(row["video_path"]).unlink(missing_ok=True)
    return {"ok": True}


@router.post("/lineups/{lineup_id}/video")
async def upload_video(lineup_id: str, file: UploadFile = File(...), au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in VIDEO_EXT:
        raise HTTPException(400, "Поддерживаются .mp4, .webm, .mov")
    data = await file.read()
    if len(data) > settings.max_lineup_video_bytes:
        raise HTTPException(413, f"Видео больше {settings.max_lineup_video_bytes // (1024 * 1024)} МБ")
    os.makedirs(settings.lineup_media_dir, exist_ok=True)
    path = os.path.join(settings.lineup_media_dir, f"{uuid.uuid4()}{ext}")
    with open(path, "wb") as f:
        f.write(data)
    old = await fetchrow("SELECT video_path FROM lineups WHERE id=$1::uuid", lineup_id)
    await execute("UPDATE lineups SET video_path=$2 WHERE id=$1::uuid", lineup_id, path)
    if old and old["video_path"]:
        Path(old["video_path"]).unlink(missing_ok=True)
    return {"ok": True, "video_src": f"/api/academy/lineups/{lineup_id}/video"}


@router.get("/lineups/{lineup_id}/video")
async def get_video(lineup_id: str):
    # <video> cannot send an Authorization header; the lineup id is an unguessable UUID.
    row = await fetchrow("SELECT video_path FROM lineups WHERE id=$1::uuid", lineup_id)
    if not row or not row["video_path"] or not os.path.exists(row["video_path"]):
        raise HTTPException(404, "Видео не найдено")
    return FileResponse(row["video_path"], media_type=VIDEO_EXT.get(Path(row["video_path"]).suffix.lower(), "video/mp4"))


class FromGrenade(BaseModel):
    match_id: str
    tick: int
    player_name: str
    title: str = Field(..., min_length=2, max_length=120)
    target: str = ""
    technique: str = "stand"
    steps: str = ""


@router.post("/lineups/from-grenade")
async def from_grenade(body: FromGrenade, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    await ensure_match_access(body.match_id, au)
    g = await fetchrow(
        """SELECT g.*, m.map_name FROM grenades g JOIN matches m ON m.match_id = g.match_id
           WHERE g.match_id=$1 AND g.player_name=$2 AND ABS(g.tick - $3) <= 2 LIMIT 1""",
        body.match_id, body.player_name, body.tick,
    )
    if not g:
        raise HTTPException(404, "Граната не найдена в демке")
    row = await fetchrow(
        """INSERT INTO lineups (org_id, map_name, side, grenade_type, title, target, technique, throw_x, throw_y, throw_z,
                                land_x, land_y, land_z, steps, source_match_id, source_tick, created_by)
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::uuid) RETURNING *""",
        au.org_id, g["map_name"], g["team"], "molotov" if g["grenade_type"] == "incendiary" else g["grenade_type"],
        body.title, body.target, body.technique, g["from_x"], g["from_y"], g["from_z"], g["to_x"], g["to_y"], g["to_z"],
        body.steps, body.match_id, g["tick"], au.id,
    )
    return _out(row)


@router.get("/lineups/{lineup_id}/compare")
async def compare_throws(lineup_id: str, player: str | None = None, last: int = 30, au: AcademyUser = Depends(get_academy_user)):
    lu = await fetchrow("SELECT * FROM lineups WHERE id=$1::uuid", lineup_id)
    if not lu or lu["land_x"] is None:
        raise HTTPException(404, "У раскидки нет точки приземления")
    types = ["molotov", "incendiary"] if lu["grenade_type"] in ("molotov", "incendiary") else [lu["grenade_type"]]
    rows = await fetch(
        f"""SELECT g.match_id, g.player_name, g.tick, g.round_number, g.from_x, g.from_y, g.to_x, g.to_y, g.team,
                   COALESCE(m.played_at, m.created_at) AS played_at
            FROM grenades g JOIN matches m ON m.match_id = g.match_id
            WHERE m.map_name=$1 AND g.grenade_type = ANY($2::text[]) AND g.team=$3
              AND (m.org_id = $4::uuid OR $4::uuid IS NULL) {"AND g.player_name = $5" if player else ""}
            ORDER BY COALESCE(m.played_at, m.created_at) DESC LIMIT 4000""",
        *([lu["map_name"], types, lu["side"], au.org_id, player] if player else [lu["map_name"], types, lu["side"], au.org_id]),
    )
    throws = []
    for r in rows:
        dist = math.hypot(r["to_x"] - lu["land_x"], r["to_y"] - lu["land_y"])
        if dist > NEAR_RADIUS:
            continue
        from_dist = math.hypot(r["from_x"] - lu["throw_x"], r["from_y"] - lu["throw_y"]) if lu["throw_x"] is not None else None
        throws.append({**{k: iso(v) for k, v in dict(r).items()}, "distance": round(dist), "from_distance": round(from_dist) if from_dist is not None else None,
                       "hit": dist <= HIT_RADIUS})
    throws = throws[:last * 5]
    by_player: dict[str, dict[str, Any]] = {}
    for t in throws:
        p = by_player.setdefault(t["player_name"], {"player": t["player_name"], "throws": 0, "hits": 0, "dist_sum": 0})
        p["throws"] += 1
        p["hits"] += int(t["hit"])
        p["dist_sum"] += t["distance"]
    summary = [{"player": p["player"], "throws": p["throws"], "hit_pct": round(100 * p["hits"] / p["throws"], 1),
                "avg_distance": round(p["dist_sum"] / p["throws"])} for p in by_player.values()]
    return {"lineup": _out(lu), "throws": throws, "players": sorted(summary, key=lambda s: -s["throws"]),
            "hit_radius": HIT_RADIUS}
