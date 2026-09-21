import type { RoundHighlight } from '../utils/matchAnalytics';
import { cn } from '../lib/cn';

interface KeyRoundsStripProps {
  highlights: RoundHighlight[];
  selectedRound?: number | null;
  onReplayRound: (roundNumber: number, jumpTick?: number) => void;
  className?: string;
}

const TAG_COLORS: Record<string, string> = {
  ACE: 'bg-amber-500/20 text-amber-300 border-amber-400/40',
  Retake: 'bg-blue-500/20 text-blue-300 border-blue-400/40',
  'Eco Win': 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40',
  'Force Win': 'bg-violet-500/20 text-violet-300 border-violet-400/40',
};

function tagClass(tag: string): string {
  if (tag.startsWith('1v')) return 'bg-rose-500/20 text-rose-300 border-rose-400/40';
  return TAG_COLORS[tag] ?? 'bg-slate-500/20 text-slate-300 border-slate-400/40';
}

export function KeyRoundsStrip({
  highlights,
  selectedRound,
  onReplayRound,
  className,
}: KeyRoundsStripProps) {
  if (!highlights.length) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-black/40 px-4 py-3', className)}>
        <p className="text-sm text-slate-500">Ключевые раунды не найдены</p>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-white/10 bg-black/40 p-3', className)}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        Ключевые раунды
      </p>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        {highlights.map((item) => {
          const active = selectedRound === item.round_number;
          return (
            <button
              key={item.round_number}
              type="button"
              onClick={() => onReplayRound(item.round_number, item.jump_tick)}
              className={cn(
                'flex shrink-0 flex-col gap-1.5 rounded-xl border px-3 py-2 text-left transition-all',
                active
                  ? 'border-cyan-400/50 bg-cyan-500/10 ring-1 ring-cyan-400/30'
                  : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10',
              )}
            >
              <span className="font-mono text-xs font-bold text-white">R{item.round_number}</span>
              <div className="flex flex-wrap gap-1">
                {item.tags.map((tag) => (
                  <span
                    key={tag}
                    className={cn(
                      'rounded-md border px-1.5 py-0.5 text-[10px] font-semibold',
                      tagClass(tag),
                    )}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              {item.players.length > 0 && (
                <span className="max-w-[120px] truncate text-[10px] text-slate-400">
                  {item.players.join(', ')}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
