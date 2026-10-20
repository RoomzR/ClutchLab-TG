"""Weekly training plan from a player's recent mistakes and metrics."""

from __future__ import annotations

import datetime as dt
from collections import Counter, defaultdict
from typing import Any

from services.analysis.solutions import CATEGORIES, MISTAKES, solution_for

SEVERITY_WEIGHT = {"high": 3.0, "medium": 2.0, "low": 1.0}
DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

THEME_METRICS = {
    "aim": ["counter_strafe_pct", "accuracy_pct", "crosshair_deg", "hs_pct"],
    "positioning": ["isolated_death_pct", "position_repeat_pct", "lurk_pct"],
    "utility": ["utility_damage_per_round", "enemies_flashed_per_round", "unused_util_value_per_death", "utility_before_contact_pct"],
    "teamplay": ["traded_death_pct", "trade_kills", "untraded_death_pct"],
    "economy": ["buy_errors", "cost_per_kill"],
    "decision": ["opening_success_pct", "opening_deaths"],
    "comms": [],
}


def week_start(today: dt.date | None = None) -> dt.date:
    today = today or dt.date.today()
    return today - dt.timedelta(days=today.weekday())


def build_plan(player: str, mistakes: list[dict[str, Any]], metrics: dict[str, float | None], match_ids: list[str],
               lineups: list[dict[str, Any]], maps: list[str]) -> dict[str, Any]:
    n_matches = max(1, len(match_ids))
    by_cat: dict[str, float] = defaultdict(float)
    by_type: Counter = Counter()
    for m in mistakes:
        w = SEVERITY_WEIGHT.get(m["severity"], 1.0)
        by_cat[m["category"]] += w / n_matches
        by_type[m["type"]] += 1

    themes = []
    for cat, score in sorted(by_cat.items(), key=lambda x: -x[1])[:3]:
        types = [t for t, _ in by_type.most_common() if MISTAKES.get(t, {}).get("category") == cat][:3]
        themes.append({
            "category": cat,
            "title": CATEGORIES.get(cat, cat),
            "score": round(score, 2),
            "mistake_types": [{"type": t, "title": MISTAKES[t]["title"], "count": by_type[t]} for t in types],
            "metrics": {k: metrics.get(k) for k in THEME_METRICS.get(cat, [])},
        })

    items: list[dict[str, Any]] = []
    for theme in themes:
        for mt in theme["mistake_types"][:2]:
            sol = solution_for(mt["type"])
            if not sol:
                continue
            items.append({
                "kind": "drill", "theme": theme["category"], "title": sol["title"], "details": sol["drill"],
                "steps": sol["steps"], "minutes": sol["minutes_per_day"], "mistake_type": mt["type"],
                "check": sol["check"], "frequency": "daily" if theme is themes[0] else "3x",
            })
        if theme["category"] == "utility":
            for lu in [lu for lu in lineups if lu["map_name"] in maps][:3]:
                items.append({
                    "kind": "lineup", "theme": "utility", "title": f"Раскидка: {lu['title']}",
                    "details": f"{lu['map_name']} · {lu['side']} · {lu['grenade_type']} — 10 точных бросков подряд",
                    "lineup_id": str(lu["id"]), "minutes": 5, "frequency": "3x",
                })
    items.append({
        "kind": "review", "theme": "review", "title": "Разбор своих ошибок в реплее",
        "details": "Открой вкладку «Ошибки» последнего матча и пересмотри каждый момент с высоким приоритетом.",
        "minutes": 15, "frequency": "2x",
    })

    schedule: dict[str, list[int]] = {d: [] for d in DAYS}
    for idx, it in enumerate(items):
        if it["frequency"] == "daily":
            days = DAYS[:6]
        elif it["frequency"] == "3x":
            days = [DAYS[(idx + k * 2) % 6] for k in range(3)]
        else:
            days = [DAYS[(idx + 1) % 6], DAYS[(idx + 4) % 6]]
        it["days"] = days
        for d in days:
            schedule[d].append(idx)

    if themes:
        summary = (f"Главный фокус недели — {themes[0]['title'].lower()}"
                   + (f", затем {', '.join(t['title'].lower() for t in themes[1:])}" if len(themes) > 1 else "")
                   + f". Основано на {len(mistakes)} ошибках из {len(match_ids)} матчей.")
    else:
        summary = "Ошибок с высоким приоритетом не найдено — поддерживающий план: аим и разбор реплеев."
    return {
        "player": player, "summary": summary, "themes": themes, "items": items,
        "schedule": {d: idxs for d, idxs in schedule.items()},
        "minutes_per_day": {d: sum(items[i]["minutes"] for i in idxs) for d, idxs in schedule.items()},
    }


def plan_markdown(plan: dict[str, Any], week: str) -> str:
    lines = [f"# План тренировок — {plan['player']} (неделя с {week})", "", plan.get("summary", ""), ""]
    for t in plan.get("themes", []):
        lines.append(f"## {t['title']}")
        for mt in t["mistake_types"]:
            lines.append(f"- {mt['title']}: {mt['count']} раз")
        lines.append("")
    lines.append("## Упражнения")
    for it in plan.get("items", []):
        lines.append(f"- **{it['title']}** ({it['minutes']} мин, {', '.join(it.get('days', []))}) — {it['details']}")
        if it.get("check"):
            c = it["check"]
            lines.append(f"  - Проверка: {c['metric']} {c['op']} {c['threshold']}")
    return "\n".join(lines) + "\n"
