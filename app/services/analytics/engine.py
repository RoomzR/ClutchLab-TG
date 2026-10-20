"""Match statistics engine.

Pure computation over a loaded MatchData (no I/O), so it can be unit-tested with
synthetic rounds. Produces:
  * per player per side ("CT", "T", "all") summable counters + extras (weapon,
    hitgroup, zone breakdowns) — derived metrics come from metrics_registry.derive
  * per round summaries (what the UI shows in the round list / hub)
  * per team counters + economy series
  * RoundFacts consumed by the mistake detectors
"""

from __future__ import annotations

import bisect
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from services.analytics.metrics_registry import METRIC_VERSION, derive

TRADE_WINDOW_S = 5.0
UNFINISHED_DMG = 50
ISOLATED_DIST = 1000.0
LURK_DIST = 1200.0
EYE_HEIGHT = 64.0

RIFLES = {"ak47", "m4a1", "m4a1_silencer", "m4a4", "aug", "sg556", "famas", "galilar", "galil"}
SNIPERS = {"awp", "ssg08", "g3sg1", "scar20"}
PISTOLS = {"glock", "hkp2000", "usp_silencer", "p250", "fiveseven", "tec9", "cz75a", "elite", "deagle", "revolver"}
SMGS = {"mp9", "mac10", "mp7", "mp5sd", "ump45", "p90", "bizon"}
HEAVY = {"nova", "xm1014", "mag7", "sawedoff", "m249", "negev"}
GUNS = RIFLES | SNIPERS | PISTOLS | SMGS | HEAVY
COUNTER_STRAFE_WEAPONS = RIFLES | SNIPERS | PISTOLS
UTILITY_DAMAGE_WEAPONS = {"hegrenade", "inferno", "molotov", "incgrenade"}

MAX_SPEED = {
    "ak47": 215, "m4a1": 225, "m4a1_silencer": 225, "m4a4": 225, "aug": 220, "sg556": 210, "famas": 220,
    "galilar": 215, "galil": 215, "awp": 200, "ssg08": 230, "g3sg1": 215, "scar20": 215, "deagle": 230,
    "revolver": 220, "glock": 240, "hkp2000": 240, "usp_silencer": 240, "p250": 240, "fiveseven": 240,
    "tec9": 240, "cz75a": 240, "elite": 240,
}
ACCURATE_SPEED_RATIO = 0.34

GRENADE_KEYS = {"flash": "flashes_thrown", "smoke": "smokes_thrown", "he": "he_thrown",
                "molotov": "molotovs_thrown", "incendiary": "molotovs_thrown", "decoy": "decoys_thrown"}


def norm_weapon(w: Any) -> str:
    s = str(w or "").lower().replace("weapon_", "").replace("item_", "").strip()
    if s.endswith("_off"):
        s = s[:-4]
    return s


def weapon_class(w: str) -> str:
    if w in RIFLES:
        return "rifle"
    if w in SNIPERS:
        return "sniper"
    if w in PISTOLS:
        return "pistol"
    if w in SMGS:
        return "smg"
    if w in HEAVY:
        return "heavy"
    if w in UTILITY_DAMAGE_WEAPONS:
        return "utility"
    if "knife" in w or w == "bayonet":
        return "knife"
    return "other"


def other_side(side: str) -> str:
    return "CT" if side == "T" else "T"


@dataclass
class MatchData:
    match_id: str
    map_name: str
    tick_rate: float
    team_t_name: str
    team_ct_name: str
    score_t: int
    score_ct: int
    players: list[dict]
    rounds: list[dict]
    kills: list[dict]
    damages: list[dict] = field(default_factory=list)
    shots: list[dict] = field(default_factory=list)
    blinds: list[dict] = field(default_factory=list)
    grenades: list[dict] = field(default_factory=list)
    economy: list[dict] = field(default_factory=list)
    bombs: list[dict] = field(default_factory=list)
    zones: list[dict] = field(default_factory=list)
    death_inventory: list[dict] = field(default_factory=list)
    early_places: list[dict] = field(default_factory=list)
    positions: list[tuple] = field(default_factory=list)  # (tick, name, side, x, y, z, round, yaw, pitch, health)
    pauses: list[dict] = field(default_factory=list)


@dataclass
class RoundFacts:
    round_number: int
    freeze_tick: int
    end_tick: int
    winner_side: str
    win_type: str
    team_by_side: dict[str, str]
    roster: dict[str, list[str]]
    buy_type: dict[str, str]
    avg_equip: dict[str, float]
    first_contact_tick: int | None
    deaths: list[dict]
    opening: dict | None
    plant: dict | None
    defuse: dict | None
    alive_at_plant: dict[str, int] | None
    buy_errors: list[dict]
    unfinished: list[dict]
    moving_shots: dict[str, dict]
    team_flashes: list[dict]
    smokes: list[dict]
    clutch: dict[str, dict]
    survivors: dict[str, list[str]]


@dataclass
class EngineResult:
    metric_version: str
    player_counters: dict[tuple[str, str], dict[str, float]]
    player_extras: dict[tuple[str, str], dict[str, Any]]
    player_team: dict[str, str]
    player_steam: dict[str, str | None]
    round_summaries: list[dict]
    team_counters: dict[str, dict[str, Any]]
    round_facts: list[RoundFacts]
    winner_team: str | None

    def player_metrics(self, name: str, side: str = "all") -> dict[str, float | None]:
        return derive(self.player_counters.get((name, side), {}))


