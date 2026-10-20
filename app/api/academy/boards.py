"""Tactical board: REST CRUD + WebSocket rooms for real-time drawing and replay sync.

Rooms live in the API process memory; shapes are persisted to tactical_boards with
a short debounce. Running several API replicas needs Redis pub/sub (BACKLOG).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field

from api.academy.common import iso
from config import settings
from core.academy import AcademyUser, _load_user, can_access, get_academy_user, jl, match_org
from postgres_repo import execute, fetch, fetchrow
from security import decode_access_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/academy", tags=["academy-boards"])

MAX_SHAPES = 2000
PERSIST_DEBOUNCE_S = 1.5


def _out(r: Any) -> dict[str, Any]:
    d = {k: iso(v) for k, v in dict(r).items()}
    d["id"] = str(r["id"])
    for k in ("org_id", "created_by"):
        if d.get(k):
            d[k] = str(d[k])
    d["shapes"] = jl(d.get("shapes")) or []
    return d


class BoardIn(BaseModel):
    map_name: str
    title: str = Field("Новая доска", max_length=120)
    match_id: str | None = None
    round_number: int | None = None
    tick: int | None = None


class BoardUpdate(BaseModel):
    title: str | None = None
    shapes: list[dict[str, Any]] | None = None
    round_number: int | None = None
    tick: int | None = None


@router.get("/boards")
async def list_boards(au: AcademyUser = Depends(get_academy_user), match_id: str | None = None):
    rows = await fetch(
        f"""SELECT b.*, u.username AS author FROM tactical_boards b LEFT JOIN users u ON u.id = b.created_by
            WHERE (b.org_id = $1::uuid OR $1::uuid IS NULL) {"AND b.match_id = $2" if match_id else ""}
            ORDER BY b.updated_at DESC LIMIT 200""",
        *([au.org_id, match_id] if match_id else [au.org_id]),
    )
    return [{**_out(r), "shapes_count": len(jl(r["shapes"]) or [])} for r in rows]


@router.post("/boards")
async def create_board(body: BoardIn, au: AcademyUser = Depends(get_academy_user)):
    row = await fetchrow(
        """INSERT INTO tactical_boards (org_id, match_id, map_name, round_number, tick, title, created_by)
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::uuid) RETURNING *""",
        au.org_id, body.match_id, body.map_name, body.round_number, body.tick, body.title, au.id,
    )
    return _out(row)


async def _board_or_404(board_id: str, au: AcademyUser) -> Any:
    row = await fetchrow("SELECT * FROM tactical_boards WHERE id=$1::uuid", board_id)
    if not row:
        raise HTTPException(404, "Доска не найдена")
    if row["org_id"] and au.org_id and str(row["org_id"]) != au.org_id:
        raise HTTPException(403, "Доска другой организации")
    return row


@router.get("/boards/{board_id}")
async def get_board(board_id: str, au: AcademyUser = Depends(get_academy_user)):
    row = await _board_or_404(board_id, au)
    room = ROOMS.get(board_id)
    data = _out(row)
    if room:
        data["shapes"] = list(room.shapes.values())
    return data


@router.patch("/boards/{board_id}")
async def update_board(board_id: str, body: BoardUpdate, au: AcademyUser = Depends(get_academy_user)):
    await _board_or_404(board_id, au)
    await execute(
        """UPDATE tactical_boards SET title=COALESCE($2,title), shapes=COALESCE($3::jsonb,shapes),
           round_number=COALESCE($4,round_number), tick=COALESCE($5,tick), updated_at=NOW() WHERE id=$1::uuid""",
        board_id, body.title, json.dumps(body.shapes) if body.shapes is not None else None, body.round_number, body.tick,
    )
    if body.shapes is not None and board_id in ROOMS:
        ROOMS[board_id].shapes = {s.get("id"): s for s in body.shapes if s.get("id")}
    return {"ok": True}


@router.delete("/boards/{board_id}")
async def delete_board(board_id: str, au: AcademyUser = Depends(get_academy_user)):
    await _board_or_404(board_id, au)
    await execute("DELETE FROM tactical_boards WHERE id=$1::uuid", board_id)
    return {"ok": True}


@dataclass
class Room:
    board_id: str
    shapes: dict[str, dict[str, Any]]
    replay: dict[str, Any]
    clients: dict[WebSocket, dict[str, Any]] = field(default_factory=dict)
    dirty: bool = False
    persist_task: asyncio.Task | None = None

    async def broadcast(self, message: dict[str, Any], exclude: WebSocket | None = None) -> None:
        payload = json.dumps(message)
        dead = []
        for ws in self.clients:
            if ws is exclude:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.pop(ws, None)

    def peers(self) -> list[dict[str, Any]]:
        return [{"id": c["id"], "name": c["name"], "color": c["color"]} for c in self.clients.values()]

    def schedule_persist(self) -> None:
        self.dirty = True
        if self.persist_task and not self.persist_task.done():
            return
        self.persist_task = asyncio.create_task(self._persist_later())

    async def _persist_later(self) -> None:
        await asyncio.sleep(PERSIST_DEBOUNCE_S)
        if not self.dirty:
            return
        self.dirty = False
        try:
            await execute(
                "UPDATE tactical_boards SET shapes=$2::jsonb, round_number=$3, tick=$4, updated_at=NOW() WHERE id=$1::uuid",
                self.board_id, json.dumps(list(self.shapes.values())), self.replay.get("round"), self.replay.get("tick"),
            )
        except Exception as exc:
            logger.warning("board persist failed %s: %s", self.board_id, exc)


ROOMS: dict[str, Room] = {}
PEER_COLORS = ["#ff5a1f", "#5b8cff", "#22d3ee", "#a3e635", "#f472b6", "#facc15", "#c084fc", "#34d399"]


@router.websocket("/ws/boards/{board_id}")
async def board_socket(websocket: WebSocket, board_id: str):
    token = websocket.query_params.get("token")
    au: AcademyUser | None = None
    if token:
        payload = decode_access_token(token)
        if payload:
            au = await _load_user(str(payload["sub"]))
    if au is None and settings.auth_required:
        await websocket.close(code=4401)
        return
    row = await fetchrow("SELECT * FROM tactical_boards WHERE id=$1::uuid", board_id)
    if not row:
        await websocket.close(code=4404)
        return
    if au and row["org_id"] and au.org_id and str(row["org_id"]) != au.org_id:
        await websocket.close(code=4403)
        return
    if row["match_id"] and au:
        exists, org, owner = await match_org(row["match_id"])
        if exists and not can_access(au, org, owner):
            await websocket.close(code=4403)
            return

    await websocket.accept()
    room = ROOMS.get(board_id)
    if room is None:
        shapes = {s.get("id"): s for s in (jl(row["shapes"]) or []) if s.get("id")}
        room = Room(board_id=board_id, shapes=shapes,
                    replay={"round": row["round_number"], "tick": row["tick"], "playing": False, "speed": 1})
        ROOMS[board_id] = room
    me = {"id": f"{(au.id if au else 'guest')}:{int(time.time() * 1000) % 100000}",
          "name": au.username if au else "guest", "color": PEER_COLORS[len(room.clients) % len(PEER_COLORS)]}
    room.clients[websocket] = me
    await websocket.send_text(json.dumps({"type": "init", "me": me, "shapes": list(room.shapes.values()),
                                          "replay": room.replay, "peers": room.peers()}))
    await room.broadcast({"type": "peers", "peers": room.peers()}, exclude=websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mtype = msg.get("type")
            if mtype == "op":
                op = msg.get("op") or {}
                action = op.get("action")
                if action in ("add", "update") and isinstance(op.get("shape"), dict) and op["shape"].get("id"):
                    if action == "add" and len(room.shapes) >= MAX_SHAPES:
                        continue
                    room.shapes[op["shape"]["id"]] = op["shape"]
                elif action == "delete" and op.get("id"):
                    room.shapes.pop(op["id"], None)
                elif action == "clear":
                    room.shapes.clear()
                else:
                    continue
                room.schedule_persist()
                await room.broadcast({"type": "op", "op": op, "by": me["id"]}, exclude=websocket)
            elif mtype == "cursor":
                await room.broadcast({"type": "cursor", "id": me["id"], "name": me["name"], "color": me["color"],
                                      "x": msg.get("x"), "y": msg.get("y")}, exclude=websocket)
            elif mtype == "replay":
                room.replay = {"round": msg.get("round"), "tick": msg.get("tick"), "playing": bool(msg.get("playing")),
                               "speed": msg.get("speed") or 1, "by": me["id"], "at": time.time()}
                room.schedule_persist()
                await room.broadcast({"type": "replay", "replay": room.replay}, exclude=websocket)
            elif mtype == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        pass
    finally:
        room.clients.pop(websocket, None)
        await room.broadcast({"type": "peers", "peers": room.peers()})
        if not room.clients:
            room.schedule_persist()
