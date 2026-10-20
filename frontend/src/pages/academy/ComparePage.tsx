import { type ReactNode, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { X } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { MetricLabel, useFmt, useMetrics } from '../../academy/metrics';
import { Button, Empty, Loading, PageHeader, Panel, PanelHeader, Segmented, Select, TabBar, inputCls } from '../../academy/ui';
import { MAPS, mapTitle } from '../../academy/radar';
import { cn } from '../../lib/cn';

const COLORS = ['#ff5a1f', '#5b8cff', '#34d399', '#f472b6', '#facc15'];

export function AcademyComparePage() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<'players' | 'periods'>('players');
  const selected = (params.get('players') ?? '').split(',').filter(Boolean);
  const setSelected = (list: string[]) => setParams({ players: list.join(',') });
  const all = useQuery({ queryKey: ['academy', 'players', 'compare-list'], queryFn: () => academyApi.players({ last: 50 }) });
  return (
    <div className="animate-fade-in">
      <PageHeader title="Сравнение" subtitle="До 5 игроков или один игрок в двух периодах" />
      <TabBar value={tab} onChange={setTab} tabs={[{ value: 'players', label: 'Игроки' }, { value: 'periods', label: 'Игрок: до и после' }]} />
      {tab === 'players' ? (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {selected.map((n, i) => (
              <span key={n} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm" style={{ borderColor: COLORS[i] + '66', background: COLORS[i] + '15' }}>
                {n}<button type="button" onClick={() => setSelected(selected.filter((x) => x !== n))}><X className="h-3 w-3" /></button>
              </span>
            ))}
            {selected.length < 5 && (
              <Select value="" onChange={(v) => v && setSelected([...selected, v])} placeholder="+ добавить игрока" options={(all.data ?? []).filter((p) => !selected.includes(p.name)).map((p) => ({ value: p.name, label: `${p.name} (${p.team ?? '—'})` }))} className="w-60" />
            )}
          </div>
          {selected.length < 2 ? <Empty title="Выбери минимум двух игроков" /> : <PlayersCompare names={selected} />}
        </>
      ) : <PeriodsCompare players={(all.data ?? []).map((p) => p.name)} />}
    </div>
  );
}

