"""Live analysts: slots, booking queue, comments, report workflow ai_draft → human_final."""

from __future__ import annotations

import datetime as dt
import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from api.academy.common import iso
from core.academy import STAFF_ROLES, AcademyUser, ensure_match_access, get_academy_user, jl, require_academy_role
from postgres_repo import execute, fetch, fetchrow
from services.analytics.metrics_registry import derive

router = APIRouter(prefix="/api/academy", tags=["academy-analysts"])

BOOKING_STATUSES = ("requested", "confirmed", "done", "cancelled")


def _out(r: Any) -> dict[str, Any]:
    d = {k: iso(v) for k, v in dict(r).items()}
    for k, v in list(d.items()):
        if k in ("id", "slot_id", "org_id", "analyst_id", "requested_by", "booking_id", "author_id") and v is not None:
            d[k] = str(v)
    if "sections" in d:
        d["sections"] = jl(d["sections"])
    return d


@router.get("/analysts")
async def analysts(au: AcademyUser = Depends(get_academy_user)):
    rows = await fetch(
        "SELECT id, username, academy_role FROM users WHERE academy_role IN ('analyst','admin','coach') AND (org_id = $1::uuid OR $1::uuid IS NULL) ORDER BY username",
        au.org_id,
    )
    return [{"id": str(r["id"]), "username": r["username"], "academy_role": r["academy_role"]} for r in rows]


class SlotIn(BaseModel):
    starts_at: dt.datetime
    ends_at: dt.datetime
    note: str = ""


@router.get("/analyst/slots")
async def list_slots(au: AcademyUser = Depends(get_academy_user), date_from: dt.datetime | None = None, date_to: dt.datetime | None = None):
    date_from = date_from or (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=1))
    date_to = date_to or (date_from + dt.timedelta(days=21))
    rows = await fetch(
        """SELECT s.*, u.username AS analyst_name,
                  (SELECT b.id FROM analyst_bookings b WHERE b.slot_id = s.id AND b.status IN ('requested','confirmed','done') LIMIT 1) AS booking_id
           FROM analyst_slots s JOIN users u ON u.id = s.analyst_id
           WHERE s.starts_at >= $1 AND s.starts_at <= $2 ORDER BY s.starts_at""",
        date_from, date_to,
    )
    return [_out(r) for r in rows]


@router.post("/analyst/slots")
async def create_slot(body: SlotIn, au: AcademyUser = Depends(require_academy_role("analyst", "coach"))):
    if body.ends_at <= body.starts_at:
        raise HTTPException(400, "Конец слота раньше начала")
    overlap = await fetchrow(
        "SELECT 1 FROM analyst_slots WHERE analyst_id=$1::uuid AND status <> 'closed' AND starts_at < $3 AND ends_at > $2",
        au.id, body.starts_at, body.ends_at,
    )
    if overlap:
        raise HTTPException(409, "Слот пересекается с существующим")
    row = await fetchrow(
        "INSERT INTO analyst_slots (analyst_id, starts_at, ends_at, note) VALUES ($1::uuid,$2,$3,$4) RETURNING *",
        au.id, body.starts_at, body.ends_at, body.note,
    )
    return _out(row)


@router.delete("/analyst/slots/{slot_id}")
async def delete_slot(slot_id: str, au: AcademyUser = Depends(require_academy_role("analyst", "coach"))):
    busy = await fetchrow("SELECT 1 FROM analyst_bookings WHERE slot_id=$1::uuid AND status IN ('confirmed')", slot_id)
    if busy:
        raise HTTPException(409, "На слот есть подтверждённая бронь")
    await execute("UPDATE analyst_slots SET status='closed' WHERE id=$1::uuid", slot_id)
    return {"ok": True}


class BookingIn(BaseModel):
    match_id: str
    slot_id: str | None = None
    focus: str = Field("", max_length=2000)


class BookingUpdate(BaseModel):
    status: str | None = None
    slot_id: str | None = None
    analyst_id: str | None = None


async def _queue_positions() -> dict[str, int]:
    rows = await fetch("SELECT id FROM analyst_bookings WHERE status='requested' AND slot_id IS NULL ORDER BY created_at")
    return {str(r["id"]): i + 1 for i, r in enumerate(rows)}


