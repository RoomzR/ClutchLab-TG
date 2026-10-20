"""Mistakes, homework, training plans, AI reviews, coach chat, timeline notes, comms."""

from __future__ import annotations

import datetime as dt
import json
import time
from collections import defaultdict
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from api.academy.common import iso, player_stat_rows, sum_counters
from core.academy import STAFF_ROLES, AcademyUser, ensure_match_access, get_academy_user, jl, require_academy_role
from postgres_repo import execute, fetch, fetchrow
from services.ai import coach_chat
from services.ai.llm import model_name, provider
from services.ai.review import llm_review
from services.analysis.homework import verify_player_homework
from services.analysis.solutions import MISTAKES, catalogue, solution_for
from services.analysis.training import build_plan, plan_markdown, week_start
from services.analytics.metrics_registry import derive

router = APIRouter(prefix="/api/academy", tags=["academy-coaching"])

MISTAKE_STATUSES = ("open", "assigned_as_homework", "fixed", "recurring", "dismissed")
HOMEWORK_STATUSES = ("assigned", "in_progress", "done", "verified", "recurring", "cancelled")


def _row(r: Any) -> dict[str, Any]:
    d = {k: iso(v) for k, v in dict(r).items()}
    for key in ("id", "mistake_id", "lineup_id", "assigned_by", "reviewed_by", "created_by", "org_id", "session_id", "author_id"):
        if d.get(key) is not None:
            d[key] = str(d[key])
    for key in ("evidence", "verification", "themes", "items", "citations", "review", "report"):
        if key in d:
            d[key] = jl(d[key])
    return d


# ───────────────────────── mistakes ─────────────────────────

@router.get("/mistakes/catalogue")
async def mistakes_catalogue():
    return catalogue()


@router.get("/matches/{match_id}/mistakes")
async def match_mistakes(match_id: str, au: AcademyUser = Depends(get_academy_user), player: str | None = None,
                         category: str | None = None):
    await ensure_match_access(match_id, au)
    rows = await fetch("SELECT * FROM mistakes WHERE match_id=$1 ORDER BY round_number NULLS LAST, tick_start", match_id)
    out = [_row(r) for r in rows]
    if player:
        out = [m for m in out if m["player_name"] == player]
    if category:
        out = [m for m in out if m["category"] == category]
    for m in out:
        m["solution"] = solution_for(m["type"])
    hw = await fetch("SELECT id, mistake_id, status FROM homework WHERE match_id=$1", match_id)
    hw_by_mistake = {str(h["mistake_id"]): {"id": str(h["id"]), "status": h["status"]} for h in hw if h["mistake_id"]}
    for m in out:
        m["homework"] = hw_by_mistake.get(m["id"])
    return out


@router.get("/mistakes")
async def org_mistakes(au: AcademyUser = Depends(get_academy_user), player: str | None = None, status: str | None = None,
                       type: str | None = None, limit: int = Query(200, le=1000)):
    clauses = ["(m.org_id = $1::uuid OR $1::uuid IS NULL)"]
    params: list[Any] = [au.org_id]
    for col, val in (("mi.player_name", player), ("mi.status", status), ("mi.type", type)):
        if val:
            params.append(val)
            clauses.append(f"{col} = ${len(params)}")
    rows = await fetch(
        f"""SELECT mi.*, m.map_name, COALESCE(m.played_at, m.created_at) AS played_at FROM mistakes mi
            JOIN matches m ON m.match_id = mi.match_id WHERE {' AND '.join(clauses)}
            ORDER BY COALESCE(m.played_at, m.created_at) DESC, mi.round_number LIMIT {int(limit)}""",
        *params,
    )
    return [_row(r) for r in rows]


class MistakeUpdate(BaseModel):
    status: str | None = None
    coach_comment: str | None = None


