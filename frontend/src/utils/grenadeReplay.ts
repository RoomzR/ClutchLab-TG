import type { GrenadeData } from '../types/match';

const TICK_RATE = 64;

/** Approximate active duration on radar (ticks). */
export const GRENADE_DURATION_TICKS: Record<GrenadeData['grenade_type'], number> = {
  smoke: TICK_RATE * 18,
  molotov: TICK_RATE * 7,
  incendiary: TICK_RATE * 7,
  flash: TICK_RATE * 1.5,
  he: TICK_RATE * 0.4,
  decoy: TICK_RATE * 15,
};

/** Approximate mid-air flight before detonation (ticks). */
export const GRENADE_FLIGHT_TICKS: Record<GrenadeData['grenade_type'], number> = {
  smoke: TICK_RATE * 1.4,
  molotov: TICK_RATE * 1.2,
  incendiary: TICK_RATE * 1.2,
  flash: TICK_RATE * 1.1,
  he: TICK_RATE * 1.3,
  decoy: TICK_RATE * 1.2,
};

export const GRENADE_RADAR_RADIUS: Record<GrenadeData['grenade_type'], number> = {
  smoke: 52,
  molotov: 38,
  incendiary: 38,
  flash: 14,
  he: 18,
  decoy: 10,
};

export function grenadeThrowTick(grenade: GrenadeData, tickRate = TICK_RATE): number {
  const flight = GRENADE_FLIGHT_TICKS[grenade.grenade_type] ?? tickRate * 1.2;
  return Math.max(0, grenade.tick - Math.round(flight));
}

export function grenadeFlightProgress(
  grenade: GrenadeData,
  tick: number,
  tickRate = TICK_RATE,
): number | null {
  const throwTick = grenadeThrowTick(grenade, tickRate);
  if (tick < throwTick || tick > grenade.tick) return null;
  const span = Math.max(1, grenade.tick - throwTick);
  return Math.min(1, Math.max(0, (tick - throwTick) / span));
}

export function grenadePositionAtTick(
  grenade: GrenadeData,
  tick: number,
  tickRate = TICK_RATE,
): { x: number; y: number; z: number; phase: 'flight' | 'landed' | 'none' } {
  const progress = grenadeFlightProgress(grenade, tick, tickRate);
  if (progress != null) {
    const arc = Math.sin(progress * Math.PI) * 40;
    return {
      x: grenade.from_x + (grenade.to_x - grenade.from_x) * progress,
      y: grenade.from_y + (grenade.to_y - grenade.from_y) * progress,
      z: (grenade.from_z ?? 0) + ((grenade.to_z ?? 0) - (grenade.from_z ?? 0)) * progress + arc,
      phase: 'flight',
    };
  }
  if (isGrenadeActiveAtTick(grenade, tick)) {
    return { x: grenade.to_x, y: grenade.to_y, z: grenade.to_z ?? 0, phase: 'landed' };
  }
  return { x: grenade.to_x, y: grenade.to_y, z: grenade.to_z ?? 0, phase: 'none' };
}

export function isGrenadeActiveAtTick(grenade: GrenadeData, tick: number): boolean {
  if (grenade.tick > tick) return false;
  const duration = GRENADE_DURATION_TICKS[grenade.grenade_type] ?? TICK_RATE * 2;
  return tick - grenade.tick <= duration;
}

export function getActiveGrenadesAtTick(grenades: GrenadeData[], tick: number): GrenadeData[] {
  return grenades.filter(
    (g) =>
      Number.isFinite(g.to_x) &&
      Number.isFinite(g.to_y) &&
      isGrenadeActiveAtTick(g, tick),
  );
}

export function getInFlightGrenadesAtTick(
  grenades: GrenadeData[],
  tick: number,
  tickRate = TICK_RATE,
): GrenadeData[] {
  return grenades.filter((g) => grenadeFlightProgress(g, tick, tickRate) != null);
}

export function getGrenadeOpacity(grenade: GrenadeData, tick: number): number {
  const duration = GRENADE_DURATION_TICKS[grenade.grenade_type] ?? TICK_RATE * 2;
  const elapsed = tick - grenade.tick;
  const remaining = Math.max(0, duration - elapsed);
  const type = grenade.grenade_type;

  if (type === 'he' || type === 'flash') {
    return Math.max(0, 1 - elapsed / duration);
  }
  if (type === 'smoke') {
    const fadeStart = duration * 0.75;
    if (elapsed < fadeStart) return 0.85;
    return 0.85 * (1 - (elapsed - fadeStart) / (duration - fadeStart));
  }
  return Math.min(1, 0.35 + (remaining / duration) * 0.65);
}

/** Seconds left until grenade effect ends (null if not active). */
export function getGrenadeRemainingSeconds(
  grenade: GrenadeData,
  tick: number,
  tickRate = TICK_RATE,
): number | null {
  if (!isGrenadeActiveAtTick(grenade, tick)) return null;
  const duration = GRENADE_DURATION_TICKS[grenade.grenade_type] ?? tickRate * 2;
  const remainingTicks = Math.max(0, duration - (tick - grenade.tick));
  return remainingTicks / tickRate;
}

export function formatGrenadeTimer(seconds: number): string {
  if (seconds >= 10) return `${Math.ceil(seconds)}s`;
  return `${seconds.toFixed(1)}s`;
}
