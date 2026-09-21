export interface MapRadarMeta {
  pos_x: number;
  pos_y: number;
  scale: number;
  radarSize: number;
}

export interface MapConfig extends MapRadarMeta {
  id: string;
  displayName: string;
  imageUrl: string;
}

const RADAR_SIZE = 1024;

const createMapConfig = (
  id: string,
  displayName: string,
  meta: Omit<MapRadarMeta, 'radarSize'>,
): MapConfig => ({
  id,
  displayName,
  imageUrl: `/maps/${id}.png`,
  radarSize: RADAR_SIZE,
  ...meta,
});

/** Official CS2 radar metadata (Valve overview + MurkyYT/cs2-map-icons). */
export const MAP_CONFIGS: Record<string, MapConfig> = {
  de_dust2: createMapConfig('de_dust2', 'Dust II', { pos_x: -2476, pos_y: 3239, scale: 4.4 }),
  de_mirage: createMapConfig('de_mirage', 'Mirage', { pos_x: -3230, pos_y: 1713, scale: 5 }),
  de_inferno: createMapConfig('de_inferno', 'Inferno', { pos_x: -2087, pos_y: 3870, scale: 4.9 }),
  de_nuke: createMapConfig('de_nuke', 'Nuke', { pos_x: -3453, pos_y: 2887, scale: 7 }),
  de_ancient: createMapConfig('de_ancient', 'Ancient', { pos_x: -2953, pos_y: 2164, scale: 5 }),
  de_anubis: createMapConfig('de_anubis', 'Anubis', { pos_x: -2796, pos_y: 3328, scale: 5.22 }),
  de_overpass: createMapConfig('de_overpass', 'Overpass', { pos_x: -4831, pos_y: 1781, scale: 5.2 }),
  de_cache: createMapConfig('de_cache', 'Cache', { pos_x: -2000, pos_y: 3250, scale: 5.5 }),
  de_vertigo: createMapConfig('de_vertigo', 'Vertigo', { pos_x: -3168, pos_y: 1762, scale: 4 }),
  de_train: createMapConfig('de_train', 'Train', { pos_x: -2308, pos_y: 2078, scale: 4.082077 }),
};

export function getMapConfig(mapName: string): MapConfig {
  const normalized = mapName.toLowerCase().replace(/^cs_/i, '');

  if (MAP_CONFIGS[normalized]) {
    return MAP_CONFIGS[normalized];
  }

  const baseMap = Object.keys(MAP_CONFIGS).find((key) => normalized.startsWith(key));
  if (baseMap) {
    return MAP_CONFIGS[baseMap];
  }

  return MAP_CONFIGS.de_dust2;
}
