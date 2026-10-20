import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { academyApi } from '../../api/academy';
import { MetricLabel, useFmt } from '../../academy/metrics';
import { Badge, DataTable, Empty, Loading, PageHeader, Segmented, Select, timeAgo } from '../../academy/ui';
import { MAPS, mapTitle } from '../../academy/radar';
import type { AcademyPlayerRow } from '../../types/academy';

const COLS = ['rating', 'kd', 'adr', 'kast_pct', 'hs_pct', 'opening_success_pct', 'traded_death_pct', 'counter_strafe_pct', 'crosshair_deg', 'utility_damage_per_round', 'enemies_flashed_per_round', 'clutch_wins', 'unused_util_value_per_death'];

export function PlayersPage() {
  const [last, setLast] = useState('10');
  const [map, setMap] = useState('');
  const [side, setSide] = useState<'all' | 'CT' | 'T'>('all');
  const [roster, setRoster] = useState<'all' | 'roster'>('all');
  const navigate = useNavigate();
  const fmt = useFmt();
  const q = useQuery({ queryKey: ['academy', 'players', last, map, side, roster], queryFn: () => academyApi.players({ last: Number(last), map_name: map || undefined, side, roster_only: roster === 'roster' }) });
  return (
    <div className="animate-fade-in">
      <PageHeader title="Игроки" subtitle="Агрегат по последним матчам каждого игрока · клик — профиль" actions={<>
        <Segmented value={roster} onChange={setRoster} options={[{ value: 'all', label: 'Все из демок' }, { value: 'roster', label: 'Состав академии' }]} />
        <Select value={last} onChange={setLast} options={['5', '10', '20', '50'].map((v) => ({ value: v, label: `${v} матчей` }))} className="w-32" />
        <Select value={map} onChange={setMap} placeholder="Все карты" options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} className="w-32" />
        <Segmented value={side} onChange={setSide} options={[{ value: 'all', label: 'Все' }, { value: 'CT', label: 'CT' }, { value: 'T', label: 'T' }]} />
      </>} />
      {q.isLoading ? <Loading /> : !q.data?.length ? <Empty title="Нет игроков" hint="Загрузите демки — игроки появятся автоматически." /> : (
        <DataTable<AcademyPlayerRow>
          rows={q.data}
          rowKey={(p) => p.name}
          onRowClick={(p) => navigate(`/players/${encodeURIComponent(p.name)}`)}
          initialSort={{ key: 'rating', dir: 'desc' }}
          stickyFirst
          columns={[
            { key: 'name', header: 'Игрок', cell: (p) => <span className="font-semibold">{p.name}{p.in_roster && <span className="ml-1.5 text-[10px] text-[var(--color-signal)]">●</span>}<span className="ml-2 text-[11px] font-normal text-slate-500">{p.team}</span></span>, sort: (p) => p.name },
            { key: 'matches', header: 'Матчи', align: 'right', cell: (p) => p.matches, sort: (p) => p.matches },
            { key: 'wr', header: 'Победы', align: 'right', cell: (p) => `${Math.round((100 * p.wins) / Math.max(1, p.matches))}%`, sort: (p) => p.wins / Math.max(1, p.matches) },
            ...COLS.map((id) => ({ key: id, header: <MetricLabel id={id} />, align: 'right' as const, cell: (p: AcademyPlayerRow) => fmt(id, p.metrics[id]), sort: (p: AcademyPlayerRow) => p.metrics[id] })),
            { key: 'open', header: 'Ошибки', align: 'right', cell: (p) => (p.open_mistakes ? <Badge tone="warn">{p.open_mistakes}</Badge> : '—'), sort: (p) => p.open_mistakes },
            { key: 'hw', header: 'ДЗ', align: 'right', cell: (p) => p.active_homework || '—', sort: (p) => p.active_homework },
            { key: 'last', header: 'Последний матч', cell: (p) => timeAgo(p.last_played), sort: (p) => p.last_played },
          ]}
        />
      )}
    </div>
  );
}
