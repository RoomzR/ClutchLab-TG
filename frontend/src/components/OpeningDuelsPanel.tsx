import type { OpeningDuelStat, TradeKillEvent } from '../utils/matchAnalytics';
import { cn } from '../lib/cn';

interface OpeningDuelsPanelProps {
  openingStats: OpeningDuelStat[];
  tradeKills: TradeKillEvent[];
  className?: string;
}

export function OpeningDuelsPanel({
  openingStats,
  tradeKills,
  className,
}: OpeningDuelsPanelProps) {
  if (!openingStats.length && !tradeKills.length) {
    return (
      <div className={cn('rounded-xl border border-white/10 bg-black/40 px-4 py-3', className)}>
        <p className="text-sm text-slate-500">Нет данных по дuel / trade</p>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4 lg:grid-cols-2', className)}>
      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Opening duels
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 text-xs text-slate-500">
                <th className="pb-2 pr-3 font-medium">Игрок</th>
                <th className="pb-2 pr-3 font-medium">W</th>
                <th className="pb-2 pr-3 font-medium">L</th>
                <th className="pb-2 pr-3 font-medium">%</th>
                <th className="pb-2 font-medium">Trade</th>
              </tr>
            </thead>
            <tbody>
              {openingStats.slice(0, 10).map((row) => {
                const pct =
                  row.openings > 0
                    ? Math.round((row.opening_kills / row.openings) * 100)
                    : 0;
                return (
                  <tr key={row.player_name} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          'font-medium',
                          row.team === 'CT' ? 'text-blue-300' : 'text-orange-300',
                        )}
                      >
                        {row.player_name}
                      </span>
                    </td>
                    <td className="py-2 pr-3 font-mono text-emerald-400">{row.opening_kills}</td>
                    <td className="py-2 pr-3 font-mono text-red-400">{row.opening_deaths}</td>
                    <td className="py-2 pr-3 font-mono text-slate-300">{pct}%</td>
                    <td className="py-2 font-mono text-slate-400">
                      {row.traded}/{row.traded_deaths}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
          Trade kills
        </p>
        <div className="max-h-48 space-y-2 overflow-y-auto scrollbar-thin">
          {tradeKills.slice(0, 20).map((trade, i) => (
            <div
              key={`${trade.tick}-${trade.trader}-${i}`}
              className="rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs"
            >
              <span className="font-mono text-slate-500">R{trade.round_number}</span>
              <span className="mx-2 text-slate-600">·</span>
              <span className="text-emerald-300">{trade.trader}</span>
              <span className="text-slate-500"> traded </span>
              <span className="text-red-300">{trade.traded_killer}</span>
              <span className="text-slate-500"> for </span>
              <span className="text-slate-300">{trade.original_victim}</span>
            </div>
          ))}
          {tradeKills.length === 0 && (
            <p className="text-sm text-slate-500">Trade kills не найдены</p>
          )}
        </div>
      </div>
    </div>
  );
}
