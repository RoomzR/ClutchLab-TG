import type { MapConfig } from './mapConfig';

/** Convert in-game world coordinates to radar pixel coordinates (0..radarSize). */
export function gameToRadarPixel(
  gameX: number,
  gameY: number,
  mapConfig: MapConfig,
): { x: number; y: number } {
  return {
    x: (gameX - mapConfig.pos_x) / mapConfig.scale,
    y: (mapConfig.pos_y - gameY) / mapConfig.scale,
  };
}

/** Convert to percentage for CSS positioning on square radar image. */
export function gameToRadarPercent(
  gameX: number,
  gameY: number,
  mapConfig: MapConfig,
): { left: number; top: number } {
  const { x, y } = gameToRadarPixel(gameX, gameY, mapConfig);
  return {
    left: (x / mapConfig.radarSize) * 100,
    top: (y / mapConfig.radarSize) * 100,
  };
}

/** @deprecated Use gameToRadarPixel — kept for any legacy Leaflet code paths. */
export function gameToLeaflet(
  gameX: number,
  gameY: number,
  mapConfig: MapConfig,
): [number, number] {
  const { x, y } = gameToRadarPixel(gameX, gameY, mapConfig);
  return [y, x];
}

export function leafletToGame(
  lat: number,
  lng: number,
  mapConfig: MapConfig,
): [number, number] {
  const gameX = lng * mapConfig.scale + mapConfig.pos_x;
  const gameY = mapConfig.pos_y - lat * mapConfig.scale;
  return [gameX, gameY];
}
