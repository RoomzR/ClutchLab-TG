import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { LatLngBoundsExpression } from 'leaflet';

interface MapBoundsSyncProps {
  bounds: LatLngBoundsExpression;
}

export function MapBoundsSync({ bounds }: MapBoundsSyncProps) {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(bounds, { padding: [16, 16], animate: false });
    map.setMaxBounds(bounds);
  }, [map, bounds]);

  return null;
}
