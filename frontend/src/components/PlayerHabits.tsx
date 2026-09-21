import { Bomb, MapPin, ShoppingCart, Zap } from 'lucide-react';
import type { PlayerHabitsData } from '../types/match';
import { SkeletonLoader } from './SkeletonLoader';
import { EmptyState } from './EmptyState';
import { cn } from '../lib/cn';

interface PlayerHabitsProps {
  habits: PlayerHabitsData | undefined;
  isLoading?: boolean;
  playerName: string;
  className?: string;
}

const GRENADE_COLORS: Record<string, string> = {
  smoke: '#94a3b8',
  flash: '#fbbf24',
  he: '#ef4444',
  molotov: '#f97316',
  incendiary: '#f97316',
  decoy: '#a78bfa',
};

export function PlayerHabits({ habits, isLoading, playerName, className }: PlayerHabitsProps) {
  if (isLoading) {
    return <SkeletonLoader variant="card" count={4} className={className} />;
  }

  if (!habits) {
    return (
      <EmptyState
        title="Нет данных о привычках"
        description={`Статистика для ${playerName} недоступна`}
        className={className}
      />
    );
  }

  const topPositions = habits.favorite_positions.slice(0, 3);
  const grenadeEntries = Object.entries(habits.grenade_preferences).sort(
    (a, b) => b[1] - a[1],
  );
  const totalGrenades = grenadeEntries.reduce((sum, [, v]) => sum + v, 0);
  const topLoadouts = habits.frequent_loadouts ??
    Object.entries(habits.purchase_pattern)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => name);

  const retreatPct = habits.flash_reaction.retreat_pct ?? 0;

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 animate-fade-in', className)}>
      <div className="glass-panel p-4">
        <div className="mb-3 flex items-center gap-2 text-cyan-400">
          <MapPin className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Любимые позиции</h3>
        </div>
        {topPositions.length > 0 ? (
          <ul className="space-y-3">
            {topPositions.map((pos, i) => (
              <li key={i}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-300">{pos.label ?? `Зона ${i + 1}`}</span>
                  <span className="font-mono text-cyan-400">{pos.frequency}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500"
                    style={{ width: `${pos.frequency}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Нет данных</p>
        )}
      </div>

      <div className="glass-panel p-4">
        <div className="mb-3 flex items-center gap-2 text-yellow-400">
          <Zap className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Реакция на флешки</h3>
        </div>
        <p className="font-mono text-2xl font-bold text-white">
          {habits.flash_reaction.avg_reaction_time_ms} мс
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Отступлений: <span className="font-mono text-yellow-400">{retreatPct}%</span>
        </p>
        <p className="text-xs text-slate-500">
          Ослеплён {habits.flash_reaction.blinded_count} раз
        </p>
      </div>

      <div className="glass-panel p-4">
        <div className="mb-3 flex items-center gap-2 text-orange-400">
          <Bomb className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Гранаты</h3>
        </div>
        {grenadeEntries.length > 0 ? (
          <ul className="space-y-2">
            {grenadeEntries.slice(0, 4).map(([type, count]) => {
              const pct = totalGrenades > 0 ? Math.round((count / totalGrenades) * 100) : 0;
              return (
                <li key={type} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-slate-300">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: GRENADE_COLORS[type] ?? '#94a3b8' }}
                    />
                    {type}
                  </span>
                  <span className="font-mono text-slate-400">{pct}%</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Нет данных</p>
        )}
      </div>

      <div className="glass-panel p-4">
        <div className="mb-3 flex items-center gap-2 text-violet-400">
          <ShoppingCart className="h-4 w-4" />
          <h3 className="text-sm font-semibold">Закупки</h3>
        </div>
        {topLoadouts.length > 0 ? (
          <ul className="space-y-2">
            {topLoadouts.map((loadout, i) => (
              <li key={i} className="text-sm text-slate-300">
                • {loadout}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Нет данных</p>
        )}
      </div>
    </div>
  );
}
