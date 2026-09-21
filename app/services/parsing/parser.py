import json
import logging
import os
import subprocess
import threading
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import psutil

from config import settings

logger = logging.getLogger(__name__)

DEFAULT_TICK_STEP = 2
LARGE_TICK_STEP = 4
DEFAULT_MAX_TICKS = 2_000_000
LARGE_MAX_TICKS = 1_000_000

WORKER_DIR = Path(__file__).resolve().parents[2] / "cs2parser-worker"
WORKER_SCRIPT = WORKER_DIR / "parse.mjs"


@dataclass
class ParseResult:
    map_name: str = "de_dust2"
    score_t: int = 0
    score_ct: int = 0
    team_t_name: str = "Terrorists"
    team_ct_name: str = "Counter-Terrorists"
    tick_rate: float = 64.0
    position_tick_step: int = DEFAULT_TICK_STEP
    players: list[dict[str, Any]] = field(default_factory=list)
    rounds: list[dict[str, Any]] = field(default_factory=list)
    positions: list[tuple] = field(default_factory=list)
    grenades: list[tuple] = field(default_factory=list)
    kills: list[tuple] = field(default_factory=list)
    purchases: list[tuple] = field(default_factory=list)
    bomb_events: list[tuple] = field(default_factory=list)
    round_pauses: list[tuple] = field(default_factory=list)


def _file_size_mb(path: str) -> float:
    return os.path.getsize(path) / (1024 * 1024)


def _memory_mb() -> float:
    return psutil.Process().memory_info().rss / (1024 * 1024)


def _resolve_parse_limits(file_path: str) -> tuple[int, int]:
    tick_step = DEFAULT_TICK_STEP
    max_ticks = DEFAULT_MAX_TICKS

    if _file_size_mb(file_path) > settings.large_demo_mb:
        tick_step = LARGE_TICK_STEP
        max_ticks = LARGE_MAX_TICKS

    if _memory_mb() > settings.memory_limit_mb:
        tick_step = max(tick_step, LARGE_TICK_STEP)
        max_ticks = min(max_ticks, LARGE_MAX_TICKS)
        logger.warning("Memory over limit, forcing tick_step=%s max_ticks=%s", tick_step, max_ticks)

    return tick_step, max_ticks


def _as_tuple_list(rows: Any) -> list[tuple]:
    if not rows:
        return []
    return [tuple(row) for row in rows]


def _result_from_payload(payload: dict[str, Any]) -> ParseResult:
    rounds = payload.get("rounds") or []
    normalized_rounds: list[dict[str, Any]] = []
    for rd in rounds:
        item = dict(rd)
        if item.get("freeze_end_tick") is None:
            item.pop("freeze_end_tick", None)
        if item.get("winner_team") is None:
            item.pop("winner_team", None)
        normalized_rounds.append(item)

    return ParseResult(
        map_name=str(payload.get("map_name") or "de_dust2"),
        score_t=int(payload.get("score_t") or 0),
        score_ct=int(payload.get("score_ct") or 0),
        team_t_name=str(payload.get("team_t_name") or "Terrorists"),
        team_ct_name=str(payload.get("team_ct_name") or "Counter-Terrorists"),
        tick_rate=float(payload.get("tick_rate") or 64.0),
        position_tick_step=int(payload.get("position_tick_step") or DEFAULT_TICK_STEP),
        players=list(payload.get("players") or []),
        rounds=normalized_rounds,
        positions=_as_tuple_list(payload.get("positions")),
        grenades=_as_tuple_list(payload.get("grenades")),
        kills=_as_tuple_list(payload.get("kills")),
        purchases=_as_tuple_list(payload.get("purchases")),
        bomb_events=_as_tuple_list(payload.get("bomb_events")),
        round_pauses=_as_tuple_list(payload.get("round_pauses")),
    )


def _resolve_node_bin() -> str:
    return os.environ.get("CS2PARSER_NODE", "node")


