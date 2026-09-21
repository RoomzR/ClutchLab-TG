import { useMemo, useState } from 'react';
import type { PlayerHabitsData, RoundData, TickData } from '../types/match';
import { useMatchHeatmap, useMatchPositions } from '../hooks/useMatch';
import { PlayerMiniMap } from './PlayerMiniMap';
import { RoundTimeline } from './RoundTimeline';
import { SkeletonLoader } from './SkeletonLoader';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';
import { classifyPointLabel } from '../utils/mapZones';
import { cn } from '../lib/cn';

interface PlayerPositionsTabProps {
  matchId: string;
  playerName: string;
  mapName: string;
  habits?: PlayerHabitsData;
  rounds: RoundData[];
  playerTeam: 'CT' | 'T';
  mapElementId?: string;
}

type SideFilter = 'all' | 'CT' | 'T';

export function PlayerPositionsTab({
  matchId,
  playerName,
  mapName,
  habits,
  rounds,
  playerTeam,
  mapElementId = 'player-positions-map',
}: PlayerPositionsTabProps) {
  const [sideFilter, setSideFilter] = useState<SideFilter>('all');
  const [showTrajectories, setShowTrajectories] = useState(false);
  const [selectedRounds, setSelectedRounds] = useState<number[]>([]);

  const positionParams = useMemo(
    () => ({
      player_names: [playerName],
      round_numbers: selectedRounds.length > 0 ? selectedRounds : undefined,
      team: sideFilter === 'all' ? undefined : sideFilter,
    }),
    [playerName, selectedRounds, sideFilter],
  );

  const heatmapParams = useMemo(
    () => ({
      round_numbers: selectedRounds.length > 0 ? selectedRounds : undefined,
    }),
    [selectedRounds],
  );

  const {
    data: positions = [],
    isLoading: positionsLoading,
    error: positionsError,
    refetch: refetchPositions,
  } = useMatchPositions(matchId, positionParams);

  const {
    data: heatmapRaw = [],
    isLoading: heatmapLoading,
    error: heatmapError,
    refetch: refetchHeatmap,
  } = useMatchHeatmap(matchId, playerName, heatmapParams);

  const trajectories = useMemo(() => {
    if (!showTrajectories || !positions.length) return [];

    const byRound = new Map<number, TickData[]>();
    for (const pos of positions) {
      const list = byRound.get(pos.round_number) ?? [];
      list.push(pos);
      byRound.set(pos.round_number, list);
    }

    const color = playerTeam === 'CT' ? '#3b82f6' : '#f97316';

    return Array.from(byRound.entries()).map(([round, ticks]) => ({
      player: `${playerName} (R${round})`,
      color,
      points: [...ticks]
        .sort((a, b) => a.tick - b.tick)
        .map((t) => ({ x: t.x, y: t.y })),
    }));
  }, [showTrajectories, positions, playerName, playerTeam]);

  const favoritePositions = useMemo(
    () =>
      (habits?.favorite_positions.slice(0, 5) ?? []).map((pos) => ({
        ...pos,
        label: classifyPointLabel(mapName, pos.x, pos.y),
      })),
    [habits?.favorite_positions, mapName],
  );

  const toggleRound = (roundNumber: number | null) => {
    if (roundNumber === null) {
      setSelectedRounds([]);
      return;
    }
    setSelectedRounds((prev) =>
      prev.includes(roundNumber)
        ? prev.filter((r) => r !== roundNumber)
        : [...prev, roundNumber],
    );
  };

  const isLoading = positionsLoading || heatmapLoading;
  const error = positionsError ?? heatmapError;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLoader variant="card" count={2} />
        <SkeletonLoader variant="chart" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        message="Не удалось загрузить данные о позициях"
        onRetry={() => {
          refetchPositions();
          refetchHeatmap();
        }}
      />
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-400">Сторона:</span>
        {(['all', 'CT', 'T'] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setSideFilter(side)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm transition-colors',
              sideFilter === side
                ? side === 'CT'
                  ? 'bg-blue-500/20 text-blue-400'
                  : side === 'T'
                    ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-cyan-500/20 text-cyan-400'
                : 'bg-slate-800 text-slate-400 hover:text-white',
            )}
          >
            {side === 'all' ? 'Все' : side}
          </button>
        ))}

        <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            checked={showTrajectories}
            onChange={(e) => setShowTrajectories(e.target.checked)}
            className="rounded border-slate-600 bg-slate-900 text-cyan-500 focus:ring-cyan-500"
          />
          Показать траектории
        </label>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {heatmapRaw.length > 0 || showTrajectories ? (
            <PlayerMiniMap
              id={mapElementId}
              mapName={mapName}
              mode={showTrajectories ? 'trajectory' : 'heatmap'}
              heatmapPoints={heatmapRaw}
              trajectories={trajectories}
              height="h-[360px] md:h-[420px]"
            />
          ) : (
            <EmptyState variant="positions" />
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
            <h3 className="mb-4 text-sm font-semibold text-slate-200">Любимые позиции</h3>
            {favoritePositions.length > 0 ? (
              <ul className="space-y-4">
                {favoritePositions.map((pos, i) => (
                  <li key={i}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="text-slate-300">{pos.label ?? `Зона ${i + 1}`}</span>
                      <span className="font-mono text-cyan-400">{pos.frequency}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-700">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                        style={{ width: `${Math.min(100, pos.frequency)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">Нет данных о позициях</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Фильтр раундов
            </h3>
            <div className="max-h-64 overflow-y-auto scrollbar-thin">
              <RoundTimeline
                rounds={rounds}
                selectedRounds={selectedRounds}
                onRoundSelect={toggleRound}
              />
            </div>
            {selectedRounds.length > 1 && (
              <p className="mt-2 text-xs text-cyan-400">
                Выбрано раундов: {selectedRounds.sort((a, b) => a - b).join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
