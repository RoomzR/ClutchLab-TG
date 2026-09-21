"""Aggregate rich tournament / folder analytics from kills + rounds."""

from __future__ import annotations

from collections import defaultdict

from postgres_repo import fetch
from rating import PlayerAgg, finalize_player, lab_rating, estimate_adr, impact_rating


async def build_analytics(match_ids: list[str]) -> dict:
    if not match_ids:
        return {
            "player_stats": [],
            "mvp": None,
            "awards": {},
            "map_pool": [],
            "head_to_head": [],
            "summary": {
                "matches": 0,
                "rounds": 0,
                "total_kills": 0,
                "players": 0,
            },
        }

    match_meta = await fetch(
        """
        SELECT match_id, map_name, score_t, score_ct, team_t_name, team_ct_name, created_at
        FROM matches WHERE match_id = ANY($1)
        """,
        match_ids,
    )
    meta_by_id = {r["match_id"]: dict(r) for r in match_meta}

    round_rows = await fetch(
        """
        SELECT match_id, COUNT(*)::int AS rounds
        FROM rounds WHERE match_id = ANY($1)
        GROUP BY match_id
        """,
        match_ids,
    )
    rounds_by_match = {r["match_id"]: int(r["rounds"]) for r in round_rows}
    # Fallback: score sum if rounds missing
    for mid, m in meta_by_id.items():
        if mid not in rounds_by_match:
            rounds_by_match[mid] = max(1, int(m.get("score_t") or 0) + int(m.get("score_ct") or 0))

    players_rows = await fetch(
        "SELECT match_id, name, team FROM players WHERE match_id = ANY($1)",
        match_ids,
    )
    players_in_match: dict[str, set[str]] = defaultdict(set)
    player_team: dict[tuple[str, str], str] = {}
    for r in players_rows:
        players_in_match[r["match_id"]].add(r["name"])
        player_team[(r["match_id"], r["name"])] = r["team"]

    kills = await fetch(
        """
        SELECT match_id, round_number, tick, killer, victim, weapon, headshot
        FROM kills
        WHERE match_id = ANY($1)
          AND killer IS NOT NULL AND victim IS NOT NULL
          AND killer != 'unknown' AND victim != 'unknown'
          AND killer != victim
        ORDER BY match_id, round_number, tick
        """,
        match_ids,
    )

    # Per (match, round) ordered kills
    by_round: dict[tuple[str, int], list] = defaultdict(list)
    for k in kills:
        by_round[(k["match_id"], int(k["round_number"]))].append(k)

    aggs: dict[str, PlayerAgg] = {}
    # track which rounds each player played (appeared in players table)
    player_match_rounds: dict[str, dict[str, int]] = defaultdict(dict)

    for mid, names in players_in_match.items():
        mr = rounds_by_match.get(mid, 0)
        map_name = meta_by_id.get(mid, {}).get("map_name") or "unknown"
        for name in names:
            agg = aggs.setdefault(name, PlayerAgg(name=name))
            agg.matches += 1
            agg.rounds += mr
            agg.map_rounds[map_name] = agg.map_rounds.get(map_name, 0) + mr
            player_match_rounds[name][mid] = mr

    # Round-level stats
    duel_matrix: dict[tuple[str, str], list[int]] = defaultdict(lambda: [0, 0])  # a->b kills, b->a

    for (mid, rnd), events in by_round.items():
        if not events:
            continue
        map_name = meta_by_id.get(mid, {}).get("map_name") or "unknown"
        # opening
        first = events[0]
        ok = first["killer"]
        od = first["victim"]
        aggs.setdefault(ok, PlayerAgg(name=ok)).opening_kills += 1
        aggs.setdefault(od, PlayerAgg(name=od)).opening_deaths += 1

        kills_in_round: dict[str, int] = defaultdict(int)
        deaths_in_round: set[str] = set()
        hs_in_round: dict[str, int] = defaultdict(int)

        for e in events:
            killer, victim = e["killer"], e["victim"]
            agg_k = aggs.setdefault(killer, PlayerAgg(name=killer))
            agg_v = aggs.setdefault(victim, PlayerAgg(name=victim))
            agg_k.kills += 1
            agg_v.deaths += 1
            if e["headshot"]:
                agg_k.headshots += 1
                hs_in_round[killer] += 1
            w = (e["weapon"] or "unknown").lower()
            agg_k.weapon_kills[w] = agg_k.weapon_kills.get(w, 0) + 1
            agg_k.map_kills[map_name] = agg_k.map_kills.get(map_name, 0) + 1
            agg_v.map_deaths[map_name] = agg_v.map_deaths.get(map_name, 0) + 1
            kills_in_round[killer] += 1
            deaths_in_round.add(victim)
            duel_matrix[(killer, victim)][0] += 1
            duel_matrix[(victim, killer)][1] += 1

        participants = set(players_in_match.get(mid, set())) | set(kills_in_round) | deaths_in_round
        for name in participants:
            agg = aggs.setdefault(name, PlayerAgg(name=name))
            got_kill = name in kills_in_round
            survived = name not in deaths_in_round
            if got_kill:
                agg.rounds_with_kill += 1
            if got_kill or survived:
                agg.kast_rounds += 1
            n = kills_in_round.get(name, 0)
            if n >= 5:
                agg.multi_5k += 1
            elif n == 4:
                agg.multi_4k += 1
            elif n == 3:
                agg.multi_3k += 1
            elif n == 2:
                agg.multi_2k += 1

    # Per-match form ratings
    kills_by_match_player: dict[tuple[str, str], dict] = defaultdict(
        lambda: {"kills": 0, "deaths": 0, "hs": 0, "ok": 0, "multi": 0, "kast": 0, "rwk": 0}
    )
    # Recompute lightweight form from already walked data — second pass on by_round
    for (mid, rnd), events in by_round.items():
        if not events:
            continue
        kills_in_round: dict[str, int] = defaultdict(int)
        deaths_in_round: set[str] = set()
        first = events[0]
        kills_by_match_player[(mid, first["killer"])]["ok"] += 1
        for e in events:
            kills_by_match_player[(mid, e["killer"])]["kills"] += 1
            kills_by_match_player[(mid, e["victim"])]["deaths"] += 1
            if e["headshot"]:
                kills_by_match_player[(mid, e["killer"])]["hs"] += 1
            kills_in_round[e["killer"]] += 1
            deaths_in_round.add(e["victim"])
        participants = set(players_in_match.get(mid, set())) | set(kills_in_round) | deaths_in_round
        for name in participants:
            st = kills_by_match_player[(mid, name)]
            got_kill = name in kills_in_round
            survived = name not in deaths_in_round
            if got_kill or survived:
                st["kast"] += 1
            if kills_in_round.get(name, 0) >= 2:
                st["multi"] += 1

    for name, agg in aggs.items():
        form = []
        for mid, mr in player_match_rounds.get(name, {}).items():
            st = kills_by_match_player.get((mid, name), {"kills": 0, "deaths": 0, "hs": 0, "ok": 0, "multi": 0, "kast": 0})
            rounds = max(mr, 1)
            kpr = st["kills"] / rounds
            dpr = st["deaths"] / rounds
            kast = (st["kast"] / rounds) * 100
            adr = estimate_adr(st["kills"], st["hs"], rounds)
            impact = impact_rating(st["ok"] / rounds, st["multi"] / rounds)
            r = lab_rating(kpr=kpr, dpr=dpr, impact=impact, kast=kast, adr=adr)
            meta = meta_by_id.get(mid, {})
            form.append(
                {
                    "match_id": mid,
                    "map_name": meta.get("map_name"),
                    "rating": r,
                    "kills": st["kills"],
                    "deaths": st["deaths"],
                    "score": f"{meta.get('score_t', 0)}:{meta.get('score_ct', 0)}",
                }
            )
        # Keep chronological by match created_at
        form.sort(key=lambda x: str(meta_by_id.get(x["match_id"], {}).get("created_at") or ""))
        agg.match_form = form

    player_stats = [finalize_player(a) for a in aggs.values()]
    player_stats.sort(key=lambda s: (-s["rating"], -s["kills"]))

    min_maps = max(1, len(match_ids) // 2)
    eligible = [p for p in player_stats if p["matches_played"] >= min_maps]
    mvp = eligible[0]["name"] if eligible else (player_stats[0]["name"] if player_stats else None)

    awards = _awards(player_stats, min_maps)

    # Map pool
    map_counts: dict[str, int] = defaultdict(int)
    for m in meta_by_id.values():
        map_counts[m.get("map_name") or "unknown"] += 1
    map_pool = sorted(
        [{"map_name": k, "matches": v} for k, v in map_counts.items()],
        key=lambda x: -x["matches"],
    )

    # Top head-to-head (most decisive duels)
    h2h = []
    seen = set()
    for (a, b), (ab, ba) in duel_matrix.items():
        if a >= b:
            continue
        key = (a, b)
        if key in seen:
            continue
        seen.add(key)
        total = ab + ba
        if total < 3:
            continue
        h2h.append({"a": a, "b": b, "a_kills": ab, "b_kills": ba, "total": total})
    h2h.sort(key=lambda x: -x["total"])

    total_rounds = sum(rounds_by_match.values())
    return {
        "player_stats": player_stats,
        "mvp": mvp,
        "awards": awards,
        "map_pool": map_pool,
        "head_to_head": h2h[:25],
        "summary": {
            "matches": len(match_ids),
            "rounds": total_rounds,
            "total_kills": sum(p["kills"] for p in player_stats),
            "players": len(player_stats),
            "avg_rating": round(
                sum(p["rating"] for p in player_stats) / len(player_stats), 2
            )
            if player_stats
            else 0,
        },
    }


def _pick_multi(elig: list[dict]) -> dict | None:
    pool = [p for p in elig if (p["multi_3k"] + p["multi_4k"] + p["multi_5k"]) > 0]
    if not pool:
        return None
    best = max(
        pool,
        key=lambda p: p["multi_5k"] * 5 + p["multi_4k"] * 4 + p["multi_3k"] * 3,
    )
    return {
        "name": best["name"],
        "value": best["multi_3k"] + best["multi_4k"] + best["multi_5k"],
    }


def _awards(stats: list[dict], min_maps: int) -> dict:
    elig = [p for p in stats if p["matches_played"] >= min_maps]
    if not elig:
        elig = stats[:5]

    def pick(key, reverse=True, pred=None):
        pool = [p for p in elig if pred(p)] if pred else elig
        if not pool:
            return None
        best = sorted(pool, key=lambda p: p[key], reverse=reverse)[0]
        return {"name": best["name"], "value": best[key]}

    return {
        "mvp": pick("rating"),
        "entry_fragger": pick("opening_kills", pred=lambda p: p["opening_kills"] > 0),
        "hs_machine": pick("headshot_pct", pred=lambda p: p["kills"] >= 10),
        "fragger": pick("kills"),
        "clutch_multi": _pick_multi(elig),
        "lowest_dpr": pick("dpr", reverse=False, pred=lambda p: p["rounds"] >= 16),
    }


async def player_profile(match_ids: list[str], player_name: str) -> dict | None:
    data = await build_analytics(match_ids)
    player = next((p for p in data["player_stats"] if p["name"] == player_name), None)
    if not player:
        return None
    # Duels involving this player
    duels = [
        h
        for h in data["head_to_head"]
        if h["a"] == player_name or h["b"] == player_name
    ]
    for d in duels:
        if d["a"] == player_name:
            d["opponent"] = d["b"]
            d["won"] = d["a_kills"]
            d["lost"] = d["b_kills"]
        else:
            d["opponent"] = d["a"]
            d["won"] = d["b_kills"]
            d["lost"] = d["a_kills"]
    return {
        "player": player,
        "duels": sorted(duels, key=lambda x: -(x["won"] + x["lost"]))[:20],
        "tournament_mvp": data["mvp"],
        "summary": data["summary"],
    }
