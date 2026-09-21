import { Clock, Trophy } from 'lucide-react';
import type { RoundData } from '../types/match';
import { formatTime } from '../utils/formatTime';
import { cn } from '../lib/cn';

interface RoundTimelineProps {
  rounds: RoundData[];
  selectedRound?: number | null;
  selectedRounds?: number[];
  roundTags?: Map<number, string[]>;
  onRoundSelect?: (roundNumber: number | null) => void;
  onReplayRound?: (roundNumber: number, jumpTick?: number) => void;
  className?: string;
}

const WIN_TYPE_LABELS: Record<string, string> = {
  elimination: 'Уничтожение',
  bomb_defused: 'Разминирование',
  bomb_exploded: 'Взрыв бомбы',
  time: 'Время',
  surrender: 'Сдача',
};

const TAG_COLORS: Record<string, string> = {
  ACE: 'bg-amber-500/20 text-amber-300',
  Retake: 'bg-blue-500/20 text-blue-300',
  'Eco Win': 'bg-emerald-500/20 text-emerald-300',
  'Force Win': 'bg-violet-500/20 text-violet-300',
};

function tagClass(tag: string): string {
  if (tag.startsWith('1v')) return 'bg-rose-500/20 text-rose-300';
  return TAG_COLORS[tag] ?? 'bg-slate-500/20 text-slate-300';
}

export function RoundTimeline({
  rounds,
  selectedRound,
  selectedRounds = [],
  roundTags,
  onRoundSelect,
  onReplayRound,
  className,
}: RoundTimelineProps) {
  if (!rounds.length) {
    return (
      <div className="glass-panel p-10 text-center text-slate-400">
        Данные о раундах отсутствуют
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {rounds.map((round) => {
        const isSelected =
          selectedRound === round.round_number ||
          selectedRounds.includes(round.round_number);
        const isCT = round.winner === 'CT';

        const tags = roundTags?.get(round.round_number) ?? [];

        return (
          <button
            key={round.round_number}
            type="button"
            onClick={() => {
              if (onReplayRound) {
                onReplayRound(round.round_number, round.start_tick ?? undefined);
                return;
              }
              onRoundSelect?.(isSelected ? null : round.round_number);
            }}
            className={cn(
              'flex w-full items-stretch gap-0 rounded-2xl border text-left transition-all animate-fade-in',
              isSelected
                ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30'
                : 'border-white/10 bg-slate-900/40 hover:border-white/20 hover:bg-slate-900/60',
            )}
          >
            <div
              className={cn(
                'w-1.5 shrink-0 rounded-l-xl',
                isCT ? 'bg-blue-500' : 'bg-orange-500',
              )}
            />

            <div className="flex flex-1 items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-4">
                <span className="font-mono text-lg font-bold text-white">
                  #{round.round_number}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy
                      className={cn(
                        'h-4 w-4',
                        isCT ? 'text-blue-400' : 'text-orange-400',
                      )}
                    />
                    <span
                      className={cn(
                        'text-sm font-medium',
                        isCT ? 'text-blue-400' : 'text-orange-400',
                      )}
                    >
                      {round.winner} — {WIN_TYPE_LABELS[round.win_type] ?? round.win_type}
                    </span>
                  </div>
                  {tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {tags.map((tag) => (
                        <span
                          key={tag}
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-semibold',
                            tagClass(tag),
                          )}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                <span className="font-mono text-sm">
                  {formatTime(round.duration_seconds)}
                </span>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
