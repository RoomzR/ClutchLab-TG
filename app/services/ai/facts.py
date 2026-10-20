"""Text facts per match for retrieval (Postgres full-text search, no vectors).

Each fact references a round (and tick where it exists), so chat answers can cite
[R12@84512] and the UI can jump to that moment.
"""

from __future__ import annotations

from typing import Any

from services.analytics.metrics_registry import derive
from services.ai.review import BUY_RU, REASON_RU


def build_facts(match_meta: dict[str, Any], round_summaries: list[dict], mistakes: list[dict],
                player_counters: dict[tuple[str, str], dict], player_team: dict[str, str],
                team_stats: dict[str, dict]) -> list[dict[str, Any]]:
    facts: list[dict[str, Any]] = []

    facts.append({
        "kind": "match", "round_number": None, "player_name": None, "tick": None,
        "text": (f"Матч на {match_meta['map_name']}: {match_meta['team_t_name']} {match_meta['score_t']} — "
                 f"{match_meta['score_ct']} {match_meta['team_ct_name']}. Раундов: {len(round_summaries)}."),
    })

    for rs in round_summaries:
        rn = rs["round"]
        kills = "; ".join(
            f"{k['time']}с {k['killer']} убил {k['victim']} ({k['weapon']}{', HS' if k['headshot'] else ''}"
            f"{', размен' if k.get('trade_of') else ''}{', ' + k['victim_place'] if k.get('victim_place') else ''})"
            for k in rs.get("kills", [])
        )
        buy = rs.get("buy") or {}
        text = (f"Раунд {rn}: выиграли {rs.get('winner_team')} ({rs.get('winner_side')}), "
                f"{REASON_RU.get(str(rs.get('reason') or '').lower(), rs.get('reason'))}, длительность {rs.get('duration')} с. "
                f"Счёт после раунда: {', '.join(f'{t} {s}' for t, s in (rs.get('score') or {}).items())}. "
                f"Закуп T ({rs['teams'].get('T')}): {BUY_RU.get(buy.get('T', {}).get('type'), '?')} ${buy.get('T', {}).get('avg_equip')}; "
                f"CT ({rs['teams'].get('CT')}): {BUY_RU.get(buy.get('CT', {}).get('type'), '?')} ${buy.get('CT', {}).get('avg_equip')}. "
                f"Убийства: {kills or 'нет'}.")
        if rs.get("plant"):
            text += f" Плант {rs['plant'].get('site') or ''} {rs['plant']['player']} на {rs['plant']['time']} с."
        if rs.get("defuse"):
            text += f" Дефьюз {rs['defuse']['player']}."
        for cl in (rs.get("clutch") or {}).values():
            text += f" Клатч 1v{cl['vs']} {cl['player']} — {'выигран' if cl.get('won') else 'проигран'}."
        if rs.get("mvp"):
            text += f" MVP раунда: {rs['mvp']}."
        key_tick = rs["opening"]["tick"] if rs.get("opening") else rs.get("freeze_tick")
        facts.append({"kind": "round", "round_number": rn, "player_name": None, "tick": key_tick, "text": text})

        econ_bits = []
        for name, p in (rs.get("players") or {}).items():
            econ_bits.append(f"{name}: ${p.get('money')} на старте, потратил ${p.get('spent')}, экипировка ${p.get('equip')}")
        if econ_bits:
            facts.append({"kind": "economy", "round_number": rn, "player_name": None, "tick": rs.get("freeze_tick"),
                          "text": f"Экономика раунда {rn}: " + "; ".join(econ_bits) + "."})

    for m in mistakes:
        facts.append({
            "kind": "mistake", "round_number": m.get("round_number"), "player_name": m.get("player_name"),
            "tick": m.get("tick_end") or m.get("tick_start"),
            "text": (f"Ошибка «{m['title']}» ({m['severity']}) — {m.get('player_name') or m.get('team_name')}, "
                     f"раунд {m.get('round_number') or 'весь матч'}. {m['explanation']} Совет: {m['recommendation']}"),
        })

    for (name, side), counters in player_counters.items():
        if side != "all":
            continue
        d = derive(counters)

        def f(key: str, digits: int = 1) -> str:
            v = d.get(key)
            return "—" if v is None else str(round(v, digits))

        facts.append({
            "kind": "player", "round_number": None, "player_name": name, "tick": None,
            "text": (f"Статистика {name} ({player_team.get(name)}): рейтинг {f('rating', 2)}, K/D {f('kd', 2)}, "
                     f"убийства {f('kills', 0)}, смерти {f('deaths', 0)}, ассисты {f('assists', 0)}, ADR {f('adr')}, "
                     f"KAST {f('kast_pct')}%, HS {f('hs_pct')}%, опенинги {f('opening_kills', 0)}/{f('opening_attempts', 0)}, "
                     f"клатчи {f('clutch_wins', 0)}/{f('clutch_attempts', 0)}, точность {f('accuracy_pct')}%, "
                     f"контрстрейф {f('counter_strafe_pct')}%, кроссхейр {f('crosshair_deg')}°, "
                     f"разменянные смерти {f('traded_death_pct')}%, урон утилити за раунд {f('utility_damage_per_round')}, "
                     f"ослеплено врагов за раунд {f('enemies_flashed_per_round', 2)}, неиспользованная утилити при смерти "
                     f"${f('unused_util_value_per_death', 0)}, средняя экипировка ${f('avg_equip', 0)}."),
        })

    for tname, ts in team_stats.items():
        m = ts.get("metrics") or {}
        facts.append({
            "kind": "team", "round_number": None, "player_name": None, "tick": None,
            "text": (f"Команда {tname}: {ts.get('score')} раундов, CT {m.get('ct_win_pct')}%, T {m.get('t_win_pct')}%, "
                     f"пистолетки {m.get('pistol_win_pct')}%, фулл-бай {m.get('full_buy_win_pct')}%, форс {m.get('force_win_pct')}%, "
                     f"эко {m.get('eco_win_pct')}%, 5v4 {m.get('opening_win_pct')}%, пост-плант {m.get('post_plant_win_pct')}%, "
                     f"ретейки {m.get('retake_win_pct')}%, первый контакт в среднем на {m.get('avg_first_contact')} с, "
                     f"размены {m.get('traded_death_pct')}%."),
        })
    return facts