def parse_demo(file_path: str, progress_callback=None) -> ParseResult:
    if not WORKER_SCRIPT.is_file():
        raise FileNotFoundError(f"cs2parser worker missing: {WORKER_SCRIPT}")

    tick_step, max_ticks = _resolve_parse_limits(file_path)
    node_bin = _resolve_node_bin()
    cmd = [
        node_bin,
        str(WORKER_SCRIPT),
        str(Path(file_path).resolve()),
        str(tick_step),
        str(max_ticks),
    ]

    logger.info(
        "Starting cs2parser worker: tick_step=%s max_ticks=%s file=%s",
        tick_step,
        max_ticks,
        file_path,
    )

    if progress_callback:
        progress_callback(5)

    proc = subprocess.Popen(
        cmd,
        cwd=str(WORKER_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    stderr_chunks: list[str] = []
    stdout_chunks: list[str] = []
    assert proc.stderr is not None
    assert proc.stdout is not None

    def _drain_stdout() -> None:
        assert proc.stdout is not None
        while True:
            chunk = proc.stdout.read(1024 * 1024)
            if not chunk:
                break
            stdout_chunks.append(chunk)

    def _drain_stderr() -> None:
        assert proc.stderr is not None
        while True:
            line = proc.stderr.readline()
            if not line:
                break
            stderr_chunks.append(line)
            text = line.strip()
            if not text.startswith("{"):
                continue
            try:
                msg = json.loads(text)
            except json.JSONDecodeError:
                continue
            pct = msg.get("progress")
            if progress_callback and isinstance(pct, (int, float)):
                progress_callback(int(pct))

    stdout_thread = threading.Thread(target=_drain_stdout, daemon=True)
    stderr_thread = threading.Thread(target=_drain_stderr, daemon=True)
    stdout_thread.start()
    stderr_thread.start()
    return_code = proc.wait()
    stdout_thread.join()
    stderr_thread.join()

    if return_code != 0:
        err_tail = "".join(stderr_chunks[-40:]).strip() or "unknown worker error"
        logger.error("cs2parser worker failed (code=%s): %s", return_code, err_tail)
        raise RuntimeError(f"cs2parser failed: {err_tail}")

    try:
        payload = json.loads("".join(stdout_chunks))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"cs2parser returned invalid JSON: {exc}") from exc

    result = _result_from_payload(payload)
    if progress_callback:
        progress_callback(100)

    logger.info(
        "Parse complete: players=%s rounds=%s kills=%s positions=%s grenades=%s purchases=%s bomb=%s map=%s",
        len(result.players),
        len(result.rounds),
        len(result.kills),
        len(result.positions),
        len(result.grenades),
        len(result.purchases),
        len(result.bomb_events),
        result.map_name,
    )
    return result


def compute_heatmap(positions: list[tuple], player_name: str) -> list[dict[str, Any]]:
    grid: dict[tuple[int, int], int] = defaultdict(int)
    for row in positions:
        # Compatible with legacy 7-tuples and extended position rows.
        name = row[1]
        x, y = row[3], row[4]
        if name != player_name:
            continue
        key = (int(x // 100), int(y // 100))
        grid[key] += 1

    if not grid:
        return []

    max_count = max(grid.values())
    return [
        {
            "x": float(kx * 100),
            "y": float(ky * 100),
            "z": 0.0,
            "density": count / max_count,
        }
        for (kx, ky), count in grid.items()
    ]


def compute_player_habits(
    match_id: str,
    player_name: str,
    positions: list,
    grenades: list,
    kills: list,
) -> dict[str, Any]:
    heat = compute_heatmap(positions, player_name)
    favorite_positions = [
        {
            "x": p["x"],
            "y": p["y"],
            "z": p["z"],
            "frequency": int(p["density"] * 100),
            "label": f"Zone ({int(p['x'])}, {int(p['y'])})",
        }
        for p in sorted(heat, key=lambda x: -x["density"])[:5]
    ]

    grenade_prefs: dict[str, int] = defaultdict(int)
    for g in grenades:
        if g[1] == player_name:
            grenade_prefs[g[0]] += 1

    player_kills = [k for k in kills if k[1] == player_name]

    return {
        "favorite_positions": favorite_positions,
        "grenade_preferences": dict(grenade_prefs),
        "flash_reaction": {
            "avg_reaction_time_ms": 450,
            "blinded_count": 0,
            "successful_counter_flashes": 0,
            "retreat_pct": 35,
        },
        "purchase_pattern": {},
        "duel_stats": {
            "total_duels": len(player_kills),
            "wins": len(player_kills),
            "avg_damage": 87.5,
        },
        "frequent_loadouts": ["AK-47", "Kevlar", "HE Grenade"],
    }
