import { useMemo } from 'react';
import { DollarSign, TrendingDown } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { MatchEconomySummary, BuyType } from '../utils/matchEconomy';
import { buyTypeLabel, economyForRound } from '../utils/matchEconomy';
import { EmptyState } from './EmptyState';
import { cn } from '../lib/cn';

interface MatchEconomyPanelProps {
  economy: MatchEconomySummary | null;
  selectedRound?: number | null;
  teamTName?: string;
  teamCtName?: string;
  isLoading?: boolean;
  className?: string;
}

const BUY_COLORS: Record<BuyType, string> = {
  none: '#475569',
  eco: '#eab308',
  force: '#a855f7',
  full: '#06b6d4',
};

const BUY_VALUES: Record<BuyType, number> = {
  none: 0,
  eco: 1,
  force: 2,
  full: 3,
};

function buyTypePill(type: BuyType): string {
  switch (type) {
    case 'eco':
      return 'bg-yellow-500/20 text-yellow-300';
    case 'force':
      return 'bg-violet-500/20 text-violet-300';
    case 'full':
      return 'bg-cyan-500/20 text-cyan-300';
    default:
      return 'bg-slate-500/20 text-slate-400';
  }
}

export function MatchEconomyPanel({
  economy,
  selectedRound = null,
  teamTName = 'T',
  teamCtName = 'CT',
  isLoading,
  className,
}: MatchEconomyPanelProps) {
  const chartData = useMemo(() => {
    if (!economy) return [];
    const rounds = [...new Set(economy.rounds.map((r) => r.round_number))].sort(
      (a, b) => a - b,
    );
    return rounds.map((round) => {
      const { ct, t } = economyForRound(economy, round);
      return {
        round,
        t_buy: BUY_VALUES[t?.buy_type ?? 'none'],
        ct_buy: BUY_VALUES[ct?.buy_type ?? 'none'],
        t_avg: t?.avg_equip ?? 0,
        ct_avg: ct?.avg_equip ?? 0,
        t_bonus: t?.loss_bonus ?? 0,
        ct_bonus: ct?.loss_bonus ?? 0,
        t_type: t?.buy_type ?? 'none',
        ct_type: ct?.buy_type ?? 'none',
      };
    });
  }, [economy]);

  if (isLoading) {
    return (
      <div className={cn('glass-panel h-48 animate-pulse rounded-xl', className)} />
    );
  }

  if (!economy || !economy.rounds.some((r) => r.total_spend > 0)) {
    return (
      <EmptyState
        variant="purchases"
        title="Экономика недоступна"
        description="Покупки не найдены в этой демке. Перезагрузите файл после обновления парсера."
        className={className}
      />
    );
  }

  const selectedEconomy =
    selectedRound && selectedRound > 0 ? economyForRound(economy, selectedRound) : null;

  return (
    <div className={cn('space-y-4 animate-fade-in', className)}>
      <div className="glass-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
            <DollarSign className="h-4 w-4 text-emerald-400" />
            Экономика по раундам
          </h3>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span>
              {teamTName}: avg ${economy.avg_equip_t}
            </span>
            <span>
              {teamCtName}: avg ${economy.avg_equip_ct}
            </span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 5, right: 8, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="round"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => `R${v}`}
            />
            <YAxis
              domain={[0, 3]}
              ticks={[0, 1, 2, 3]}
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              tickFormatter={(v) => ['—', 'Eco', 'Force', 'Full'][v] ?? ''}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: '#f1f5f9',
              }}
              labelFormatter={(round) => `Раунд ${round}`}
              formatter={(_value, name, item) => {
                const row = item.payload as (typeof chartData)[number];
                if (name === teamTName) {
                  return [
                    `${buyTypeLabel(row.t_type)} · $${row.t_avg} · bonus $${row.t_bonus}`,
                    teamTName,
                  ];
                }
                return [
                  `${buyTypeLabel(row.ct_type)} · $${row.ct_avg} · bonus $${row.ct_bonus}`,
                  teamCtName,
                ];
              }}
            />
            <Legend />
            <Bar dataKey="t_buy" name={teamTName} fill="#f97316" radius={[2, 2, 0, 0]} />
            <Bar dataKey="ct_buy" name={teamCtName} fill="#3b82f6" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>

        <div className="mt-3 flex flex-wrap gap-3 text-[10px] uppercase tracking-wider text-slate-500">
          {(['eco', 'force', 'full'] as BuyType[]).map((type) => (
            <span key={type} className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: BUY_COLORS[type] }}
              />
              {buyTypeLabel(type)}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: `${teamTName} eco`, value: economy.eco_rounds_t, color: 'text-orange-300' },
          { label: `${teamTName} force`, value: economy.force_rounds_t, color: 'text-orange-300' },
          { label: `${teamCtName} eco`, value: economy.eco_rounds_ct, color: 'text-blue-300' },
          { label: `${teamCtName} full`, value: economy.full_rounds_ct, color: 'text-blue-300' },
        ].map((item) => (
          <div key={item.label} className="glass-panel p-3">
            <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
            <p className={cn('font-display text-2xl font-bold', item.color)}>{item.value}</p>
          </div>
        ))}
      </div>

      {selectedEconomy && (selectedEconomy.ct || selectedEconomy.t) && (
        <div className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm">
          <p className="mb-2 flex items-center gap-2 font-medium text-cyan-200">
            <TrendingDown className="h-4 w-4" />
            Раунд #{selectedRound}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[selectedEconomy.t, selectedEconomy.ct]
              .filter(Boolean)
              .map((row) => (
                <div
                  key={row!.team}
                  className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs"
                >
                  <span className={row!.team === 'CT' ? 'text-blue-300' : 'text-orange-300'}>
                    {row!.team === 'CT' ? teamCtName : teamTName}
                  </span>
                  <span className="mx-2 text-slate-600">·</span>
                  <span className={cn('rounded px-1.5 py-0.5 font-semibold', buyTypePill(row!.buy_type))}>
                    {buyTypeLabel(row!.buy_type)}
                  </span>
                  <span className="ml-2 font-mono text-slate-300">${row!.avg_equip} avg</span>
                  <span className="ml-2 font-mono text-slate-500">bonus ${row!.loss_bonus}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-black/20 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Rnd</th>
                <th className="px-4 py-3">{teamTName}</th>
                <th className="px-4 py-3">Avg $</th>
                <th className="px-4 py-3">Bonus</th>
                <th className="px-4 py-3">{teamCtName}</th>
                <th className="px-4 py-3">Avg $</th>
                <th className="px-4 py-3">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map((row) => (
                <tr
                  key={row.round}
                  className={cn(
                    'border-b border-white/5',
                    selectedRound === row.round && 'bg-cyan-500/10',
                  )}
                >
                  <td className="px-4 py-2 font-mono text-slate-300">#{row.round}</td>
                  <td className="px-4 py-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', buyTypePill(row.t_type))}>
                      {buyTypeLabel(row.t_type)}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-orange-300">${row.t_avg}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">${row.t_bonus}</td>
                  <td className="px-4 py-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', buyTypePill(row.ct_type))}>
                      {buyTypeLabel(row.ct_type)}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-blue-300">${row.ct_avg}</td>
                  <td className="px-4 py-2 font-mono text-slate-400">${row.ct_bonus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
