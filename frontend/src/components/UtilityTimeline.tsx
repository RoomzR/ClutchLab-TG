import { useMemo } from 'react';
import type { UtilityTimelineEvent } from '../utils/matchAnalytics';
import { GrenadeIcon } from './GrenadeIcon';
import { cn } from '../lib/cn';

interface UtilityTimelineProps {
  events: UtilityTimelineEvent[];
  tickStart: number;
  tickEnd: number;
  currentTick: number;
  onSeek: (tick: number) => void;
  className?: string;
}

const TEAM_COLORS = { CT: '#5eb6ff', T: '#ff8a3d' } as const;

export function UtilityTimeline({
  events,
  tickStart,
  tickEnd,
  currentTick,
  onSeek,
  className,
}: UtilityTimelineProps) {
  const range = Math.max(tickEnd - tickStart, 1);

  const markers = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        leftPct: Math.min(100, Math.max(0, ((event.tick - tickStart) / range) * 100)),
        past: event.tick <= currentTick,
      })),
    [events, tickStart, range, currentTick],
  );

  const playheadPct = Math.min(100, Math.max(0, ((currentTick - tickStart) / range) * 100));

  if (!events.length) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-black/50 px-4 py-3', className)}>
        <p className="text-xs text-slate-500">Нет гранат в этом раунде</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-white/10 bg-black/50 p-3', className)}>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Utility timeline
        </p>
        <span className="font-mono text-[10px] text-slate-500">{events.length} бросков</span>
      </div>

      <div className="relative h-14 rounded-lg bg-white/5">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/10" />

        <div
          className="absolute top-0 bottom-0 w-0.5 bg-cyan-400/80"
          style={{ left: `${playheadPct}%` }}
        />

        {markers.map((marker, i) => (
          <button
            key={`${marker.tick}-${marker.player_name}-${i}`}
            type="button"
            onClick={() => onSeek(marker.tick)}
            className={cn(
              'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-opacity',
              marker.past ? 'opacity-100' : 'opacity-45 hover:opacity-80',
            )}
            style={{ left: `${marker.leftPct}%` }}
            title={`${marker.player_name} · ${marker.grenade_type} · tick ${marker.tick}`}
          >
            <span
              className="flex flex-col items-center gap-0.5"
              style={{ color: TEAM_COLORS[marker.team] }}
            >
              <GrenadeIcon type={marker.grenade_type} size={14} withBackdrop />
              <span className="max-w-[48px] truncate text-[8px] font-medium text-slate-400">
                {marker.player_name.split(' ')[0]}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
