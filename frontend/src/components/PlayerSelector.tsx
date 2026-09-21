import { Link } from 'react-router-dom';
import { ChevronRight, Shield } from 'lucide-react';
import type { Player } from '../types/match';
import { EmptyState } from './EmptyState';
import { cn } from '../lib/cn';

interface PlayerSelectorProps {
  matchId: string;
  players: Player[];
  selectedPlayer?: string;
  onTogglePlayer?: (name: string) => void;
  multiSelect?: boolean;
  selectedPlayers?: string[];
  className?: string;
}

export function PlayerSelector({
  matchId,
  players,
  selectedPlayer,
  onTogglePlayer,
  multiSelect = false,
  selectedPlayers = [],
  className,
}: PlayerSelectorProps) {
  if (players.length === 0) {
    return (
      <EmptyState
        variant="default"
        title="Нет игроков"
        description="Список игроков пуст"
        className="p-6"
      />
    );
  }

  const ctPlayers = players.filter((p) => p.team === 'CT');
  const tPlayers = players.filter((p) => p.team === 'T');

  const renderPlayer = (player: Player) => {
    const isSelected = multiSelect
      ? selectedPlayers.includes(player.name)
      : selectedPlayer === player.name;

    const isCT = player.team === 'CT';
    const teamBg = isCT ? 'bg-blue-500/15' : 'bg-orange-500/15';
    const teamBorder = isCT ? 'border-blue-400/30' : 'border-orange-400/30';
    const teamRing = isCT ? 'ring-blue-400/20' : 'ring-orange-400/20';

    const content = (
      <>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold',
            isCT ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300',
          )}
        >
          {player.name.slice(0, 2).toUpperCase()}
        </div>
        <span className="min-w-0 flex-1 truncate font-medium">{player.name}</span>
        {!multiSelect && <ChevronRight className="h-4 w-4 shrink-0 opacity-40" />}
      </>
    );

    if (multiSelect && onTogglePlayer) {
      return (
        <button
          key={player.name}
          type="button"
          onClick={() => onTogglePlayer(player.name)}
          className={cn(
            'flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-all',
            isSelected
              ? `${teamBg} ${teamBorder} text-white ring-1 ${teamRing}`
              : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5',
          )}
        >
          {content}
        </button>
      );
    }

    return (
      <Link
        key={player.name}
        to={`/match/${matchId}/player/${encodeURIComponent(player.name)}`}
        className={cn(
          'group flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all',
          isSelected
            ? `${teamBg} ${teamBorder} text-white ring-1 ${teamRing}`
            : 'border-transparent text-slate-300 hover:border-white/10 hover:bg-white/5 hover:text-white',
        )}
      >
        {content}
      </Link>
    );
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
          <Shield className="h-3.5 w-3.5" />
          CT · {ctPlayers.length}
        </h3>
        <div className="space-y-1">{ctPlayers.map(renderPlayer)}</div>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-orange-400">
          T · {tPlayers.length}
        </h3>
        <div className="space-y-1">{tPlayers.map(renderPlayer)}</div>
      </div>
    </div>
  );
}
