"""Per-round review: deterministic draft from facts + optional LLM rewrite.

Output schema (validated before storing):
{ round, summary, tags[], mistakes[{type, player, severity, tick, recommendation, evidence}],
  positives[{player, tick, text}], key_tick }
"""

from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from services.ai.llm import complete, extract_json, load_prompt, model_name

REASON_RU = {
    "ct_eliminated": "все CT убиты",
    "t_eliminated": "все T убиты",
    "terrorists_win": "все CT убиты",
    "cts_win": "все T убиты",
    "bomb_defused": "бомба обезврежена",
    "target_bombed": "бомба взорвана",
    "target_saved": "время вышло",
    "bomb_exploded": "бомба взорвана",
    "time_ran_out": "время вышло",
}

BUY_RU = {"pistol": "пистолетный", "eco": "эко", "force": "форс", "full": "фулл-бай"}


class ReviewMistake(BaseModel):
    type: str
    player: str | None = None
    severity: str
    tick: int | None = None
    recommendation: str
    title: str
    evidence: dict[str, Any] = Field(default_factory=dict)


class ReviewPositive(BaseModel):
    player: str | None = None
    tick: int | None = None
    text: str


class RoundReview(BaseModel):
    round: int
    summary: str
    tags: list[str]
    mistakes: list[ReviewMistake]
    positives: list[ReviewPositive]
    key_tick: int | None = None
    llm: dict[str, Any] | None = None


def round_tags(rs: dict[str, Any]) -> list[str]:
    tags: list[str] = []
    buy = rs.get("buy") or {}
    if buy.get("T", {}).get("type") == "pistol":
        tags.append("пистолетка")
    for side in ("T", "CT"):
        own, enemy = buy.get(side, {}).get("type"), buy.get("CT" if side == "T" else "T", {}).get("type")
        if own == "eco" and enemy == "full":
            tags.append(f"эко {rs['teams'].get(side)}")
        if own == "force":
            tags.append(f"форс {rs['teams'].get(side)}")
    kills_by: dict[str, int] = {}
    for k in rs.get("kills", []):
        if k.get("killer_side") != k.get("victim_side"):
            kills_by[k["killer"]] = kills_by.get(k["killer"], 0) + 1
    for name, n in kills_by.items():
        if n == 5:
            tags.append(f"эйс {name}")
        elif n == 4:
            tags.append(f"4K {name}")
    for side, cl in (rs.get("clutch") or {}).items():
        if cl.get("vs", 0) >= 2 or cl.get("won"):
            tags.append(f"клатч 1v{cl['vs']} {cl['player']}" + (" ✓" if cl.get("won") else ""))
    if rs.get("plant"):
        tags.append(f"плант {rs['plant'].get('site') or ''}".strip())
    if rs.get("defuse"):
        tags.append("дефьюз")
    return tags