class _Positions:
    """Nearest-sample lookup over sampled positions."""

    def __init__(self, rows: list[tuple]):
        by_player: dict[str, list[tuple]] = defaultdict(list)
        for row in rows:
            by_player[row[1]].append(row)
        self.ticks: dict[str, list[int]] = {}
        self.rows: dict[str, list[tuple]] = {}
        for name, items in by_player.items():
            items.sort(key=lambda r: r[0])
            self.rows[name] = items
            self.ticks[name] = [r[0] for r in items]

    def at(self, name: str, tick: int, max_gap: int = 48) -> tuple | None:
        ticks = self.ticks.get(name)
        if not ticks:
            return None
        i = bisect.bisect_right(ticks, tick) - 1
        if i < 0:
            return None
        row = self.rows[name][i]
        if tick - row[0] > max_gap:
            return None
        return row

    def between(self, name: str, start: int, end: int) -> list[tuple]:
        ticks = self.ticks.get(name)
        if not ticks:
            return []
        lo = bisect.bisect_left(ticks, start)
        hi = bisect.bisect_right(ticks, end)
        return self.rows[name][lo:hi]


def _view_angle_to(src: tuple, dst: tuple) -> float | None:
    """Angle (deg) between src view direction and the vector src→dst (eye level)."""
    yaw, pitch = src[7], src[8]
    if yaw is None or pitch is None:
        return None
    dx = dst[3] - src[3]
    dy = dst[4] - src[4]
    dz = (dst[5] or 0) - (src[5] or 0)
    dist = math.sqrt(dx * dx + dy * dy + dz * dz)
    if dist < 1:
        return None
    yr = math.radians(float(yaw))
    pr = math.radians(float(pitch))
    vx, vy, vz = math.cos(pr) * math.cos(yr), math.cos(pr) * math.sin(yr), -math.sin(pr)
    dot = (vx * dx + vy * dy + vz * dz) / dist
    dot = max(-1.0, min(1.0, dot))
    return math.degrees(math.acos(dot))


def _dist2d(a: tuple, b: tuple) -> float:
    return math.hypot(a[3] - b[3], a[4] - b[4])


def _buy_type(avg_equip: float, money_start_avg: float, is_pistol: bool) -> str:
    if is_pistol:
        return "pistol"
    if avg_equip >= 3800:
        return "full"
    if avg_equip >= 1500:
        return "force"
    return "eco"


