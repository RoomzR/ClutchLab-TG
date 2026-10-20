"""Engine + detectors on a hand-built 2v2 match with known answers."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.analysis.mistakes import detect  # noqa: E402
from services.analytics.engine import MatchData, compute  # noqa: E402
from services.analytics.metrics_registry import all_metrics, derive  # noqa: E402

RATE = 64


def _kill(tick, rn, killer, victim, ks, vs, weapon="ak47", hs=False, assister=None, flash=False):
    return {"tick": tick, "round_number": rn, "killer": killer, "victim": victim, "assister": assister, "weapon": weapon,
            "headshot": hs, "assisted_flash": flash, "penetrated": 0, "thrusmoke": False, "attacker_blind": False,
            "noscope": False, "attacker_in_air": False, "distance": 12.0, "killer_side": ks, "victim_side": vs,
            "killer_place": "Mid", "victim_place": "Mid"}


def _dmg(tick, rn, a, v, asd, vsd, dmg, weapon="ak47", hitgroup="chest"):
    return {"tick": tick, "round_number": rn, "attacker": a, "victim": v, "attacker_side": asd, "victim_side": vsd,
            "weapon": weapon, "dmg_health": dmg, "hitgroup": hitgroup}


def _eco(rn, name, side, equip, spent=0, money=800):
    return {"round_number": rn, "player_name": name, "side": side, "money_start": money, "cash_spent": spent,
            "equip_value": equip, "round_start_equip": 200, "has_defuser": False}


def build() -> MatchData:
    players = [{"name": "a1", "team": "T"}, {"name": "a2", "team": "T"},
               {"name": "b1", "team": "CT"}, {"name": "b2", "team": "CT"}]
    rounds = [
        {"round_number": 1, "winner": "T", "win_type": "ct_eliminated", "start_tick": 0, "freeze_end_tick": 1000, "end_tick": 5000,
         "t_team": "Alpha", "ct_team": "Bravo"},
        {"round_number": 2, "winner": "CT", "win_type": "t_eliminated", "start_tick": 6000, "freeze_end_tick": 7000, "end_tick": 12000,
         "t_team": "Alpha", "ct_team": "Bravo"},
    ]
    kills = [
        # R1: b1 opens on a1, a2 trades b1 within 1 s, then a2 wins a 1v1 vs b2 (clutch)
        _kill(2000, 1, "b1", "a1", "CT", "T"),
        _kill(2064, 1, "a2", "b1", "T", "CT", hs=True),
        _kill(3000, 1, "a2", "b2", "T", "CT", assister="a1"),
        # R2: a1 opens, then b1 kills a1 and a2 untraded (8 s apart)
        _kill(8000, 2, "a1", "b2", "T", "CT"),
        _kill(8500, 2, "b1", "a1", "CT", "T"),
        _kill(9200, 2, "b1", "a2", "CT", "T"),
    ]
    damages = [
        _dmg(1990, 1, "b1", "a1", "CT", "T", 100, hitgroup="head"),
        _dmg(2060, 1, "a2", "b1", "T", "CT", 100, hitgroup="head"),
        _dmg(2990, 1, "a2", "b2", "T", "CT", 100),
        _dmg(7990, 2, "a1", "b2", "T", "CT", 100),
        _dmg(8490, 2, "b1", "a1", "CT", "T", 100),
        _dmg(9190, 2, "b1", "a2", "CT", "T", 100),
        # unfinished: a2 hits b1 for 60 in R2, b1 survives
        _dmg(9100, 2, "a2", "b1", "T", "CT", 60),
    ]
    shots = [
        {"tick": 2058, "round_number": 1, "player_name": "a2", "side": "T", "weapon": "ak47", "speed": 10.0},
        {"tick": 2990, "round_number": 1, "player_name": "a2", "side": "T", "weapon": "ak47", "speed": 200.0},
    ]
    economy = []
    for rn in (1, 2):
        for n, s in (("a1", "T"), ("a2", "T"), ("b1", "CT"), ("b2", "CT")):
            economy.append(_eco(rn, n, s, 4500 if rn == 2 else 800, spent=3700 if rn == 2 else 0, money=4000 if rn == 2 else 800))
    return MatchData(match_id="test", map_name="de_mirage", tick_rate=RATE, team_t_name="Alpha", team_ct_name="Bravo",
                     score_t=1, score_ct=1, players=players, rounds=rounds, kills=kills, damages=damages, shots=shots,
                     economy=economy)


def test_core_counters():
    res = compute(build())
    a2 = res.player_counters[("a2", "all")]
    assert a2["kills"] == 2
    assert a2["deaths"] == 1
    assert a2["trade_kills"] == 1
    assert a2["headshot_kills"] == 1
    assert a2["damage"] == 260
    # R1: last alive vs 2 after a1 died (won); R2: last alive vs 1 (lost)
    assert a2["clutch_attempts"] == 2 and a2["clutch_wins"] == 1
    assert a2["clutch_1v2_won"] == 1 and a2.get("clutch_1v1_won", 0) == 0
    assert a2["unfinished_enemies"] == 1

    a1 = res.player_counters[("a1", "all")]
    assert a1["opening_deaths"] == 1 and a1["opening_kills"] == 1
    assert a1["traded_deaths"] == 1
    assert a1["assists"] == 1
    assert a1["kast_rounds"] == 2  # R1 traded + assist, R2 kill

    b1 = res.player_counters[("b1", "CT")]
    assert b1["kills"] == 3 and b1["opening_kills"] == 1


def test_derived_metrics_and_buy_types():
    res = compute(build())
    m = derive(res.player_counters[("a2", "all")])
    assert m["kd"] == 2.0
    assert m["adr"] == 130.0
    assert m["counter_strafe_pct"] == 50.0
    rs1, rs2 = res.round_summaries
    assert rs1["buy"]["T"]["type"] == "pistol"
    assert rs2["buy"]["T"]["type"] == "full"
    assert rs1["opening"]["killer"] == "b1"
    assert rs1["kills"][1]["trade_of"] == "a1"
    assert res.team_counters["Alpha"]["counters"]["wins"] == 1
    assert res.team_counters["Alpha"]["metrics"]["opening_loss_win_pct"] == 100.0


def test_detectors_produce_evidence():
    md = build()
    res = compute(md)
    found = detect(res, RATE)
    types = {m["type"] for m in found}
    assert "unfinished_enemy" in types
    assert "lost_man_advantage" in types  # Alpha opened R2 and lost it
    for m in found:
        assert m["evidence"] is not None
        assert m["title"] and m["recommendation"]


def test_registry_is_consistent():
    ids = [m["id"] for m in all_metrics()]
    assert len(ids) == len(set(ids))
    empty = derive({})
    assert empty["kd"] is None and empty["adr"] is None
    for m in all_metrics():
        assert m["confidence"] in ("exact", "derived", "estimated")
        assert m["better"] in ("higher", "lower", "neutral")
