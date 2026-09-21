import { useMemo } from 'react';
import type { GrenadeData, KillData, TickData } from '../../types/match';
import type { MapConfig } from '../../utils/mapConfig';
import { gameToRadarPercent } from '../../utils/mapCoordinates';
import {
  buildPlayerTracks,
  interpolatePositionsAtTick,
} from '../../utils/positionInterpolation';
import { getActiveGrenadesAtTick } from '../../utils/grenadeReplay';
import { getDeadPlayersAtTick, type RoundTickRange } from '../../utils/roundStats';
import { cn } from '../../lib/cn';

interface MiniMapProps {
  mapConfig: MapConfig;
  positions: TickData[];
  grenades: GrenadeData[];
  kills: KillData[];
  currentTick: number;
  roundTickRanges: RoundTickRange[];
  selectedRound: number | null;
  followPlayer: string | null;
  className?: string;
}

export function MiniMap({
  mapConfig,
  positions,
  grenades,
  kills,
  currentTick,
  roundTickRanges,
  selectedRound,
  followPlayer,
  className,
}: MiniMapProps) {
  const tracks = useMemo(() => buildPlayerTracks(positions), [positions]);
  const live = useMemo(
    () => interpolatePositionsAtTick(tracks, currentTick),
    [tracks, currentTick],
  );
  const dead = useMemo(
    () => getDeadPlayersAtTick(currentTick, kills, roundTickRanges, selectedRound),
    [currentTick, kills, roundTickRanges, selectedRound],
  );
  const activeNades = useMemo(
    () => getActiveGrenadesAtTick(grenades, currentTick).slice(0, 24),
    [grenades, currentTick],
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute bottom-[100px] right-3 z-30 h-[132px] w-[132px] overflow-hidden rounded-sm border border-white/20 bg-black/80 shadow-xl',
        className,
      )}
    >
      <img
        src={mapConfig.imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-90"
        draggable={false}
      />
      {activeNades.map((g) => {
        const pct = gameToRadarPercent(g.to_x, g.to_y, mapConfig);
        return (
          <span
            key={`${g.tick}-${g.player_name}-${g.grenade_type}`}
            className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/90"
            style={{ left: `${pct.left}%`, top: `${pct.top}%` }}
          />
        );
      })}
      {live.map((p) => {
        const pct = gameToRadarPercent(p.x, p.y, mapConfig);
        const isDead = dead.has(p.player_name);
        const isFollow = followPlayer === p.player_name;
        return (
          <span
            key={p.player_name}
            className={cn(
              'absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-black/50',
              p.team === 'CT' ? 'bg-sky-400' : 'bg-orange-400',
              isDead && 'opacity-25',
              isFollow && 'h-3.5 w-3.5 ring-2 ring-amber-300',
            )}
            style={{ left: `${pct.left}%`, top: `${pct.top}%` }}
          />
        );
      })}
    </div>
  );
}