def compute(md: MatchData) -> EngineResult:
    rate = float(md.tick_rate or 64.0)
    trade_window = int(TRADE_WINDOW_S * rate)
    rounds = sorted(md.rounds, key=lambda r: r["round_number"])

    player_team = {
        p["name"]: (md.team_t_name if p["team"] == "T" else md.team_ct_name) for p in md.players
    }
    player_steam = {p["name"]: p.get("steam_id") for p in md.players}
    known_players = set(player_team)

    counters: dict[tuple[str, str], Counter] = defaultdict(Counter)
    extras: dict[tuple[str, str], dict[str, Any]] = defaultdict(lambda: defaultdict(Counter))

    def add(name: str, side: str | None, key: str, value: float = 1.0) -> None:
        if not name or name not in known_players:
            return
        counters[(name, "all")][key] += value
        if side in ("CT", "T"):
            counters[(name, side)][key] += value

    def add_extra(name: str, side: str | None, bucket: str, key: str, value: float = 1.0) -> None:
        if not name or name not in known_players or key is None:
            return
        extras[(name, "all")][bucket][key] += value
        if side in ("CT", "T"):
            extras[(name, side)][bucket][key] += value

    def list_extra(name: str, side: str | None, bucket: str, item: dict) -> None:
        if not name or name not in known_players:
            return
        for s in ("all", side):
            if s not in ("all", "CT", "T"):
                continue
            store = extras[(name, s)]
            if not isinstance(store.get(bucket), list):
                store[bucket] = []
            store[bucket].append(item)

    by_round: dict[str, dict[int, list[dict]]] = {}
    for key, rows in (
        ("kills", md.kills), ("damages", md.damages), ("shots", md.shots), ("blinds", md.blinds),
        ("grenades", md.grenades), ("bombs", md.bombs), ("death_inventory", md.death_inventory),
    ):
        grouped: dict[int, list[dict]] = defaultdict(list)
        for row in rows:
            grouped[int(row.get("round_number") or 0)].append(row)
        for items in grouped.values():
            items.sort(key=lambda r: r.get("tick") or 0)
        by_round[key] = grouped

    economy_rp: dict[tuple[int, str], dict] = {(int(e["round_number"]), e["player_name"]): e for e in md.economy}
    positions = _Positions(md.positions)

    # side of each player in each round: economy snapshot → positions → kills
    side_rp: dict[tuple[int, str], str] = {}
    for (rn, name), e in economy_rp.items():
        if e.get("side") in ("CT", "T"):
            side_rp[(rn, name)] = e["side"]
    for r in rounds:
        rn = r["round_number"]
        start = r.get("freeze_end_tick") or r.get("start_tick") or 0
        for name in known_players:
            if (rn, name) in side_rp:
                continue
            row = positions.at(name, int(start) + int(rate * 2), max_gap=int(rate * 30))
            if row and row[2] in ("CT", "T"):
                side_rp[(rn, name)] = row[2]
        for k in by_round["kills"].get(rn, []):
            if k.get("killer") in known_players and k.get("killer_side") and (rn, k["killer"]) not in side_rp:
                side_rp[(rn, k["killer"])] = k["killer_side"]
            if k.get("victim") in known_players and k.get("victim_side") and (rn, k["victim"]) not in side_rp:
                side_rp[(rn, k["victim"])] = k["victim_side"]

    first_round = rounds[0]["round_number"] if rounds else 1
    first_sides = {name: side_rp.get((first_round, name)) for name in known_players}

    score: Counter = Counter()
    round_summaries: list[dict] = []
    round_facts: list[RoundFacts] = []
    team_counters: dict[str, Counter] = defaultdict(Counter)
    team_series: dict[str, list[dict]] = defaultdict(list)
    team_sites: dict[str, Counter] = defaultdict(Counter)
    team_reasons: dict[str, Counter] = defaultdict(Counter)
    pistol_seen_flip = False

    for r in rounds:
        rn = int(r["round_number"])
        freeze = int(r.get("freeze_end_tick") or r.get("start_tick") or 0)
        end = int(r.get("end_tick") or freeze)
        winner_side = r.get("winner") or "CT"

        roster: dict[str, list[str]] = {"CT": [], "T": []}
        for name in sorted(known_players):
            s = side_rp.get((rn, name))
            if s in roster:
                roster[s].append(name)

        def team_for(side: str) -> str:
            explicit = r.get("t_team") if side == "T" else r.get("ct_team")
            if explicit:
                return explicit
            votes = Counter(player_team.get(n) for n in roster[side])
            return votes.most_common(1)[0][0] if votes else ("T" if side == "T" else "CT")

        team_by_side = {"T": team_for("T"), "CT": team_for("CT")}
        winner_team = team_by_side.get(winner_side)
        if winner_team:
            score[winner_team] += 1

        # ── economy & buy type ──
        flipped = any(
            first_sides.get(n) and side_rp.get((rn, n)) and side_rp[(rn, n)] != first_sides[n]
            for n in known_players
        )
        avg_equip: dict[str, float] = {}
        avg_money: dict[str, float] = {}
        for side in ("CT", "T"):
            eq = [economy_rp[(rn, n)]["equip_value"] or 0 for n in roster[side] if (rn, n) in economy_rp]
            mo = [economy_rp[(rn, n)]["money_start"] or 0 for n in roster[side] if (rn, n) in economy_rp]
            avg_equip[side] = sum(eq) / len(eq) if eq else 0.0
            avg_money[side] = sum(mo) / len(mo) if mo else 0.0
        is_pistol = False
        if rn == first_round:
            is_pistol = True
        elif flipped and not pistol_seen_flip:
            pistol_seen_flip = True
            is_pistol = max(avg_money.values() or [0]) <= 1000
        buy_type = {s: _buy_type(avg_equip[s], avg_money[s], is_pistol) for s in ("CT", "T")}

        buy_errors: list[dict] = []
        for side in ("CT", "T"):
            for n in roster[side]:
                e = economy_rp.get((rn, n))
                if not e:
                    continue
                side_label = side
                add(n, side_label, "equip_value_sum", e["equip_value"] or 0)
                add(n, side_label, "money_spent", e["cash_spent"] or 0)
                add(n, side_label, f"rounds_{buy_type[side]}")
                if winner_side == side:
                    add(n, side_label, f"wins_{buy_type[side]}")
                if is_pistol:
                    continue
                mates = [economy_rp[(rn, m)]["equip_value"] or 0 for m in roster[side] if m != n and (rn, m) in economy_rp]
                if not mates:
                    continue
                mates_avg = sum(mates) / len(mates)
                if (e["equip_value"] or 0) >= 3500 and (e["cash_spent"] or 0) >= 2000 and mates_avg < 2000:
                    buy_errors.append({"player": n, "side": side, "kind": "solo_full_buy",
                                       "equip": e["equip_value"], "team_avg": round(mates_avg)})
                elif (e["cash_spent"] or 0) < 500 and (e["money_start"] or 0) >= 5000 and mates_avg >= 3800:
                    buy_errors.append({"player": n, "side": side, "kind": "solo_save",
                                       "money": e["money_start"], "team_avg": round(mates_avg)})
        for be in buy_errors:
            add(be["player"], be["side"], "buy_errors")

        for side in ("CT", "T"):
            for n in roster[side]:
                add(n, side, "rounds")
                if winner_side == side:
                    add(n, side, "rounds_won")

        # ── damage ──
        dmg_r = by_round["damages"].get(rn, [])
        pair_dmg: dict[tuple[str, str], int] = defaultdict(int)
        first_hit: dict[tuple[str, str], int] = {}
        first_contact_tick: int | None = None
        round_dmg: Counter = Counter()
        hit_ticks: dict[str, list[int]] = defaultdict(list)
        for d in dmg_r:
            a, v = d.get("attacker"), d.get("victim")
            a_side = d.get("attacker_side") or side_rp.get((rn, a))
            v_side = d.get("victim_side") or side_rp.get((rn, v))
            dmg = int(d.get("dmg_health") or 0)
            w = norm_weapon(d.get("weapon"))
            wc = weapon_class(w)
            if a in known_players and wc not in ("utility", "other", "knife") and w in GUNS:
                hit_ticks[a].append(int(d["tick"]))
                add(a, a_side, "hits")
                if d.get("hitgroup") == "head":
                    add(a, a_side, "head_hits")
                add_extra(a, a_side, "hitgroups", d.get("hitgroup") or "generic")
            if a not in known_players or a == v:
                continue
            if a_side and v_side and a_side == v_side:
                add(a, a_side, "team_damage", dmg)
                continue
            add(a, a_side, "damage", dmg)
            add(v, v_side, "damage_taken", dmg)
            round_dmg[a] += dmg
            add_extra(a, a_side, "damage_by_weapon", w, dmg)
            if wc == "utility":
                add(a, a_side, "utility_damage", dmg)
                add(a, a_side, "he_damage" if w == "hegrenade" else "fire_damage", dmg)
            pair_dmg[(a, v)] += dmg
            first_hit.setdefault((a, v), int(d["tick"]))
            if first_contact_tick is None and int(d["tick"]) >= freeze:
                first_contact_tick = int(d["tick"])

        # reaction proxy & crosshair placement at first hit of each pair
        for (a, v), t0 in first_hit.items():
            back = first_hit.get((v, a))
            if back is not None and t0 < back <= t0 + int(rate * 1.5):
                add(v, side_rp.get((rn, v)), "reaction_sum_ms", (back - t0) / rate * 1000.0)
                add(v, side_rp.get((rn, v)), "reaction_n")
            pa = positions.at(a, t0 - int(rate * 0.25))
            pv = positions.at(v, t0 - int(rate * 0.25))
            if pa and pv and (pa[9] or 0) > 0 and (pv[9] or 0) > 0:
                ang = _view_angle_to(pa, pv)
                if ang is not None:
                    add(a, side_rp.get((rn, a)), "xhair_sum_deg", ang)
                    add(a, side_rp.get((rn, a)), "xhair_n")
                    if ang <= 5.0:
                        add(a, side_rp.get((rn, a)), "xhair_good")

        # ── kills, trades, openings, clutches, KAST ──
        kills_r = by_round["kills"].get(rn, [])
        alive = {s: set(roster[s]) for s in ("CT", "T")}
        dead: set[str] = set()
        deaths: list[dict] = []
        kast: dict[str, bool] = defaultdict(bool)
        round_kills: Counter = Counter()
        round_assists: Counter = Counter()
        clutch: dict[str, dict] = {}
        opening: dict | None = None
        traded_victims: set[str] = set()
        kills_out: list[dict] = []

        for k in kills_r:
            tick = int(k["tick"])
            a, v = k.get("killer"), k.get("victim")
            v_side = k.get("victim_side") or side_rp.get((rn, v))
            a_side = k.get("killer_side") or side_rp.get((rn, a))
            weapon = norm_weapon(k.get("weapon"))
            enemy_kill = a in known_players and a != v and a_side and v_side and a_side != v_side

            if v in known_players:
                add(v, v_side, "deaths")
                add_extra(v, v_side, "death_places", k.get("victim_place") or "?")
                dead.add(v)
                if v_side in alive:
                    alive[v_side].discard(v)

            if a in known_players and a != v and a_side and v_side and a_side == v_side:
                add(a, a_side, "teamkills")

            trade_of = None
            if enemy_kill:
                add(a, a_side, "kills")
                round_kills[a] += 1
                kast[a] = True
                add_extra(a, a_side, "kills_by_weapon", weapon)
                add_extra(a, a_side, "kill_places", k.get("killer_place") or "?")
                add_extra(a, a_side, "victims", v)
                if k.get("headshot"):
                    add(a, a_side, "headshot_kills")
                if (k.get("penetrated") or 0) > 0:
                    add(a, a_side, "wallbang_kills")
                if k.get("thrusmoke"):
                    add(a, a_side, "smoke_kills")
                if k.get("attacker_blind"):
                    add(a, a_side, "blind_kills")
                if k.get("noscope"):
                    add(a, a_side, "noscope_kills")
                if k.get("attacker_in_air"):
                    add(a, a_side, "air_kills")
                if weapon == "awp":
                    add(a, a_side, "awp_kills")
                if k.get("distance") is not None:
                    add(a, a_side, "kill_distance_sum", float(k["distance"]))
                    add(a, a_side, "kill_distance_n")

                # trade: a kills v, and v killed a teammate of a within the window
                for prev in reversed(deaths):
                    if tick - prev["tick"] > trade_window:
                        break
                    if prev["killer"] == v and prev["victim_side"] == a_side and not prev["traded"]:
                        prev["traded"] = True
                        prev["traded_by"] = a
                        prev["trade_time"] = (tick - prev["tick"]) / rate
                        traded_victims.add(prev["victim"])
                        add(prev["victim"], a_side, "traded_deaths")
                        kast[prev["victim"]] = True
                        add(a, a_side, "trade_kills")
                        add(a, a_side, "trade_time_sum", prev["trade_time"])
                        add(a, a_side, "trade_time_n")
                        trade_of = prev["victim"]
                        break

                if opening is None:
                    opening = {"tick": tick, "killer": a, "victim": v, "killer_side": a_side, "victim_side": v_side,
                               "time": round((tick - freeze) / rate, 1), "weapon": weapon}
                    add(a, a_side, "opening_kills")
                    add(a, a_side, "opening_attempts")
                    add(v, v_side, "opening_deaths")
                    add(v, v_side, "opening_attempts")
                    if a_side == winner_side:
                        add(a, a_side, "opening_kills_won")
                    if a_side == "T":
                        add(a, a_side, "entry_attempts")
                        add(a, a_side, "entry_kills")
                    if v_side == "T":
                        add(v, v_side, "entry_attempts")

            assister = k.get("assister")
            if enemy_kill and assister in known_players and assister != a:
                as_side = side_rp.get((rn, assister))
                add(assister, as_side, "assists")
                round_assists[assister] += 1
                kast[assister] = True
                if k.get("assisted_flash"):
                    add(assister, as_side, "flash_assists")

            # spacing to nearest alive teammate at death + aim error at death
            spacing = None
            death_aim = None
            alive_mates = len(alive[v_side]) if v_side in alive else 0
            if v in known_players and v_side in alive:
                pv = positions.at(v, tick)
                if pv:
                    dists = []
                    for mate in alive[v_side]:
                        pm = positions.at(mate, tick)
                        if pm and (pm[9] or 0) > 0:
                            dists.append(_dist2d(pv, pm))
                    if dists:
                        spacing = min(dists)
                        add(v, v_side, "death_spacing_sum", spacing)
                        add(v, v_side, "death_spacing_n")
                        if spacing > ISOLATED_DIST:
                            add(v, v_side, "isolated_deaths")
                if enemy_kill and weapon in GUNS:
                    pv0 = positions.at(v, tick - int(rate * 0.25))
                    pa0 = positions.at(a, tick - int(rate * 0.25))
                    if pv0 and pa0:
                        ang = _view_angle_to(pv0, pa0)
                        if ang is not None:
                            death_aim = round(ang, 1)
                            add(v, v_side, "death_aim_sum", ang)
                            add(v, v_side, "death_aim_n")

            death = {
                "tick": tick, "time": round((tick - freeze) / rate, 1), "killer": a, "victim": v,
                "killer_side": a_side, "victim_side": v_side, "weapon": weapon,
                "headshot": bool(k.get("headshot")), "traded": False, "traded_by": None, "trade_time": None,
                "spacing": round(spacing) if spacing is not None else None, "is_opening": opening is not None and opening["tick"] == tick and opening["victim"] == v,
                "killer_place": k.get("killer_place"), "victim_place": k.get("victim_place"),
                "enemy_kill": bool(enemy_kill), "trade_of": trade_of, "post_round": tick > end,
                "aim_error": death_aim,
                "alive_teammates": alive_mates,
            }
            deaths.append(death)

            for s in ("CT", "T"):
                if s not in clutch and len(alive[s]) == 1 and len(alive[other_side(s)]) >= 1 and tick <= end:
                    lone = next(iter(alive[s]))
                    clutch[s] = {"player": lone, "vs": len(alive[other_side(s)]), "tick": tick, "side": s}

        for d in deaths:
            if d["victim"] in known_players and not d["traded"]:
                add(d["victim"], d["victim_side"], "untraded_deaths")
        kills_out = [
            {"tick": d["tick"], "time": d["time"], "killer": d["killer"], "victim": d["victim"],
             "killer_side": d["killer_side"], "victim_side": d["victim_side"], "weapon": d["weapon"],
             "headshot": d["headshot"], "traded": d["traded"], "trade_of": d["trade_of"], "opening": d["is_opening"],
             "victim_place": d["victim_place"], "killer_place": d["killer_place"]}
            for d in deaths
        ]

        survivors = {s: sorted(alive[s]) for s in ("CT", "T")}
        for s in ("CT", "T"):
            for n in alive[s]:
                add(n, s, "survived_rounds")
                kast[n] = True
                if winner_side != s:
                    add(n, s, "saves")
            if len(alive[s]) == 1:
                add(next(iter(alive[s])), s, "last_alive_rounds")
            elif not alive[s]:
                last = [d for d in deaths if d["victim_side"] == s and d["victim"] in known_players]
                if last:
                    add(last[-1]["victim"], s, "last_alive_rounds")

        for s, cl in clutch.items():
            add(cl["player"], s, "clutch_attempts")
            add(cl["player"], s, f"clutch_1v{min(cl['vs'], 5)}_att")
            cl["won"] = winner_side == s
            if cl["won"]:
                add(cl["player"], s, "clutch_wins")
                add(cl["player"], s, f"clutch_1v{min(cl['vs'], 5)}_won")
            list_extra(cl["player"], s, "clutches", {"round": rn, "vs": cl["vs"], "won": cl["won"]})

        for n, cnt in round_kills.items():
            if 2 <= cnt <= 5:
                add(n, side_rp.get((rn, n)), f"multi_{cnt}k")
        for side in ("CT", "T"):
            for n in roster[side]:
                if kast[n]:
                    add(n, side, "kast_rounds")
                if round_kills[n] > 0:
                    add(n, side, "rounds_with_kill")

        # unfinished enemies: ≥ 50 damage and the enemy survived the round
        unfinished: list[dict] = []
        for (a, v), dmg in pair_dmg.items():
            if dmg >= UNFINISHED_DMG and v not in dead and v in known_players:
                add(a, side_rp.get((rn, a)), "unfinished_enemies")
                unfinished.append({"player": a, "victim": v, "damage": dmg})

        # ── shots: counter-strafe, first-shot & spray accuracy ──
        moving_shots: dict[str, dict] = {}
        shots_by_player: dict[str, list[dict]] = defaultdict(list)
        for s_ in by_round["shots"].get(rn, []):
            shots_by_player[s_["player_name"]].append(s_)
        for n, items in shots_by_player.items():
            if n not in known_players:
                continue
            side = side_rp.get((rn, n)) or items[0].get("side")
            hits_sorted = sorted(hit_ticks.get(n, []))
            prev_tick = None
            moving = {"count": 0, "eligible": 0, "ticks": []}
            for s_ in items:
                w = norm_weapon(s_.get("weapon"))
                if w not in GUNS:
                    continue
                t = int(s_["tick"])
                add(n, side, "shots")
                gap = None if prev_tick is None else (t - prev_tick) / rate
                prev_tick = t
                j = bisect.bisect_left(hits_sorted, t)
                hit = j < len(hits_sorted) and hits_sorted[j] <= t + 2
                if gap is None or gap >= 0.5:
                    add(n, side, "first_shots")
                    if hit:
                        add(n, side, "first_shot_hits")
                    if w in COUNTER_STRAFE_WEAPONS:
                        limit = MAX_SPEED.get(w, 240) * ACCURATE_SPEED_RATIO
                        speed = float(s_.get("speed") or 0)
                        add(n, side, "cs_shots")
                        moving["eligible"] += 1
                        if speed <= limit:
                            add(n, side, "cs_good")
                        else:
                            moving["count"] += 1
                            moving["ticks"].append(t)
                elif gap < 0.2:
                    add(n, side, "spray_shots")
                    if hit:
                        add(n, side, "spray_hits")
            if moving["eligible"]:
                moving_shots[n] = moving

        # ── blinds ──
        team_flashes: list[dict] = []
        kills_by_victim = {d["victim"]: d for d in deaths if d["enemy_kill"]}
        for b in by_round["blinds"].get(rn, []):
            f, v = b.get("flasher"), b.get("victim")
            dur = float(b.get("duration") or 0)
            fs = b.get("flasher_side") or side_rp.get((rn, f))
            vs = b.get("victim_side") or side_rp.get((rn, v))
            if not f or f not in known_players:
                continue
            if f == v:
                add(f, fs, "self_flashed")
                continue
            if fs and vs and fs == vs:
                if dur > 0.5:
                    add(f, fs, "team_flashed")
                    team_flashes.append({"flasher": f, "victim": v, "tick": int(b["tick"]), "duration": dur})
                continue
            add(f, fs, "enemies_flashed")
            add(f, fs, "enemy_blind_time", dur)
            add(v, vs, "times_blinded")
            add(v, vs, "blinded_time", dur)
            kd = kills_by_victim.get(v)
            if kd and kd["killer_side"] == fs and 0 <= kd["tick"] - int(b["tick"]) <= int(rate * min(3.0, dur + 0.5)):
                add(f, fs, "flash_to_kill")

        # ── grenades ──
        smokes: list[dict] = []
        team_util_ticks: dict[str, list[int]] = {"CT": [], "T": []}
        for g in by_round["grenades"].get(rn, []):
            n = g.get("player_name")
            gtype = g.get("grenade_type")
            side = side_rp.get((rn, n)) or g.get("team")
            key = GRENADE_KEYS.get(gtype)
            if key:
                add(n, side, key)
            if gtype != "decoy":
                add(n, side, "utility_thrown")
                if side in team_util_ticks:
                    team_util_ticks[side].append(int(g["tick"]))
                if first_contact_tick is None or int(g["tick"]) <= first_contact_tick:
                    add(n, side, "utility_before_contact")
            if gtype == "smoke":
                smokes.append({"player": n, "side": side, "tick": int(g["tick"]), "x": g.get("to_x"), "y": g.get("to_y")})

        for di in by_round["death_inventory"].get(rn, []):
            v = di.get("victim")
            if v in known_players and (di.get("value") or 0) > 0:
                add(v, side_rp.get((rn, v)), "unused_util_value", float(di["value"]))
                add(v, side_rp.get((rn, v)), "unused_util_deaths")
                for d in deaths:
                    if d["victim"] == v and d["tick"] == di.get("tick"):
                        d["unused_util"] = {"items": di.get("items") or [], "value": di["value"]}

        for d in deaths:
            side = d["victim_side"]
            if side in team_util_ticks:
                d["team_util_before_4s"] = sum(1 for t in team_util_ticks[side] if d["tick"] - int(rate * 4) <= t <= d["tick"])

        # ── bomb ──
        plant = defuse = None
        alive_at_plant = None
        for b in by_round["bombs"].get(rn, []):
            et = b.get("event_type")
            n = b.get("player_name")
            if et == "bomb_planted" and plant is None:
                plant = {"tick": int(b["tick"]), "player": n, "site": b.get("site"), "time": round((int(b["tick"]) - freeze) / rate, 1),
                         "x": b.get("x"), "y": b.get("y")}
                add(n, "T", "plants")
                add(n, "T", "plant_time_sum", (int(b["tick"]) - freeze) / rate)
                dead_before = {d["victim"] for d in deaths if d["tick"] <= int(b["tick"])}
                alive_at_plant = {s: sum(1 for m in roster[s] if m not in dead_before) for s in ("CT", "T")}
            elif et == "bomb_defused" and defuse is None:
                defuse = {"tick": int(b["tick"]), "player": n, "time": round((int(b["tick"]) - freeze) / rate, 1)}
                add(n, "CT", "defuses")
                e = economy_rp.get((rn, n))
                if e is not None and not e.get("has_defuser"):
                    add(n, "CT", "defuses_no_kit")
                    defuse["no_kit"] = True

        # ── positioning from sampled positions ──
        for side in ("CT", "T"):
            for n in roster[side]:
                samples = positions.between(n, freeze, end)
                prev = None
                for row in samples:
                    if (row[9] or 0) <= 0:
                        prev = None
                        continue
                    if prev is not None:
                        step = _dist2d(prev, row)
                        if step < 300:
                            add(n, side, "distance_traveled", step)
                    prev = row
                    if row[0] % int(rate) < 8:
                        dists = []
                        for mate in roster[side]:
                            if mate == n:
                                continue
                            pm = positions.at(mate, row[0], max_gap=16)
                            if pm and (pm[9] or 0) > 0:
                                dists.append(_dist2d(row, pm))
                        if dists:
                            nearest = min(dists)
                            add(n, side, "teammate_dist_sum", nearest)
                            add(n, side, "alive_samples")
                            if nearest > LURK_DIST:
                                add(n, side, "lurk_samples")

        # ── round MVP (winning team, by contribution score) ──
        contribution: dict[str, float] = {}
        for n in roster.get(winner_side, []):
            contribution[n] = round_kills[n] * 2 + round_assists[n] * 0.5 + round_dmg[n] / 40.0
        if plant and plant["player"] in contribution:
            contribution[plant["player"]] += 1
        if defuse and defuse["player"] in contribution:
            contribution[defuse["player"]] += 1.5
        cl = clutch.get(winner_side)
        if cl and cl.get("won") and cl["player"] in contribution:
            contribution[cl["player"]] += 2 + cl["vs"]
        mvp = max(contribution, key=contribution.get) if contribution and max(contribution.values()) > 0 else None
        if mvp:
            add(mvp, winner_side, "mvp_rounds")

        # ── team counters ──
        for side in ("CT", "T"):
            tname = team_by_side[side]
            won = winner_side == side
            tc = team_counters[tname]
            tc["rounds"] += 1
            tc[f"{side.lower()}_rounds"] += 1
            if won:
                tc["wins"] += 1
                tc[f"{side.lower()}_wins"] += 1
            bt = buy_type[side]
            tc[f"{bt}_rounds"] += 1
            if won:
                tc[f"{bt}_wins"] += 1
            if buy_type[other_side(side)] == "eco" and bt in ("full", "force"):
                tc["anti_eco_rounds"] += 1
                if won:
                    tc["anti_eco_wins"] += 1
            if opening:
                if opening["killer_side"] == side:
                    tc["opening_rounds"] += 1
                    if won:
                        tc["opening_wins"] += 1
                else:
                    tc["opening_loss_rounds"] += 1
                    if won:
                        tc["opening_loss_wins"] += 1
            if plant:
                if side == "T":
                    tc["plants"] += 1
                    tc["plant_time_sum"] += plant["time"]
                    if won:
                        tc["post_plant_wins"] += 1
                    team_sites[tname][str(plant.get("site") or "?")] += 1
                else:
                    tc["retake_rounds"] += 1
                    if won:
                        tc["retake_wins"] += 1
            if first_contact_tick is not None:
                tc["first_contact_sum"] += (first_contact_tick - freeze) / rate
                tc["first_contact_n"] += 1
            side_deaths = [d for d in deaths if d["victim_side"] == side and d["victim"] in known_players]
            tc["deaths"] += len(side_deaths)
            tc["traded_deaths"] += sum(1 for d in side_deaths if d["traded"])
            tc["utility_thrown"] += len(team_util_ticks[side])
            tc["utility_damage"] += sum(
                int(d.get("dmg_health") or 0) for d in dmg_r
                if d.get("attacker_side") == side and d.get("victim_side") != side
                and weapon_class(norm_weapon(d.get("weapon"))) == "utility"
            )
            tc["flash_assists"] += sum(
                1 for k in kills_r if k.get("assisted_flash") and (k.get("killer_side") == side)
            )
            if won:
                team_reasons[tname][r.get("win_type") or "?"] += 1
            team_series[tname].append({
                "round": rn, "side": side, "won": won, "buy_type": bt,
                "equip": round(avg_equip[side] * max(1, len(roster[side]))),
                "money": round(avg_money[side] * max(1, len(roster[side]))),
                "spent": sum((economy_rp.get((rn, n)) or {}).get("cash_spent") or 0 for n in roster[side]),
            })

        player_rows = {}
        for side in ("CT", "T"):
            for n in roster[side]:
                e = economy_rp.get((rn, n)) or {}
                player_rows[n] = {
                    "side": side, "kills": round_kills[n], "assists": round_assists[n], "damage": round_dmg[n],
                    "died": n in dead, "kast": bool(kast[n]), "equip": e.get("equip_value"),
                    "money": e.get("money_start"), "spent": e.get("cash_spent"),
                }

        round_summaries.append({
            "round": rn,
            "winner_side": winner_side,
            "winner_team": winner_team,
            "reason": r.get("win_type"),
            "duration": round((end - freeze) / rate, 1),
            "freeze_tick": freeze,
            "end_tick": end,
            "start_tick": r.get("start_tick"),
            "teams": team_by_side,
            "score": dict(score),
            "buy": {s: {"type": buy_type[s], "avg_equip": round(avg_equip[s]), "avg_money": round(avg_money[s])} for s in ("CT", "T")},
            "opening": opening,
            "first_contact": round((first_contact_tick - freeze) / rate, 1) if first_contact_tick else None,
            "kills": kills_out,
            "plant": plant,
            "defuse": defuse,
            "clutch": {s: v for s, v in clutch.items()},
            "survivors": survivors,
            "mvp": mvp,
            "players": player_rows,
        })
        round_facts.append(RoundFacts(
            round_number=rn, freeze_tick=freeze, end_tick=end, winner_side=winner_side,
            win_type=r.get("win_type") or "", team_by_side=team_by_side, roster=roster, buy_type=buy_type,
            avg_equip=avg_equip, first_contact_tick=first_contact_tick, deaths=deaths, opening=opening,
            plant=plant, defuse=defuse, alive_at_plant=alive_at_plant, buy_errors=buy_errors,
            unfinished=unfinished, moving_shots=moving_shots, team_flashes=team_flashes, smokes=smokes,
            clutch=clutch, survivors=survivors,
        ))

    # ── zones & early places ──
    for z in md.zones:
        n, side = z.get("player_name"), z.get("side")
        add_extra(n, side, "zones", z.get("place") or "?", float(z.get("seconds") or 0))
    early: dict[tuple[str, str], Counter] = defaultdict(Counter)
    for ep in md.early_places:
        if ep.get("player_name") in known_players and ep.get("side") in ("CT", "T"):
            early[(ep["player_name"], ep["side"])][ep.get("place") or "?"] += 1
    for (n, side), cnt in early.items():
        total = sum(cnt.values())
        top_place, top_n = cnt.most_common(1)[0]
        counters[(n, side)]["early_place_max"] += top_n
        counters[(n, side)]["early_place_rounds"] += total
        counters[(n, "all")]["early_place_max"] += top_n
        counters[(n, "all")]["early_place_rounds"] += total
        for place, k in cnt.items():
            extras[(n, side)]["early_places"][place] += k
            extras[(n, "all")]["early_places"][place] += k

    winner_team = None
    if score:
        top = score.most_common(2)
        if len(top) == 1 or top[0][1] > top[1][1]:
            winner_team = top[0][0]

    team_out: dict[str, dict[str, Any]] = {}
    for tname, tc in team_counters.items():
        team_out[tname] = {
            "counters": dict(tc),
            "metrics": derive_team(tc),
            "series": team_series[tname],
            "sites": dict(team_sites[tname]),
            "win_reasons": dict(team_reasons[tname]),
            "score": score.get(tname, 0),
        }

    def _plain(d: dict[str, Any]) -> dict[str, Any]:
        out: dict[str, Any] = {}
        for k, v in d.items():
            out[k] = dict(v) if isinstance(v, Counter) else v
        return out

    return EngineResult(
        metric_version=METRIC_VERSION,
        player_counters={k: dict(v) for k, v in counters.items()},
        player_extras={k: _plain(v) for k, v in extras.items()},
        player_team=player_team,
        player_steam=player_steam,
        round_summaries=round_summaries,
        team_counters=team_out,
        round_facts=round_facts,
        winner_team=winner_team,
    )


