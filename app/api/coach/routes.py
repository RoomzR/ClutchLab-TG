"""Coach tools: voice notes (audio uploads) and tactical map drawings."""

import json
import logging
import os
import uuid as uuid_mod

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from config import settings
from permissions import AuthUser, get_current_user
from postgres_repo import execute, fetch, fetchrow

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/coach", tags=["coach"])

ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp4", "audio/wav", "audio/x-wav",
}


def _note_payload(row) -> dict:
    return {
        "id": str(row["id"]),
        "match_id": row["match_id"],
        "round_number": row["round_number"],
        "title": row["title"],
        "duration_seconds": float(row["duration_seconds"]),
        "created_at": row["created_at"].isoformat(),
        "author": row.get("username") if hasattr(row, "get") else row["username"] if "username" in row.keys() else None,
    }


# ---------- Voice notes ----------

@router.post("/matches/{match_id}/notes")
async def create_voice_note(
    match_id: str,
    file: UploadFile = File(...),
    title: str = Form(""),
    round_number: int | None = Form(None),
    duration_seconds: float = Form(0),
    user: AuthUser = Depends(get_current_user),
):
    content_type = (file.content_type or "").split(";")[0].strip()
    if content_type not in ALLOWED_AUDIO_TYPES:
        raise HTTPException(status_code=422, detail=f"Unsupported audio format: {content_type}")

    content = await file.read()
    if len(content) > settings.max_voice_note_bytes:
        raise HTTPException(status_code=413, detail="Voice note exceeds 15 MB limit")
    if len(content) < 100:
        raise HTTPException(status_code=422, detail="Recording is empty")

    ext = {
        "audio/webm": "webm", "audio/ogg": "ogg", "audio/mpeg": "mp3",
        "audio/mp4": "m4a", "audio/wav": "wav", "audio/x-wav": "wav",
    }[content_type]
    note_id = str(uuid_mod.uuid4())
    path = os.path.join(settings.voice_notes_dir, f"{note_id}.{ext}")
    with open(path, "wb") as f:
        f.write(content)

    row = await fetchrow(
        """
        INSERT INTO coach_notes (id, match_id, user_id, round_number, title, audio_path, duration_seconds)
        VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7)
        RETURNING *
        """,
        note_id, match_id, user.id, round_number, title[:120], path, duration_seconds,
    )
    me = await fetchrow("SELECT username FROM users WHERE id = $1::uuid", user.id)
    payload = dict(row)
    payload["username"] = me["username"] if me else None
    return _note_payload(payload)


@router.get("/matches/{match_id}/notes")
async def list_voice_notes(match_id: str, user: AuthUser = Depends(get_current_user)):
    rows = await fetch(
        """
        SELECT cn.*, u.username FROM coach_notes cn
        JOIN users u ON u.id = cn.user_id
        WHERE cn.match_id = $1
        ORDER BY cn.created_at DESC
        """,
        match_id,
    )
    return [_note_payload(dict(r)) for r in rows]


@router.get("/notes/{note_id}/audio")
async def get_note_audio(note_id: str, user: AuthUser = Depends(get_current_user)):
    row = await fetchrow("SELECT audio_path FROM coach_notes WHERE id = $1::uuid", note_id)
    if not row or not os.path.exists(row["audio_path"]):
        raise HTTPException(status_code=404, detail="Recording not found")
    ext = row["audio_path"].rsplit(".", 1)[-1]
    media_types = {"webm": "audio/webm", "ogg": "audio/ogg", "mp3": "audio/mpeg", "m4a": "audio/mp4", "wav": "audio/wav"}
    return FileResponse(row["audio_path"], media_type=media_types.get(ext, "application/octet-stream"))


@router.delete("/notes/{note_id}")
async def delete_voice_note(note_id: str, user: AuthUser = Depends(get_current_user)):
    row = await fetchrow(
        "SELECT user_id, audio_path FROM coach_notes WHERE id = $1::uuid", note_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Note not found")
    if str(row["user_id"]) != user.id and user.role not in ("ADMIN", "SUPERADMIN"):
        raise HTTPException(status_code=403, detail="You can only delete your own notes")

    await execute("DELETE FROM coach_notes WHERE id = $1::uuid", note_id)
    try:
        os.remove(row["audio_path"])
    except OSError:
        pass
    return {"detail": "Note deleted"}


# ---------- Map drawings ----------

class DrawingSaveRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    map_name: str = Field(max_length=40)
    # List of strokes: {tool, color, width, points: [[x,y],...]} in 0-1 relative coords
    data: list = Field(max_length=500)


def _drawing_payload(row) -> dict:
    data = row["data"]
    return {
        "id": str(row["id"]),
        "match_id": row["match_id"],
        "name": row["name"],
        "map_name": row["map_name"],
        "data": json.loads(data) if isinstance(data, str) else data,
        "created_at": row["created_at"].isoformat(),
        "updated_at": row["updated_at"].isoformat(),
        "author": row["username"] if "username" in row.keys() else None,
    }


@router.post("/matches/{match_id}/drawings")
async def save_drawing(
    match_id: str, body: DrawingSaveRequest, user: AuthUser = Depends(get_current_user),
):
    row = await fetchrow(
        """
        INSERT INTO coach_drawings (match_id, user_id, name, map_name, data)
        VALUES ($1, $2::uuid, $3, $4, $5::jsonb)
        RETURNING *
        """,
        match_id, user.id, body.name, body.map_name, json.dumps(body.data),
    )
    payload = dict(row)
    me = await fetchrow("SELECT username FROM users WHERE id = $1::uuid", user.id)
    payload["username"] = me["username"] if me else None
    return _drawing_payload(payload)


@router.get("/matches/{match_id}/drawings")
async def list_drawings(match_id: str, user: AuthUser = Depends(get_current_user)):
    rows = await fetch(
        """
        SELECT cd.*, u.username FROM coach_drawings cd
        JOIN users u ON u.id = cd.user_id
        WHERE cd.match_id = $1
        ORDER BY cd.updated_at DESC
        """,
        match_id,
    )
    return [_drawing_payload(dict(r)) for r in rows]


@router.delete("/drawings/{drawing_id}")
async def delete_drawing(drawing_id: str, user: AuthUser = Depends(get_current_user)):
    row = await fetchrow("SELECT user_id FROM coach_drawings WHERE id = $1::uuid", drawing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Drawing not found")
    if str(row["user_id"]) != user.id and user.role not in ("ADMIN", "SUPERADMIN"):
        raise HTTPException(status_code=403, detail="You can only delete your own drawings")
    await execute("DELETE FROM coach_drawings WHERE id = $1::uuid", drawing_id)
    return {"detail": "Drawing deleted"}
