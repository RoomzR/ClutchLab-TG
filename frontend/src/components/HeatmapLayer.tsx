import { memo, useEffect, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { HeatmapPoint, HeatmapLatLngPoint } from '../types/match';
import type { MapConfig } from '../utils/mapConfig';
import { gameToLeaflet } from '../utils/mapCoordinates';

interface HeatmapLayerProps {
  points?: HeatmapPoint[];
  mapConfig?: MapConfig;
  latLngPoints?: HeatmapLatLngPoint[];
  maxDensity?: number;
  radius?: number;
  blur?: number;
}

function intensityToColor(intensity: number): string {
  if (intensity < 0.25) return `rgba(6, 182, 212, ${0.15 + intensity * 0.6})`;
  if (intensity < 0.6) return `rgba(59, 130, 246, ${0.25 + intensity * 0.5})`;
  return `rgba(124, 58, 237, ${0.35 + intensity * 0.5})`;
}

function HeatmapLayerComponent({
  points = [],
  mapConfig,
  latLngPoints,
  maxDensity,
  radius = 25,
  blur = 20,
}: HeatmapLayerProps) {
  const map = useMap();

  const resolvedLatLngPoints: HeatmapLatLngPoint[] = useMemo(() => {
    if (latLngPoints?.length) return latLngPoints;
    if (points.length && mapConfig) {
      return points.map((p) => {
        const [lat, lng] = gameToLeaflet(p.x, p.y, mapConfig);
        return { lat, lng, intensity: p.density };
      });
    }
    return [];
  }, [latLngPoints, points, mapConfig]);

  useEffect(() => {
    if (!resolvedLatLngPoints.length) return;

    const useCanvas = !!latLngPoints || resolvedLatLngPoints.length > 5;

    if (!useCanvas) {
      const max = maxDensity ?? Math.max(...resolvedLatLngPoints.map((p) => p.intensity), 1);
      const group = L.layerGroup();

      resolvedLatLngPoints.forEach((point) => {
        const intensity = point.intensity / max;
        const circle = L.circleMarker([point.lat, point.lng], {
          radius: 8 + intensity * 20,
          fillColor: intensityToColor(intensity),
          color: `rgba(34, 211, 238, ${intensity + 0.2})`,
          weight: 1,
          fillOpacity: 0.15 + intensity * 0.5,
        });
        group.addLayer(circle);
      });

      group.addTo(map);
      return () => {
        map.removeLayer(group);
      };
    }

    const canvas = L.DomUtil.create('canvas', 'leaflet-heatmap-layer') as HTMLCanvasElement;
    const pane = map.getPanes().overlayPane;
    if (pane) pane.appendChild(canvas);

    const maxIntensity = Math.max(...resolvedLatLngPoints.map((p) => p.intensity), 1);

    const redraw = () => {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;

      const topLeft = map.containerPointToLayerPoint([0, 0]);
      L.DomUtil.setPosition(canvas, topLeft);

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, size.x, size.y);

      for (const point of resolvedLatLngPoints) {
        const layerPoint = map.latLngToLayerPoint([point.lat, point.lng]);
        const x = layerPoint.x - topLeft.x;
        const y = layerPoint.y - topLeft.y;
        const normalized = point.intensity / maxIntensity;
        const r = radius + blur * normalized;

        const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
        gradient.addColorStop(0, intensityToColor(normalized));
        gradient.addColorStop(0.5, intensityToColor(normalized * 0.6));
        gradient.addColorStop(1, 'rgba(0,0,0,0)');

        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    map.on('moveend zoomend resize', redraw);
    redraw();

    return () => {
      map.off('moveend zoomend resize', redraw);
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    };
  }, [map, resolvedLatLngPoints, maxDensity, radius, blur, latLngPoints]);

  return null;
}

export const HeatmapLayer = memo(HeatmapLayerComponent);
