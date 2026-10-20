import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { academyApi } from '../../../api/academy';
import { useHub } from './hub';
import { PointsMap } from '../../../academy/PointsMap';
import { Loading, Panel, PanelHeader, Segmented, Select } from '../../../academy/ui';
import { sideColor } from '../../../academy/radar';

const KINDS = [
  { value: 'deaths', label: 'Смерти' }, { value: 'kills', label: 'Убийства' }, { value: 'damage', label: 'Урон' },
  { value: 'shots', label: 'Выстрелы' }, { value: 'pings', label: 'Пинги' },
] as const;

export function HeatmapTab() {
  const { matchId, summary, openMoment } = useHub();
  const [kind, setKind] = useState<string>('deaths');
  const [side, setSide] = useState<'all' | 'CT' | 'T'>('all');
  const [player, setPlayer] = useState('');
  const [round, setRound] = useState('');
  const [density, setDensity] = useState<'dots' | 'heat'>('heat');
  const q = useQuery({
    queryKey: ['academy', 'match', matchId, 'heat', kind, side, player, round],
    queryFn: () => academyApi.matchHeatmap(matchId, { kind, side: side === 'all' ? undefined : side, player: player || undefined, round_number: round ? Number(round) : undefined }),
  });
  const points = (q.data ?? []).map((p, i) => ({ id: String(i), x: p.x, y: p.y, color: sideColor(p.side), label: `${p.player} · R${p.round_number}${p.place ? ` · ${p.place}` : ''}` }));
  const places = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of q.data ?? []) if (p.place) c[p.place] = (c[p.place] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [q.data]);
  const total = q.data?.length ?? 0;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Panel>
        <PanelHeader
          title="Теплокарты"
          subtitle={`${total} событий · клик по точке — открыть момент`}
          actions={<>
            <Segmented size="sm" value={kind} onChange={setKind} options={KINDS.map((k) => ({ value: k.value, label: k.label }))} />
            <Segmented size="sm" value={side} onChange={setSide} options={[{ value: 'all', label: 'Обе' }, { value: 'T', label: 'T' }, { value: 'CT', label: 'CT' }]} />
            <Select value={player} onChange={setPlayer} placeholder="Все игроки" options={summary.players.map((p) => ({ value: p.name, label: p.name }))} className="w-36" />
            <Select value={round} onChange={setRound} placeholder="Все раунды" options={summary.rounds.map((r) => ({ value: String(r.round), label: `R${r.round}` }))} className="w-28" />
            <Segmented size="sm" value={density} onChange={setDensity} options={[{ value: 'heat', label: 'Плотность' }, { value: 'dots', label: 'Точки' }]} />
          </>}
        />
        {q.isLoading ? <Loading /> : (
          <div className="mx-auto max-w-[760px]">
            <PointsMap
              mapName={String(summary.match.map_name)}
              points={points}
              density={density === 'heat'}
              onPointClick={(p) => {
                const ev = q.data?.[Number(p.id)];
                if (ev) openMoment(ev.round_number, ev.tick - 64 * 3, ev.player);
              }}
            />
          </div>
        )}
      </Panel>
      <Panel>
        <PanelHeader title="Зоны карты" subtitle="Где происходят события (коллауты из демки)" />
        <ul className="space-y-1.5">
          {places.map(([place, n]) => (
            <li key={place} className="text-xs">
              <div className="mb-0.5 flex justify-between"><span className="text-slate-300">{place}</span><span className="tabular-nums text-slate-500">{n} · {Math.round((100 * n) / Math.max(1, total))}%</span></div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-[var(--color-signal)]" style={{ width: `${(100 * n) / (places[0]?.[1] || 1)}%` }} /></div>
            </li>
          ))}
          {places.length === 0 && <li className="text-sm text-slate-500">Нет событий для выбранных фильтров.</li>}
        </ul>
      </Panel>
    </div>
  );
}