function PlayersCompare({ names }: { names: string[] }) {
  const [last, setLast] = useState('20');
  const [map, setMap] = useState('');
  const [side, setSide] = useState<'all' | 'CT' | 'T'>('all');
  const { registry, byId } = useMetrics();
  const fmt = useFmt();
  const q = useQuery({ queryKey: ['academy', 'compare', names, last, map, side], queryFn: () => academyApi.compare(names, { last: Number(last), map_name: map || undefined, side }) });
  const radarData = useMemo(() => (q.data?.groups ?? []).map((g) => ({ group: g.ru, ...Object.fromEntries((q.data?.players ?? []).map((p) => [p.name, p.radar[g.id] ?? 0])) })), [q.data]);
  if (q.isLoading) return <Loading />;
  const players = q.data?.players ?? [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Select value={last} onChange={setLast} options={['5', '10', '20', '50'].map((v) => ({ value: v, label: `${v} матчей` }))} className="w-32" />
        <Select value={map} onChange={setMap} placeholder="Все карты" options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} className="w-32" />
        <Segmented value={side} onChange={setSide} options={[{ value: 'all', label: 'Все' }, { value: 'CT', label: 'CT' }, { value: 'T', label: 'T' }]} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
        <Panel>
          <PanelHeader title="Профиль по группам" subtitle={`Средний перцентиль метрик группы среди ${q.data?.population_size ?? 0} игроков академии`} />
          <div className="h-[420px]">
            <ResponsiveContainer>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="group" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {players.map((p, i) => <Radar key={p.name} dataKey={p.name} stroke={COLORS[i]} fill={COLORS[i]} fillOpacity={0.12} strokeWidth={2} />)}
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#121216', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }} formatter={(v) => `${Math.round(Number(v))} перцентиль`} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel padded={false} className="max-h-[540px] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#121216]"><tr className="text-[10.5px] uppercase text-slate-500"><th className="px-4 py-2 text-left">Метрика</th>{players.map((p, i) => <th key={p.name} className="px-3 py-2 text-right" style={{ color: COLORS[i] }}>{p.name}<span className="block text-[9px] text-slate-500">{p.matches} матчей</span></th>)}</tr></thead>
            <tbody>
              {(registry?.groups ?? []).map((g) => (
                <GroupRows key={g.id} title={g.ru} ids={(registry?.metrics ?? []).filter((m) => m.group === g.id).map((m) => m.id)}
                  render={(id) => {
                    const vals = players.map((p) => p.metrics[id]);
                    const nums = vals.filter((v): v is number => v != null);
                    const better = byId[id]?.better;
                    const best = nums.length > 1 && better !== 'neutral' ? (better === 'lower' ? Math.min(...nums) : Math.max(...nums)) : null;
                    return (
                      <tr key={id} className="border-t border-white/[0.04]">
                        <td className="px-4 py-1.5"><MetricLabel id={id} className="text-slate-300" /></td>
                        {vals.map((v, i) => <td key={i} className={cn('px-3 py-1.5 text-right tabular-nums', best != null && v === best ? 'font-bold text-emerald-300' : 'text-slate-300')}>{fmt(id, v)}</td>)}
                      </tr>
                    );
                  }} />
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

function GroupRows({ title, ids, render }: { title: string; ids: string[]; render: (id: string) => ReactNode }) {
  return (
    <>
      <tr><td colSpan={99} className="bg-white/[0.02] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">{title}</td></tr>
      {ids.map(render)}
    </>
  );
}

function PeriodsCompare({ players }: { players: string[] }) {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
  const twoMonths = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
  const [player, setPlayer] = useState('');
  const [a, setA] = useState<[string, string]>([twoMonths, monthAgo]);
  const [b, setB] = useState<[string, string]>([monthAgo, today]);
  const { registry, byId } = useMetrics();
  const fmt = useFmt();
  const q = useQuery({ queryKey: ['academy', 'periods', player, a, b], queryFn: () => academyApi.comparePeriods(player, [a[0], `${a[1]}T23:59:59`], [b[0], `${b[1]}T23:59:59`]), enabled: !!player });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Select value={player} onChange={setPlayer} placeholder="Выбери игрока" options={players.map((p) => ({ value: p, label: p }))} className="w-52" />
        <span className="text-xs text-slate-500">Период A</span>
        <input type="date" value={a[0]} onChange={(e) => setA([e.target.value, a[1]])} className={`${inputCls} w-40 py-1.5`} />
        <input type="date" value={a[1]} onChange={(e) => setA([a[0], e.target.value])} className={`${inputCls} w-40 py-1.5`} />
        <span className="text-xs text-slate-500">Период B</span>
        <input type="date" value={b[0]} onChange={(e) => setB([e.target.value, b[1]])} className={`${inputCls} w-40 py-1.5`} />
        <input type="date" value={b[1]} onChange={(e) => setB([b[0], e.target.value])} className={`${inputCls} w-40 py-1.5`} />
        <Button size="sm" variant="ghost" onClick={() => q.refetch()}>Обновить</Button>
      </div>
      {!player ? <Empty title="Выбери игрока" hint="Например: месяц до назначения ДЗ и месяц после." /> : q.isLoading ? <Loading /> : q.data && (
        <Panel padded={false} className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[10.5px] uppercase text-slate-500"><th className="px-4 py-2 text-left">Метрика</th><th className="px-3 text-right">A · {q.data.a.matches} м.</th><th className="px-3 text-right">B · {q.data.b.matches} м.</th><th className="px-3 text-right">Изменение</th></tr></thead>
            <tbody>
              {(registry?.metrics ?? []).filter((m) => m.key || ['counter_strafe_pct', 'crosshair_deg', 'traded_death_pct', 'isolated_death_pct'].includes(m.id)).map((m) => {
                const va = q.data.a.metrics[m.id];
                const vb = q.data.b.metrics[m.id];
                const diff = va != null && vb != null ? vb - va : null;
                const good = diff != null && byId[m.id]?.better !== 'neutral' && (byId[m.id]?.better === 'higher' ? diff > 0 : diff < 0);
                return (
                  <tr key={m.id} className="border-t border-white/[0.04]">
                    <td className="px-4 py-2"><MetricLabel id={m.id} className="text-slate-300" /></td>
                    <td className="px-3 text-right tabular-nums">{fmt(m.id, va)}</td>
                    <td className="px-3 text-right font-semibold tabular-nums">{fmt(m.id, vb)}</td>
                    <td className={cn('px-3 text-right tabular-nums', diff == null ? 'text-slate-600' : good ? 'text-emerald-300' : 'text-rose-300')}>{diff == null ? '—' : `${diff > 0 ? '+' : ''}${fmt(m.id, diff)}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}