def rules_review(rs: dict[str, Any], round_mistakes: list[dict[str, Any]]) -> dict[str, Any]:
    winner_team = rs.get("winner_team") or rs.get("winner_side")
    reason = REASON_RU.get(str(rs.get("reason") or "").lower(), str(rs.get("reason") or ""))
    parts = [f"{winner_team} ({rs.get('winner_side')}) взяли раунд — {reason}."]
    op = rs.get("opening")
    if op:
        parts.append(f"Открытие: {op['killer']} → {op['victim']} на {op['time']} с.")
    if rs.get("plant"):
        parts.append(f"Плант {rs['plant'].get('site') or ''} на {rs['plant']['time']} с ({rs['plant']['player']}).")
    for cl in (rs.get("clutch") or {}).values():
        parts.append(f"Клатч 1v{cl['vs']} {cl['player']} — {'выигран' if cl.get('won') else 'проигран'}.")
    buy = rs.get("buy") or {}
    if buy:
        parts.append(
            f"Закуп: {rs['teams'].get('T')} — {BUY_RU.get(buy.get('T', {}).get('type'), '?')} (${buy.get('T', {}).get('avg_equip')}), "
            f"{rs['teams'].get('CT')} — {BUY_RU.get(buy.get('CT', {}).get('type'), '?')} (${buy.get('CT', {}).get('avg_equip')})."
        )

    positives: list[dict[str, Any]] = []
    kills_by: dict[str, list[dict]] = {}
    for k in rs.get("kills", []):
        if k.get("killer_side") and k.get("killer_side") != k.get("victim_side"):
            kills_by.setdefault(k["killer"], []).append(k)
    for name, ks in kills_by.items():
        if len(ks) >= 3:
            positives.append({"player": name, "tick": ks[0]["tick"], "text": f"{len(ks)} убийства в раунде"})
    for k in rs.get("kills", []):
        if k.get("trade_of"):
            positives.append({"player": k["killer"], "tick": k["tick"], "text": f"Разменял {k['trade_of']}"})
    for cl in (rs.get("clutch") or {}).values():
        if cl.get("won"):
            positives.append({"player": cl["player"], "tick": cl.get("tick"), "text": f"Выиграл клатч 1v{cl['vs']}"})
    if rs.get("defuse"):
        positives.append({"player": rs["defuse"]["player"], "tick": rs["defuse"]["tick"], "text": "Дефьюз бомбы"})

    mistakes = [
        {"type": m["type"], "player": m.get("player_name"), "severity": m["severity"], "tick": m.get("tick_end") or m.get("tick_start"),
         "recommendation": m["recommendation"], "title": m["title"], "evidence": m.get("evidence") or {}}
        for m in round_mistakes
    ]
    key_tick = None
    high = [m for m in mistakes if m["severity"] == "high" and m["tick"]]
    if high:
        key_tick = high[0]["tick"]
    elif op:
        key_tick = op["tick"]

    review = RoundReview(
        round=rs["round"], summary=" ".join(parts), tags=round_tags(rs), mistakes=mistakes,
        positives=positives[:5], key_tick=key_tick,
    )
    return json.loads(review.model_dump_json())


def _compact_round(rs: dict[str, Any]) -> dict[str, Any]:
    return {
        "round": rs["round"], "winner_team": rs.get("winner_team"), "winner_side": rs.get("winner_side"),
        "reason": rs.get("reason"), "teams": rs.get("teams"), "buy": rs.get("buy"),
        "kills": [{k_: k[k_] for k_ in ("tick", "time", "killer", "victim", "weapon", "headshot", "traded", "victim_place")}
                  for k in rs.get("kills", [])],
        "plant": rs.get("plant"), "defuse": rs.get("defuse"), "clutch": rs.get("clutch"),
        "first_contact": rs.get("first_contact"),
    }


async def llm_review(rs: dict[str, Any], draft: dict[str, Any], match_id: str) -> dict[str, Any] | None:
    payload = {"round": _compact_round(rs), "rule_mistakes": draft.get("mistakes", [])}
    text = await complete(
        load_prompt("round_review.v1.md"),
        [{"role": "user", "content": json.dumps(payload, ensure_ascii=False)}],
        feature="round_review", match_id=match_id, json_mode=True, max_tokens=900,
    )
    data = extract_json(text)
    if not data:
        return None
    valid_ticks = {k["tick"] for k in rs.get("kills", [])}
    for key in ("plant", "defuse"):
        if rs.get(key):
            valid_ticks.add(rs[key]["tick"])
    for m in draft.get("mistakes", []):
        if m.get("tick"):
            valid_ticks.add(m["tick"])

    def keep(items: Any, limit: int) -> list[dict[str, Any]]:
        out = []
        for it in items if isinstance(items, list) else []:
            if not isinstance(it, dict) or not it.get("point"):
                continue
            tick = it.get("tick")
            if tick is not None and tick not in valid_ticks:
                continue
            out.append({"player": it.get("player"), "tick": tick, "point": str(it["point"])[:400],
                        "fix": str(it.get("fix") or "")[:400]})
        return out[:limit]

    try:
        result = {**draft, "summary": str(data.get("summary") or draft["summary"])[:600],
                  "llm": {"model": model_name(), "priorities": keep(data.get("priorities"), 4),
                          "positives": keep(data.get("positives"), 3)}}
        RoundReview.model_validate(result)
        return result
    except ValidationError:
        return None
