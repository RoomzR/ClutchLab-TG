import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academyApi } from '../../../api/academy';
import { useHub } from './hub';
import { Loading, Panel, PanelHeader, Segmented } from '../../../academy/ui';
import { fmtValue } from '../../../academy/metrics';
import { cn } from '../../../lib/cn';

export function DuelsTab() {
  const { matchId, summary } = useHub();
  const [mode, setMode] = useState<'kills' | 'damage'>('kills');
  const q = useQuery({ queryKey: ['academy', 'match', matchId, 'duels'], queryFn: () => academyApi.duels(matchId) });
  const a = summary.players.filter((p) => p.team === summary.match.team_t_name).map((p) => p.name);
  const b = summary.players.filter((p) => p.team === summary.match.team_ct_name).map((p) => p.name);

  const kmap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of q.data?.kills ?? []) m.set(`${r.killer}\0${r.victim}`, r.kills);
    return m;
  }, [q.data]);
  const dmap = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of q.data?.damage ?? []) m.set(`${r.attacker}\0${r.victim}`, r.dmg);
    return m;
  }, [q.data]);
  const val = (x: string, y: string) => (mode === 'kills' ? kmap : dmap).get(`${x}\0${y}`) ?? 0;
  const maxV = Math.max(1, ...a.flatMap((x) => b.flatMap((y) => [val(x, y), val(y, x)])));

  if (q.isLoading) return <Loading />;

  return (
    <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
      <Panel>
        <PanelHeader
          title="Head-to-head"
          subtitle={`Строка — ${summary.match.team_t_name}, столбец — ${summary.match.team_ct_name}. В ячейке: ${mode === 'kills' ? 'убийств строкой / убийств столбцом' : 'урон строкой / урон столбцом'}`}
          actions={<Segmented value={mode} onChange={setMode} options={[{ value: 'kills', label: 'Убийства' }, { value: 'damage', label: 'Урон' }]} />}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr>
                <th />
                {b.map((y) => <th key={y} className="px-1 py-2 text-center font-semibold text-slate-300"><span className="block max-w-[88px] truncate">{y}</span></th>)}
              </tr>
            </thead>
            <tbody>
              {a.map((x) => (
                <tr key={x}>
                  <td className="whitespace-nowrap py-1 pr-3 text-right font-semibold text-[var(--color-signal)]">{x}</td>
                  {b.map((y) => {
                    const mine = val(x, y);
                    const theirs = val(y, x);
                    const net = mine - theirs;
                    const intensity = Math.min(1, Math.abs(net) / (maxV * 0.6));
                    return (
                      <td key={y} className="p-0.5">
                        <div
                          className="flex h-11 flex-col items-center justify-center rounded-md text-center tabular-nums"
                          style={{ background: net > 0 ? `rgba(52,211,153,${0.08 + intensity * 0.35})` : net < 0 ? `rgba(248,113,113,${0.08 + intensity * 0.35})` : 'rgba(255,255,255,0.03)' }}
                          title={`${x} → ${y}: ${mine}; ${y} → ${x}: ${theirs}`}
                        >
                          <span className="font-bold text-white">{mine} / {theirs}</span>
                          <span className={cn('text-[10px]', net > 0 ? 'text-emerald-300' : net < 0 ? 'text-rose-300' : 'text-slate-500')}>{net > 0 ? '+' : ''}{net}</span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Первые дуэли раунда" subtitle="Кто открывает раунды и с каким результатом" />
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase text-slate-500"><th className="py-1 text-left">Игрок</th><th className="text-right">Попытки</th><th className="text-right">Выиграно</th><th className="text-right">%</th><th className="text-right">Раунд выигран</th></tr></thead>
            <tbody>
              {[...summary.players].sort((x, y) => (y.sides.all?.metrics.opening_attempts ?? 0) - (x.sides.all?.metrics.opening_attempts ?? 0)).map((p) => {
                const mm = p.sides.all?.metrics ?? {};
                return (
                  <tr key={p.name} className="border-t border-white/[0.04]">
                    <td className="py-1.5 font-semibold">{p.name}</td>
                    <td className="text-right tabular-nums">{mm.opening_attempts ?? 0}</td>
                    <td className="text-right tabular-nums">{mm.opening_kills ?? 0}</td>
                    <td className={cn('text-right tabular-nums', (mm.opening_success_pct ?? 0) >= 50 ? 'text-emerald-300' : 'text-rose-300')}>{fmtValue(mm.opening_success_pct, 'pct', 0)}</td>
                    <td className="text-right tabular-nums text-slate-400">{fmtValue(mm.opening_kill_win_pct, 'pct', 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
        <Panel>
          <PanelHeader title="Дуэли по дистанции" subtitle="Убийства / смерти" />
          <table className="w-full text-xs">
            <thead><tr className="text-[10px] uppercase text-slate-500"><th className="py-1 text-left">Игрок</th>{['близко (<10 м)', 'средне (10–25 м)', 'далеко (>25 м)'].map((h) => <th key={h} className="text-right">{h}</th>)}</tr></thead>
            <tbody>
              {summary.players.map((p) => (
                <tr key={p.name} className="border-t border-white/[0.04]">
                  <td className="py-1.5 font-semibold">{p.name}</td>
                  {['близко (<10 м)', 'средне (10–25 м)', 'далеко (>25 м)'].map((bk) => {
                    const v = q.data?.distance[p.name]?.[bk];
                    return <td key={bk} className="text-right tabular-nums">{v ? `${v.kills} / ${v.deaths}` : '—'}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel>
          <PanelHeader title="Оружие" subtitle="Убийства по оружию" />
          <div className="space-y-1.5">
            {summary.players.map((p) => {
              const ws = (q.data?.weapons ?? []).filter((w) => w.killer === p.name).sort((x, y) => y.kills - x.kills);
              if (!ws.length) return null;
              return (
                <div key={p.name} className="flex items-center gap-2 text-xs">
                  <span className="w-24 truncate font-semibold">{p.name}</span>
                  <span className="flex flex-wrap gap-1">{ws.map((w) => <span key={w.weapon} className="rounded bg-white/[0.05] px-1.5 py-0.5 text-slate-300">{w.weapon} ×{w.kills}</span>)}</span>
                </div>
              );
            })}
          </div>
        </Panel>
      </div>
    </div>
  );
}
