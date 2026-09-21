import type { TickData } from '../types/match';

/** CS2 run speed ~250 u/s → ~3.9 u/tick @64, ~1.95 u/tick @128. */
const RUN_P90_64_THRESHOLD = 2.75;

/**
 * Infer server tick rate from parsed position tracks.
 * Fixes demos where header/tick metadata says 128 but gameplay is 64-tick.
 */
export function inferTickRateFromPositions(positions: TickData[]): number | null {
  if (positions.length < 100) return null;

  const tracks = new Map<string, TickData[]>();
  for (const pos of positions) {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    const list = tracks.get(pos.player_name) ?? [];
    list.push(pos);
    tracks.set(pos.player_name, list);
  }

  const runPerTick: number[] = [];
  for (const track of tracks.values()) {
    track.sort((a, b) => a.tick - b.tick);
    for (let i = 1; i < track.length; i++) {
      const dt = track[i].tick - track[i - 1].tick;
      if (dt <= 0 || dt > 8) continue;
      const du = Math.hypot(track[i].x - track[i - 1].x, track[i].y - track[i - 1].y);
      const perTick = du / dt;
      if (perTick > 2.0 && perTick < 5.5) {
        runPerTick.push(perTick);
      }
    }
  }

  if (runPerTick.length < 40) return null;

  runPerTick.sort((a, b) => a - b);
  const p90 = runPerTick[Math.floor(runPerTick.length * 0.9)];
  return p90 > RUN_P90_64_THRESHOLD ? 64 : 128;
}

/** Prefer movement-inferred tick rate when stored value is off by 2×. */
export function resolvePlaybackTickRate(
  storedTickRate: number,
  positions: TickData[],
): number {
  const inferred = inferTickRateFromPositions(positions);
  if (inferred == null) return storedTickRate;

  if (
    storedTickRate !== inferred &&
    (storedTickRate === inferred * 2 || inferred === storedTickRate * 2)
  ) {
    return inferred;
  }

  return storedTickRate;
}
