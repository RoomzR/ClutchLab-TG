import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { GrenadeData } from '../types/match';
import { getMapConfig } from '../utils/mapConfig';
import { gameToRadarPixel } from '../utils/mapCoordinates';
import { getGrenadeIconConfig } from '../utils/grenadeIcons';
import { GrenadeIcon } from './GrenadeIcon';
import { cn } from '../lib/cn';

export interface UtilityLabThrow extends GrenadeData {
  count?: number;
  match_count?: number;
}

interface UtilityLabRadarProps {
  mapName: string;
  averages: UtilityLabThrow[];
  throws?: UtilityLabThrow[];
  showAllThrows?: boolean;
  className?: string;
}

const TEAM_COLORS = { CT: '#5eb6ff', T: '#ff8a3d' } as const;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

/**
 * ESL-style utility radar: average lines always visible, throws animate in a loop.
 */
function UtilityLabRadarComponent({
  mapName,
  averages,
  throws = [],
  showAllThrows = false,
  className,
}: UtilityLabRadarProps) {
  const mapConfig = getMapConfig(mapName);
  const [playing, setPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const rafRef = useRef<number | null>(null);
  const lastRef = useRef<number | null>(null);

  const lines = useMemo(
    () => (showAllThrows && throws.length ? throws : averages),
    [averages, throws, showAllThrows],
  );

  useEffect(() => {
    if (!playing || lines.length === 0) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
      return;
    }

    const cycleMs = 4200 / speed;
    const tick = (now: number) => {
      if (lastRef.current == null) lastRef.current = now;
      const dt = now - lastRef.current;
      lastRef.current = now;
      setProgress((p) => (p + dt / cycleMs) % 1);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playing, speed, lines.length]);

  const toPx = (x: number, y: number) => gameToRadarPixel(x, y, mapConfig);

  // Stagger each average throw across the cycle so they "fire" in sequence.
  const animated = useMemo(() => {
    if (!averages.length) return [];
    return averages.map((g, i) => {
      const slot = averages.length <= 1 ? 0 : i / averages.length;
      // Local 0..1 for this throw: brief flight then linger on land.
      const local = (progress - slot + 1) % 1;
      const flightEnd = 0.35;
      const phase =
        local < flightEnd ? ('flight' as const) : local < 0.85 ? ('landed' as const) : ('idle' as const);
      const flightT = phase === 'flight' ? clamp01(local / flightEnd) : 1;
      const arc = Math.sin(flightT * Math.PI) * 40;
      const x = lerp(g.from_x, g.to_x, flightT);
      const y = lerp(g.from_y, g.to_y, flightT);
      const z = lerp(g.from_z ?? 0, g.to_z ?? 0, flightT) + (phase === 'flight' ? arc : 0);
      return { g, phase, flightT, x, y, z, active: phase !== 'idle' };
    });
  }, [averages, progress]);

  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/10 bg-[#05080d] shadow-[0_20px_80px_rgba(0,0,0,0.55)]',
        className,
      )}
    >
      <div className="absolute left-3 top-3 z-[20] rounded-lg border border-white/10 bg-black/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-300">
        Average utilities · {averages.length} spots
      </div>

      <div className="radar-viewport h-[min(78vh,820px)] min-h-[520px] w-full">
        <div className="radar-stage" style={{ transform: 'none' }}>
          <img
            src={mapConfig.imageUrl}
            alt={mapConfig.displayName}
            className="radar-image pointer-events-none select-none"
            draggable={false}
          />

          <svg
            className="radar-svg-layer"
            viewBox={`0 0 ${mapConfig.radarSize} ${mapConfig.radarSize}`}
            preserveAspectRatio="none"
          >
            {lines.map((g, i) => {
              const from = toPx(g.from_x, g.from_y);
              const to = toPx(g.to_x, g.to_y);
              const style = getGrenadeIconConfig(g.grenade_type);
              const isAvg = !showAllThrows;
              return (
                <g key={`line-${i}-${g.grenade_type}`}>
                  <line
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    stroke={style.radarStroke}
                    strokeWidth={isAvg ? 2.2 : 1.1}
                    strokeDasharray={isAvg ? '6 5' : '4 6'}
                    opacity={isAvg ? 0.55 : 0.22}
                  />
                  <circle
                    cx={from.x}
                    cy={from.y}
                    r={isAvg ? 4 : 2.5}
                    fill={TEAM_COLORS[g.team] ?? '#94a3b8'}
                    opacity={0.7}
                  />
                  <circle
                    cx={to.x}
                    cy={to.y}
                    r={isAvg ? 7 : 4}
                    fill={style.radarFill}
                    stroke={style.radarStroke}
                    strokeWidth={1.5}
                    opacity={isAvg ? 0.75 : 0.35}
                  />
                </g>
              );
            })}

            {animated.map(({ g, phase, x, y, active }, i) => {
              if (!active || phase === 'idle') return null;
              const p = toPx(x, y);
              const style = getGrenadeIconConfig(g.grenade_type);
              if (phase === 'landed') {
                return (
                  <circle
                    key={`pulse-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={18 + (g.count ?? 1) * 2}
                    fill={style.radarFill}
                    stroke={style.radarStroke}
                    strokeWidth={2}
                    opacity={0.45}
                  >
                    <animate attributeName="r" values="14;28;14" dur="1.4s" repeatCount="indefinite" />
                    <animate attributeName="opacity" values="0.55;0.15;0.55" dur="1.4s" repeatCount="indefinite" />
                  </circle>
                );
              }
              return (
                <circle
                  key={`fly-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={6}
                  fill={style.radarStroke}
                  stroke="#fff"
                  strokeWidth={1.5}
                />
              );
            })}
          </svg>

          {animated.map(({ g, phase, x, y, active }, i) => {
            if (!active) return null;
            const p = toPx(x, y);
            return (
              <div
                key={`icon-${i}`}
                className="radar-grenade-icon pointer-events-none"
                style={{
                  left: `${(p.x / mapConfig.radarSize) * 100}%`,
                  top: `${(p.y / mapConfig.radarSize) * 100}%`,
                }}
              >
                <GrenadeIcon type={g.grenade_type} size={13} withBackdrop />
                {phase === 'landed' && g.count != null && (
                  <span className="radar-grenade-timer">{g.count}×</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-white/10 bg-black/55 px-4 py-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/5 text-white hover:bg-white/10"
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={progress}
          onChange={(e) => {
            setPlaying(false);
            setProgress(Number(e.target.value));
          }}
          className="min-w-[160px] flex-1 accent-cyan-400"
        />
        <div className="flex gap-1">
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                'rounded-md px-2 py-1 text-[11px] font-semibold',
                speed === s ? 'bg-cyan-500/25 text-cyan-200' : 'text-slate-400 hover:text-white',
              )}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const UtilityLabRadar = memo(UtilityLabRadarComponent);
