import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shield, UserSearch } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { getErrorMessage } from '../../api/client';
import { MetricLabel, fmtValue, useFmt } from '../../academy/metrics';
import { Badge, Button, DataTable, Empty, ErrorBox, Kpi, Loading, PageHeader, Panel, PanelHeader, Select, fmtDate, timeAgo } from '../../academy/ui';
import { BUY_RU, MAPS, REASON_RU, mapTitle } from '../../academy/radar';
import type { TeamProfile } from '../../types/academy';

export function TeamsPage() {
  const q = useQuery({ queryKey: ['academy', 'teams'], queryFn: academyApi.teams });
  const navigate = useNavigate();
  return (
    <div className="animate-fade-in">
      <PageHeader title="Команды" subtitle="Все команды из загруженных демок: наши составы и соперники" />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty title="Команд пока нет" /> : (
        <DataTable
          rows={q.data}
          rowKey={(t) => t.team_name}
          onRowClick={(t) => navigate(`/teams/${encodeURIComponent(t.team_name)}`)}
          initialSort={{ key: 'matches', dir: 'desc' }}
          columns={[
            { key: 'name', header: 'Команда', cell: (t) => <span className="font-semibold">{t.team_name}{t.is_academy && <Badge tone="signal" className="ml-2">Академия</Badge>}</span>, sort: (t) => t.team_name },
            { key: 'matches', header: 'Матчи', align: 'right', cell: (t) => t.matches, sort: (t) => t.matches },
            { key: 'wr', header: 'Победы', align: 'right', cell: (t) => `${t.wins} (${Math.round((100 * t.wins) / t.matches)}%)`, sort: (t) => t.wins / t.matches },
            { key: 'maps', header: 'Карты', cell: (t) => (t.maps ?? []).map(mapTitle).join(', ') },
            { key: 'last', header: 'Последний матч', cell: (t) => timeAgo(t.last_played), sort: (t) => t.last_played },
          ]}
        />
      )}
    </div>
  );
}

export function TeamProfilePage() {
  const { name = '' } = useParams();
  const [map, setMap] = useState('');
  const q = useQuery({ queryKey: ['academy', 'team', name, map], queryFn: () => academyApi.team(name, { map_name: map || undefined }) });
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorBox message={getErrorMessage(q.error)} />;
  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Команда" title={name} subtitle={`${q.data!.matches} матчей · ${q.data!.wins} побед`} actions={<>
        <Select value={map} onChange={setMap} placeholder="Все карты" options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} className="w-36" />
        <Link to={`/scouting?opponent=${encodeURIComponent(name)}`}><Button><UserSearch className="h-4 w-4" />Разведка</Button></Link>
      </>} />
      <TeamProfileBody t={q.data!} />
    </div>
  );
}