def _p(a: float, b: float) -> float | None:
    return round(100.0 * a / b, 1) if b else None


def derive_team(tc: dict[str, float]) -> dict[str, float | None]:
    g = lambda k: float(tc.get(k, 0) or 0)  # noqa: E731
    return {
        "round_win_pct": _p(g("wins"), g("rounds")),
        "ct_win_pct": _p(g("ct_wins"), g("ct_rounds")),
        "t_win_pct": _p(g("t_wins"), g("t_rounds")),
        "pistol_win_pct": _p(g("pistol_wins"), g("pistol_rounds")),
        "full_buy_win_pct": _p(g("full_wins"), g("full_rounds")),
        "force_win_pct": _p(g("force_wins"), g("force_rounds")),
        "eco_win_pct": _p(g("eco_wins"), g("eco_rounds")),
        "anti_eco_win_pct": _p(g("anti_eco_wins"), g("anti_eco_rounds")),
        "opening_win_pct": _p(g("opening_wins"), g("opening_rounds")),
        "opening_loss_win_pct": _p(g("opening_loss_wins"), g("opening_loss_rounds")),
        "post_plant_win_pct": _p(g("post_plant_wins"), g("plants")),
        "retake_win_pct": _p(g("retake_wins"), g("retake_rounds")),
        "avg_first_contact": round(g("first_contact_sum") / g("first_contact_n"), 1) if g("first_contact_n") else None,
        "avg_plant_time": round(g("plant_time_sum") / g("plants"), 1) if g("plants") else None,
        "traded_death_pct": _p(g("traded_deaths"), g("deaths")),
        "utility_per_round": round(g("utility_thrown") / g("rounds"), 2) if g("rounds") else None,
        "utility_damage_per_round": round(g("utility_damage") / g("rounds"), 1) if g("rounds") else None,
        "flash_assists": g("flash_assists"),
    }
