import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DuelRecord, PlayerStats } from '../types/match';
import { SkeletonLoader } from './SkeletonLoader';
import { EmptyState } from './EmptyState';
import { cn } from '../lib/cn';

type SortKey = 'opponent' | 'kills' | 'deaths' | 'diff';
type SortDir = 'asc' | 'desc';

interface PlayerDuelsTabProps {
  duels: DuelRecord[];
  stats: PlayerStats;
  isLoading?: boolean;
}

export function PlayerDuelsTab({ duels, stats, isLoading }: PlayerDuelsTabProps) {
  const [sortKey, setSortKey] = useState<SortKey>('diff');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const enrichedDuels = useMemo(
    () =>
      duels.map((d) => ({
        ...d,
        diff: d.kills - d.deaths,
      })),
    [duels],
  );

  const sortedDuels = useMemo(() => {
    return [...enrichedDuels].sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortKey === 'opponent') {
        return mul * a.opponent.localeCompare(b.opponent);
      }
      return mul * (a[sortKey] - b[sortKey]);
    });
  }, [enrichedDuels, sortKey, sortDir]);

  const weaponChartData = useMemo(() => {
    if (!stats.weapon_kills) return [];
    return Object.entries(stats.weapon_kills)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, kills]) => ({ name, kills }));
  }, [stats.weapon_kills]);

  const kdRatio =
    stats.deaths > 0 ? (stats.kills / stats.deaths).toFixed(2) : stats.kills.toFixed(2);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortHeader = ({ label, col }: { label: string; col: SortKey }) => (
    <th
      className="cursor-pointer px-4 py-3 text-left font-medium text-slate-400 hover:text-white"
      onClick={() => handleSort(col)}
    >
      {label}
      {sortKey === col && (sortDir === 'asc' ? ' ↑' : ' ↓')}
    </th>
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <SkeletonLoader variant="card" count={3} />
        <SkeletonLoader variant="table" count={5} />
      </div>
    );
  }

  if (!duels.length) {
    return <EmptyState variant="kills" title="Нет данных о дуэлях" />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">Убийств</p>
          <p className="font-mono text-3xl font-bold text-green-400">{stats.kills}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">Смертей</p>
          <p className="font-mono text-3xl font-bold text-red-400">{stats.deaths}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-center">
          <p className="text-xs uppercase tracking-wider text-slate-400">K/D</p>
          <p className="font-mono text-3xl font-bold text-cyan-400">{kdRatio}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/50">
              <SortHeader label="Противник" col="opponent" />
              <SortHeader label="Убийств" col="kills" />
              <SortHeader label="Смертей" col="deaths" />
              <SortHeader label="Разница" col="diff" />
            </tr>
          </thead>
          <tbody>
            {sortedDuels.map((duel) => (
              <tr
                key={duel.opponent}
                className="border-b border-slate-700/50 hover:bg-slate-700/30"
              >
                <td className="px-4 py-2.5 text-slate-200">{duel.opponent}</td>
                <td className="px-4 py-2.5 font-mono text-green-400">{duel.kills}</td>
                <td className="px-4 py-2.5 font-mono text-red-400">{duel.deaths}</td>
                <td
                  className={cn(
                    'px-4 py-2.5 font-mono font-semibold',
                    duel.diff > 0 ? 'text-green-400' : duel.diff < 0 ? 'text-red-400' : 'text-slate-400',
                  )}
                >
                  {duel.diff > 0 ? '+' : ''}
                  {duel.diff}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {weaponChartData.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <h3 className="mb-4 text-sm font-semibold text-slate-200">
            Любимое оружие — {stats.favorite_weapon}
          </h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weaponChartData} layout="vertical" margin={{ left: 80 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                width={75}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                  borderRadius: '8px',
                }}
              />
              <Bar dataKey="kills" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
