import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GrenadeData } from '../types/match';
import type { MapConfig } from '../utils/mapConfig';
import { gameToLeaflet } from '../utils/mapCoordinates';
import { getGrenadeIconConfig } from '../utils/grenadeIcons';

interface GrenadeLayerProps {
  grenades: GrenadeData[];
  mapConfig: MapConfig;
}

export function GrenadeLayer({ grenades, mapConfig }: GrenadeLayerProps) {
  const map = useMap();

  useEffect(() => {
    if (!grenades.length) return;

    const group = L.layerGroup();

    grenades.forEach((grenade) => {
      const [fromLat, fromLng] = gameToLeaflet(grenade.from_x, grenade.from_y, mapConfig);
      const [toLat, toLng] = gameToLeaflet(grenade.to_x, grenade.to_y, mapConfig);
      const iconConfig = getGrenadeIconConfig(grenade.grenade_type);

      const throwIcon = L.divIcon({
        className: 'grenade-throw-marker',
        html: '✕',
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      });

      const landingIcon = L.divIcon({
        className: 'grenade-landing-marker',
        html: `<img src="${iconConfig.src}" alt="${iconConfig.label}" width="20" height="20" style="display:block;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.85));" />`,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const throwMarker = L.marker([fromLat, fromLng], { icon: throwIcon });
      const landingMarker = L.marker([toLat, toLng], { icon: landingIcon });

      const popupHtml = `
        <div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.5">
          <strong>${grenade.player_name}</strong><br/>
          ${iconConfig.label}<br/>
          Раунд #${grenade.round_number}<br/>
          Команда: ${grenade.team}
        </div>
      `;

      throwMarker.bindPopup(popupHtml);
      landingMarker.bindPopup(popupHtml);

      const line = L.polyline(
        [
          [fromLat, fromLng],
          [toLat, toLng],
        ],
        {
          color: iconConfig.color,
          weight: 1.5,
          opacity: 0.6,
          dashArray: '6, 6',
        },
      );

      group.addLayer(throwMarker);
      group.addLayer(landingMarker);
      group.addLayer(line);
    });

    group.addTo(map);

    return () => {
      map.removeLayer(group);
    };
  }, [map, grenades, mapConfig]);

  return null;
}
