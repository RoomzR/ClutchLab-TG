import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LayoutGrid, List, Search } from 'lucide-react';
import { academyApi, type MatchFilters } from '../../api/academy';
import { MatchCard } from '../../academy/MatchCard';
import { Badge, Button, DataTable, Empty, ErrorBox, Loading, PageHeader, Segmented, Select, fmtDate, inputCls, useLocalState } from '../../academy/ui';
import { MAPS, MATCH_TYPE_RU, mapTitle } from '../../academy/radar';
import type { AcademyMatch } from '../../types/academy';
import { getErrorMessage } from '../../api/client';

export function MatchesPage() {
  const [filters, setFilters] = useLocalState<MatchFilters>('cl_match_filters', {});
  const [view, setView] = useLocalState<'cards' | 'table'>('cl_match_view', 'cards');
  const [q, setQ] = useState(filters.q ?? '');
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: ['academy', 'matches', filters],
    queryFn: () => academyApi.matches({ ...filters, limit: 200 }),
    refetchInterval: (s) => (s.state.data?.some((m) => m.status !== 'ready' && m.status !== 'error') ? 2500 : false),
  });
  const set = (p: Partial<MatchFilters>) => setFilters({ ...filters, ...p });
  const data = useMemo(() => query.data ?? [], [query.data]);
  const teams = useMemo(() => [...new Set(data.flatMap((m) => [m.team_t_name, m.team_ct_name]))].sort(), [data]);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Матчи" subtitle={`${data.length} матчей · фильтры сохраняются`} actions={<Link to="/upload"><Button variant="primary">Загрузить демки</Button></Link>} />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <form onSubmit={(e) => { e.preventDefault(); set({ q: q || undefined }); }} className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Команда, игрок, файл…" className={`${inputCls} w-64 pl-9`} />
        </form>
        <Select value={filters.map_name ?? ''} onChange={(v) => set({ map_name: v || undefined })} placeholder="Все карты" options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} className="w-36" />
        <Select value={filters.match_type ?? ''} onChange={(v) => set({ match_type: v || undefined })} placeholder="Все типы" options={Object.entries(MATCH_TYPE_RU).map(([value, label]) => ({ value, label }))} className="w-40" />
        <Select value={filters.team ?? ''} onChange={(v) => set({ team: v || undefined })} placeholder="Все команды" options={teams.map((t) => ({ value: t, label: t }))} className="w-40" />
        <Segmented
          size="sm"
          value={filters.reviewed === true ? 'yes' : filters.open_mistakes ? 'open' : 'all'}
          onChange={(v) => set({ reviewed: v === 'yes' ? true : undefined, open_mistakes: v === 'open' ? true : undefined })}
          options={[{ value: 'all', label: 'Все' }, { value: 'open', label: 'С открытыми ошибками' }, { value: 'yes', label: 'Разобраны аналитиком' }]}
        />
        {(filters.map_name || filters.match_type || filters.team || filters.q || filters.reviewed || filters.open_mistakes) && (
          <Button size="sm" variant="ghost" onClick={() => { setFilters({}); setQ(''); }}>Сбросить</Button>
        )}
        <div className="ml-auto">
          <Segmented value={view} onChange={setView} options={[{ value: 'cards', label: <LayoutGrid className="h-3.5 w-3.5" /> }, { value: 'table', label: <List className="h-3.5 w-3.5" /> }]} />
        </div>
      </div>

      {query.isLoading ? <Loading /> : query.isError ? <ErrorBox message={getErrorMessage(query.error)} onRetry={() => query.refetch()} /> : data.length === 0 ? (
        <Empty title="Матчей не найдено" hint="Измените фильтры или загрузите новые демки." />
      ) : view === 'cards' ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{data.map((m) => <MatchCard key={m.match_id} m={m} />)}</div>
      ) : (
        <DataTable<AcademyMatch>
          rows={data}
          rowKey={(m) => m.match_id}
          onRowClick={(m) => navigate(`/match/${m.match_id}`)}
          initialSort={{ key: 'date', dir: 'desc' }}
          columns={[
            { key: 'date', header: 'Дата', cell: (m) => fmtDate(m.played_at ?? m.created_at), sort: (m) => m.played_at ?? m.created_at },
            { key: 'map', header: 'Карта', cell: (m) => mapTitle(m.map_name), sort: (m) => m.map_name ?? '' },
            { key: 'teams', header: 'Матч', cell: (m) => <span>{m.team_t_name} <b className="mx-1 tabular-nums">{m.score_t}:{m.score_ct}</b> {m.team_ct_name}</span> },
            { key: 'type', header: 'Тип', cell: (m) => MATCH_TYPE_RU[m.match_type] ?? m.match_type, sort: (m) => m.match_type },
            { key: 'result', header: 'Итог', cell: (m) => (m.result ? <Badge tone={m.result === 'W' ? 'good' : 'bad'}>{m.result}</Badge> : '—'), sort: (m) => m.result ?? '' },
            { key: 'rounds', header: 'Раунды', align: 'right', cell: (m) => m.rounds, sort: (m) => m.rounds },
            { key: 'open', header: 'Открытые ошибки', align: 'right', cell: (m) => m.open_mistakes || '—', sort: (m) => m.open_mistakes },
            { key: 'status', header: 'Статус', cell: (m) => (m.status === 'ready' ? (m.reviewed_by_analyst ? <Badge tone="good">Аналитик</Badge> : <Badge tone="info">ИИ</Badge>) : <Badge tone={m.status === 'error' ? 'bad' : 'warn'}>{m.status} {m.progress}%</Badge>) },
          ]}
        />
      )}
    </div>
  );
}
