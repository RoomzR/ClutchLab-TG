import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bookmark, Play } from 'lucide-react';
import { academyApi } from '../../../api/academy';
import { getGrenades } from '../../../api/matches';
import { useHub } from './hub';
import { PointsMap, type MapPoint } from '../../../academy/PointsMap';
import { MetricLabel, useFmt } from '../../../academy/metrics';
import { Badge, Button, Loading, Panel, PanelHeader, Segmented, Select, inputCls } from '../../../academy/ui';
import { GRENADE_COLOR, GRENADE_RU } from '../../../academy/radar';
import type { GrenadeData } from '../../../types/match';
import { fmtClock } from '../../../academy/replay';

const UTIL_METRICS = ['utility_per_round', 'utility_damage_per_round', 'he_damage', 'fire_damage', 'enemies_flashed_per_round', 'avg_enemy_blind', 'flash_assists', 'flash_to_kill', 'team_flashes_per_round', 'utility_before_contact_pct', 'unused_util_value_per_death', 'smokes_thrown', 'flashes_thrown', 'he_thrown', 'molotovs_thrown'];

export function UtilityTab() {
  const { matchId, summary, openMoment, isStaff, tickRate } = useHub();
  const fmt = useFmt();
  const [type, setType] = useState('smoke');
  const [side, setSide] = useState<'all' | 'CT' | 'T'>('all');
  const [player, setPlayer] = useState('');
  const [sel, setSel] = useState<GrenadeData | null>(null);
  const [title, setTitle] = useState('');
  const q = useQuery({ queryKey: ['academy', 'match', matchId, 'grenades-all'], queryFn: () => getGrenades(matchId) });
  const save = useMutation({
    mutationFn: () => academyApi.lineupFromGrenade({ match_id: matchId, tick: sel!.tick, player_name: sel!.player_name, title: title || `${GRENADE_RU[sel!.grenade_type]} R${sel!.round_number}` }),
    onSuccess: () => { toast.success('Раскидка сохранена в каталог'); setTitle(''); },
  });

  const list = useMemo(() => (q.data ?? []).filter((g) =>
    (type === 'all' || g.grenade_type === type || (type === 'molotov' && g.grenade_type === 'incendiary'))
    && (side === 'all' || g.team === side) && (!player || g.player_name === player)), [q.data, type, side, player]);
  const points: MapPoint[] = list.map((g, i) => ({
    id: `${g.tick}${g.player_name}${i}`, x: g.to_x, y: g.to_y, fromX: g.from_x, fromY: g.from_y, color: GRENADE_COLOR[g.grenade_type] ?? '#fff',
    label: `${g.player_name} · R${g.round_number} · ${GRENADE_RU[g.grenade_type]}`,
  }));
  const selId = sel ? points[list.indexOf(sel)]?.id : null;
  const roundFreeze = (r: number) => summary.rounds.find((x) => x.round === r)?.freeze_tick ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Panel>
          <PanelHeader
            title="Карта гранат"
            subtitle={`${list.length} бросков · пунктир — от точки броска до приземления`}
            actions={<>
              <Segmented size="sm" value={type} onChange={setType} options={[{ value: 'smoke', label: 'Смоки' }, { value: 'flash', label: 'Флешки' }, { value: 'molotov', label: 'Молотовы' }, { value: 'he', label: 'HE' }, { value: 'all', label: 'Все' }]} />
              <Segmented size="sm" value={side} onChange={setSide} options={[{ value: 'all', label: 'Обе' }, { value: 'T', label: 'T' }, { value: 'CT', label: 'CT' }]} />
              <Select value={player} onChange={setPlayer} placeholder="Все игроки" options={summary.players.map((p) => ({ value: p.name, label: p.name }))} className="w-36" />
            </>}
          />
          {q.isLoading ? <Loading /> : (
            <div className="mx-auto max-w-[720px]">
              <PointsMap mapName={String(summary.match.map_name)} points={points} highlight={selId} onPointClick={(p) => setSel(list[points.findIndex((x) => x.id === p.id)] ?? null)} />
            </div>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Бросок" subtitle="Кликни гранату на карте" />
          {sel ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2"><Badge tone={sel.team === 'CT' ? 'ct' : 't'}>{sel.team}</Badge><span className="font-semibold">{sel.player_name}</span><Badge>{GRENADE_RU[sel.grenade_type]}</Badge></div>
              <p className="text-slate-400">Раунд {sel.round_number} · {fmtClock((sel.tick - roundFreeze(sel.round_number)) / tickRate)} после фризтайма</p>
              <Button variant="primary" onClick={() => openMoment(sel.round_number, sel.tick - tickRate * 3, sel.player_name)}><Play className="h-4 w-4" />Смотреть бросок в разборе</Button>
              {isStaff && (
                <div className="space-y-2 rounded-lg border border-white/[0.07] p-3">
                  <p className="text-xs text-slate-400">Сделать эталоном: точки броска и приземления возьмутся из демки, потом можно добавить видео.</p>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Название, например «Окно с T-спавна»" className={inputCls} />
                  <Button onClick={() => save.mutate()} loading={save.isPending}><Bookmark className="h-4 w-4" />В каталог раскидок</Button>
                </div>
              )}
            </div>
          ) : <p className="text-sm text-slate-500">Выбери бросок, чтобы открыть его в реплее или сохранить как раскидку.</p>}
        </Panel>
      </div>
      <Panel padded={false} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-[10.5px] uppercase text-slate-500"><th className="sticky left-0 bg-[#0d0d10] px-4 py-2 text-left">Игрок</th>{UTIL_METRICS.map((m) => <th key={m} className="whitespace-nowrap px-2.5 py-2 text-right"><MetricLabel id={m} /></th>)}</tr></thead>
          <tbody>
            {summary.players.map((p) => (
              <tr key={p.name} className="border-t border-white/[0.04]">
                <td className="sticky left-0 bg-[#0d0d10] px-4 py-2 font-semibold">{p.name} <span className="text-[10px] font-normal text-slate-600">{p.team}</span></td>
                {UTIL_METRICS.map((m) => <td key={m} className="px-2.5 py-2 text-right tabular-nums text-slate-300">{fmt(m, p.sides.all?.metrics[m])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
