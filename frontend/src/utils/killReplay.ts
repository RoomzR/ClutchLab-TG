import type { KillData, TickData } from '../types/match';
import { buildPlayerTracks, interpolateTrackAtTick } from './positionInterpolation';

const SNIPER_WEAPONS = new Set(['awp', 'ssg08', 'scout', 'g3sg1', 'scar20']);

export function normalizeWeapon(weapon: string): string {
  return weapon.toLowerCase().replace(/^weapon_/, '');
}

export function isSniperKill(kill: KillData): boolean {
  return SNIPER_WEAPONS.has(normalizeWeapon(kill.weapon));
}

/** Tick to seek for kill-cam (short lead before the frag). */
export function getKillReplayTick(kill: KillData, tickRate: number, leadSeconds = 1.5): number {
  const lead = Math.round(tickRate * leadSeconds);
  return Math.max(0, kill.tick - lead);
}

export interface PreAimData {
  killerPos: { x: number; y: number };
  victimPos: { x: number; y: number };
  preAimPos: { x: number; y: number };
  distance: number;
  angleDeg: number;
  preTicks: number;
  isSniper: boolean;
}

export function computePreAimForKill(
  kill: KillData,
  positions: TickData[],
  tickRate: number,
  preSeconds = 0.75,
): PreAimData | null {
  if (kill.killer === 'unknown' || kill.victim === 'unknown') return null;
  if (kill.killer === kill.victim) return null;

  const tracks = buildPlayerTracks(positions);
  const killerTrack = tracks.get(kill.killer);
  const victimTrack = tracks.get(kill.victim);
  if (!killerTrack?.length || !victimTrack?.length) return null;

  const preTicks = Math.round(tickRate * preSeconds);
  const preTick = Math.max(killerTrack[0].tick, kill.tick - preTicks);

  const killerAtKill = interpolateTrackAtTick(killerTrack, kill.tick);
  const victimAtKill = interpolateTrackAtTick(victimTrack, kill.tick);
  const killerPre = interpolateTrackAtTick(killerTrack, preTick);

  if (!killerAtKill || !victimAtKill || !killerPre) return null;

  const dx = victimAtKill.x - killerPre.x;
  const dy = victimAtKill.y - killerPre.y;
  const distance = Math.hypot(dx, dy);
  const angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);

  return {
    killerPos: { x: killerAtKill.x, y: killerAtKill.y },
    victimPos: { x: victimAtKill.x, y: victimAtKill.y },
    preAimPos: { x: killerPre.x, y: killerPre.y },
    distance: Math.round(distance),
    angleDeg,
    preTicks,
    isSniper: isSniperKill(kill),
  };
}

export function formatDistance(units: number): string {
  if (units >= 1000) return `${(units / 1000).toFixed(1)}k u`;
  return `${units} u`;
}