@router.get("/analyst/bookings")
async def list_bookings(au: AcademyUser = Depends(get_academy_user), status: str | None = None):
    rows = await fetch(
        f"""SELECT b.*, s.starts_at, s.ends_at, ua.username AS analyst_name, ur.username AS requested_by_name,
                   m.map_name, m.team_t_name, m.team_ct_name, m.score_t, m.score_ct,
                   (SELECT r.status FROM analyst_reports r WHERE r.booking_id = b.id ORDER BY r.updated_at DESC LIMIT 1) AS report_status
            FROM analyst_bookings b
            LEFT JOIN analyst_slots s ON s.id = b.slot_id
            LEFT JOIN users ua ON ua.id = COALESCE(b.analyst_id, s.analyst_id)
            LEFT JOIN users ur ON ur.id = b.requested_by
            LEFT JOIN matches m ON m.match_id = b.match_id
            WHERE (b.org_id = $1::uuid OR $1::uuid IS NULL) {"AND b.status = $2" if status else ""}
            ORDER BY b.created_at DESC""",
        *([au.org_id, status] if status else [au.org_id]),
    )
    q = await _queue_positions()
    return [{**_out(r), "queue_position": q.get(str(r["id"]))} for r in rows]


@router.post("/analyst/bookings")
async def create_booking(body: BookingIn, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(body.match_id, au)
    analyst_id = None
    if body.slot_id:
        slot = await fetchrow("SELECT * FROM analyst_slots WHERE id=$1::uuid AND status='open'", body.slot_id)
        if not slot:
            raise HTTPException(409, "Слот уже занят или закрыт")
        analyst_id = slot["analyst_id"]
        await execute("UPDATE analyst_slots SET status='booked' WHERE id=$1::uuid", body.slot_id)
    row = await fetchrow(
        """INSERT INTO analyst_bookings (slot_id, org_id, analyst_id, requested_by, match_id, focus, status)
           VALUES ($1::uuid,$2::uuid,$3,$4::uuid,$5,$6,'requested') RETURNING *""",
        body.slot_id, au.org_id, analyst_id, au.id, body.match_id, body.focus,
    )
    q = await _queue_positions()
    return {**_out(row), "queue_position": q.get(str(row["id"]))}


@router.patch("/analyst/bookings/{booking_id}")
async def update_booking(booking_id: str, body: BookingUpdate, au: AcademyUser = Depends(get_academy_user)):
    b = await fetchrow("SELECT * FROM analyst_bookings WHERE id=$1::uuid", booking_id)
    if not b:
        raise HTTPException(404, "Бронь не найдена")
    if body.status and body.status not in BOOKING_STATUSES:
        raise HTTPException(400, "Неизвестный статус")
    if not au.is_staff and not (body.status == "cancelled" and str(b["requested_by"]) == au.id):
        raise HTTPException(403, "Недостаточно прав")
    if body.slot_id:
        slot = await fetchrow("SELECT * FROM analyst_slots WHERE id=$1::uuid AND status='open'", body.slot_id)
        if not slot:
            raise HTTPException(409, "Слот недоступен")
        await execute("UPDATE analyst_slots SET status='booked' WHERE id=$1::uuid", body.slot_id)
        await execute("UPDATE analyst_bookings SET slot_id=$2::uuid, analyst_id=$3 WHERE id=$1::uuid", booking_id, body.slot_id, slot["analyst_id"])
    if body.analyst_id:
        await execute("UPDATE analyst_bookings SET analyst_id=$2::uuid WHERE id=$1::uuid", booking_id, body.analyst_id)
    if body.status:
        await execute("UPDATE analyst_bookings SET status=$2, updated_at=NOW() WHERE id=$1::uuid", booking_id, body.status)
        if body.status == "cancelled" and b["slot_id"]:
            await execute("UPDATE analyst_slots SET status='open' WHERE id=$1::uuid", b["slot_id"])
        if body.status == "confirmed" and not b["analyst_id"] and not body.analyst_id and au.academy_role in ("analyst", "coach", "admin"):
            await execute("UPDATE analyst_bookings SET analyst_id=$2::uuid WHERE id=$1::uuid", booking_id, au.id)
    return {"ok": True}


class CommentIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=4000)


@router.get("/analyst/bookings/{booking_id}/comments")
async def list_comments(booking_id: str, au: AcademyUser = Depends(get_academy_user)):
    rows = await fetch("SELECT * FROM analyst_booking_comments WHERE booking_id=$1::uuid ORDER BY created_at", booking_id)
    return [_out(r) for r in rows]


@router.post("/analyst/bookings/{booking_id}/comments")
async def add_comment(booking_id: str, body: CommentIn, au: AcademyUser = Depends(get_academy_user)):
    row = await fetchrow(
        "INSERT INTO analyst_booking_comments (booking_id, author_id, author_name, text) VALUES ($1::uuid,$2::uuid,$3,$4) RETURNING *",
        booking_id, au.id, au.username, body.text,
    )
    return _out(row)


