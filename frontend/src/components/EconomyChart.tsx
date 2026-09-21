import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { PurchaseEvent, RoundData } from '../types/match';
import {
  getCategoryLabel,
  getPurchasePatterns,
  groupPurchasesByRound,
} from '../utils/purchaseType';
import { SkeletonLoader } from './SkeletonLoader';
import { EmptyState } from './EmptyState';
import { cn } from '../lib/cn';

interface EconomyChartProps {
  purchases: PurchaseEvent[];
  rounds?: RoundData[];
  isLoading?: boolean;
  className?: string;
  variant?: 'bar' | 'line';
}

const CATEGORY_TICKS = [
  { value: 0, label: '—' },
  { value: 1, label: 'Эко' },
  { value: 2, label: 'Полу' },
  { value: 3, label: 'Полный' },
];

export function EconomyChart({
  purchases,
  isLoading,
  className,
  variant = 'line',
}: EconomyChartProps) {
  if (isLoading) {
    return <SkeletonLoader variant="chart" className={className} />;
  }

  if (!purchases.length) {
    return <EmptyState variant="purchases" className={className} />;
  }

  const summaries = groupPurchasesByRound(purchases);
  const patterns = getPurchasePatterns(summaries);

  const chartData = summaries.map((s) => ({
    round: s.round_number,
    category: s.category,
    items: s.items,
    total_cost: s.total_cost,
  }));

  return (
    <div className={cn('space-y-6 animate-fade-in', className)}>
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
        <h3 className="mb-4 text-sm font-semibold text-slate-200">Закупки по раундам</h3>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="round"
              tick={{ fill: '#94a3b8', fontSize: 12 }}
              tickFormatter={(v) => `R${v}`}
            />
            <YAxis
              domain={[0, 3]}
              ticks={[0, 1, 2, 3]}
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              tickFormatter={(v) => CATEGORY_TICKS.find((t) => t.value === v)?.label ?? ''}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #475569',
                borderRadius: '8px',
                color: '#f1f5f9',
              }}
              labelFormatter={(round) => `Раунд ${round}`}
              formatter={(_value, _name, item) => {
                const payload = item.payload as (typeof chartData)[number];
                return [
                  `${getCategoryLabel(payload.category as 0 | 1 | 2 | 3)} — $${payload.total_cost}`,
                  payload.items.join(', ') || 'Нет предметов',
                ];
              }}
            />
            <Line
              type="stepAfter"
              dataKey="category"
              stroke="#06b6d4"
              strokeWidth={2}
              dot={{ fill: '#22d3ee', r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {variant === 'line' && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-violet-400">
                Пистолетные раунды
              </h4>
              {patterns.pistol.length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-300">
                  {patterns.pistol.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Нет данных</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-yellow-400">
                Эко раунды
              </h4>
              {patterns.eco.length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-300">
                  {patterns.eco.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Нет данных</p>
              )}
            </div>

            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cyan-400">
                Полный закуп
              </h4>
              {patterns.full.length > 0 ? (
                <ul className="space-y-1 text-sm text-slate-300">
                  {patterns.full.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">Нет данных</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700 bg-slate-900/50">
                  <th className="px-4 py-3 text-left font-medium text-slate-400">Раунд</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-400">Предметы</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-400">Тип раунда</th>
                  <th className="px-4 py-3 text-right font-medium text-slate-400">Сумма</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <tr
                    key={summary.round_number}
                    className="border-b border-slate-700/50 hover:bg-slate-700/30"
                  >
                    <td className="px-4 py-2.5 font-mono text-slate-300">
                      #{summary.round_number}
                    </td>
                    <td className="px-4 py-2.5 text-slate-300">
                      {summary.items.join(', ') || '—'}
                    </td>
                    <td className="px-4 py-2.5 text-cyan-400">
                      {getCategoryLabel(summary.category)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-300">
                      ${summary.total_cost}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
