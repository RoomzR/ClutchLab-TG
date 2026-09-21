import { Layers } from 'lucide-react';
import { cn } from '../lib/cn';

export type MapTeamFilter = 'all' | 'CT' | 'T';

export interface MapLayerState {
  showRadar: boolean;
  showPlayers: boolean;
  showNames: boolean;
  showViewCones: boolean;
  showTrajectories: boolean;
  showUtilities: boolean;
  showUtilityLines: boolean;
  showKillLines: boolean;
  showBomb: boolean;
  smokeOnly: boolean;
}

export const DEFAULT_MAP_LAYERS: MapLayerState = {
  showRadar: true,
  showPlayers: true,
  showNames: true,
  showViewCones: true,
  showTrajectories: true,
  showUtilities: true,
  showUtilityLines: true,
  showKillLines: true,
  showBomb: true,
  smokeOnly: false,
};

interface MapLayerControlsProps {
  layers: MapLayerState;
  onChange: (next: MapLayerState) => void;
  teamFilter: MapTeamFilter;
  onTeamFilterChange: (value: MapTeamFilter) => void;
  trajectoryPlayer: string | null;
  onTrajectoryPlayerChange: (value: string | null) => void;
  players: string[];
  className?: string;
  compact?: boolean;
}

const LAYER_TOGGLES: { key: keyof MapLayerState; label: string }[] = [
  { key: 'showRadar', label: 'Radar Background' },
  { key: 'showPlayers', label: 'Players' },
  { key: 'showNames', label: 'Player Names' },
  { key: 'showViewCones', label: 'View Cones' },
  { key: 'showTrajectories', label: 'Movement Trails' },
  { key: 'showUtilities', label: 'Utilities' },
  { key: 'showUtilityLines', label: 'Utility Source Lines' },
  { key: 'showKillLines', label: 'Kill Lines' },
  { key: 'showBomb', label: 'Bomb' },
  { key: 'smokeOnly', label: 'Smokes Only' },
];

export function MapLayerControls({
  layers,
  onChange,
  teamFilter,
  onTeamFilterChange,
  trajectoryPlayer,
  onTrajectoryPlayerChange,
  players,
  className,
  compact = false,
}: MapLayerControlsProps) {
  const toggle = (key: keyof MapLayerState) => {
    onChange({ ...layers, [key]: !layers[key] });
  };

  return (
    <div
      className={cn(
        'glass-panel flex flex-col gap-3 p-3',
        compact ? 'w-full' : 'min-w-[220px]',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <Layers className="h-3.5 w-3.5 text-cyan-400" />
        Layers
      </div>

      <div className="flex rounded-lg border border-white/10 p-0.5">
        {(['all', 'CT', 'T'] as const).map((team) => (
          <button
            key={team}
            type="button"
            onClick={() => onTeamFilterChange(team)}
            className={cn(
              'flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
              teamFilter === team
                ? team === 'CT'
                  ? 'bg-blue-500/25 text-blue-300'
                  : team === 'T'
                    ? 'bg-orange-500/25 text-orange-300'
                    : 'bg-cyan-500/20 text-cyan-300'
                : 'text-slate-400 hover:text-white',
            )}
          >
            {team === 'all' ? 'All' : team}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {LAYER_TOGGLES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={cn(
              'flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors',
              layers[key]
                ? 'bg-white/8 text-white'
                : 'text-slate-500 hover:bg-white/5 hover:text-slate-300',
            )}
          >
            <span>{label}</span>
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                layers[key] ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' : 'bg-slate-700',
              )}
            />
          </button>
        ))}
      </div>

      {layers.showTrajectories && players.length > 0 && (
        <select
          value={trajectoryPlayer ?? ''}
          onChange={(e) => onTrajectoryPlayerChange(e.target.value || null)}
          className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-white"
        >
          <option value="">All selected</option>
          {players.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
