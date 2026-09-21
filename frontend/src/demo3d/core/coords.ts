import type { MapConfig } from '../../utils/mapConfig';

/** Approximate CS2 standing eye height (Source units). */
export const EYE_HEIGHT = 64;

/** Source/CS2: X/Y horizontal, Z up. Three.js: X/Z horizontal, Y up. */
export function gameToThree(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

/**
 * Source forward (yaw 0 = +X, CCW; +pitch = look down) → Three unit direction.
 * Matches demoparser `m_angEyeAngles` after `gameToThree`.
 */
export function sourceLookDir(
  yawDeg: number,
  pitchDeg: number,
): [number, number, number] {
  const yaw = (yawDeg * Math.PI) / 180;
  const pitch = (pitchDeg * Math.PI) / 180;
  const cp = Math.cos(pitch);
  return [
    Math.cos(yaw) * cp,
    -Math.sin(pitch),
    -Math.sin(yaw) * cp,
  ];
}

/**
 * Root yaw for player pawns. Local +X = look (sourceLookDir).
 * Mesh facing fix lives in GlbPlayer `faceYaw`, not here.
 */
export function sourceYawToThreeRotation(yawDeg: number): number {
  return (yawDeg * Math.PI) / 180;
}

/** Shortest signed yaw delta in degrees, range (-180, 180]. */
export function shortestYawDeltaDeg(fromDeg: number, toDeg: number): number {
  let d = toDeg - fromDeg;
  while (d > 180) d -= 360;
  while (d <= -180) d += 360;
  return d;
}

export function mapWorldBounds(map: MapConfig) {
  const size = map.radarSize * map.scale;
  const minX = map.pos_x;
  const maxX = map.pos_x + size;
  const maxY = map.pos_y;
  const minY = map.pos_y - size;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: size,
    depth: size,
    centerX,
    centerY,
    centerThree: gameToThree(centerX, centerY, 0) as [number, number, number],
  };
}
