import type { TickData } from '../types/match';

export interface InterpolatedPosition extends TickData {
  /** Fractional tick used for interpolation. */
  renderTick: number;
  /** Game units per tick along the current segment (walk vs run). */
  speedPerTick?: number;
  /** Source yaw of horizontal movement (null when nearly still). */
  moveYaw?: number | null;
}

export function buildPlayerTracks(positions: TickData[]): Map<string, TickData[]> {
  const tracks = new Map<string, TickData[]>();

  for (const pos of positions) {
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;
    const list = tracks.get(pos.player_name) ?? [];
    list.push(pos);
    tracks.set(pos.player_name, list);
  }

  for (const list of tracks.values()) {
    list.sort((a, b) => a.tick - b.tick);
  }

  return tracks;
}

function findSegment(track: TickData[], tick: number): [TickData, TickData] | [TickData] | null {
  if (!track.length) return null;

  if (tick <= track[0].tick) return [track[0]];
  if (tick >= track[track.length - 1].tick) return [track[track.length - 1]];

  let lo = 0;
  let hi = track.length - 1;

  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].tick <= tick) lo = mid;
    else hi = mid;
  }

  return [track[lo], track[hi]];
}

function segmentSpeedPerTick(prev: TickData, next: TickData): number {
  const tickGap = next.tick - prev.tick;
  if (tickGap <= 0) return 0;
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  return Math.hypot(dx, dy) / tickGap;
}

function lerpYaw(a: number | null | undefined, b: number | null | undefined, alpha: number): number | null {
  if (!Number.isFinite(a as number) && !Number.isFinite(b as number)) return null;
  if (!Number.isFinite(a as number)) return Number(b);
  if (!Number.isFinite(b as number)) return Number(a);
  let diff = Number(b) - Number(a);
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return Number(a) + diff * alpha;
}

/** Fallback yaw from movement when eye angles are missing (old demos). */
export function yawFromMovement(prev: TickData, next: TickData): number | null {
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  if (Math.hypot(dx, dy) < 0.5) return null;
  // Source yaw: 0 = +X, increases CCW
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Build a view-cone wedge in game world space, then map to radar pixels.
 * Source yaw: 0 = +X, increases CCW. Radar Y is flipped vs game Y.
 */
export function viewConeRadarPath(
  gameX: number,
  gameY: number,
  yawDeg: number,
  toPx: (x: number, y: number) => { x: number; y: number },
  lengthGame = 420,
  halfAngleDeg = 22,
): string {
  const yaw = (yawDeg * Math.PI) / 180;
  const half = (halfAngleDeg * Math.PI) / 180;
  const fx = Math.cos(yaw);
  const fy = Math.sin(yaw);

  const leftAng = yaw + half;
  const rightAng = yaw - half;
  const left = toPx(gameX + Math.cos(leftAng) * lengthGame, gameY + Math.sin(leftAng) * lengthGame);
  const right = toPx(gameX + Math.cos(rightAng) * lengthGame, gameY + Math.sin(rightAng) * lengthGame);
  const origin = toPx(gameX, gameY);
  const tip = toPx(gameX + fx * lengthGame, gameY + fy * lengthGame);

  return `M ${origin.x} ${origin.y} L ${left.x} ${left.y} L ${tip.x} ${tip.y} L ${right.x} ${right.y} Z`;
}

/** @deprecated Prefer viewConeRadarPath — kept for any callers. */
export function yawToRadarRotation(yaw: number): number {
  return -yaw;
}

export function interpolateTrackAtTick(track: TickData[], tick: number): InterpolatedPosition | null {
  if (!track.length) return null;

  const segment = findSegment(track, tick);
  if (!segment) return null;

  if (segment.length === 1) {
    return { ...segment[0], renderTick: tick, speedPerTick: 0, moveYaw: null };
  }

  const [prev, next] = segment;
  if (prev.tick === next.tick) {
    return { ...prev, renderTick: tick, speedPerTick: 0, moveYaw: null };
  }

  const tickGap = next.tick - prev.tick;
  const alpha = (tick - prev.tick) / tickGap;
  const speedPerTick = segmentSpeedPerTick(prev, next);
  const moveYaw = yawFromMovement(prev, next);
  let yaw = lerpYaw(prev.yaw, next.yaw, alpha);
  if (yaw == null) {
    yaw = moveYaw;
  }
  let pitch: number | null = null;
  if (Number.isFinite(prev.pitch) && Number.isFinite(next.pitch)) {
    pitch = Number(prev.pitch) + (Number(next.pitch) - Number(prev.pitch)) * alpha;
  } else if (Number.isFinite(prev.pitch as number)) {
    pitch = Number(prev.pitch);
  } else if (Number.isFinite(next.pitch as number)) {
    pitch = Number(next.pitch);
  }

  const health =
    Number.isFinite(prev.health as number) && Number.isFinite(next.health as number)
      ? Math.round(Number(prev.health) + (Number(next.health) - Number(prev.health)) * alpha)
      : (prev.health ?? next.health ?? null);
  const armor =
    Number.isFinite(prev.armor as number) && Number.isFinite(next.armor as number)
      ? Math.round(Number(prev.armor) + (Number(next.armor) - Number(prev.armor)) * alpha)
      : (prev.armor ?? next.armor ?? null);

  return {
    tick: prev.tick,
    renderTick: tick,
    player_name: prev.player_name,
    team: prev.team,
    round_number: prev.round_number,
    z: prev.z + (next.z - prev.z) * alpha,
    x: prev.x + (next.x - prev.x) * alpha,
    y: prev.y + (next.y - prev.y) * alpha,
    yaw,
    pitch,
    health,
    armor,
    weapon: alpha < 0.5 ? (prev.weapon ?? next.weapon ?? null) : (next.weapon ?? prev.weapon ?? null),
    scoped: alpha < 0.5 ? Boolean(prev.scoped) : Boolean(next.scoped),
    speedPerTick,
    moveYaw,
  };
}

export function interpolatePositionsAtTick(
  tracks: Map<string, TickData[]>,
  tick: number,
  selectedPlayers?: string[],
): InterpolatedPosition[] {
  const filter =
    selectedPlayers && selectedPlayers.length > 0 ? new Set(selectedPlayers) : null;
  const result: InterpolatedPosition[] = [];

  for (const [name, track] of tracks) {
    if (filter && !filter.has(name)) continue;
    const pos = interpolateTrackAtTick(track, tick);
    if (pos) result.push(pos);
  }

  return result;
}

/** Positions at or before tick — for HUD / death checks without interpolation. */
export function getLatestPositionsAtTick(
  tracks: Map<string, TickData[]>,
  tick: number,
): TickData[] {
  const result: TickData[] = [];
  for (const track of tracks.values()) {
    const segment = findSegment(track, tick);
    if (!segment) continue;
    result.push(segment.length === 1 ? segment[0] : segment[0]);
  }
  return result;
}
