import { getMapConfig } from './mapConfig';

export interface MapZone {
  id: string;
  label: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** Approximate callout regions in game X/Y (CS2 overview coords). */
const MAP_ZONES: Record<string, MapZone[]> = {
  de_dust2: [
    { id: 'long', label: 'Long A', minX: 350, maxX: 2200, minY: 1800, maxY: 4200 },
    { id: 'a_site', label: 'A Site', minX: 100, maxX: 700, minY: 2400, maxY: 3600 },
    { id: 'cat', label: 'Catwalk', minX: -500, maxX: 250, minY: 1800, maxY: 3200 },
    { id: 'mid', label: 'Mid', minX: -700, maxX: 150, minY: 600, maxY: 1900 },
    { id: 'b_site', label: 'B Site', minX: -2200, maxX: -700, minY: 2400, maxY: 4000 },
    { id: 't_spawn', label: 'T Spawn', minX: -1200, maxX: 400, minY: -400, maxY: 900 },
    { id: 'ct_spawn', label: 'CT Spawn', minX: -2200, maxX: -900, minY: 600, maxY: 1800 },
  ],
  de_mirage: [
    { id: 'a_site', label: 'A Site', minX: -1400, maxX: -500, minY: -400, maxY: 500 },
    { id: 'mid', label: 'Mid', minX: -700, maxX: 200, minY: -900, maxY: 0 },
    { id: 'b_site', label: 'B Site', minX: 600, maxX: 1600, minY: 400, maxY: 1200 },
    { id: 'palace', label: 'Palace', minX: -1800, maxX: -900, minY: -200, maxY: 600 },
    { id: 'connector', label: 'Connector', minX: -400, maxX: 300, minY: -200, maxY: 500 },
    { id: 't_spawn', label: 'T Spawn', minX: -1600, maxX: -600, minY: 800, maxY: 1800 },
    { id: 'ct_spawn', label: 'CT Spawn', minX: 200, maxX: 1200, minY: -1600, maxY: -700 },
  ],
  de_inferno: [
    { id: 'a_site', label: 'A Site', minX: 400, maxX: 1400, minY: 2200, maxY: 3400 },
    { id: 'b_site', label: 'B Site', minX: -2200, maxX: -900, minY: 800, maxY: 2000 },
    { id: 'mid', label: 'Mid', minX: -600, maxX: 500, minY: 1200, maxY: 2400 },
    { id: 'banana', label: 'Banana', minX: -1400, maxX: -400, minY: 400, maxY: 1600 },
    { id: 'apps', label: 'Apartments', minX: 200, maxX: 1200, minY: 800, maxY: 2000 },
    { id: 't_spawn', label: 'T Spawn', minX: -400, maxX: 600, minY: -200, maxY: 700 },
    { id: 'ct_spawn', label: 'CT Spawn', minX: -200, maxX: 800, minY: 2800, maxY: 3600 },
  ],
  de_ancient: [
    { id: 'a_site', label: 'A Site', minX: -2200, maxX: -900, minY: -400, maxY: 800 },
    { id: 'b_site', label: 'B Site', minX: 400, maxX: 1600, minY: 200, maxY: 1200 },
    { id: 'mid', label: 'Mid', minX: -600, maxX: 500, minY: 200, maxY: 1200 },
    { id: 'cave', label: 'Cave', minX: -400, maxX: 600, minY: -1200, maxY: 0 },
    { id: 't_spawn', label: 'T Spawn', minX: 800, maxX: 2000, minY: -1600, maxY: -400 },
    { id: 'ct_spawn', label: 'CT Spawn', minX: -2000, maxX: -800, minY: 1400, maxY: 2600 },
  ],
  de_nuke: [
    { id: 'a_site', label: 'A Site', minX: -1400, maxX: -400, minY: -2200, maxY: -1200 },
    { id: 'b_site', label: 'B Site', minX: 400, maxX: 1400, minY: 1200, maxY: 2200 },
    { id: 'outside', label: 'Outside', minX: -800, maxX: 800, minY: -800, maxY: 800 },
    { id: 'ramp', label: 'Ramp', minX: -400, maxX: 400, minY: 400, maxY: 1400 },
    { id: 't_spawn', label: 'T Spawn', minX: -1600, maxX: -400, minY: 1600, maxY: 2800 },
    { id: 'ct_spawn', label: 'CT Spawn', minX: -1600, maxX: -400, minY: -2800, maxY: -1600 },
  ],
  de_overpass: [
    { id: 'a_site', label: 'A Site', minX: -2200, maxX: -900, minY: 400, maxY: 1400 },
    { id: 'b_site', label: 'B Site', minX: 600, maxX: 1800, minY: -400, maxY: 600 },
    { id: 'mid', label: 'Mid / Connector', minX: -400, maxX: 600, minY: -200, maxY: 800 },
    { id: 'long', label: 'Long A', minX: -3200, maxX: -1800, minY: 200, maxY: 1200 },
    { id: 't_spawn', label: 'T Spawn', minX: 400, maxX: 1600, minY: 1200, maxY: 2200 },
    { id: 'ct_spawn', label: 'CT Spawn', minX: -1600, maxX: -200, minY: -2200, maxY: -1200 },
  ],
  de_anubis: [
    { id: 'a_site', label: 'A Site', minX: -1400, maxX: -400, minY: 800, maxY: 1800 },
    { id: 'b_site', label: 'B Site', minX: 400, maxX: 1400, minY: -400, maxY: 600 },
    { id: 'mid', label: 'Mid', minX: -400, maxX: 500, minY: 200, maxY: 1000 },
    { id: 'canal', label: 'Canal', minX: -1800, maxX: -600, minY: -400, maxY: 600 },
    { id: 't_spawn', label: 'T Spawn', minX: 600, maxX: 1800, minY: 1200, maxY: 2200 },
    { id: 'ct_spawn', label: 'CT Spawn', minX: -1800, maxX: -400, minY: -1800, maxY: -800 },
  ],
};

export function getMapZones(mapName: string): MapZone[] {
  const base = getMapConfig(mapName).id;
  return MAP_ZONES[base] ?? MAP_ZONES.de_dust2;
}

export function classifyPoint(mapName: string, x: number, y: number): MapZone | null {
  const zones = getMapZones(mapName);
  for (const zone of zones) {
    if (x >= zone.minX && x <= zone.maxX && y >= zone.minY && y <= zone.maxY) {
      return zone;
    }
  }
  return null;
}

export function classifyPointLabel(mapName: string, x: number, y: number): string {
  return classifyPoint(mapName, x, y)?.label ?? 'Unknown';
}

export function aggregateZoneCounts(
  mapName: string,
  points: Array<{ x: number; y: number; weight?: number }>,
): Array<{ zone: MapZone; count: number; pct: number }> {
  const zones = getMapZones(mapName);
  const counts = new Map<string, number>();
  let total = 0;

  for (const point of points) {
    const zone = classifyPoint(mapName, point.x, point.y);
    const id = zone?.id ?? 'unknown';
    const w = point.weight ?? 1;
    counts.set(id, (counts.get(id) ?? 0) + w);
    total += w;
  }

  return zones
    .map((zone) => ({
      zone,
      count: counts.get(zone.id) ?? 0,
      pct: total > 0 ? Math.round(((counts.get(zone.id) ?? 0) / total) * 100) : 0,
    }))
    .filter((z) => z.count > 0)
    .sort((a, b) => b.count - a.count);
}
