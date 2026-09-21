"""ClutchLab Rating — HLTV-inspired Rating 2.0 approximation from demo events.

Without damage/assists in the parse pipeline we estimate ADR and KAST from
kills/deaths/rounds. Values are calibrated to sit near HLTV's familiar 0.8–1.4 band.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PlayerAgg:
    name: str
    kills: int = 0
    deaths: int = 0
    headshots: int = 0
    rounds: int = 0
    matches: int = 0
    opening_kills: int = 0
    opening_deaths: int = 0
    multi_2k: int = 0
    multi_3k: int = 0
    multi_4k: int = 0
    multi_5k: int = 0
    kast_rounds: int = 0
    rounds_with_kill: int = 0
    weapon_kills: dict[str, int] = field(default_factory=dict)
    map_rounds: dict[str, int] = field(default_factory=dict)
    map_kills: dict[str, int] = field(default_factory=dict)
    map_deaths: dict[str, int] = field(default_factory=dict)
    # per match_id -> rating contribution inputs
    match_form: list[dict] = field(default_factory=list)


def estimate_adr(kills: int, headshots: int, rounds: int) -> float:
    """Proxy ADR when hurt events are unavailable."""
    if rounds <= 0:
        return 0.0
    # ~105 dmg per kill + HS bonus; capped like real ADR ranges
    return min(140.0, (kills * 105.0 + headshots * 18.0) / rounds)


def impact_rating(fkpr: float, multi_per_round: float) -> float:
    """HLTV-style Impact component (opening + multi-kill presence)."""
    return 2.13 * fkpr + 0.42 * multi_per_round


def lab_rating(
    *,
    kpr: float,
    dpr: float,
    impact: float,
    kast: float,
    adr: float,
) -> float:
    """
    Approximate HLTV Rating 2.0 weights (community reverse-engineering).
    Returns value typically in ~0.5–2.0 range (1.00 ≈ average).
    """
    raw = (
        0.0073 * kast
        + 0.3591 * kpr
        - 0.5329 * dpr
        + 0.2372 * impact
        + 0.0032 * adr
        + 0.1587
    )
    return round(max(0.0, min(3.0, raw)), 2)


def rating_1_0(kpr: float, dpr: float) -> float:
    """Classic Rating 1.0-style: kill/death contribution vs league averages."""
    # Historical averages ≈ 0.679 KPR / 0.679 DPR
    if kpr == 0 and dpr == 0:
        return 0.0
    return round(max(0.0, (kpr / 0.679) * 0.5 + (0.679 / max(dpr, 0.01)) * 0.5) * 0.5 + 0.5, 2)


def finalize_player(agg: PlayerAgg) -> dict:
    rounds = max(agg.rounds, 1)
    kpr = agg.kills / rounds
    dpr = agg.deaths / rounds
    fkpr = agg.opening_kills / rounds
    multi_kills = agg.multi_2k + agg.multi_3k + agg.multi_4k + agg.multi_5k
    multi_pr = multi_kills / rounds
    kast = (agg.kast_rounds / rounds) * 100.0
    adr = estimate_adr(agg.kills, agg.headshots, rounds)
    impact = impact_rating(fkpr, multi_pr)
    r2 = lab_rating(kpr=kpr, dpr=dpr, impact=impact, kast=kast, adr=adr)
    r1 = rating_1_0(kpr, dpr)
    hs_pct = round(agg.headshots / agg.kills * 100) if agg.kills else 0
    kd = round(agg.kills / agg.deaths, 2) if agg.deaths else float(agg.kills)

    maps_breakdown = []
    for map_name in sorted(set(agg.map_rounds) | set(agg.map_kills)):
        mr = max(agg.map_rounds.get(map_name, 0), 1)
        mk = agg.map_kills.get(map_name, 0)
        md = agg.map_deaths.get(map_name, 0)
        maps_breakdown.append(
            {
                "map_name": map_name,
                "rounds": agg.map_rounds.get(map_name, 0),
                "kills": mk,
                "deaths": md,
                "kd": round(mk / md, 2) if md else float(mk),
                "kpr": round(mk / mr, 2),
            }
        )

    weapons = sorted(
        [{"weapon": w, "kills": k} for w, k in agg.weapon_kills.items()],
        key=lambda x: -x["kills"],
    )[:12]

    return {
        "name": agg.name,
        "kills": agg.kills,
        "deaths": agg.deaths,
        "assists": 0,  # not in parse pipeline yet
        "headshots": agg.headshots,
        "headshot_pct": hs_pct,
        "kd": kd,
        "kpr": round(kpr, 2),
        "dpr": round(dpr, 2),
        "adr": round(adr, 1),
        "kast": round(kast, 1),
        "impact": round(impact, 2),
        "rating": r2,
        "rating_1": r1,
        "opening_kills": agg.opening_kills,
        "opening_deaths": agg.opening_deaths,
        "fk_diff": agg.opening_kills - agg.opening_deaths,
        "multi_2k": agg.multi_2k,
        "multi_3k": agg.multi_3k,
        "multi_4k": agg.multi_4k,
        "multi_5k": agg.multi_5k,
        "rounds": agg.rounds,
        "matches_played": agg.matches,
        "weapons": weapons,
        "maps": maps_breakdown,
        "form": agg.match_form,
    }