async def _draft_sections(match_id: str) -> tuple[str, list[dict[str, Any]]]:
    m = await fetchrow("SELECT * FROM matches WHERE match_id=$1", match_id)
    reviews = await fetch("SELECT round_number, review FROM ai_round_reviews WHERE match_id=$1 ORDER BY round_number", match_id)
    mistakes = await fetch(
        "SELECT player_name, team_name, type, title, severity, round_number, explanation, recommendation FROM mistakes WHERE match_id=$1 ORDER BY severity DESC",
        match_id,
    )
    stats = await fetch("SELECT player_name, team_name, counters FROM player_match_stats WHERE match_id=$1 AND side='all'", match_id)
    summary = (f"{m['map_name']}: {m['team_t_name']} {m['score_t']} — {m['score_ct']} {m['team_ct_name']}. "
               f"ИИ нашёл {len(mistakes)} ошибок; ниже черновик разбора для аналитика.")
    player_lines = []
    for s in stats:
        d = derive(jl(s["counters"]) or {})
        player_lines.append(f"{s['player_name']} ({s['team_name']}): рейтинг {round(d.get('rating') or 0, 2)}, ADR {round(d.get('adr') or 0)}, "
                            f"KAST {round(d.get('kast_pct') or 0)}%, размены {round(d.get('traded_death_pct') or 0)}%")
    high = [mi for mi in mistakes if mi["severity"] == "high"]
    by_player: dict[str, list[str]] = {}
    for mi in mistakes:
        if mi["player_name"]:
            by_player.setdefault(mi["player_name"], []).append(f"R{mi['round_number'] or '—'}: {mi['title']}")
    key_rounds = []
    for r in reviews:
        rv = jl(r["review"]) or {}
        if any(mm.get("severity") == "high" for mm in rv.get("mistakes", [])) or any("клатч" in t for t in rv.get("tags", [])):
            key_rounds.append(f"R{r['round_number']}: {rv.get('summary', '')}")
    sections = [
        {"key": "overview", "title": "Итог матча", "body": summary, "source": "ai"},
        {"key": "key_rounds", "title": "Ключевые раунды", "body": "\n".join(key_rounds[:10]) or "—", "source": "ai"},
        {"key": "team_mistakes", "title": "Главные ошибки", "body": "\n".join(f"R{mi['round_number'] or '—'} · {mi['title']} — {mi['explanation']}" for mi in high[:10]) or "—", "source": "ai"},
        {"key": "players", "title": "Игроки", "body": "\n".join(player_lines), "source": "ai"},
        {"key": "per_player", "title": "Ошибки по игрокам", "body": "\n".join(f"{p}: {', '.join(v[:6])}" for p, v in by_player.items()) or "—", "source": "ai"},
        {"key": "plan", "title": "План на тренировку", "body": "", "source": "analyst"},
    ]
    return summary, sections


@router.get("/matches/{match_id}/analyst-report")
async def get_report(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    row = await fetchrow(
        """SELECT r.*, u.username AS analyst_name FROM analyst_reports r LEFT JOIN users u ON u.id = r.analyst_id
           WHERE r.match_id=$1 ORDER BY r.updated_at DESC LIMIT 1""", match_id)
    return _out(row) if row else None


@router.post("/matches/{match_id}/analyst-report/draft")
async def create_draft(match_id: str, booking_id: str | None = None, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    await ensure_match_access(match_id, au)
    summary, sections = await _draft_sections(match_id)
    row = await fetchrow(
        """INSERT INTO analyst_reports (match_id, booking_id, analyst_id, status, summary, sections)
           VALUES ($1,$2::uuid,$3::uuid,'ai_draft',$4,$5::jsonb) RETURNING *""",
        match_id, booking_id, au.id, summary, json.dumps(sections, ensure_ascii=False),
    )
    return _out(row)


class ReportUpdate(BaseModel):
    summary: str | None = None
    sections: list[dict[str, Any]] | None = None
    status: str | None = Field(None, pattern="^(ai_draft|in_review|human_final)$")


@router.patch("/analyst-reports/{report_id}")
async def update_report(report_id: str, body: ReportUpdate, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    r = await fetchrow("SELECT * FROM analyst_reports WHERE id=$1::uuid", report_id)
    if not r:
        raise HTTPException(404, "Отчёт не найден")
    await execute(
        """UPDATE analyst_reports SET summary=COALESCE($2, summary), sections=COALESCE($3::jsonb, sections),
           status=COALESCE($4, status), analyst_id=$5::uuid, updated_at=NOW(),
           finalized_at = CASE WHEN $4 = 'human_final' THEN NOW() ELSE finalized_at END WHERE id=$1::uuid""",
        report_id, body.summary, json.dumps(body.sections, ensure_ascii=False) if body.sections is not None else None, body.status, au.id,
    )
    if body.status == "human_final":
        await execute("UPDATE matches SET reviewed_by_analyst=TRUE WHERE match_id=$1", r["match_id"])
        if r["booking_id"]:
            await execute("UPDATE analyst_bookings SET status='done', updated_at=NOW() WHERE id=$1", r["booking_id"])
    return {"ok": True}