@router.patch("/mistakes/{mistake_id}")
async def update_mistake(mistake_id: str, body: MistakeUpdate, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    if body.status and body.status not in MISTAKE_STATUSES:
        raise HTTPException(400, "Неизвестный статус")
    row = await fetchrow("SELECT match_id FROM mistakes WHERE id=$1::uuid", mistake_id)
    if not row:
        raise HTTPException(404, "Ошибка не найдена")
    await ensure_match_access(row["match_id"], au)
    await execute(
        "UPDATE mistakes SET status=COALESCE($2, status), coach_comment=COALESCE($3, coach_comment), reviewed_by=$4::uuid WHERE id=$1::uuid",
        mistake_id, body.status, body.coach_comment, au.id,
    )
    return {"ok": True}


class AssignHomework(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: dt.date | None = None


async def _baseline(player: str, metric: str | None, org_id: str | None, before: dt.datetime | None = None) -> float | None:
    if not metric:
        return None
    rows = await player_stat_rows(org_id, player=player)
    if before:
        rows = [r for r in rows if r["played_at"] <= before]
    rows = rows[:5]
    if not rows:
        return None
    return derive(sum_counters([r["counters"] for r in rows])).get(metric)


@router.post("/mistakes/{mistake_id}/homework")
async def assign_from_mistake(mistake_id: str, body: AssignHomework, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    mi = await fetchrow("SELECT * FROM mistakes WHERE id=$1::uuid", mistake_id)
    if not mi:
        raise HTTPException(404, "Ошибка не найдена")
    await ensure_match_access(mi["match_id"], au)
    if not mi["player_name"]:
        raise HTTPException(400, "Командную ошибку назначьте как задачу каждому игроку отдельно")
    sol = solution_for(mi["type"]) or {}
    check = sol.get("check") or {}
    baseline = await _baseline(mi["player_name"], check.get("metric"), au.org_id)
    desc = body.description or "\n".join([mi["explanation"], "", "Что делать:", *[f"• {s}" for s in sol.get("steps", [])],
                                          "", f"Упражнение: {sol.get('drill', '')}"])
    row = await fetchrow(
        """INSERT INTO homework (org_id, player_name, mistake_id, mistake_type, match_id, title, description, solution_code,
                                 assigned_by, due_date, check_metric, check_op, check_threshold, baseline_value)
           VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6,$7,$8,$9::uuid,$10,$11,$12,$13,$14) RETURNING id""",
        au.org_id, mi["player_name"], mistake_id, mi["type"], mi["match_id"], body.title or sol.get("title") or mi["title"],
        desc, mi["type"], au.id, body.due_date or (dt.date.today() + dt.timedelta(days=7)),
        check.get("metric"), check.get("op"), check.get("threshold"), baseline,
    )
    await execute("UPDATE mistakes SET status='assigned_as_homework', reviewed_by=$2::uuid WHERE id=$1::uuid", mistake_id, au.id)
    return {"id": str(row["id"])}


@router.get("/players/{name}/mistakes/progress")
async def mistakes_progress(name: str, au: AcademyUser = Depends(get_academy_user), last: int = 20):
    rows = await fetch(
        f"""WITH ms AS (
              SELECT m.match_id, COALESCE(m.played_at, m.created_at) AS at, m.map_name FROM matches m
              JOIN players p ON p.match_id = m.match_id AND p.name = $1
              WHERE m.status='ready' AND (m.org_id = $2::uuid OR $2::uuid IS NULL)
              ORDER BY at DESC LIMIT {int(last)})
            SELECT ms.match_id, ms.at, ms.map_name, mi.type, mi.status, COUNT(mi.id)::int AS n
            FROM ms LEFT JOIN mistakes mi ON mi.match_id = ms.match_id AND mi.player_name = $1
            GROUP BY ms.match_id, ms.at, ms.map_name, mi.type, mi.status ORDER BY ms.at""",
        name, au.org_id,
    )
    matches: dict[str, dict[str, Any]] = {}
    types: dict[str, dict[str, Any]] = {}
    for r in rows:
        m = matches.setdefault(r["match_id"], {"match_id": r["match_id"], "date": iso(r["at"]), "map": r["map_name"], "counts": defaultdict(int)})
        if r["type"]:
            m["counts"][r["type"]] += r["n"]
            t = types.setdefault(r["type"], {"type": r["type"], "title": MISTAKES.get(r["type"], {}).get("title", r["type"]),
                                             "total": 0, "statuses": defaultdict(int)})
            t["total"] += r["n"]
            t["statuses"][r["status"]] += r["n"]
    series = [{**m, "counts": dict(m["counts"])} for m in matches.values()]
    for t in types.values():
        counts = [s["counts"].get(t["type"], 0) for s in series]
        half = len(counts) // 2 or 1
        first, second = counts[:half], counts[half:] or counts[:half]
        t["trend"] = "improving" if sum(second) / len(second) < sum(first) / len(first) else (
            "worse" if sum(second) / len(second) > sum(first) / len(first) else "flat")
        t["statuses"] = dict(t["statuses"])
    return {"matches": series, "types": sorted(types.values(), key=lambda t: -t["total"])}


# ───────────────────────── homework ─────────────────────────

class HomeworkCreate(BaseModel):
    player_name: str
    title: str
    description: str = ""
    solution_code: str | None = None
    lineup_id: str | None = None
    due_date: dt.date | None = None
    check_metric: str | None = None
    check_op: str | None = Field(None, pattern="^(>=|<=)$")
    check_threshold: float | None = None


class HomeworkUpdate(BaseModel):
    status: str | None = None
    title: str | None = None
    description: str | None = None
    due_date: dt.date | None = None


@router.get("/homework")
async def list_homework(au: AcademyUser = Depends(get_academy_user), player: str | None = None, status: str | None = None):
    clauses = ["(org_id = $1::uuid OR org_id IS NULL)"]
    params: list[Any] = [au.org_id]
    if au.academy_role == "player" and au.player_name:
        player = au.player_name
    if player:
        params.append(player)
        clauses.append(f"player_name = ${len(params)}")
    if status:
        params.append(status)
        clauses.append(f"status = ${len(params)}")
    rows = await fetch(f"SELECT * FROM homework WHERE {' AND '.join(clauses)} ORDER BY created_at DESC LIMIT 500", *params)
    return [_row(r) for r in rows]


@router.post("/homework")
async def create_homework(body: HomeworkCreate, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    check_metric, op, thr = body.check_metric, body.check_op, body.check_threshold
    if body.solution_code and not check_metric:
        c = (solution_for(body.solution_code) or {}).get("check") or {}
        check_metric, op, thr = c.get("metric"), c.get("op"), c.get("threshold")
    baseline = await _baseline(body.player_name, check_metric, au.org_id)
    row = await fetchrow(
        """INSERT INTO homework (org_id, player_name, mistake_type, title, description, solution_code, lineup_id, assigned_by,
                                 due_date, check_metric, check_op, check_threshold, baseline_value)
           VALUES ($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8::uuid,$9,$10,$11,$12,$13) RETURNING id""",
        au.org_id, body.player_name, body.solution_code, body.title, body.description, body.solution_code, body.lineup_id,
        au.id, body.due_date, check_metric, op, thr, baseline,
    )
    return {"id": str(row["id"])}


@router.patch("/homework/{hw_id}")
async def update_homework(hw_id: str, body: HomeworkUpdate, au: AcademyUser = Depends(get_academy_user)):
    hw = await fetchrow("SELECT player_name FROM homework WHERE id=$1::uuid", hw_id)
    if not hw:
        raise HTTPException(404, "Задание не найдено")
    if body.status and body.status not in HOMEWORK_STATUSES:
        raise HTTPException(400, "Неизвестный статус")
    if not au.is_staff:
        if au.player_name != hw["player_name"] or (body.status and body.status not in ("in_progress", "done")):
            raise HTTPException(403, "Игрок может только отмечать выполнение своих заданий")
        body.title = body.description = None
        body.due_date = None
    await execute(
        """UPDATE homework SET status=COALESCE($2,status), title=COALESCE($3,title), description=COALESCE($4,description),
           due_date=COALESCE($5,due_date), completed_at = CASE WHEN $2 = 'done' THEN NOW() ELSE completed_at END WHERE id=$1::uuid""",
        hw_id, body.status, body.title, body.description, body.due_date,
    )
    return {"ok": True}


@router.delete("/homework/{hw_id}")
async def delete_homework(hw_id: str, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    await execute("DELETE FROM homework WHERE id=$1::uuid", hw_id)
    return {"ok": True}


@router.post("/homework/verify")
async def verify_homework(player: str, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    return {"changed": await verify_player_homework(player)}


# ───────────────────────── training plans ─────────────────────────

@router.post("/players/{name}/training-plan")
async def generate_plan(name: str, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES)), last: int = 10):
    rows = (await player_stat_rows(au.org_id, player=name))[:last]
    if not rows:
        raise HTTPException(404, "Нет матчей игрока")
    match_ids = [r["match_id"] for r in rows]
    metrics = derive(sum_counters([r["counters"] for r in rows]))
    mistakes = [dict(m) for m in await fetch(
        "SELECT type, category, severity FROM mistakes WHERE player_name=$1 AND match_id = ANY($2::text[]) AND status <> 'dismissed'",
        name, match_ids)]
    maps = sorted({r["map_name"] for r in rows})
    lineups = [dict(lu) for lu in await fetch(
        "SELECT id, title, map_name, side, grenade_type FROM lineups WHERE (org_id = $1::uuid OR org_id IS NULL) ORDER BY created_at DESC LIMIT 50",
        au.org_id)]
    plan = build_plan(name, mistakes, metrics, match_ids, lineups, maps)
    ws = week_start()
    row = await fetchrow(
        """INSERT INTO training_plans (org_id, player_name, week_start, source, created_by, summary, themes, items, based_on_matches)
           VALUES ($1::uuid,$2,$3,'ai',$4::uuid,$5,$6::jsonb,$7::jsonb,$8) RETURNING id""",
        au.org_id, name, ws, au.id, plan["summary"], json.dumps(plan["themes"]),
        json.dumps({"items": plan["items"], "schedule": plan["schedule"], "minutes_per_day": plan["minutes_per_day"]}), match_ids,
    )
    return {"id": str(row["id"]), **plan, "week_start": ws.isoformat()}


@router.get("/players/{name}/training-plans")
async def list_plans(name: str, au: AcademyUser = Depends(get_academy_user)):
    rows = await fetch("SELECT * FROM training_plans WHERE player_name=$1 ORDER BY created_at DESC LIMIT 20", name)
    return [_row(r) for r in rows]


@router.get("/training-plans/{plan_id}/export.md", response_class=PlainTextResponse)
async def export_plan(plan_id: str, au: AcademyUser = Depends(get_academy_user)):
    r = await fetchrow("SELECT * FROM training_plans WHERE id=$1::uuid", plan_id)
    if not r:
        raise HTTPException(404, "План не найден")
    items = jl(r["items"]) or {}
    plan = {"player": r["player_name"], "summary": r["summary"], "themes": jl(r["themes"]) or [], "items": items.get("items", [])}
    return PlainTextResponse(plan_markdown(plan, r["week_start"].isoformat()), media_type="text/markdown; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="plan_{r["player_name"]}_{r["week_start"]}.md"'})


# ───────────────────────── AI reviews & chat ─────────────────────────

@router.get("/ai/status")
async def ai_status():
    p = provider()
    return {"available": p is not None, "provider": p, "model": model_name(),
            "note": None if p else "ИИ-модель не подключена: задайте ANTHROPIC_API_KEY или OPENAI_API_KEY. Разбор и чат работают на правилах."}


@router.get("/matches/{match_id}/reviews")
async def reviews(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    rows = await fetch("SELECT round_number, review, source, model, created_at FROM ai_round_reviews WHERE match_id=$1 ORDER BY round_number", match_id)
    return [{"round": r["round_number"], "review": jl(r["review"]), "source": r["source"], "model": r["model"], "created_at": iso(r["created_at"])} for r in rows]


@router.post("/matches/{match_id}/reviews/llm")
async def generate_llm_reviews(match_id: str, rounds: str | None = None, au: AcademyUser = Depends(require_academy_role(*STAFF_ROLES))):
    await ensure_match_access(match_id, au)
    if provider() is None:
        raise HTTPException(409, "ИИ-модель не подключена (нет API-ключа)")
    wanted = {int(x) for x in rounds.split(",")} if rounds else None
    done = 0
    for r in await fetch("SELECT round_number, review FROM ai_round_reviews WHERE match_id=$1 ORDER BY round_number", match_id):
        if wanted and r["round_number"] not in wanted:
            continue
        rs = await fetchrow("SELECT data FROM round_summaries WHERE match_id=$1 AND round_number=$2", match_id, r["round_number"])
        if not rs:
            continue
        improved = await llm_review(jl(rs["data"]), jl(r["review"]), match_id)
        if improved:
            await execute("UPDATE ai_round_reviews SET review=$3::jsonb, source='llm', model=$4, created_at=NOW() WHERE match_id=$1 AND round_number=$2",
                          match_id, r["round_number"], json.dumps(improved), model_name())
            done += 1
    return {"updated": done}


_chat_hits: dict[str, list[float]] = defaultdict(list)


def _chat_rate_limit(key: str, per_min: int) -> None:
    now = time.monotonic()
    hits = [t for t in _chat_hits[key] if now - t < 60]
    if len(hits) >= per_min:
        raise HTTPException(429, "Слишком много вопросов подряд — подождите минуту")
    hits.append(now)
    _chat_hits[key] = hits


@router.get("/matches/{match_id}/chat/sessions")
async def chat_sessions(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    rows = await fetch(
        """SELECT s.*, (SELECT COUNT(*)::int FROM coach_chat_messages m WHERE m.session_id = s.id) AS messages
           FROM coach_chat_sessions s WHERE s.match_id=$1 AND (s.user_id = $2::uuid OR $2::uuid IS NULL) ORDER BY s.created_at DESC""",
        match_id, au.id,
    )
    return [_row(r) for r in rows]


class SessionCreate(BaseModel):
    title: str | None = None


@router.post("/matches/{match_id}/chat/sessions")
async def create_session(match_id: str, body: SessionCreate, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    row = await fetchrow("INSERT INTO coach_chat_sessions (match_id, user_id, title) VALUES ($1,$2::uuid,$3) RETURNING *",
                         match_id, au.id, body.title or "Разбор матча")
    return _row(row)


@router.get("/chat/sessions/{session_id}/messages")
async def session_messages(session_id: str, au: AcademyUser = Depends(get_academy_user)):
    s = await fetchrow("SELECT match_id FROM coach_chat_sessions WHERE id=$1::uuid", session_id)
    if not s:
        raise HTTPException(404, "Сессия не найдена")
    await ensure_match_access(s["match_id"], au)
    rows = await fetch("SELECT * FROM coach_chat_messages WHERE session_id=$1::uuid ORDER BY created_at", session_id)
    return [_row(r) for r in rows]


class ChatMessage(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)


@router.post("/chat/sessions/{session_id}/messages")
async def send_message(session_id: str, body: ChatMessage, au: AcademyUser = Depends(get_academy_user)):
    from config import settings

    s = await fetchrow("SELECT match_id FROM coach_chat_sessions WHERE id=$1::uuid", session_id)
    if not s:
        raise HTTPException(404, "Сессия не найдена")
    await ensure_match_access(s["match_id"], au)
    _chat_rate_limit(au.id or "guest", settings.coach_chat_per_min)
    history = [{"role": r["role"], "content": r["content"]} for r in await fetch(
        "SELECT role, content FROM coach_chat_messages WHERE session_id=$1::uuid ORDER BY created_at", session_id)]
    await execute("INSERT INTO coach_chat_messages (session_id, role, content) VALUES ($1::uuid,'user',$2)", session_id, body.content)
    players = [r["name"] for r in await fetch("SELECT name FROM players WHERE match_id=$1", s["match_id"])]
    ans = await coach_chat.answer(s["match_id"], body.content, players, history)
    row = await fetchrow(
        "INSERT INTO coach_chat_messages (session_id, role, content, citations, source) VALUES ($1::uuid,'assistant',$2,$3::jsonb,$4) RETURNING *",
        session_id, ans["content"], json.dumps(ans["citations"]), ans["source"],
    )
    if len(history) == 0:
        await execute("UPDATE coach_chat_sessions SET title=$2 WHERE id=$1::uuid", session_id, body.content[:60])
    return _row(row)


# ───────────────────────── notes & comms ─────────────────────────

class NoteCreate(BaseModel):
    round_number: int | None = None
    tick: int | None = None
    player_name: str | None = None
    text: str = Field(..., min_length=1, max_length=4000)


@router.get("/matches/{match_id}/notes")
async def list_notes(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    rows = await fetch("SELECT * FROM coach_text_notes WHERE match_id=$1 ORDER BY round_number NULLS FIRST, tick", match_id)
    return [_row(r) for r in rows]


@router.post("/matches/{match_id}/notes")
async def create_note(match_id: str, body: NoteCreate, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    row = await fetchrow(
        """INSERT INTO coach_text_notes (match_id, round_number, tick, player_name, author_id, author_name, text)
           VALUES ($1,$2,$3,$4,$5::uuid,$6,$7) RETURNING *""",
        match_id, body.round_number, body.tick, body.player_name, au.id, au.username, body.text,
    )
    return _row(row)


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, au: AcademyUser = Depends(get_academy_user)):
    row = await fetchrow("SELECT author_id FROM coach_text_notes WHERE id=$1::uuid", note_id)
    if not row:
        raise HTTPException(404, "Заметка не найдена")
    if not au.is_staff and str(row["author_id"]) != au.id:
        raise HTTPException(403, "Можно удалять только свои заметки")
    await execute("DELETE FROM coach_text_notes WHERE id=$1::uuid", note_id)
    return {"ok": True}


@router.get("/matches/{match_id}/comms")
async def comms_report(match_id: str, au: AcademyUser = Depends(get_academy_user)):
    await ensure_match_access(match_id, au)
    row = await fetchrow("SELECT * FROM communication_reports WHERE match_id=$1", match_id)
    if not row:
        raise HTTPException(404, "Отчёт ещё не построен")
    return {"has_voice": row["has_voice"], "voice_reason": row["voice_reason"], **(jl(row["report"]) or {})}
