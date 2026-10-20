import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BadgeCheck, CalendarDays, Download, Dumbbell, Sparkles, TrendingDown, TrendingUp } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { apiClient, getErrorMessage } from '../../api/client';
import { useIsStaff } from '../../academy/AcademyLayout';
import { Delta, MetricLabel, PercentileBar, fmtValue, percentileText, useFmt, useMetrics } from '../../academy/metrics';
import { PointsMap } from '../../academy/PointsMap';
import { Badge, Button, DataTable, Empty, ErrorBox, Kpi, Loading, PageHeader, Panel, PanelHeader, Segmented, Select, TabBar, fmtDate } from '../../academy/ui';
import { MAPS, MATCH_TYPE_RU, mapTitle, sideColor } from '../../academy/radar';
import type { Homework, PlayerProfile, TrainingItem, TrainingPlan } from '../../types/academy';
import { cn } from '../../lib/cn';

type Tab = 'overview' | 'metrics' | 'maps' | 'positions' | 'mistakes' | 'plan' | 'matches';
const OVERVIEW_KEYS = ['rating', 'adr', 'kast_pct', 'kd', 'hs_pct', 'opening_success_pct', 'traded_death_pct', 'counter_strafe_pct', 'crosshair_deg', 'utility_damage_per_round', 'enemies_flashed_per_round', 'unused_util_value_per_death', 'clutch_wins', 'accuracy_pct'];
const TREND_OPTIONS = [
  { value: 'rating', label: 'Рейтинг' }, { value: 'adr', label: 'ADR' }, { value: 'kast_pct', label: 'KAST' }, { value: 'hs_pct', label: 'HS%' },
  { value: 'counter_strafe_pct', label: 'Контрстрейф' }, { value: 'crosshair_deg', label: 'Кроссхейр' }, { value: 'opening_success_pct', label: 'Опенинги' },
  { value: 'traded_death_pct', label: 'Размены' }, { value: 'utility_damage_per_round', label: 'Урон утилити' }, { value: 'mistakes', label: 'Ошибки' },
];

