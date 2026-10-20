import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHub } from './hub';
import { MetricLabel, useFmt, useMetrics } from '../../../academy/metrics';
import { Panel, Segmented } from '../../../academy/ui';
import type { Side } from '../../../types/academy';
import { cn } from '../../../lib/cn';

export function PlayersTab() {
  const { summary } = useHub();
  const { registry, byId } = useMetrics();
  const fmt = useFmt();
  const [group, setGroup] = useState('core');
  const [side, setSide] = useState<Side>('all');
  const groups = registry?.groups ?? [];
  const metrics = useMemo(() => (registry?.metrics ?? []).filter((m) => group === 'all' ? m.key : m.group === group), [registry, group]);
  const teams = [summary.match.team_t_name, summary.match.team_ct_name];

  const best = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of metrics) {
      const vals = summary.players.map((p) => p.sides[side]?.metrics[m.id]).filter((v): v is number => v != null);
      if (vals.length && m.better !== 'neutral') out[m.id] = m.better === 'lower' ? Math.min(...vals) : Math.max(...vals);
    }
    return out;
  }, [metrics, summary.players, side]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1">
          {[{ id: 'all', ru: 'Ключевые' }, ...groups].map((g) => (
            <button key={g.id} type="button" onClick={() => setGroup(g.id)}
              className={cn('rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors', group === g.id ? 'bg-[var(--color-signal)] text-white' : 'bg-white/[0.04] text-slate-400 hover:text-white')}>
              {g.ru}
            </button>
          ))}
        </div>
        <Segmented value={side} onChange={setSide} options={[{ value: 'all', label: 'Весь матч' }, { value: 'CT', label: 'CT' }, { value: 'T', label: 'T' }]} />
      </div>
      <p className="text-xs text-slate-500">
        Жирным — лучшее значение в матче. <span className="text-amber-300">≈</span> — оценка (выборка позиций, эвристика). «—» — данных для метрики в демке нет.
      </p>
      {teams.map((team) => (
        <Panel key={team} padded={false} className="overflow-hidden">
          <div className="border-b border-white/[0.06] px-4 py-2.5 font-display font-bold">{team}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wide text-slate-500">
                  <th className="sticky left-0 z-10 bg-[#0d0d10] px-4 py-2 text-left">Игрок</th>
                  {metrics.map((m) => <th key={m.id} className="whitespace-nowrap px-2.5 py-2 text-right font-semibold"><MetricLabel id={m.id} /></th>)}
                </tr>
              </thead>
              <tbody>
                {summary.players.filter((p) => p.team === team).map((p) => (
                  <tr key={p.name} className="border-t border-white/[0.04] hover:bg-white/[0.025]">
                    <td className="sticky left-0 z-10 bg-[#0d0d10] px-4 py-2"><Link to={`/players/${encodeURIComponent(p.name)}`} className="font-semibold hover:text-[var(--color-signal)]">{p.name}</Link></td>
                    {metrics.map((m) => {
                      const v = p.sides[side]?.metrics[m.id];
                      return (
                        <td key={m.id} className={cn('whitespace-nowrap px-2.5 py-2 text-right tabular-nums', v != null && best[m.id] === v ? 'font-bold text-white' : 'text-slate-300', v == null && 'text-slate-600')}>
                          {fmt(m.id, v)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      {group !== 'all' && byId && (
        <Panel>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Как считаются метрики группы</p>
          <dl className="grid gap-x-6 gap-y-2 text-xs md:grid-cols-2">
            {metrics.map((m) => (
              <div key={m.id}>
                <dt className="font-semibold text-slate-200">{m.ru} <span className="font-mono text-[10px] text-slate-500">{m.confidence}</span></dt>
                <dd className="text-slate-400">{m.description} <span className="font-mono text-[10px] text-[#ffb08f]">{m.formula}</span></dd>
              </div>
            ))}
          </dl>
        </Panel>
      )}
    </div>
  );
}
