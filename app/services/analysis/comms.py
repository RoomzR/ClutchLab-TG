"""Communication report from what the demo actually contains.

In-game signals: pings (player_ping) and chat. Voice is only analysed when the demo
carries voice packets (tv_relayvoice) — otherwise the report says so explicitly.
"""

from __future__ import annotations

import math
from collections import defaultdict
from typing import Any

PING_MATCH_RADIUS = 700.0
LATE_PING_S = 2.0
DUPLICATE_WINDOW_S = 2.0
DUPLICATE_RADIUS = 400.0


def build_report(rate: float, pings: list[dict], chat: list[dict], damages: list[dict],
                 round_summaries: list[dict], has_voice: bool, voice_reason: str | None) -> dict[str, Any]:
    freeze_by_round = {rs["round"]: rs["freeze_tick"] for rs in round_summaries}
    side_team = {rs["round"]: rs["teams"] for rs in round_summaries}

    per_player: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    per_round_pings: dict[int, list[dict]] = defaultdict(list)
    for p in pings:
        per_round_pings[int(p["round_number"] or 0)].append(p)
        per_player[p["player_name"]]["pings"] += 1
        if p.get("urgent"):
            per_player[p["player_name"]]["urgent_pings"] += 1

    # contacts: first damage each player receives from each enemy in a round
    contacts: list[dict] = []
    seen: set[tuple[int, str, str]] = set()
    for d in sorted(damages, key=lambda x: x["tick"]):
        if not d.get("attacker") or d.get("attacker") == "world" or d.get("attacker_side") == d.get("victim_side"):
            continue
        key = (int(d["round_number"]), d["victim"], d["attacker"])
        if key in seen:
            continue
        seen.add(key)
        contacts.append(d)

    events: list[dict[str, Any]] = []
    pinged = late = not_pinged = 0
    for c in contacts:
        rn = int(c["round_number"])
        side = c.get("victim_side")
        ax, ay = c.get("attacker_x"), c.get("attacker_y")
        if ax is None or ay is None:
            continue
        best = None
        for p in per_round_pings.get(rn, []):
            if p.get("side") != side:
                continue
            dt = (p["tick"] - c["tick"]) / rate
            if dt < -10 or dt > 6:
                continue
            dist = math.hypot((p.get("x") or 0) - ax, (p.get("y") or 0) - ay)
            if dist <= PING_MATCH_RADIUS and (best is None or abs(dt) < abs(best[0])):
                best = (dt, p)
        team = (side_team.get(rn) or {}).get(side)
        if best is None:
            not_pinged += 1
            per_player[c["victim"]]["contacts_unmarked"] += 1
            events.append({"type": "contact_unmarked", "round": rn, "tick": c["tick"], "player": c["victim"],
                           "team": team, "enemy": c["attacker"], "place": c.get("attacker_place"),
                           "text": f"Контакт с {c['attacker']} ({c.get('attacker_place') or 'неизвестно'}) не отмечен пингом командой."})
        elif best[0] > LATE_PING_S:
            late += 1
            per_player[best[1]["player_name"]]["late_pings"] += 1
            events.append({"type": "late_ping", "round": rn, "tick": best[1]["tick"], "player": best[1]["player_name"],
                           "team": team, "delay_s": round(best[0], 1),
                           "text": f"Пинг на {c['attacker']} поставлен через {round(best[0], 1)} с после контакта."})
        else:
            pinged += 1

    duplicates = 0
    for rn, items in per_round_pings.items():
        items = sorted(items, key=lambda x: x["tick"])
        for i, a in enumerate(items):
            for b in items[i + 1:]:
                if (b["tick"] - a["tick"]) / rate > DUPLICATE_WINDOW_S:
                    break
                if a["side"] == b["side"] and a["player_name"] != b["player_name"]:
                    if math.hypot((a.get("x") or 0) - (b.get("x") or 0), (a.get("y") or 0) - (b.get("y") or 0)) <= DUPLICATE_RADIUS:
                        duplicates += 1
                        per_player[b["player_name"]]["duplicate_pings"] += 1
                        events.append({"type": "duplicate_ping", "round": rn, "tick": b["tick"], "player": b["player_name"],
                                       "text": f"Дублирующий пинг: {a['player_name']} уже отметил эту точку."})
                        break

    for p in pings:
        rn = int(p["round_number"] or 0)
        freeze = freeze_by_round.get(rn)
        if freeze is not None and p["tick"] < freeze:
            per_player[p["player_name"]]["pings_freeze"] += 1

    chat_out = []
    for m in chat:
        rn = int(m.get("round_number") or 0)
        freeze = freeze_by_round.get(rn)
        chat_out.append({"tick": m["tick"], "round": rn, "player": m.get("player_name"), "side": m.get("side"),
                         "time": round((m["tick"] - freeze) / rate, 1) if freeze is not None else None, "text": m["text"]})
        if m.get("player_name"):
            per_player[m["player_name"]]["chat_messages"] += 1

    total_contacts = pinged + late + not_pinged
    return {
        "voice": {
            "available": has_voice,
            "reason": voice_reason,
            "message": None if has_voice else (
                "Голоса в этой демке нет. Анализ войса («инфа не передана», «колл поздно», «дублирование») доступен "
                "только для демок, записанных с tv_relayvoice 1, или после загрузки записи голосового канала."
            ),
        },
        "summary": {
            "pings": len(pings),
            "chat_messages": len(chat),
            "contacts": total_contacts,
            "contacts_pinged_pct": round(100 * pinged / total_contacts, 1) if total_contacts else None,
            "late_pings": late,
            "unmarked_contacts": not_pinged,
            "duplicate_pings": duplicates,
        },
        "players": {name: dict(v) for name, v in per_player.items()},
        "events": sorted(events, key=lambda e: e["tick"])[:400],
        "chat": chat_out,
        "notes": [
            "Пинги — единственный внутриигровой сигнал передачи инфы, который пишет демка. "
            "Отсутствие пинга не означает, что инфа не была передана голосом.",
        ],
    }
