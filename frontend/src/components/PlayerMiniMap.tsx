import { useMemo } from 'react';
import { getMapConfig } from '../utils/mapConfig';
import { gameToRadarPixel } from '../utils/mapCoordinates';
import { getGrenadeIconConfig } from '../utils/grenadeIcons';
import type { GrenadeData, HeatmapPoint } from '../types/match';
import { cn } from '../lib/cn';

interface TrajectoryLine {
  player: string;
  color: string;
  points: { x: number; y: number }[];
}

interface PlayerMiniMapProps {
  mapName: string;
  mode: 'heatmap' | 'grenades' | 'trajectory';
  heatmapPoints?: HeatmapPoint[];
  trajectories?: TrajectoryLine[];
  grenades?: GrenadeData[];
  id?: string;
  className?: string;
  height?: string;
}

export function PlayerMiniMap({
  mapName,
  mode,
  heatmapPoints = [],
  trajectories = [],
  grenades = [],
  id,
  className,
  height = 'h-[320px]',
}: PlayerMiniMapProps) {
  const mapConfig = getMapConfig(mapName);

  const hasContent = useMemo(() => {
    if (mode === 'heatmap') return heatmapPoints.length > 0;
    if (mode === 'grenades') return grenades.length > 0;
    return trajectories.some((t) => t.points.length > 1);
  }, [mode, heatmapPoints, grenades, trajectories]);

  const toPx = (x: number, y: number) => gameToRadarPixel(x, y, mapConfig);

  return (
    <div
      id={id}
      className={cn(
        'relative overflow-hidden rounded-xl border border-white/10 bg-[#05080d]',
        height,
        className,
      )}
    >
      <div className="radar-viewport h-full w-full">
        <div className="radar-stage mx-auto h-full max-h-full w-auto max-w-full">
          <img
            src={mapConfig.imageUrl}
            alt={mapConfig.displayName}
            className="radar-image h-full w-full object-contain"
            draggable={false}
          />

          <svg
            className="radar-svg-layer"
            viewBox={`0 0 ${mapConfig.radarSize} ${mapConfig.radarSize}`}
            preserveAspectRatio="none"
          >
            {mode === 'heatmap' &&
              heatmapPoints.map((p, i) => {
                const { x, y } = toPx(p.x, p.y);
                const r = 6 + p.density * 18;
                return (
                  <circle
                    key={`heat-${i}`}
                    cx={x}
                    cy={y}
                    r={r}
                    fill={`rgba(6,182,212,${0.1 + p.density * 0.4})`}
                  />
                );
              })}

            {mode === 'trajectory' &&
              trajectories.map((t, i) => {
                if (t.points.length < 2) return null;
                const d = t.points
                  .map((p, j) => {
                    const { x, y } = toPx(p.x, p.y);
                    return `${j === 0 ? 'M' : 'L'} ${x} ${y}`;
                  })
                  .join(' ');
                return (
                  <path
                    key={`traj-${t.player}-${i}`}
                    d={d}
                    fill="none"
                    stroke={t.color}
                    strokeWidth={2}
                    strokeOpacity={0.75}
                  />
                );
              })}

            {mode === 'grenades' &&
              grenades.map((g, i) => {
                const from = toPx(g.from_x, g.from_y);
                const to = toPx(g.to_x, g.to_y);
                const iconSrc = getGrenadeIconConfig(g.grenade_type).src;
                const iconSize = 16;
                return (
                  <g key={`g-${g.tick}-${i}`}>
                    <line
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      opacity={0.65}
                    />
                    <circle
                      cx={to.x}
                      cy={to.y}
                      r={iconSize * 0.55}
                      fill="rgba(0,0,0,0.72)"
                      stroke={`${getGrenadeIconConfig(g.grenade_type).color}88`}
                      strokeWidth={1}
                    />
                    <image
                      href={iconSrc}
                      x={to.x - iconSize / 2}
                      y={to.y - iconSize / 2}
                      width={iconSize}
                      height={iconSize}
                    />
                  </g>
                );
              })}
          </svg>
        </div>
      </div>

      {!hasContent && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50">
          <p className="rounded-lg bg-slate-900/90 px-4 py-2 text-sm text-slate-400">
            Нет данных для отображения
          </p>
        </div>
      )}
    </div>
  );
}
