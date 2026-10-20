import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Crosshair, Film, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { useIsStaff } from '../../academy/AcademyLayout';
import { PointsMap } from '../../academy/PointsMap';
import { Badge, Button, Empty, Field, Loading, Modal, PageHeader, Panel, PanelHeader, Segmented, Select, inputCls } from '../../academy/ui';
import { GRENADE_COLOR, GRENADE_RU, MAPS, fromRadar, mapTitle } from '../../academy/radar';
import type { Lineup } from '../../types/academy';

const TECH_RU: Record<string, string> = { stand: 'Стоя', 'jump-throw': 'Jump-throw', 'run-throw': 'С разбега', 'walk-throw': 'На шаге', crouch: 'Присев', 'right-click': 'ПКМ', 'jump-right-click': 'Прыжок + ПКМ' };

export function LineupsPage() {
  const [params] = useSearchParams();
  const [map, setMap] = useState('de_mirage');
  const [side, setSide] = useState<'all' | 'T' | 'CT'>('all');
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<Lineup | null>(null);
  const [edit, setEdit] = useState<Partial<Lineup> | null>(null);
  const isStaff = useIsStaff();
  const q = useQuery({ queryKey: ['academy', 'lineups', map, side, type], queryFn: () => academyApi.lineups({ map_name: map, side: side === 'all' ? undefined : side, grenade_type: type || undefined }) });
  const all = useMemo(() => q.data ?? [], [q.data]);

  useEffect(() => {
    const id = params.get('id');
    if (id && all.length) setSelected(all.find((l) => l.id === id) ?? null);
  }, [params, all]);

  const points = all.filter((l) => l.land_x != null).map((l) => ({ id: l.id, x: l.land_x!, y: l.land_y!, fromX: l.throw_x ?? undefined, fromY: l.throw_y ?? undefined, color: GRENADE_COLOR[l.grenade_type] ?? '#fff', label: l.title }));

  return (
    <div className="animate-fade-in">
      <PageHeader title="Раскидки" subtitle="Эталонные броски академии: видео, точка броска и приземления, техника. Сравнение «твой бросок vs эталон» — по гранатам из ваших демок." actions={<>
        <Select value={map} onChange={setMap} options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} className="w-36" />
        <Segmented value={side} onChange={setSide} options={[{ value: 'all', label: 'Обе' }, { value: 'T', label: 'T' }, { value: 'CT', label: 'CT' }]} />
        <Select value={type} onChange={setType} placeholder="Все гранаты" options={['smoke', 'flash', 'molotov', 'he'].map((t) => ({ value: t, label: GRENADE_RU[t] }))} className="w-36" />
        {isStaff && <Button variant="primary" onClick={() => setEdit({ map_name: map, side: 'T', grenade_type: 'smoke', technique: 'stand', tags: [] })}><Plus className="h-4 w-4" />Новая раскидка</Button>}
      </>} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-4">
          {q.isLoading ? <Loading /> : all.length === 0 ? (
            <Empty icon={<Crosshair className="h-8 w-8" />} title={`На ${mapTitle(map)} раскидок пока нет`} hint="Создайте вручную или сохраните бросок из демки: Матч → Утилити → кликнуть гранату → «В каталог раскидок»." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {all.map((l) => (
                <button key={l.id} type="button" onClick={() => setSelected(l)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 ${selected?.id === l.id ? 'border-[var(--color-signal)]/60 bg-[var(--color-signal)]/[0.06]' : 'border-white/[0.07] bg-[#0d0d10] hover:border-white/20'}`}>
                  <div className="mb-2 flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: GRENADE_COLOR[l.grenade_type] }} />
                    <Badge tone={l.side === 'CT' ? 'ct' : 't'}>{l.side}</Badge>
                    <Badge>{GRENADE_RU[l.grenade_type]}</Badge>
                    {(l.video_src || l.video_url) && <Film className="ml-auto h-3.5 w-3.5 text-slate-400" />}
                  </div>
                  <p className="font-semibold">{l.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{l.target || '—'} · {TECH_RU[l.technique] ?? l.technique}</p>
                  {l.tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{l.tags.map((t) => <span key={t} className="rounded bg-white/[0.05] px-1.5 text-[10px] text-slate-400">{t}</span>)}</div>}
                </button>
              ))}
            </div>
          )}
          <Panel>
            <PanelHeader title={`Все раскидки на радаре · ${mapTitle(map)}`} />
            <div className="mx-auto max-w-[620px]"><PointsMap mapName={map} points={points} highlight={selected?.id} onPointClick={(p) => setSelected(all.find((l) => l.id === p.id) ?? null)} /></div>
          </Panel>
        </div>
        <div>{selected ? <LineupDetail l={selected} onEdit={() => setEdit(selected)} onDeleted={() => setSelected(null)} /> : <Panel><p className="text-sm text-slate-500">Выбери раскидку, чтобы посмотреть видео, шаги и сравнить броски игроков.</p></Panel>}</div>
      </div>
      {edit && <LineupEditor initial={edit} onClose={() => setEdit(null)} onSaved={(l) => { setEdit(null); setSelected(l); }} />}
    </div>
  );
}

function LineupDetail({ l, onEdit, onDeleted }: { l: Lineup; onEdit: () => void; onDeleted: () => void }) {
  const isStaff = useIsStaff();
  const qc = useQueryClient();
  const [player, setPlayer] = useState('');
  const cmp = useQuery({ queryKey: ['academy', 'lineup', l.id, 'compare', player], queryFn: () => academyApi.compareThrows(l.id, player || undefined), enabled: l.land_x != null });
  const del = useMutation({ mutationFn: () => academyApi.deleteLineup(l.id), onSuccess: () => { qc.invalidateQueries({ queryKey: ['academy', 'lineups'] }); onDeleted(); } });
  const upload = useMutation({
    mutationFn: (f: File) => academyApi.uploadLineupVideo(l.id, f),
    onSuccess: () => { toast.success('Видео загружено'); qc.invalidateQueries({ queryKey: ['academy', 'lineups'] }); },
  });
  const pts = useMemo(() => [
    ...(l.land_x != null ? [{ id: 'ref', x: l.land_x, y: l.land_y!, fromX: l.throw_x ?? undefined, fromY: l.throw_y ?? undefined, color: '#ffffff', ring: cmp.data?.hit_radius ?? 120, size: 1.4, label: 'Эталон' }] : []),
    ...(cmp.data?.throws ?? []).map((t, i) => ({ id: `t${i}`, x: t.to_x, y: t.to_y, color: t.hit ? '#34d399' : '#f87171', label: `${t.player_name} · ${t.distance} юнитов от эталона` })),
  ], [l, cmp.data]);
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title={l.title} subtitle={`${mapTitle(l.map_name)} · ${l.side} · ${GRENADE_RU[l.grenade_type]} · ${TECH_RU[l.technique] ?? l.technique}`} actions={isStaff && <>
          <Button size="sm" onClick={onEdit}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="danger" onClick={() => confirm('Удалить раскидку?') && del.mutate()}><Trash2 className="h-3.5 w-3.5" /></Button>
        </>} />
        {l.video_src ? <video src={l.video_src} controls loop className="w-full rounded-xl" /> : l.video_url ? (
          <a href={l.video_url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 p-3 text-sm text-[var(--color-signal)] hover:underline">Открыть видео ↗</a>
        ) : <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-slate-500">Видео не добавлено</div>}
        {isStaff && (
          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-xs text-slate-400 hover:text-white">
            <Upload className="h-3.5 w-3.5" />{upload.isPending ? 'Загрузка…' : 'Загрузить видео (.mp4/.webm)'}
            <input type="file" accept="video/mp4,video/webm,video/quicktime" hidden onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
          </label>
        )}
        {l.steps && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{l.steps}</p>}
        {l.source_match_id && <Link to={`/match/${l.source_match_id}?tab=utility`} className="mt-2 inline-block text-xs text-slate-500 hover:text-white">Источник: бросок из демки →</Link>}
      </Panel>
      <Panel>
        <PanelHeader title="Твой бросок vs эталон" subtitle={`Броски этой гранаты из демок академии рядом с точкой · зелёные — в радиусе ${cmp.data?.hit_radius ?? 120} юнитов`} />
        {l.land_x == null ? <p className="text-sm text-slate-500">У раскидки нет точки приземления.</p> : (
          <>
            <div className="mb-3"><Select value={player} onChange={setPlayer} placeholder="Все игроки" options={(cmp.data?.players ?? []).map((p) => ({ value: p.player, label: p.player }))} className="w-48" /></div>
            <PointsMap mapName={l.map_name} points={pts} />
            <ul className="mt-3 space-y-1 text-xs">
              {(cmp.data?.players ?? []).map((p) => (
                <li key={p.player} className="flex justify-between"><span className="font-semibold">{p.player}</span><span className="text-slate-400">{p.throws} бросков · попадание {p.hit_pct}% · в среднем {p.avg_distance} юнитов</span></li>
              ))}
              {cmp.data && cmp.data.players.length === 0 && <li className="text-slate-500">В демках таких бросков рядом с эталоном не нашлось.</li>}
            </ul>
          </>
        )}
      </Panel>
    </div>
  );
}

function LineupEditor({ initial, onClose, onSaved }: { initial: Partial<Lineup>; onClose: () => void; onSaved: (l: Lineup) => void }) {
  const qc = useQueryClient();
  const [l, setL] = useState<Partial<Lineup>>(initial);
  const [pick, setPick] = useState<'throw' | 'land'>('land');
  const set = (p: Partial<Lineup>) => setL({ ...l, ...p });
  const save = useMutation({
    mutationFn: () => (l.id ? academyApi.updateLineup(l.id, l) : academyApi.createLineup(l)),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ['academy', 'lineups'] }); toast.success('Сохранено'); onSaved(res); },
  });
  const pts = [
    ...(l.throw_x != null ? [{ id: 'throw', x: l.throw_x, y: l.throw_y!, color: '#ffffff', label: 'Точка броска' }] : []),
    ...(l.land_x != null ? [{ id: 'land', x: l.land_x, y: l.land_y!, fromX: l.throw_x ?? undefined, fromY: l.throw_y ?? undefined, color: GRENADE_COLOR[l.grenade_type ?? 'smoke'], label: 'Приземление' }] : []),
  ];
  return (
    <Modal open onClose={onClose} title={l.id ? 'Редактировать раскидку' : 'Новая раскидка'} wide>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-3">
          <Field label="Название"><input value={l.title ?? ''} onChange={(e) => set({ title: e.target.value })} className={inputCls} placeholder="Смок в окно с T-спавна" /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Карта"><Select value={l.map_name ?? 'de_mirage'} onChange={(v) => set({ map_name: v })} options={MAPS.map((m) => ({ value: m, label: mapTitle(m) }))} /></Field>
            <Field label="Сторона"><Select value={l.side ?? 'T'} onChange={(v) => set({ side: v as 'T' | 'CT' })} options={[{ value: 'T', label: 'T' }, { value: 'CT', label: 'CT' }]} /></Field>
            <Field label="Граната"><Select value={l.grenade_type ?? 'smoke'} onChange={(v) => set({ grenade_type: v })} options={['smoke', 'flash', 'molotov', 'he'].map((t) => ({ value: t, label: GRENADE_RU[t] }))} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Цель / точка"><input value={l.target ?? ''} onChange={(e) => set({ target: e.target.value })} className={inputCls} placeholder="Window, CT, Jungle" /></Field>
            <Field label="Техника"><Select value={l.technique ?? 'stand'} onChange={(v) => set({ technique: v })} options={Object.entries(TECH_RU).map(([value, label]) => ({ value, label }))} /></Field>
          </div>
          <Field label="Роль"><input value={l.role ?? ''} onChange={(e) => set({ role: e.target.value })} className={inputCls} placeholder="Энтри, саппорт, лурк…" /></Field>
          <Field label="Шаги"><textarea value={l.steps ?? ''} onChange={(e) => set({ steps: e.target.value })} rows={4} className={inputCls} placeholder="Встать в угол у ящика, прицел на антенну, jump-throw" /></Field>
          <Field label="Ссылка на видео (если не загружаете файл)"><input value={l.video_url ?? ''} onChange={(e) => set({ video_url: e.target.value })} className={inputCls} placeholder="https://…" /></Field>
          <Field label="Теги через запятую"><input value={(l.tags ?? []).join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className={inputCls} /></Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-slate-400">Кликни на радар, чтобы поставить точку:</span>
            <Segmented size="sm" value={pick} onChange={setPick} options={[{ value: 'throw', label: 'Бросок' }, { value: 'land', label: 'Приземление' }]} />
          </div>
          <PointsMap
            mapName={l.map_name ?? 'de_mirage'}
            points={pts}
            onMapClick={([px, py]) => {
              const [x, y] = fromRadar(l.map_name ?? 'de_mirage', px, py);
              if (pick === 'throw') { set({ throw_x: x, throw_y: y }); setPick('land'); } else set({ land_x: x, land_y: y });
            }}
          />
          <p className="mt-2 text-[11px] text-slate-500">Точнее всего — сохранить бросок прямо из демки во вкладке «Утилити» матча.</p>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Отмена</Button>
        <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!l.title || (l.title?.length ?? 0) < 2}>Сохранить</Button>
      </div>
    </Modal>
  );
}