export function TeamProfileBody({ t }: { t: TeamProfile }) {
  const fmt = useFmt();
  const m = t.metrics;
  const sites = Object.entries(t.sites);
  const sitesTotal = sites.reduce((a, [, n]) => a + n, 0) || 1;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Kpi label="Раунды" value={fmtValue(m.round_win_pct, 'pct', 0)} />
        <Kpi label="CT" value={fmtValue(m.ct_win_pct, 'pct', 0)} />
        <Kpi label="T" value={fmtValue(m.t_win_pct, 'pct', 0)} />
        <Kpi label="Пистолетки" value={fmtValue(m.pistol_win_pct, 'pct', 0)} />
        <Kpi label="5v4" value={fmtValue(m.opening_win_pct, 'pct', 0)} />
        <Kpi label="Пост-плант" value={fmtValue(m.post_plant_win_pct, 'pct', 0)} />
        <Kpi label="Ретейки" value={fmtValue(m.retake_win_pct, 'pct', 0)} />
        <Kpi label="Размены" value={fmtValue(m.traded_death_pct, 'pct', 0)} />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
        <Panel>
          <PanelHeader title="Пул карт" icon={<Shield className="h-4 w-4" />} />
          <DataTable
            rows={t.maps}
            rowKey={(r) => r.map}
            dense
            columns={[
              { key: 'map', header: 'Карта', cell: (r) => <span className="font-semibold">{mapTitle(r.map)}</span> },
              { key: 'n', header: 'Матчи', align: 'right', cell: (r) => r.matches, sort: (r) => r.matches },
              { key: 'w', header: 'Победы', align: 'right', cell: (r) => `${Math.round((100 * r.wins) / r.matches)}%`, sort: (r) => r.wins / r.matches },
              { key: 'ct', header: 'CT', align: 'right', cell: (r) => fmtValue(r.metrics.ct_win_pct, 'pct', 0) },
              { key: 't', header: 'T', align: 'right', cell: (r) => fmtValue(r.metrics.t_win_pct, 'pct', 0) },
              { key: 'p', header: 'Пистолетки', align: 'right', cell: (r) => fmtValue(r.metrics.pistol_win_pct, 'pct', 0) },
              { key: 'pp', header: 'Пост-плант', align: 'right', cell: (r) => fmtValue(r.metrics.post_plant_win_pct, 'pct', 0) },
            ]}
          />
        </Panel>
        <Panel>
          <PanelHeader title="Тенденции" subtitle="Как команда играет раунды" />
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Первый контакт</dt><dd className="font-display text-xl font-bold">{fmtValue(m.avg_first_contact, 'sec')}</dd></div>
            <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Время планта</dt><dd className="font-display text-xl font-bold">{fmtValue(m.avg_plant_time, 'sec')}</dd></div>
            <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Утилити за раунд</dt><dd className="font-display text-xl font-bold">{fmtValue(m.utility_per_round, 'ratio', 1)}</dd></div>
            <div className="rounded-lg bg-white/[0.03] p-3"><dt className="text-xs text-slate-500">Урон утилити за раунд</dt><dd className="font-display text-xl font-bold">{fmtValue(m.utility_damage_per_round, 'num')}</dd></div>
          </dl>
          <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Планты по точкам</p>
          <div className="flex h-7 overflow-hidden rounded-lg">
            {sites.map(([s, n], i) => <div key={s} className="flex items-center justify-center text-xs font-bold" style={{ width: `${(100 * n) / sitesTotal}%`, background: i % 2 ? '#334155' : '#ff5a1f' }}>{s} · {Math.round((100 * n) / sitesTotal)}%</div>)}
            {!sites.length && <span className="text-xs text-slate-500">планов нет</span>}
          </div>
          <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Типы закупа (победы / раунды)</p>
          <div className="flex flex-wrap gap-1.5">
            {(['pistol', 'eco', 'force', 'full'] as const).map((b) => <Badge key={b}>{BUY_RU[b]}: {t.counters[`${b}_wins`] ?? 0}/{t.counters[`${b}_rounds`] ?? 0}</Badge>)}
          </div>
          <p className="mb-1.5 mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Как выигрывают раунды</p>
          <div className="flex flex-wrap gap-1.5">{Object.entries(t.win_reasons).map(([r, n]) => <Badge key={r}>{REASON_RU[r] ?? r} ×{n}</Badge>)}</div>
        </Panel>
      </div>
      <Panel>
        <PanelHeader title="Игроки" subtitle="Вклад по последним матчам за эту команду" />
        <DataTable
          rows={t.players}
          rowKey={(p) => p.name}
          initialSort={{ key: 'rating', dir: 'desc' }}
          columns={[
            { key: 'name', header: 'Игрок', cell: (p) => <Link to={`/players/${encodeURIComponent(p.name)}`} className="font-semibold hover:text-[var(--color-signal)]">{p.name}</Link> },
            { key: 'n', header: 'Матчи', align: 'right', cell: (p) => p.matches, sort: (p) => p.matches },
            ...['rating', 'adr', 'kast_pct', 'opening_success_pct', 'entry_success_pct', 'trade_kills', 'awp_kills', 'flash_assists', 'utility_damage_per_round'].map((id) => ({
              key: id, header: <MetricLabel id={id} />, align: 'right' as const, cell: (p: TeamProfile['players'][number]) => fmt(id, p.metrics[id]), sort: (p: TeamProfile['players'][number]) => p.metrics[id],
            })),
          ]}
        />
      </Panel>
      <Panel>
        <PanelHeader title="Последние матчи" />
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {t.recent.map((r) => (
            <li key={r.match_id}>
              <Link to={`/match/${r.match_id}`} className="block rounded-lg border border-white/[0.06] p-3 hover:border-white/20">
                <div className="flex items-center justify-between text-sm"><span className="font-semibold">{mapTitle(r.map)}</span><Badge tone={r.won ? 'good' : 'bad'}>{r.won ? 'W' : 'L'}</Badge></div>
                <p className="mt-1 truncate text-xs text-slate-400">{r.team_t_name} {r.score_t}:{r.score_ct} {r.team_ct_name}</p>
                <div className="mt-2 flex gap-[2px]">{r.series.map((s) => <span key={s.round} title={`R${s.round} ${BUY_RU[s.buy_type]}`} className={`h-2 flex-1 rounded-sm ${s.won ? 'bg-emerald-400/80' : 'bg-white/10'}`} />)}</div>
                <p className="mt-1 text-[10px] text-slate-600">{fmtDate(r.date)}</p>
              </Link>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