export function PlayerProfilePage() {
  const { name = '' } = useParams();
  const [tab, setTab] = useState<Tab>('overview');
  const [last, setLast] = useState('20');
  const [mapName, setMap] = useState('');
  const [matchType, setType] = useState('');
  const q = useQuery({
    queryKey: ['academy', 'player', name, last, mapName, matchType],
    queryFn: () => academyApi.player(name, { last: Number(last), map_name: mapName || undefined, match_type: matchType || undefined }),
  });
  if (q.isLoading) return <Loading label="Считаем профиль…" />;
  if (q.isError) return <ErrorBox message={getErrorMessage(q.error)} onRetry={() => q.refetch()} />;
  const p = q.data!;
  const m = p.sides.all.metrics;

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow={p.team ?? 'Игрок'}
        title={<span className="flex items-center gap-3">{p.name}{p.form != null && <span className={cn('rounded-lg px-2 py-0.5 font-display text-lg', percentileText(((p.form ?? 1) - 0.6) * 125), 'bg-white/[0.05]')}>форма {p.form.toFixed(2)}</span>}</span>}
        subtitle={`${p.matches} матчей · ${p.wins} побед · сравнение с ${p.population_size} игроками академии за тот же период`}
        actions={<>
          <Select value={last} onChange={setLast} options={[{ value: '5', label: '5 матчей' }, { value: '10', label: '10 матчей' }, { value: '20', label: '20 матчей' }, { value: '50', label: '50 матчей' }, { value: '500', label: 'Все' }]} className="w-32" />
          <Select value={mapName} onChange={setMap} placeholder="Все карты" options={MAPS.map((x) => ({ value: x, label: mapTitle(x) }))} className="w-32" />
          <Select value={matchType} onChange={setType} placeholder="Все типы" options={Object.entries(MATCH_TYPE_RU).map(([value, label]) => ({ value, label }))} className="w-36" />
          <Link to={`/compare?players=${encodeURIComponent(p.name)}`}><Button>Сравнить</Button></Link>
        </>}
      />

      <div className="mb-6 grid gap-3 md:grid-cols-[repeat(4,minmax(0,1fr))_1.4fr]">
        <Kpi label="Рейтинг" value={fmtValue(m.rating, 'ratio')} hint={<Pct p={p.percentiles.rating} />} tone="signal" />
        <Kpi label="ADR" value={fmtValue(m.adr, 'num', 0)} hint={<Pct p={p.percentiles.adr} />} />
        <Kpi label="KAST" value={fmtValue(m.kast_pct, 'pct', 0)} hint={<Pct p={p.percentiles.kast_pct} />} />
        <Kpi label="K/D" value={fmtValue(m.kd, 'ratio')} hint={`${m.kills ?? 0} / ${m.deaths ?? 0}`} />
        <div className="grid grid-cols-2 gap-3">
          <StrengthList title="Сильные стороны" items={p.strengths} good />
          <StrengthList title="Зоны роста" items={p.weaknesses} />
        </div>
      </div>

      <TabBar<Tab> value={tab} onChange={setTab} tabs={[
        { value: 'overview', label: 'Обзор' }, { value: 'metrics', label: 'Все метрики' }, { value: 'maps', label: 'Карты и оружие' },
        { value: 'positions', label: 'Позиционирование' }, { value: 'mistakes', label: 'Ошибки и прогресс', count: p.mistake_types.reduce((a, t) => a + t.open, 0) },
        { value: 'plan', label: 'План и ДЗ' }, { value: 'matches', label: 'Матчи', count: p.cards.length },
      ]} />

      {tab === 'overview' && <Overview p={p} />}
      {tab === 'metrics' && <AllMetrics p={p} />}
      {tab === 'maps' && <MapsWeapons p={p} />}
      {tab === 'positions' && <Positions p={p} />}
      {tab === 'mistakes' && <MistakesProgress p={p} />}
      {tab === 'plan' && <PlanAndHomework p={p} />}
      {tab === 'matches' && <Cards p={p} />}
    </div>
  );
}

function Pct({ p }: { p: number | null | undefined }) {
  if (p == null) return <span>мало данных для сравнения</span>;
  return <span className={percentileText(p)}>лучше {Math.round(p)}% академии</span>;
}

