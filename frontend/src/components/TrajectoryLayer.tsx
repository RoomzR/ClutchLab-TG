import { memo, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import type { TickData, TrajectoryData } from '../types/match';
import type { MapConfig } from '../utils/mapConfig';
import { gameToLeaflet } from '../utils/mapCoordinates';

interface TrajectoryLayerProps {
  positions?: TickData[];
  mapConfig?: MapConfig;
  trajectories?: TrajectoryData[];
  color?: string;
  playerName?: string;
  gradientByTime?: boolean;
}

function createArrowMarker(lat: number, lng: number, bearing: number, color: string) {
  const icon = L.divIcon({
    className: '',
    html: `<div style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:10px solid ${color};transform:rotate(${bearing}deg);transform-origin:center 80%"></div>`,
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
  return L.marker([lat, lng], { icon });
}

function bearingBetween(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const dx = to.lng - from.lng;
  const dy = to.lat - from.lat;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

function TrajectoryLayerComponent({
  positions = [],
  mapConfig,
  trajectories,
  color = '#22d3ee',
  playerName,
  gradientByTime = false,
}: TrajectoryLayerProps) {
  const map = useMap();

  useEffect(() => {
    const layers: L.Layer[] = [];

    const drawTrajectory = (traj: TrajectoryData) => {
      if (traj.points.length < 2) return;

      const latLngs = traj.points.map((p) => [p.lat, p.lng] as [number, number]);
      const polyline = L.polyline(latLngs, {
        color: traj.color,
        weight: 2,
        opacity: gradientByTime ? 0.9 : 0.7,
        dashArray: gradientByTime ? undefined : '4, 8',
      });

      polyline.bindTooltip(`<strong>${traj.player}</strong>`);
      polyline.addTo(map);
      layers.push(polyline);

      if (traj.showArrow !== false) {
        const last = traj.points[traj.points.length - 1];
        const prev = traj.points[traj.points.length - 2];
        const bearing = bearingBetween(prev, last);
        const arrow = createArrowMarker(last.lat, last.lng, bearing, traj.color);
        arrow.addTo(map);
        layers.push(arrow);
      }
    };

    if (trajectories?.length) {
      trajectories.forEach(drawTrajectory);
    } else if (positions.length >= 2 && mapConfig) {
      const sorted = [...positions].sort((a, b) => a.tick - b.tick);
      const points = sorted.map((p) => {
        const [lat, lng] = gameToLeaflet(p.x, p.y, mapConfig);
        return { lat, lng };
      });

      drawTrajectory({
        player: playerName ?? 'Player',
        color,
        points,
        showArrow: true,
      });
    }

    return () => {
      layers.forEach((layer) => map.removeLayer(layer));
    };
  }, [map, positions, mapConfig, trajectories, color, playerName, gradientByTime]);

  return null;
}

export const TrajectoryLayer = memo(TrajectoryLayerComponent);
