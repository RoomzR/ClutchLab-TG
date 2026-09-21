import { useMemo } from 'react';
import { RotateCcw } from 'lucide-react';
import type { GrenadeData } from '../types/match';
import { GRENADE_FILTER_TYPES } from '../utils/grenadeIcons';
import { GrenadeIcon } from './GrenadeIcon';
import { cn } from '../lib/cn';

export const GRENADE_TYPES = GRENADE_FILTER_TYPES;

export interface GrenadeFilterState {
  types: string[];
  team: 'CT' | 'T' | 'all';
  player: string;
}

interface GrenadeFiltersProps {
  selectedTypes: string[];
  onTypesChange: (types: string[]) => void;
  selectedTeam: 'CT' | 'T' | 'all';
  onTeamChange: (team: 'CT' | 'T' | 'all') => void;
  selectedPlayer: string;
  onPlayerChange: (player: string) => void;
  players: string[];
  grenades: GrenadeData[];
  onReset?: () => void;
  onFilterChange?: (filters: GrenadeFilterState) => void;
  hidePlayerFilter?: boolean;
  hideTeamFilter?: boolean;
  layout?: 'vertical' | 'horizontal';
  className?: string;
}

const ALL_TYPES = GRENADE_TYPES.map((t) => t.id);

export function GrenadeFilters({
  selectedTypes,
  onTypesChange,
  selectedTeam,
  onTeamChange,
  selectedPlayer,
  onPlayerChange,
  players,
  grenades,
  onReset,
  onFilterChange,
  hidePlayerFilter = false,
  hideTeamFilter = false,
  layout = 'vertical',
  className,
}: GrenadeFiltersProps) {
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const type of GRENADE_TYPES) {
      result[type.id] = grenades.filter((g) => g.grenade_type === type.id).length;
    }
    return result;
  }, [grenades]);

  const toggleType = (id: string) => {
    const next = selectedTypes.includes(id)
      ? selectedTypes.filter((t) => t !== id)
      : [...selectedTypes, id];
    onTypesChange(next);
    onFilterChange?.({ types: next, team: selectedTeam, player: selectedPlayer });
  };

  const handleTeamChange = (team: 'CT' | 'T' | 'all') => {
    onTeamChange(team);
    onFilterChange?.({ types: selectedTypes, team, player: selectedPlayer });
  };

  const handlePlayerChange = (player: string) => {
    onPlayerChange(player);
    onFilterChange?.({ types: selectedTypes, team: selectedTeam, player });
  };

  const handleReset = () => {
    onTypesChange(ALL_TYPES);
    onTeamChange('all');
    onPlayerChange('');
    onReset?.();
    onFilterChange?.({ types: ALL_TYPES, team: 'all', player: '' });
  };

  return (
    <div
      className={cn(
        'rounded-xl border border-slate-700 bg-slate-800 p-4',
        layout === 'horizontal' ? 'flex flex-wrap items-center gap-4' : 'space-y-4',
        className,
      )}
    >
      <div className={cn(layout === 'horizontal' ? 'flex flex-wrap items-center gap-2' : '')}>
        {layout === 'vertical' && (
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Тип гранаты
          </h4>
        )}
        <div className="flex flex-wrap gap-2">
          {GRENADE_TYPES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleType(id)}
              className={cn(
                'flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors',
                selectedTypes.includes(id)
                  ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
                  : 'border-slate-600 text-slate-300 hover:border-slate-500',
              )}
            >
              <GrenadeIcon type={id} size={16} withBackdrop />
              <span>{label}</span>
              <span className="font-mono text-xs text-slate-500">({counts[id] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      {!hideTeamFilter && (
        <div className={cn(layout === 'horizontal' ? '' : '')}>
          {layout === 'vertical' && (
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Команда
            </h4>
          )}
          <select
            value={selectedTeam}
            onChange={(e) => handleTeamChange(e.target.value as 'CT' | 'T' | 'all')}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="all">Все команды</option>
            <option value="CT">CT</option>
            <option value="T">T</option>
          </select>
        </div>
      )}

      {!hidePlayerFilter && (
        <div>
          {layout === 'vertical' && (
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Игрок
            </h4>
          )}
          <select
            value={selectedPlayer}
            onChange={(e) => handlePlayerChange(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
          >
            <option value="">Все игроки</option>
            {players.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="button"
        onClick={handleReset}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 px-3 py-2 text-sm text-slate-400 transition-colors hover:border-slate-500 hover:text-white"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Сбросить
      </button>
    </div>
  );
}