function StrengthList({ title, items, good }: { title: string; items: PlayerProfile['strengths']; good?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
      <p className={cn('mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider', good ? 'text-emerald-300' : 'text-rose-300')}>
        {good ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{title}
      </p>
      {items.length === 0 ? <p className="text-xs text-slate-500">—</p> : items.map((s) => (
        <p key={s.metric} className="truncate text-xs"><span className="text-slate-300">{s.name}</span> <span className={percentileText(s.percentile)}>{Math.round(s.percentile)}%</span></p>
      ))}
    </div>
  );
}

function Overview({ p }: { p: PlayerProfile }) {
  const fmt = useFmt();
  const [metric, setMetric] = useState('rating');
  const data = p.trend.map((t, i) => ({ i: i + 1, value: (t as Record<string, unknown>)[metric] as number | null, map: t.map, date: t.date, won: t.won }));
  const avg = p.academy_avg[metric];
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
      <Panel>
        <PanelHeader title="Ключевые метрики" subtitle="Значение · отличие от средних команды · перцентиль в академии" />
        <ul className="space-y-2.5">
          {OVERVIEW_KEYS.map((id) => (
            <li key={id} className="grid grid-cols-[minmax(0,1fr)_76px_60px_120px] items-center gap-3 text-sm">
              <MetricLabel id={id} className="truncate text-slate-300" />
              <span className="text-right font-semibold tabular-nums">{fmt(id, p.sides.all.metrics[id])}</span>
              <span className="text-right"><Delta id={id} value={p.sides.all.metrics[id]} reference={p.team_avg[id]} /></span>
              <PercentileBar value={p.percentiles[id]} />
            </li>
          ))}
        </ul>
      </Panel>
      <Panel>
        <PanelHeader title="Прогресс по матчам" subtitle="Пунктир — среднее академии" actions={<Select value={metric} onChange={setMetric} options={TREND_OPTIONS} className="w-40" />} />
        {data.length < 2 ? <Empty title="Нужно минимум 2 матча для графика" /> : (
          <div className="h-[340px]">
            <ResponsiveContainer>
              <LineChart data={data}>
                <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="i" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={['auto', 'auto']} />
                <Tooltip contentStyle={{ background: '#121216', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                  labelFormatter={(i) => { const d = data[Number(i) - 1]; return d ? `${fmtDate(d.date)} · ${mapTitle(d.map)} · ${d.won ? 'победа' : 'поражение'}` : ''; }}
                  formatter={(v) => fmt(metric, Number(v))} />
                {avg != null && metric !== 'mistakes' && <ReferenceLine y={avg} stroke="#64748b" strokeDasharray="4 4" />}
                <Line dataKey="value" stroke="#ff5a1f" strokeWidth={2.5} dot={{ r: 3, fill: '#ff5a1f' }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </div>
  );
}

function AllMetrics({ p }: { p: PlayerProfile }) {
  const { registry } = useMetrics();
  const fmt = useFmt();
  return (
    <div className="space-y-5">
      {(registry?.groups ?? []).map((g) => (
        <Panel key={g.id} padded={false} className="overflow-hidden">
          <div className="border-b border-white/[0.06] px-4 py-2.5 font-display font-bold">{g.ru}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 text-left">Метрика</th><th className="px-2 text-right">Всего</th><th className="px-2 text-right">CT</th><th className="px-2 text-right">T</th>
                <th className="px-2 text-right">Команда</th><th className="px-2 text-right">Академия</th><th className="w-40 px-4 text-left">Перцентиль</th>
              </tr></thead>
              <tbody>
                {registry!.metrics.filter((m) => m.group === g.id).map((m) => (
                  <tr key={m.id} className="border-t border-white/[0.04]">
                    <td className="px-4 py-2"><MetricLabel id={m.id} className="text-slate-300" /></td>
                    <td className="px-2 text-right font-semibold tabular-nums">{fmt(m.id, p.sides.all.metrics[m.id])}</td>
                    <td className="px-2 text-right tabular-nums text-[#a9c2ff]">{fmt(m.id, p.sides.CT?.metrics[m.id])}</td>
                    <td className="px-2 text-right tabular-nums text-[#ffd590]">{fmt(m.id, p.sides.T?.metrics[m.id])}</td>
                    <td className="px-2 text-right tabular-nums text-slate-400">{fmt(m.id, p.team_avg[m.id])}</td>
                    <td className="px-2 text-right tabular-nums text-slate-400">{fmt(m.id, p.academy_avg[m.id])}</td>
                    <td className="px-4"><div className="flex items-center gap-2"><PercentileBar value={p.percentiles[m.id]} /><span className={cn('w-8 text-right text-[11px] tabular-nums', percentileText(p.percentiles[m.id]))}>{p.percentiles[m.id] != null ? Math.round(p.percentiles[m.id]!) : ''}</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
    </div>
  );
}

function bars(obj: Record<string, number> | undefined, limit = 10) {
  return Object.entries(obj ?? {}).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function BarList({ title, data, unit }: { title: string; data: [string, number][]; unit?: string }) {
  const max = data[0]?.[1] || 1;
  const total = data.reduce((a, [, v]) => a + v, 0) || 1;
  return (
    <Panel>
      <PanelHeader title={title} />
      {data.length === 0 ? <p className="text-sm text-slate-500">Нет данных</p> : (
        <ul className="space-y-1.5">
          {data.map(([k, v]) => (
            <li key={k} className="text-xs">
              <div className="mb-0.5 flex justify-between"><span className="text-slate-300">{k}</span><span className="tabular-nums text-slate-500">{unit === 's' ? `${Math.round(v)} с` : Math.round(v)} · {Math.round((100 * v) / total)}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-[var(--color-signal)]" style={{ width: `${(100 * v) / max}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function MapsWeapons({ p }: { p: PlayerProfile }) {
  const ex = p.extras as Record<string, Record<string, number>>;
  return (
    <div className="space-y-6">
      <DataTable
        rows={p.maps}
        rowKey={(r) => r.map}
        initialSort={{ key: 'matches', dir: 'desc' }}
        columns={[
          { key: 'map', header: 'Карта', cell: (r) => <span className="font-semibold">{mapTitle(r.map)}</span> },
          { key: 'matches', header: 'Матчи', align: 'right', cell: (r) => r.matches, sort: (r) => r.matches },
          { key: 'win', header: 'Победы', align: 'right', cell: (r) => `${r.wins} (${Math.round((100 * r.wins) / r.matches)}%)`, sort: (r) => r.wins / r.matches },
          ...(['rating', 'adr', 'kd', 'kast_pct', 'hs_pct', 'opening_success_pct', 'utility_damage_per_round'] as const).map((id) => ({
            key: id, header: <MetricLabel id={id} />, align: 'right' as const, cell: (r: PlayerProfile['maps'][number]) => fmtValue(r.metrics[id], id.endsWith('pct') ? 'pct' : id === 'rating' || id === 'kd' ? 'ratio' : 'num'), sort: (r: PlayerProfile['maps'][number]) => r.metrics[id],
          })),
        ]}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <BarList title="Убийства по оружию" data={bars(ex.kills_by_weapon)} />
        <BarList title="Урон по оружию" data={bars(ex.damage_by_weapon)} />
        <BarList title="Попадания по частям тела" data={bars(ex.hitgroups)} />
        <BarList title="Чаще всего убивает" data={bars(ex.victims, 8)} />
        <BarList title="Где убивает" data={bars(ex.kill_places, 8)} />
        <BarList title="Где умирает" data={bars(ex.death_places, 8)} />
      </div>
    </div>
  );
}

function Positions({ p }: { p: PlayerProfile }) {
  const [map, setMap] = useState(p.maps[0]?.map ?? 'de_mirage');
  const [kind, setKind] = useState<'deaths' | 'kills'>('deaths');
  const [side, setSide] = useState<'all' | 'CT' | 'T'>('all');
  const heat = useQuery({ queryKey: ['academy', 'player', p.name, 'heat', map, kind, side], queryFn: () => academyApi.playerHeatmap(p.name, { map_name: map, kind, side: side === 'all' ? undefined : side }) });
  const ex = p.extras as Record<string, Record<string, number>>;
  const fmt = useFmt();
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel>
        <PanelHeader title="Теплокарта по всем матчам" subtitle={`${heat.data?.length ?? 0} событий`} actions={<>
          <Select value={map} onChange={setMap} options={p.maps.map((m) => ({ value: m.map, label: mapTitle(m.map) }))} className="w-32" />
          <Segmented size="sm" value={kind} onChange={setKind} options={[{ value: 'deaths', label: 'Смерти' }, { value: 'kills', label: 'Убийства' }]} />
          <Segmented size="sm" value={side} onChange={setSide} options={[{ value: 'all', label: 'Обе' }, { value: 'T', label: 'T' }, { value: 'CT', label: 'CT' }]} />
        </>} />
        <div className="mx-auto max-w-[680px]">
          <PointsMap mapName={map} density points={(heat.data ?? []).map((h, i) => ({ id: String(i), x: h.x, y: h.y, color: kind === 'deaths' ? '#f87171' : sideColor(h.side), label: `${h.place ?? ''} · ${h.weapon}` }))} />
        </div>
      </Panel>
      <div className="space-y-6">
        <Panel>
          <PanelHeader title="Стиль игры" />
          <ul className="space-y-2 text-sm">
            {['distance_per_round', 'avg_teammate_dist', 'lurk_pct', 'position_repeat_pct', 'isolated_death_pct', 'death_spacing'].map((id) => (
              <li key={id} className="flex justify-between gap-3"><MetricLabel id={id} className="text-slate-400" /><span className="font-semibold tabular-nums">{fmt(id, p.sides.all.metrics[id])}</span></li>
            ))}
          </ul>
        </Panel>
        <BarList title="Время в зонах" data={bars(ex.zones, 10)} unit="s" />
        <BarList title="Позиция на 20-й секунде" data={bars(ex.early_places, 8)} />
      </div>
    </div>
  );
}

function MistakesProgress({ p }: { p: PlayerProfile }) {
  const prog = useQuery({ queryKey: ['academy', 'player', p.name, 'progress'], queryFn: () => academyApi.mistakesProgress(p.name) });
  const isStaff = useIsStaff();
  const qc = useQueryClient();
  const recent = useQuery({ queryKey: ['academy', 'mistakes', p.name, 'open'], queryFn: () => academyApi.mistakes({ player: p.name, status: 'open', limit: 60 }) });
  const assign = useMutation({ mutationFn: (id: string) => academyApi.assignHomework(id), onSuccess: () => { toast.success('ДЗ назначено'); qc.invalidateQueries({ queryKey: ['academy'] }); } });
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Panel>
        <PanelHeader title="Типы ошибок" subtitle="Динамика: сравнение первой и второй половины выбранных матчей" />
        {!prog.data ? <Loading /> : prog.data.types.length === 0 ? <Empty title="Ошибок не найдено" /> : (
          <ul className="space-y-2">
            {prog.data.types.map((t) => (
              <li key={t.type} className="rounded-lg bg-white/[0.025] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t.title}</span>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={t.trend === 'improving' ? 'good' : t.trend === 'worse' ? 'bad' : 'neutral'}>{t.trend === 'improving' ? 'реже' : t.trend === 'worse' ? 'чаще' : 'без изменений'}</Badge>
                    <Badge>{t.total}</Badge>
                  </span>
                </div>
                <div className="mt-2 flex h-6 items-end gap-[3px]">
                  {prog.data!.matches.map((mm) => {
                    const n = mm.counts[t.type] ?? 0;
                    return <span key={mm.match_id} title={`${fmtDate(mm.date)} · ${mapTitle(mm.map)}: ${n}`} className={cn('flex-1 rounded-sm', n ? 'bg-amber-400/80' : 'bg-white/[0.06]')} style={{ height: `${Math.min(100, 20 + n * 25)}%` }} />;
                  })}
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">{Object.entries(t.statuses).map(([s, n]) => `${s}: ${n}`).join(' · ')}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel>
        <PanelHeader title="Открытые ошибки" subtitle="Последние матчи — назначь ДЗ в один клик" />
        <ul className="max-h-[640px] space-y-2 overflow-y-auto">
          {(recent.data ?? []).map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/[0.06] p-2.5">
              <Link to={`/match/${m.match_id}?tab=review&round=${m.round_number ?? 1}${m.tick_end ? `&tick=${m.tick_end - 128}` : ''}&player=${encodeURIComponent(p.name)}`} className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm font-semibold hover:text-[var(--color-signal)]"><Badge tone={m.severity === 'high' ? 'bad' : m.severity === 'medium' ? 'warn' : 'neutral'}>{m.severity}</Badge>{m.title}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{mapTitle(m.map_name)} · R{m.round_number ?? '—'} · {fmtDate(m.played_at)}</span>
              </Link>
              {isStaff && <Button size="sm" onClick={() => assign.mutate(m.id)}><Dumbbell className="h-3.5 w-3.5" />ДЗ</Button>}
            </li>
          ))}
          {recent.data?.length === 0 && <li className="text-sm text-slate-500">Открытых ошибок нет.</li>}
        </ul>
      </Panel>
    </div>
  );
}

function planItems(plan: TrainingPlan): { items: TrainingItem[]; minutes: Record<string, number> } {
  if (Array.isArray(plan.items)) return { items: plan.items, minutes: plan.minutes_per_day ?? {} };
  return { items: plan.items.items, minutes: plan.items.minutes_per_day };
}

function PlanAndHomework({ p }: { p: PlayerProfile }) {
  const isStaff = useIsStaff();
  const qc = useQueryClient();
  const plans = useQuery({ queryKey: ['academy', 'plans', p.name], queryFn: () => academyApi.plans(p.name) });
  const hw = useQuery({ queryKey: ['academy', 'homework', p.name], queryFn: () => academyApi.homework({ player: p.name }) });
  const gen = useMutation({ mutationFn: () => academyApi.generatePlan(p.name), onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'plans', p.name] }) });
  const verify = useMutation({ mutationFn: () => academyApi.verifyHomework(p.name), onSuccess: (r) => { toast.success(`Проверено, изменилось: ${r.changed}`); qc.invalidateQueries({ queryKey: ['academy', 'homework'] }); } });
  const plan = plans.data?.[0];
  const { name } = useMetrics();
  const exportMd = async () => {
    if (!plan) return;
    const { data } = await apiClient.get(`/academy/training-plans/${plan.id}/export.md`, { responseType: 'blob' });
    const url = URL.createObjectURL(data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plan_${p.name}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
      <Panel>
        <PanelHeader
          title="План тренировок на неделю"
          subtitle={plan ? `Неделя с ${fmtDate(plan.week_start)} · ${plan.summary}` : 'Строится из ошибок и метрик последних 10 матчей'}
          icon={<CalendarDays className="h-4 w-4" />}
          actions={<>
            {plan && <Button size="sm" onClick={exportMd}><Download className="h-3.5 w-3.5" />Для тренера (.md)</Button>}
            {isStaff && <Button size="sm" variant="primary" onClick={() => gen.mutate()} loading={gen.isPending}><Sparkles className="h-3.5 w-3.5" />{plan ? 'Пересобрать' : 'Собрать план'}</Button>}
          </>}
        />
        {!plan ? <Empty title="Плана пока нет" hint="Нажми «Собрать план» — система возьмёт топ-3 темы по ошибкам и подберёт упражнения." /> : (() => {
          const { items, minutes } = planItems(plan);
          return (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {plan.themes.map((t, i) => <Badge key={t.category} tone={i === 0 ? 'signal' : 'neutral'}>{i + 1}. {t.title} · {t.mistake_types.map((x) => x.title).join(', ')}</Badge>)}
              </div>
              <div className="mb-4 grid grid-cols-7 gap-1">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                  <div key={d} className="rounded-lg bg-white/[0.03] p-2 text-center">
                    <p className="text-[10px] uppercase text-slate-500">{d}</p>
                    <p className="font-display text-lg font-bold">{minutes[d] ?? 0}</p>
                    <p className="text-[9px] text-slate-600">мин</p>
                  </div>
                ))}
              </div>
              <ul className="space-y-2">
                {items.map((it, i) => (
                  <li key={i} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{it.title}</span>
                      <span className="flex shrink-0 gap-1"><Badge>{it.minutes} мин</Badge><Badge tone="info">{(it.days ?? []).join(' ')}</Badge></span>
                    </div>
                    <p className="mt-1 text-sm text-slate-400">{it.details}</p>
                    {it.steps && <ul className="mt-1.5 list-disc pl-4 text-xs text-slate-500">{it.steps.map((s) => <li key={s}>{s}</li>)}</ul>}
                    {it.check && <p className="mt-1.5 text-[11px] text-emerald-300/80">Проверка: {name(it.check.metric)} {it.check.op} {it.check.threshold}</p>}
                    {it.lineup_id && <Link to={`/lineups?id=${it.lineup_id}`} className="mt-1 inline-block text-[11px] text-[var(--color-signal)] hover:underline">Открыть раскидку →</Link>}
                  </li>
                ))}
              </ul>
            </>
          );
        })()}
      </Panel>
      <Panel>
        <PanelHeader title="Домашние задания" actions={isStaff && <Button size="sm" onClick={() => verify.mutate()} loading={verify.isPending}><BadgeCheck className="h-3.5 w-3.5" />Проверить по метрикам</Button>} />
        <HomeworkList items={hw.data ?? []} />
      </Panel>
    </div>
  );
}

export function HomeworkList({ items }: { items: Homework[] }) {
  const { name } = useMetrics();
  const fmt = useFmt();
  if (!items.length) return <p className="text-sm text-slate-500">Заданий пока нет — назначь из ошибки матча.</p>;
  const tone = (s: string) => (s === 'verified' ? 'good' : s === 'recurring' ? 'bad' : s === 'done' ? 'info' : s === 'in_progress' ? 'warn' : 'neutral') as 'good';
  const RU: Record<string, string> = { assigned: 'Назначено', in_progress: 'В работе', done: 'Выполнено', verified: 'Подтверждено метрикой', recurring: 'Ошибка повторяется', cancelled: 'Отменено' };
  return (
    <ul className="space-y-2">
      {items.map((h) => (
        <li key={h.id} className="rounded-lg border border-white/[0.06] p-3">
          <div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{h.title}</span><Badge tone={tone(h.status)}>{RU[h.status]}</Badge></div>
          {h.check_metric && (
            <p className="mt-1.5 text-xs text-slate-400">
              {name(h.check_metric)} {h.check_op} {h.check_threshold}: было {fmt(h.check_metric, h.baseline_value)} → сейчас {fmt(h.check_metric, h.last_value)}
              {h.verification?.matches?.length ? ` (${h.verification.matches.length} матчей после назначения)` : ' (ждём новые матчи)'}
            </p>
          )}
          <p className="mt-1 text-[11px] text-slate-600">до {h.due_date ? fmtDate(h.due_date) : '—'}{h.match_id && <> · <Link to={`/match/${h.match_id}?tab=mistakes`} className="hover:text-white">из матча</Link></>}</p>
        </li>
      ))}
    </ul>
  );
}

function Cards({ p }: { p: PlayerProfile }) {
  const fmt = useFmt();
  const catalog = useMetricsCatalog();
  const titles = useMemo(() => Object.fromEntries((catalog ?? []).map((c) => [c.type, c.title])), [catalog]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {p.cards.map((c) => (
        <Link key={c.match_id} to={`/match/${c.match_id}`} className="group rounded-2xl border border-white/[0.07] bg-[#0d0d10] p-4 transition hover:-translate-y-0.5 hover:border-[var(--color-signal)]/40">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5"><span className="font-display font-bold">{mapTitle(c.map)}</span><Badge tone={c.won ? 'good' : 'bad'}>{c.won ? 'W' : 'L'}</Badge>{c.reviewed_by_analyst && <Badge tone="good">аналитик</Badge>}</span>
            <span className="text-[11px] text-slate-500">{fmtDate(c.date)}</span>
          </div>
          <p className="truncate text-xs text-slate-500">{c.team_t_name} {c.score_t}:{c.score_ct} {c.team_ct_name}</p>
          <div className="mt-3 grid grid-cols-4 gap-2 text-center">
            <div><p className="font-display text-xl font-bold">{fmt('rating', c.rating, 2)}</p><p className="text-[10px] text-slate-500">рейтинг</p></div>
            <div><p className="font-display text-xl font-bold">{c.kills}-{c.deaths}</p><p className="text-[10px] text-slate-500">K-D</p></div>
            <div><p className="font-display text-xl font-bold">{fmt('adr', c.adr, 0)}</p><p className="text-[10px] text-slate-500">ADR</p></div>
            <div><p className="font-display text-xl font-bold">{fmt('kast_pct', c.kast_pct, 0)}</p><p className="text-[10px] text-slate-500">KAST</p></div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 border-t border-white/[0.05] pt-2.5 text-[11px]">
            <Badge tone="info">ИИ-разбор</Badge>
            {c.mistakes > 0 && <Badge tone="warn">{c.mistakes} ошибок</Badge>}
            {c.top_mistake && <span className="truncate text-slate-500">чаще: {titles[c.top_mistake] ?? c.top_mistake}</span>}
          </div>
        </Link>
      ))}
    </div>
  );
}

function useMetricsCatalog() {
  const { registry } = useMetrics();
  return registry?.mistakes;
}
