import { useMemo, useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { GrenadeData, GrenadeSpot } from '../types/match';
import { useMatchGrenades } from '../hooks/useMatch';
import { GrenadeFilters, GRENADE_TYPES } from './GrenadeFilters';
import { PlayerMiniMap } from './PlayerMiniMap';
import { classifyPointLabel } from '../utils/mapZones';
import { SkeletonLoader } from './SkeletonLoader';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

const PIE_COLORS: Record<string, string> = {
  smoke: '#94a3b8',
  flash: '#fbbf24',
  he: '#ef4444',
  molotov: '#f97316',
  incendiary: '#f97316',
  decoy: '#a78bfa',
};

interface PlayerGrenadesTabProps {
  matchId: string;
  playerName: string;
  mapName: string;
  grenadeSpots?: GrenadeSpot[];
  mapElementId?: string;
}

export function PlayerGrenadesTab({
  matchId,
  playerName,
  mapName,
  grenadeSpots = [],
  mapElementId = 'player-grenades-map',
}: PlayerGrenadesTabProps) {
  const [selectedTypes, setSelectedTypes] = useState<string[]>([
    'smoke', 'flash', 'he', 'molotov', 'incendiary', 'decoy',
  ]);

  const grenadeParams = useMemo(
    () => ({
      player_name: playerName,
      grenade_types: selectedTypes,
    }),
    [playerName, selectedTypes],
  );

  const {
    data: grenades = [],
    isLoading,
    error,
    refetch,
  } = useMatchGrenades(matchId, grenadeParams);

  const pieData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const g of grenades) {
      counts[g.grenade_type] = (counts[g.grenade_type] ?? 0) + 1;
    }
    return ['smoke', 'flash', 'he', 'molotov'].map((type) => ({
      name: type,
      value: counts[type] ?? 0,
    })).filter((d) => d.value > 0);
  }, [grenades]);

  const computedSpots = useMemo(() => {
    if (grenadeSpots.length > 0) {
      return grenadeSpots.map((s) => ({
        ...s,
        zone:
          s.to_x && s.to_y ? classifyPointLabel(mapName, s.to_x, s.to_y) : s.zone,
      }));
    }

    const spotMap = new Map<string, { zone: string; type: string; count: number }>();
    for (const g of grenades) {
      const zone = `(${Math.round(g.to_x)}, ${Math.round(g.to_y)})`;
      const key = `${g.grenade_type}-${zone}`;
      const existing = spotMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        spotMap.set(key, { zone, type: g.grenade_type, count: 1 });
      }
    }

    return Array.from(spotMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
      .map((s) => {
        const coords = s.zone.match(/\(([-\d.]+),\s*([-\d.]+)\)/);
        const to_x = coords ? parseFloat(coords[1]) : 0;
        const to_y = coords ? parseFloat(coords[2]) : 0;
        return {
          grenade_type: s.type,
          zone: to_x && to_y ? classifyPointLabel(mapName, to_x, to_y) : s.zone,
          frequency: s.count,
          to_x,
          to_y,
        };
      });
  }, [grenadeSpots, grenades, mapName]);

  const spotsByType = useMemo(() => {
    const grouped: Record<string, typeof computedSpots> = {};
    for (const spot of computedSpots) {
      if (!grouped[spot.grenade_type]) grouped[spot.grenade_type] = [];
      grouped[spot.grenade_type].push(spot);
    }
    return grouped;
  }, [computedSpots]);

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
      <ErrorState message="Не удалось загрузить данные о гранатах" onRetry={() => refetch()} />
    );
  }

  if (!grenades.length) {
    return <EmptyState variant="grenades" />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 md:col-span-2">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">Распределение гранат</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  label={({ name, percent }) =>
                    `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                  }
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #475569',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-slate-500">Нет данных для диаграммы</p>
          )}
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 flex flex-col justify-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">Всего гранат</p>
          <p className="font-mono text-4xl font-bold text-cyan-400">{grenades.length}</p>
          <div className="mt-3 space-y-1">
            {GRENADE_TYPES.slice(0, 4).map(({ id, label }) => {
              const count = grenades.filter((g) => g.grenade_type === id).length;
              return (
                <div key={id} className="flex justify-between text-sm">
                  <span className="text-slate-400">{label}</span>
                  <span className="font-mono text-slate-200">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <GrenadeFilters
        selectedTypes={selectedTypes}
        onTypesChange={setSelectedTypes}
        selectedTeam="all"
        onTeamChange={() => {}}
        selectedPlayer={playerName}
        onPlayerChange={() => {}}
        players={[playerName]}
        grenades={grenades}
        hidePlayerFilter
        hideTeamFilter
        layout="horizontal"
      />

      <PlayerMiniMap
        id={mapElementId}
        mapName={mapName}
        mode="grenades"
        grenades={grenades as GrenadeData[]}
        height="h-[360px]"
      />

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
        <h3 className="mb-4 text-sm font-semibold text-slate-200">Частые раскидки</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Object.entries(spotsByType).map(([type, spots]) => (
            <div key={type}>
              <h4
                className="mb-2 text-xs font-semibold uppercase tracking-wider"
                style={{ color: PIE_COLORS[type] ?? '#94a3b8' }}
              >
                {type}
              </h4>
              <ul className="space-y-2">
                {spots.slice(0, 3).map((spot, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded-lg bg-slate-900/50 px-3 py-2 text-sm"
                  >
                    <span className="text-slate-300">{spot.zone}</span>
                    <span className="font-mono text-cyan-400">{spot.frequency}×</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
