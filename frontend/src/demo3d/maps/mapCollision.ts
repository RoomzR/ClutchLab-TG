import * as THREE from 'three';

/**
 * Shared map mesh registry for foot-plant raycasts.
 * Throttled + distance-gated so 10 players don't raycast the full map every frame.
 */

const targets: THREE.Object3D[] = [];
const raycaster = new THREE.Raycaster();
const origin = new THREE.Vector3();
const down = new THREE.Vector3(0, -1, 0);
const hits: THREE.Intersection[] = [];

type CacheEntry = { x: number; z: number; y: number; frame: number };
const cache = new Map<string, CacheEntry>();
let frameCounter = 0;

export function registerMapCollider(root: THREE.Object3D | null): () => void {
  if (!root) return () => undefined;
  targets.push(root);
  return () => {
    const i = targets.indexOf(root);
    if (i >= 0) targets.splice(i, 1);
  };
}

/** Call once per animation frame from the scene (optional). */
export function tickMapCollisionFrame(): void {
  frameCounter += 1;
}

/**
 * Cast from above the demo height down onto map geometry.
 * Returns world Y of the first solid hit near the player, or null.
 */
export function queryGroundY(
  worldX: number,
  worldZ: number,
  hintY: number,
  maxDrop = 420,
  cacheKey?: string,
): number | null {
  if (targets.length === 0) return null;

  if (cacheKey) {
    const prev = cache.get(cacheKey);
    if (
      prev &&
      frameCounter - prev.frame < 6 &&
      Math.hypot(prev.x - worldX, prev.z - worldZ) < 12
    ) {
      return prev.y;
    }
  }

  const startY = hintY + 120;
  origin.set(worldX, startY, worldZ);
  raycaster.set(origin, down);
  raycaster.far = maxDrop;
  raycaster.near = 0;
  hits.length = 0;

  for (const root of targets) {
    if (!root.visible) continue;
    raycaster.intersectObject(root, true, hits);
  }
  if (hits.length === 0) return null;

  hits.sort((a, b) => a.distance - b.distance);
  let result: number | null = null;
  for (const h of hits) {
    const y = h.point.y;
    if (y > hintY + 90) continue;
    if (Math.abs(y - hintY) > 280) continue;
    result = y;
    break;
  }
  if (result == null) result = hits[0]?.point.y ?? null;

  if (result != null && cacheKey) {
    cache.set(cacheKey, { x: worldX, z: worldZ, y: result, frame: frameCounter });
  }
  return result;
}
