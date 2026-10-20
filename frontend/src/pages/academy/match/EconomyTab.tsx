import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useHub } from './hub';
import { MetricLabel, useFmt } from '../../../academy/metrics';
import { Badge, Panel, PanelHeader } from '../../../academy/ui';
import { BUY_RU } from '../../../academy/radar';

const ECO_METRICS = ['avg_equip', 'money_spent', 'cost_per_kill', 'dmg_per_1000', 'buy_errors', 'win_pct_eco', 'win_pct_force', 'win_pct_full', 'saves'];

export function EconomyTab() {
  const { summary, openMoment } = useHub();
  const fmt = useFmt();
  const [A, B] = [summary.match.team_t_name, summary.match.team_ct_name];
  const ta = summary.teams.find((t) => t.name === A);
  const tb = summary.teams.find((t) => t.name === B);
  const data = summary.rounds.map((r) => {
    const sa = ta?.series.find((s) => s.round === r.round);
    const sb = tb?.series.find((s) => s.round === r.round);
    return {
      round: r.round,
      [`${A} экипировка`]: sa?.equip ?? 0,
      [`${B} экипировка`]: sb?.equip ?? 0,
      [`${A} деньги`]: sa?.money ?? 0,
      [`${B} деньги`]: sb?.money ?? 0,
      winner: r.winner_team,
      buyA: sa?.buy_type,
      buyB: sb?.buy_type,
    };
  });

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader title="Экономика по раундам" subtitle="Столбцы — стоимость снаряжения команды через 3 с после фризтайма, линии — деньги на старте раунда" />
        <div className="h-[340px]">
          <ResponsiveContainer>
            <ComposedChart data={data} onClick={(e) => { const r = (e as { activeLabel?: number })?.activeLabel; if (r) openMoment(Number(r)); }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="round" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip contentStyle={{ background: '#121216', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => `$${Number(v).toLocaleString('ru-RU')}`} labelFormatter={(r) => `Раунд ${r}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey={`${A} экипировка`} fill="#ff5a1f" radius={[3, 3, 0, 0]} />
              <Bar dataKey={`${B} экипировка`} fill="#cbd5e1" radius={[3, 3, 0, 0]} />
              <Line dataKey={`${A} деньги`} stroke="#ffb08f" dot={false} strokeWidth={2} />
              <Line dataKey={`${B} деньги`} stroke="#94a3b8" dot={false} strokeWidth={2} strokeDasharray="4 3" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex gap-[3px] overflow-x-auto">
          {data.map((d) => (
            <button key={d.round} type="button" onClick={() => openMoment(d.round)} className="flex min-w-[38px] flex-1 flex-col items-center gap-1 rounded-md bg-white/[0.02] py-1.5 text-[9px] hover:bg-white/[0.06]">
              <span className="font-mono text-slate-500">R{d.round}</span>
              <span className={d.winner === A ? 'font-bold text-[var(--color-signal)]' : 'text-slate-500'}>{BUY_RU[d.buyA ?? '']?.slice(0, 4) ?? '—'}</span>
              <span className={d.winner === B ? 'font-bold text-white' : 'text-slate-500'}>{BUY_RU[d.buyB ?? '']?.slice(0, 4) ?? '—'}</span>
            </button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        {[ta, tb].filter(Boolean).map((t) => (
          <Panel key={t!.name}>
            <PanelHeader title={t!.name} subtitle="Раунды по типу закупа команды" />
            <div className="grid grid-cols-4 gap-2">
              {(['pistol', 'eco', 'force', 'full'] as const).map((bt) => {
                const n = t!.counters[`${bt}_rounds`] ?? 0;
                const w = t!.counters[`${bt}_wins`] ?? 0;
                return (
                  <div key={bt} className="rounded-xl bg-white/[0.03] p-3 text-center">
                    <p className="text-[10px] uppercase tracking-wide text-slate-500">{BUY_RU[bt]}</p>
                    <p className="font-display text-2xl font-bold">{n ? `${Math.round((100 * w) / n)}%` : '—'}</p>
                    <p className="text-[11px] text-slate-500">{w} из {n}</p>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone="info">Анти-эко: {t!.metrics.anti_eco_win_pct ?? '—'}%</Badge>
              <Badge>Пистолетки: {t!.metrics.pistol_win_pct ?? '—'}%</Badge>
            </div>
          </Panel>
        ))}
      </div>

      <Panel padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[10.5px] uppercase text-slate-500"><th className="px-4 py-2 text-left">Игрок</th>{ECO_METRICS.map((m) => <th key={m} className="whitespace-nowrap px-2.5 py-2 text-right"><MetricLabel id={m} /></th>)}</tr></thead>
          <tbody>
            {summary.players.map((p) => (
              <tr key={p.name} className="border-t border-white/[0.04]">
                <td className="px-4 py-2 font-semibold">{p.name} <span className="text-[10px] font-normal text-slate-600">{p.team}</span></td>
                {ECO_METRICS.map((m) => <td key={m} className="px-2.5 py-2 text-right tabular-nums text-slate-300">{fmt(m, p.sides.all?.metrics[m])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
