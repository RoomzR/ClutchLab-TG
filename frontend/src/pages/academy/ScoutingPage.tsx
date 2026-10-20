import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, Target, UserSearch } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { getErrorMessage } from '../../api/client';
import { PointsMap } from '../../academy/PointsMap';
import { Badge, Empty, ErrorBox, Loading, PageHeader, Panel, PanelHeader, Segmented, Select } from '../../academy/ui';
import { GRENADE_COLOR, GRENADE_RU, MAPS, mapTitle } from '../../academy/radar';
import { TeamProfileBody } from './TeamsPage';

export function ScoutingPage() {
  const [params, setParams] = useSearchParams();
  const opponent = params.get('opponent') ?? '';
  const [map, setMap] = useState('');
  const teams = useQuery({ queryKey: ['academy', 'teams'], queryFn: academyApi.teams });
  const q = useQuery({ queryKey: ['academy', 'scouting', opponent, map], queryFn: () => academyApi.scouting(opponent, { map_name: map || undefined }), enabled: !!opponent });
  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Разведка соперника"
        subtitle="Загрузите демки соперника (тип «Демка соперника») — здесь соберутся их тенденции, раскидки, позиции и ключевые игроки."
        actions={<>
          <Select value={opponent} onChange={(v) => setParams(v ? { opponent: v } : {})} placeholder="Выбери команду" options={(teams.data ?? []).filter((t) => !t.is_academy).map((t) => ({ value: t.team_name, label: `${t.team_name} (${t.matches})` }))} className="w-56" />
          <Select value={map} onChange={setMap} placeholder="Все карты" options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} className="w-36" />
        </>}
      />
      {!opponent ? <Empty icon={<UserSearch className="h-8 w-8" />} title="Выбери соперника" /> : q.isLoading ? <Loading /> : q.isError ? <ErrorBox message={getErrorMessage(q.error)} /> : q.data && <ScoutBody r={q.data} map={map} />}
    </div>
  );
}

function ScoutBody({ r, map }: { r: import('../../types/academy').ScoutingReport; map: string }) {
  const maps = Object.keys(r.utility_clusters);
  const [m, setM] = useState(map || maps[0] || 'de_mirage');
  const [side, setSide] = useState<'T' | 'CT'>('T');
  const [layer, setLayer] = useState<'utility' | 'kills'>('utility');
  const clusters = useMemo(() => r.utility_clusters[m]?.[side] ?? [], [r.utility_clusters, m, side]);
  const points = useMemo(() => layer === 'utility'
    ? clusters.map((c, i) => ({ id: String(i), x: c.x, y: c.y, fromX: c.from_x, fromY: c.from_y, color: GRENADE_COLOR[c.grenade_type] ?? '#fff', size: Math.min(2.4, 0.8 + c.count / 4), label: `${GRENADE_RU[c.grenade_type]} ×${c.count} (${c.matches} матчей) · ${Object.keys(c.players).join(', ')}` }))
    : r.kill_points.filter((k) => k.map_name === m && k.killer_side === side).map((k, i) => ({ id: String(i), x: k.killer_x, y: k.killer_y, color: side === 'T' ? '#f5a524' : '#5b8cff', label: `${k.killer} · ${k.weapon} · ${k.killer_place}` })), [layer, clusters, r.kill_points, m, side]);
  const early = r.early_positions.filter((e) => e.map_name === m && e.side === side).slice(0, 10);
  const pistols = r.pistols.filter((p) => !map || p.map === map);
  return (
    <div className="space-y-6">
      <TeamProfileBody t={r} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Panel>
          <PanelHeader title="Их утилити и позиции на карте" subtitle="Кластеры приземления гранат и точки, откуда они убивают" actions={<>
            <Select value={m} onChange={setM} options={(maps.length ? maps : MAPS).map((x) => ({ value: x, label: mapTitle(x) }))} className="w-32" />
            <Segmented size="sm" value={side} onChange={setSide} options={[{ value: 'T', label: 'За T' }, { value: 'CT', label: 'За CT' }]} />
            <Segmented size="sm" value={layer} onChange={setLayer} options={[{ value: 'utility', label: 'Утилити' }, { value: 'kills', label: 'Киллы' }]} />
          </>} />
          <div className="mx-auto max-w-[720px]"><PointsMap mapName={m} points={points} density={layer === 'kills'} /></div>
        </Panel>
        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Ключевые игроки" icon={<Target className="h-4 w-4" />} />
            <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">Открывают раунды</p>
            <div className="mb-3 flex flex-wrap gap-1.5">{Object.entries(r.opening_players).map(([p, n]) => <Badge key={p} tone="signal">{p} ×{n}</Badge>)}</div>
            <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">AWP</p>
            <div className="flex flex-wrap gap-1.5">{Object.entries(r.awp_players).map(([p, n]) => <Badge key={p}>{p} — {n} киллов</Badge>)}{!Object.keys(r.awp_players).length && <span className="text-xs text-slate-500">—</span>}</div>
          </Panel>
          <Panel>
            <PanelHeader title="Где стоят на 20-й секунде" subtitle={`${mapTitle(m)} · ${side}`} icon={<Crosshair className="h-4 w-4" />} />
            <ul className="space-y-1 text-sm">{early.map((e) => <li key={e.place} className="flex justify-between"><span className="text-slate-300">{e.place}</span><span className="tabular-nums text-slate-500">{e.n}</span></li>)}{!early.length && <li className="text-xs text-slate-500">Нет данных</li>}</ul>
          </Panel>
          <Panel>
            <PanelHeader title="Пистолетные раунды" />
            <div className="flex flex-wrap gap-1.5">{pistols.map((p, i) => <Badge key={i} tone={p.won ? 'good' : 'bad'}>{mapTitle(p.map)} R{p.round} {p.won ? 'W' : 'L'}</Badge>)}{!pistols.length && <span className="text-xs text-slate-500">—</span>}</div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
