"""Deterministic mistake detectors over engine RoundFacts.

Every mistake carries evidence (ticks, players, values) so the UI can jump to the
exact moment in the 2D replay. The LLM layer only rephrases/prioritises these.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from typing import Any

from services.analytics.engine import EngineResult, RoundFacts
from services.analysis.solutions import MISTAKES

SEVERITY_ORDER = {"high": 3, "medium": 2, "low": 1}


def _mk(mtype: str, rf: RoundFacts | None, player: str | None, side: str | None, team: str | None,
        severity: str, tick_start: int | None, tick_end: int | None, evidence: dict[str, Any],
        detail: str, confidence: str = "rule") -> dict[str, Any]:
    spec = MISTAKES[mtype]
    return {
        "type": mtype,
        "category": spec["category"],
        "round_number": rf.round_number if rf else None,
        "player_name": player,
        "side": side,
        "team_name": team,
        "severity": severity,
        "confidence": confidence,
        "tick_start": tick_start,
        "tick_end": tick_end,
        "title": spec["title"],
        "explanation": f"{spec['explanation']} {detail}".strip(),
        "recommendation": spec["solution"]["title"] + ": " + spec["solution"]["steps"][0],
        "solution_code": mtype,
        "evidence": evidence,
    }


def detect(result: EngineResult, rate: float, lineups: list[dict] | None = None) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    lineups = lineups or []

    for rf in result.round_facts:
        lost = {s: rf.winner_side != s for s in ("CT", "T")}

        for d in rf.deaths:
            v, side = d["victim"], d["victim_side"]
            if v not in result.player_team or not d["enemy_kill"] or d.get("post_round"):
                continue
            team = rf.team_by_side.get(side)
            ev = {"tick": d["tick"], "killer": d["killer"], "weapon": d["weapon"], "time": d["time"],
                  "victim_place": d["victim_place"], "killer_place": d["killer_place"],
                  "spacing": d["spacing"], "team_util_before_4s": d.get("team_util_before_4s", 0)}

            if d["is_opening"] and not d["traded"] and d.get("team_util_before_4s", 0) == 0:
                sev = "high" if lost[side] else "medium"
                out.append(_mk("dry_peek", rf, v, side, team, sev, d["tick"] - int(rate * 4), d["tick"], ev,
                               f"Раунд {rf.round_number}, {d['time']} с: умер первым от {d['killer']} ({d['weapon']}) "
                               f"на {d['victim_place'] or 'позиции'}, без утилити команды и без размена."))
            elif (d["time"] <= 25 and rf.first_contact_tick is not None and d.get("team_util_before_4s", 0) == 0
                  and side == "T" and not d["traded"]):
                out.append(_mk("no_utility_contact", rf, v, side, team, "medium", d["tick"] - int(rate * 4), d["tick"], ev,
                               f"Раунд {rf.round_number}, {d['time']} с после фризтайма — гранат команды ещё не было."))

            if (d["spacing"] is not None and d["spacing"] > 1000 and not d["traded"]
                    and d.get("alive_teammates", 0) >= 2 and not rf.plant):
                out.append(_mk("isolated_death", rf, v, side, team, "medium" if lost[side] else "low",
                               d["tick"] - int(rate * 3), d["tick"], ev,
                               f"Ближайший тиммейт был в {d['spacing']} юнитах."))

            # > 90° means shot from behind/flank — a positioning problem, not crosshair placement
            if d.get("aim_error") is not None and 40 <= d["aim_error"] <= 90 and d["weapon"] not in ("awp", "ssg08"):
                out.append(_mk("poor_crosshair", rf, v, side, team, "low", d["tick"] - int(rate * 1), d["tick"],
                               {**ev, "aim_error_deg": d["aim_error"]},
                               f"Прицел был в {d['aim_error']}° от {d['killer']} за 250 мс до смерти.", confidence="estimated"))

            uu = d.get("unused_util")
            if uu and uu.get("value", 0) >= 600:
                ev2 = {**ev, "items": uu["items"], "value": uu["value"]}
                out.append(_mk("died_with_utility", rf, v, side, team, "medium" if uu["value"] >= 900 else "low",
                               d["tick"] - int(rate * 3), d["tick"], ev2,
                               f"В инвентаре: {', '.join(uu['items'])} (${uu['value']})."))

        for name, ms in rf.moving_shots.items():
            if ms["eligible"] >= 4 and ms["count"] / ms["eligible"] >= 0.5:
                side = next((s for s in ("CT", "T") if name in rf.roster[s]), None)
                died = any(d["victim"] == name for d in rf.deaths)
                if not died:
                    continue
                out.append(_mk("moving_shots", rf, name, side, rf.team_by_side.get(side or ""), "medium",
                               ms["ticks"][0] if ms["ticks"] else None, ms["ticks"][-1] if ms["ticks"] else None,
                               {"moving_first_shots": ms["count"], "eligible_first_shots": ms["eligible"], "ticks": ms["ticks"][:12]},
                               f"{ms['count']} из {ms['eligible']} первых выстрелов в движении."))

        for be in rf.buy_errors:
            detail = (f"Фулл-бай (${be['equip']}) при средней экипировке команды ${be['team_avg']}."
                      if be["kind"] == "solo_full_buy"
                      else f"Сейв с ${be['money']} при закупе команды (средняя экипировка ${be['team_avg']}).")
            out.append(_mk("buy_desync", rf, be["player"], be["side"], rf.team_by_side.get(be["side"]), "low",
                           rf.freeze_tick, rf.freeze_tick + int(rate * 3), be, detail))

        for u in rf.unfinished:
            side = next((s for s in ("CT", "T") if u["player"] in rf.roster[s]), None)
            out.append(_mk("unfinished_enemy", rf, u["player"], side, rf.team_by_side.get(side or ""), "low",
                           rf.freeze_tick, rf.end_tick, u, f"{u['victim']} получил {u['damage']} урона и выжил."))

        flashed: dict[str, list[dict]] = defaultdict(list)
        for tf in rf.team_flashes:
            flashed[tf["flasher"]].append(tf)
        for flasher, items in flashed.items():
            deadly = [tf for tf in items if any(d["victim"] == tf["victim"] and 0 <= d["tick"] - tf["tick"] <= int(rate * 2.5)
                                                for d in rf.deaths)]
            if len(items) >= 2 or deadly:
                side = next((s for s in ("CT", "T") if flasher in rf.roster[s]), None)
                out.append(_mk("team_flash", rf, flasher, side, rf.team_by_side.get(side or ""),
                               "medium" if deadly else "low", items[0]["tick"], items[-1]["tick"],
                               {"flashes": items, "led_to_death": [tf["victim"] for tf in deadly]},
                               f"Ослеплены тиммейты: {', '.join(tf['victim'] for tf in items)}"
                               + (f"; {', '.join(tf['victim'] for tf in deadly)} умер сразу после." if deadly else ".")))

        # team-level round mistakes
        if rf.opening:
            adv_side = rf.opening["killer_side"]
            if adv_side and rf.winner_side != adv_side:
                out.append(_mk("lost_man_advantage", rf, None, adv_side, rf.team_by_side.get(adv_side), "medium",
                               rf.opening["tick"], rf.end_tick, {"opening": rf.opening},
                               f"Первый килл: {rf.opening['killer']} → {rf.opening['victim']} на {rf.opening['time']} с."))
        for side in ("CT", "T"):
            enemy = "CT" if side == "T" else "T"
            if rf.buy_type[side] == "full" and rf.buy_type[enemy] in ("eco",) and rf.winner_side != side:
                out.append(_mk("lost_eco_advantage", rf, None, side, rf.team_by_side.get(side), "high",
                               rf.freeze_tick, rf.end_tick,
                               {"own_equip": round(rf.avg_equip[side]), "enemy_equip": round(rf.avg_equip[enemy])},
                               f"Средняя экипировка ${round(rf.avg_equip[side])} против ${round(rf.avg_equip[enemy])}."))
        if rf.plant and rf.alive_at_plant and rf.winner_side == "CT":
            a = rf.alive_at_plant
            if a.get("T", 0) > a.get("CT", 0):
                out.append(_mk("lost_post_plant", rf, None, "T", rf.team_by_side.get("T"), "high",
                               rf.plant["tick"], rf.end_tick, {"alive_at_plant": a, "plant": rf.plant},
                               f"На плант {a['T']}v{a['CT']}, раунд проигран."))
        # lineup misses
        for sm in rf.smokes:
            if sm.get("x") is None:
                continue
            best = None
            for lu in lineups:
                if lu.get("grenade_type") != "smoke" or lu.get("land_x") is None:
                    continue
                dist = math.hypot(sm["x"] - lu["land_x"], sm["y"] - lu["land_y"])
                if dist <= 400 and (best is None or dist < best[0]):
                    best = (dist, lu)
            if best and best[0] > 120:
                lu = best[1]
                side = sm.get("side")
                out.append(_mk("lineup_miss", rf, sm["player"], side, rf.team_by_side.get(side or ""), "low",
                               sm["tick"] - int(rate * 2), sm["tick"],
                               {"lineup_id": str(lu["id"]), "lineup_title": lu["title"], "distance": round(best[0]),
                                "land": [sm["x"], sm["y"]], "target": [lu["land_x"], lu["land_y"]]},
                               f"Эталон «{lu['title']}», промах {round(best[0])} юнитов."))

    # match-level: predictable positions (same zone at 20 s in ≥ 70% of ≥ 6 rounds on a side)
    for (name, side), ex in result.player_extras.items():
        if side not in ("CT", "T"):
            continue
        places = ex.get("early_places") or {}
        total = sum(places.values()) if isinstance(places, dict) else 0
        if total < 6:
            continue
        top, cnt = Counter(places).most_common(1)[0]
        deaths_here = (ex.get("death_places") or {}).get(top, 0)
        if cnt / total >= 0.7 and deaths_here >= 3:
            out.append({
                **_mk("predictable_position", None, name, side, result.player_team.get(name), "medium", None, None,
                      {"place": top, "rounds_on_place": cnt, "rounds_on_side": total, "deaths_on_place": deaths_here},
                      f"За {side}: «{top}» в {cnt} из {total} раундов, {deaths_here} смертей там."),
            })

    out.sort(key=lambda m: (m["round_number"] or 0, -SEVERITY_ORDER[m["severity"]]))
    return out


def detect_late_rotations(result: EngineResult, positions_at, rate: float) -> list[dict[str, Any]]:
    """CT players > 2000 units from the bomb at plant time in a lost round."""
    out: list[dict[str, Any]] = []
    for rf in result.round_facts:
        if not rf.plant or rf.winner_side != "T" or rf.plant.get("x") is None:
            continue
        t = rf.plant["tick"]
        dead = {d["victim"] for d in rf.deaths if d["tick"] <= t}
        for n in rf.roster["CT"]:
            if n in dead:
                continue
            p = positions_at(n, t)
            if not p:
                continue
            dist = math.hypot(p[3] - rf.plant["x"], p[4] - rf.plant["y"])
            if dist > 2000:
                out.append(_mk("far_from_plant", rf, n, "CT", rf.team_by_side.get("CT"), "low", t - int(rate * 5), t + int(rate * 5),
                               {"distance": round(dist), "site": rf.plant.get("site"), "plant_tick": t},
                               f"Во время планта ({rf.plant['time']} с) был в {round(dist)} юнитах от бомбы."))
    return out
