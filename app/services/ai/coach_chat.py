"""AI coach chat over one match: retrieval from match_facts + LLM or rule answer."""

from __future__ import annotations

import re
from typing import Any

from postgres_repo import fetch
from services.ai.llm import complete, load_prompt, model_name, provider

INTENTS = {
    "mistakes": ("ошиб", "косяк", "проеб", "что не так", "mistake", "плохо"),
    "economy": ("эконом", "закуп", "деньг", "эко", "форс", "buy", "money"),
    "utility": ("утилит", "гранат", "флеш", "смок", "молот", "раскид", "utility", "flash", "smoke"),
    "clutch": ("клатч", "clutch", "1v"),
    "trade": ("размен", "трейд", "trade"),
    "aim": ("аим", "прицел", "стрел", "контрстрейф", "точност", "aim", "crosshair"),
    "lost": ("почему проиграли", "почему слили", "проиграли", "слили", "why lost", "lose"),
    "best": ("лучш", "mvp", "топ", "кто тащил"),
}

KIND_PRIORITY = {"mistakes": ["mistake"], "economy": ["economy", "round"], "aim": ["player", "mistake"],
                 "best": ["player", "round"], "lost": ["round", "mistake", "team"]}


def _rounds_in(question: str) -> list[int]:
    nums = re.findall(r"(?:раунд\w*\s*|r|round\s*)(\d{1,2})|(\d{1,2})\s*(?:-?й|-?ом|-?го)?\s*раунд", question.lower())
    out = []
    for a, b in nums:
        n = int(a or b)
        if 0 < n < 60:
            out.append(n)
    return sorted(set(out))


def _intents(question: str) -> list[str]:
    q = question.lower()
    return [name for name, keys in INTENTS.items() if any(k in q for k in keys)]


async def retrieve(match_id: str, question: str, players: list[str], limit: int = 10) -> list[dict[str, Any]]:
    q = question.lower()
    rounds = _rounds_in(question)
    mentioned = [p for p in players if p.lower() in q]
    intents = _intents(question)
    kinds: list[str] = []
    for it in intents:
        kinds.extend(KIND_PRIORITY.get(it, []))

    rows = await fetch(
        """
        SELECT id, kind, round_number, player_name, tick, text,
               ts_rank(tsv, plainto_tsquery('simple', $2)) AS rank
        FROM match_facts WHERE match_id = $1
        """,
        match_id, question,
    )
    scored = []
    for r in rows:
        score = float(r["rank"] or 0) * 10
        if rounds and r["round_number"] in rounds:
            score += 6
            if r["kind"] == "round":
                score += 5
        if mentioned and r["player_name"] in mentioned:
            score += 5
        if mentioned and any(p in r["text"] for p in mentioned):
            score += 2
        if kinds and r["kind"] in kinds:
            score += 3
        if "mistakes" in intents and r["kind"] == "mistake":
            score += 2
        if not rounds and not mentioned and not intents and r["kind"] in ("match", "team"):
            score += 1
        if rounds and r["round_number"] not in rounds and r["kind"] in ("round", "economy"):
            score -= 3
        if score > 0:
            scored.append((score, dict(r)))
    scored.sort(key=lambda x: -x[0])
    return [item for _, item in scored[:limit]]


def _cite(f: dict[str, Any]) -> str:
    if f.get("round_number") and f.get("tick"):
        return f"[R{f['round_number']}@{f['tick']}]"
    if f.get("round_number"):
        return f"[R{f['round_number']}]"
    return "[матч]"


def _citations(facts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"round": f.get("round_number"), "tick": f.get("tick"), "player": f.get("player_name"),
             "kind": f["kind"], "label": _cite(f), "text": f["text"][:240]} for f in facts]


def _rule_answer(question: str, facts: list[dict[str, Any]]) -> str:
    if not facts:
        return "В демке этого нет: по этому вопросу в данных матча не нашлось фактов. Спроси про конкретный раунд, игрока, экономику или ошибки."
    intents = _intents(question)
    head = {
        "mistakes": "Ошибки, найденные в демке:",
        "economy": "Что показывает экономика:",
        "utility": "По утилити:",
        "clutch": "Клатчи и концовки раундов:",
        "trade": "Размены:",
        "aim": "Стрельба и механика:",
        "lost": "Ключевые факты по проигранным моментам:",
        "best": "Кто сделал больше всего:",
    }.get(intents[0] if intents else "", "Вот что есть в демке по вопросу:")
    lines = [head]
    for f in facts[:6]:
        lines.append(f"• {f['text']} {_cite(f)}")
    lines.append("")
    lines.append("ИИ-модель не подключена — ответ собран из фактов демки без генерации текста.")
    return "\n".join(lines)


async def answer(match_id: str, question: str, players: list[str], history: list[dict[str, str]]) -> dict[str, Any]:
    facts = await retrieve(match_id, question, players)
    citations = _citations(facts)
    if provider() is None:
        return {"content": _rule_answer(question, facts), "citations": citations, "source": "rules"}
    if not facts:
        return {"content": "В демке этого нет: подходящих фактов в данных матча не нашлось.", "citations": [], "source": "rules"}

    context = "\n".join(f"{_cite(f)} {f['text']}" for f in facts)
    messages = [*history[-6:], {"role": "user", "content": f"Факты матча:\n{context}\n\nВопрос: {question}"}]
    text = await complete(load_prompt("coach_chat.v1.md"), messages, feature="coach_chat", match_id=match_id, max_tokens=900)
    if not text:
        return {"content": _rule_answer(question, facts), "citations": citations, "source": "rules"}

    labels = set(re.findall(r"\[R\d+(?:@\d+)?\]|\[матч\]", text))
    used = [c for c in citations if c["label"] in labels] or citations
    return {"content": text.strip(), "citations": used, "source": f"llm:{model_name()}"}
