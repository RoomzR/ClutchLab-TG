import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bomb, Bot, Crown, Link2, Loader2, NotebookPen, PenTool, Scissors, ShieldCheck, Sparkles, Target, Trash2, Zap } from 'lucide-react';
import { academyApi } from '../../../api/academy';
import { useHub } from './hub';
import { ReplayCanvas, ReplayControls, ReplayTimeline, fmtClock, type ReplayMarker, type TimelineMarker, useReplayClock, useReplayHotkeys, usePlayerStates } from '../../../academy/replay';
import { Badge, Button, Empty, Loading, Panel, SEVERITY_RU, SEVERITY_TONE, Segmented, inputCls } from '../../../academy/ui';
import { BUY_RU, CT_COLOR, REASON_RU, T_COLOR } from '../../../academy/radar';
import { CoachChat } from './CoachChat';
import type { Mistake } from '../../../types/academy';
import { cn } from '../../../lib/cn';

type RightTab = 'review' | 'notes' | 'damage' | 'coach';

export function ReviewTab() {
  const { matchId, summary, tickRate, openMoment, isStaff } = useHub();
  const [params, setParams] = useSearchParams();
  const rounds = summary.rounds;
  const round = Number(params.get('round')) || rounds[0]?.round || 1;
  const rs = rounds.find((r) => r.round === round) ?? rounds[0];
  const [selected, setSelected] = useState<string | null>(params.get('player'));
  const [right, setRight] = useState<RightTab>('review');
  const navigate = useNavigate();

  const detail = useQuery({ queryKey: ['academy', 'match', matchId, 'round', round], queryFn: () => academyApi.roundDetail(matchId, round) });
  const positions = useQuery({ queryKey: ['academy', 'match', matchId, 'pos', round], queryFn: () => academyApi.roundPositions(matchId, round), staleTime: Infinity });
  const grenades = useQuery({ queryKey: ['academy', 'match', matchId, 'gren', round], queryFn: () => academyApi.roundGrenades(matchId, round), staleTime: Infinity });
  const bombs = useQuery({ queryKey: ['academy', 'match', matchId, 'bombs'], queryFn: () => academyApi.bombEvents(matchId), staleTime: Infinity });

  const start = Math.max(rs.start_tick ?? rs.freeze_tick, rs.freeze_tick - tickRate * 4);
  const end = rs.end_tick + tickRate * 3;
  const clock = useReplayClock(start, end, tickRate);
  useReplayHotkeys(clock, tickRate);

  useEffect(() => {
    const t = Number(params.get('tick'));
    if (t) clock.setTick(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, params.get('tick')]);

  const go = useCallback((r: number) => {
    const next = new URLSearchParams(params);
    next.set('round', String(r));
    next.delete('tick');
    setParams(next);
  }, [params, setParams]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const idx = rounds.findIndex((r) => r.round === round);
      if (e.key === 'j' && idx > 0) go(rounds[idx - 1].round);
      if (e.key === 'k' && idx < rounds.length - 1) go(rounds[idx + 1].round);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [rounds, round, go]);

  const roundBombs = useMemo(() => (bombs.data ?? []).filter((b) => b.round_number === round), [bombs.data, round]);
  const mistakes = useMemo(() => detail.data?.mistakes ?? [], [detail.data]);
  const notes = useMemo(() => detail.data?.notes ?? [], [detail.data]);

  const markers: ReplayMarker[] = useMemo(() => mistakes
    .filter((m) => m.player_name && (m.tick_end ?? m.tick_start))
    .map((m) => ({ tick: (m.tick_end ?? m.tick_start)!, player: m.player_name, color: m.severity === 'high' ? '#f87171' : '#fbbf24', label: m.title })), [mistakes]);

  const timeline: TimelineMarker[] = useMemo(() => [
    ...rs.kills.map((k) => ({ tick: k.tick, color: k.killer_side === 'CT' ? CT_COLOR : T_COLOR, label: `${fmtClock((k.tick - rs.freeze_tick) / tickRate)} ${k.killer} → ${k.victim} (${k.weapon})` })),
    ...(rs.plant ? [{ tick: rs.plant.tick, color: '#ef4444', label: `Плант ${rs.plant.site ?? ''} — ${rs.plant.player}`, shape: 'bar' as const }] : []),
    ...(rs.defuse ? [{ tick: rs.defuse.tick, color: '#22d3ee', label: `Дефьюз — ${rs.defuse.player}`, shape: 'bar' as const }] : []),
    ...mistakes.filter((m) => m.tick_end ?? m.tick_start).map((m) => ({ tick: (m.tick_end ?? m.tick_start)!, color: m.severity === 'high' ? '#f87171' : '#fbbf24', label: `Ошибка: ${m.title}${m.player_name ? ` — ${m.player_name}` : ''}`, shape: 'diamond' as const })),
    ...notes.filter((n) => n.tick).map((n) => ({ tick: n.tick!, color: '#a78bfa', label: `Заметка: ${n.text.slice(0, 60)}`, shape: 'diamond' as const })),
  ], [rs, mistakes, notes, tickRate]);

  const states = usePlayerStates(positions.data ?? [], clock.tick, rs.kills);

  const share = async () => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', 'review');
    url.searchParams.set('round', String(round));
    url.searchParams.set('tick', String(Math.round(clock.tick)));
    if (selected) url.searchParams.set('player', selected);
    await navigator.clipboard.writeText(url.toString());
    toast.success('Ссылка на момент скопирована');
  };

  const toBoard = async () => {
    const b = await academyApi.createBoard({ map_name: String(summary.match.map_name), match_id: matchId, round_number: round, tick: Math.round(clock.tick), title: `R${round} · ${fmtClock((clock.tick - rs.freeze_tick) / tickRate)}` });
    navigate(`/boards/${b.id}`);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)_400px]">
      {/* rounds */}
      <Panel padded={false} className="max-h-[calc(100vh-220px)] overflow-y-auto xl:sticky xl:top-[72px]">
        <div className="sticky top-0 z-10 border-b border-white/[0.06] bg-[#0d0d10] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Раунды · J/K</div>
        <ul className="p-1.5">
          {rounds.map((r) => {
            const tWin = r.winner_team === summary.match.team_t_name;
            return (
              <li key={r.round}>
                <button
                  type="button"
                  onClick={() => go(r.round)}
                  className={cn('mb-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors', r.round === round ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]')}
                >
                  <span className={cn('h-7 w-1 rounded-full', tWin ? 'bg-[var(--color-signal)]' : 'bg-slate-300')} />
                  <span className="w-6 font-mono text-xs text-slate-400">{r.round}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{r.winner_team}</span>
                    <span className="block truncate text-[10px] text-slate-500">{BUY_RU[r.buy.T?.type] ?? '—'} vs {BUY_RU[r.buy.CT?.type] ?? '—'}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    {r.plant && <Bomb className="h-3 w-3 text-rose-400" />}
                    {!!r.mistakes && <span className="rounded bg-amber-400/15 px-1 text-[9px] font-bold text-amber-200">{r.mistakes}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* replay */}
      <div className="min-w-0 space-y-3">
        <Panel className="!p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="font-display text-xl font-bold">Раунд {round}</h2>
            <Badge tone={rs.winner_side === 'CT' ? 'ct' : 't'}>{rs.winner_team} · {rs.winner_side}</Badge>
            <Badge>{REASON_RU[rs.reason ?? ''] ?? rs.reason}</Badge>
            <Badge tone="t">T: {BUY_RU[rs.buy.T?.type]} ${rs.buy.T?.avg_equip}</Badge>
            <Badge tone="ct">CT: {BUY_RU[rs.buy.CT?.type]} ${rs.buy.CT?.avg_equip}</Badge>
            {rs.mvp && <Badge tone="signal"><Crown className="h-3 w-3" />MVP {rs.mvp}</Badge>}
            <span className="ml-auto flex gap-1.5">
              <Button size="sm" onClick={share}><Link2 className="h-3.5 w-3.5" />Поделиться моментом</Button>
              <Button size="sm" onClick={toBoard}><PenTool className="h-3.5 w-3.5" />На доску</Button>
            </span>
          </div>
          {positions.isLoading ? (
            <div className="flex aspect-square items-center justify-center rounded-xl bg-black/30"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
          ) : (positions.data?.length ?? 0) === 0 ? (
            <Empty title="Позиций для этого раунда нет в демке" />
          ) : (
            <div className="mx-auto max-w-[760px]">
              <ReplayCanvas
                mapName={String(summary.match.map_name)}
                positions={positions.data!}
                kills={rs.kills}
                grenades={grenades.data ?? []}
                bombs={roundBombs}
                tick={clock.tick}
                tickRate={tickRate}
                selected={selected}
                onSelect={setSelected}
                markers={markers}
              />
            </div>
          )}
          <div className="mt-3 space-y-3">
            <ReplayTimeline start={start} end={end} freeze={rs.freeze_tick} tick={clock.tick} tickRate={tickRate} markers={timeline} onSeek={clock.setTick} />
            <ReplayControls clock={clock} tickRate={tickRate} />
          </div>
        </Panel>

        <Panel className="!p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {(['T', 'CT'] as const).map((side) => (
              <div key={side} className="space-y-1">
                <p className={cn('px-1 text-[10px] font-bold uppercase tracking-wider', side === 'CT' ? 'text-[#a9c2ff]' : 'text-[#ffd590]')}>{rs.teams[side]} · {side}</p>
                {states.filter((s) => s.team === side).map((s) => (
                  <button
                    key={s.name}
                    type="button"
                    onClick={() => setSelected(selected === s.name ? null : s.name)}
                    className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors', selected === s.name ? 'bg-white/[0.09]' : 'hover:bg-white/[0.04]', !s.state && 'opacity-40')}
                  >
                    <span className="w-24 truncate font-semibold">{s.name}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <span className="block h-full rounded-full" style={{ width: `${s.state?.health ?? 0}%`, background: side === 'CT' ? CT_COLOR : T_COLOR }} />
                    </span>
                    <span className="w-7 text-right tabular-nums text-slate-400">{s.state?.health ?? 0}</span>
                    <span className="w-16 truncate text-right text-[10px] text-slate-500">{s.state?.weapon ?? (s.state ? '' : 'мёртв')}</span>
                    <span className="w-12 text-right text-[10px] text-slate-500">${rs.players[s.name]?.equip ?? '—'}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </Panel>

        <Panel className="!p-3">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Киллфид</p>
          <ul className="grid gap-1 md:grid-cols-2">
            {rs.kills.map((k) => (
              <li key={`${k.tick}${k.victim}`}>
                <button type="button" onClick={() => clock.setTick(k.tick - tickRate * 3)} className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-white/[0.05]', clock.tick >= k.tick && 'opacity-60')}>
                  <span className="w-9 font-mono text-[10px] text-slate-500">{fmtClock((k.tick - rs.freeze_tick) / tickRate)}</span>
                  <span style={{ color: k.killer_side === 'CT' ? CT_COLOR : T_COLOR }} className="truncate font-semibold">{k.killer}</span>
                  <span className="text-[10px] text-slate-500">{k.weapon}{k.headshot ? ' ◎' : ''}</span>
                  <span style={{ color: k.victim_side === 'CT' ? CT_COLOR : T_COLOR }} className="truncate">{k.victim}</span>
                  <span className="ml-auto flex gap-1">
                    {k.opening && <Badge tone="signal">open</Badge>}
                    {k.trade_of && <Badge tone="good">трейд</Badge>}
                    {!k.traded && k.victim_side && <span className="text-[9px] text-slate-600">без размена</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* insights */}
      <div className="space-y-3 xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-90px)] xl:overflow-y-auto">
        <Segmented<RightTab>
          value={right}
          onChange={setRight}
          options={[
            { value: 'review', label: <span className="inline-flex items-center gap-1"><Sparkles className="h-3 w-3" />Разбор</span> },
            { value: 'notes', label: <span className="inline-flex items-center gap-1"><NotebookPen className="h-3 w-3" />Заметки {notes.length || ''}</span> },
            { value: 'damage', label: <span className="inline-flex items-center gap-1"><Target className="h-3 w-3" />Урон</span> },
            { value: 'coach', label: <span className="inline-flex items-center gap-1"><Bot className="h-3 w-3" />ИИ-тренер</span> },
          ]}
        />
        {detail.isLoading ? <Loading /> : right === 'review' ? (
          <RoundInsights
            review={detail.data?.review?.data ?? null}
            source={detail.data?.review?.source ?? null}
            model={detail.data?.review?.model ?? null}
            mistakes={mistakes}
            onSeek={(t, p) => { clock.setTick(t - tickRate * 3); if (p) setSelected(p); clock.setPlaying(false); }}
            isStaff={isStaff}
            round={round}
          />
        ) : right === 'notes' ? (
          <RoundNotes round={round} tick={Math.round(clock.tick)} freeze={rs.freeze_tick} selected={selected} onSeek={(t) => clock.setTick(t)} />
        ) : right === 'damage' ? (
          <Panel className="!p-3">
            <table className="w-full text-xs">
              <thead><tr className="text-[10px] uppercase text-slate-500"><th className="py-1 text-left">Кто</th><th className="text-left">Кому</th><th className="text-right">Урон</th><th className="text-right">Попад.</th></tr></thead>
              <tbody>
                {(detail.data?.damage ?? []).sort((a, b) => b.dmg - a.dmg).map((d) => (
                  <tr key={`${d.attacker}${d.victim}`} className="border-t border-white/[0.04]"><td className="py-1 font-semibold">{d.attacker}</td><td>{d.victim}</td><td className="text-right tabular-nums">{d.dmg}</td><td className="text-right tabular-nums text-slate-400">{d.hits}</td></tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ) : (
          <CoachChat compact onCitation={(r, t) => openMoment(r, t)} />
        )}
      </div>
    </div>
  );
}

function RoundInsights({ review, source, model, mistakes, onSeek, isStaff, round }: {
  review: import('../../../types/academy').RoundReview | null; source: string | null; model: string | null; mistakes: Mistake[];
  onSeek: (tick: number, player?: string | null) => void; isStaff: boolean; round: number;
}) {
  const { matchId } = useHub();
  const qc = useQueryClient();
  const assign = useMutation({
    mutationFn: (id: string) => academyApi.assignHomework(id),
    onSuccess: () => { toast.success('ДЗ назначено игроку'); qc.invalidateQueries({ queryKey: ['academy', 'match', matchId] }); },
  });
  const llm = useMutation({
    mutationFn: () => academyApi.llmReviews(matchId, [round]),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'match', matchId, 'round', round] }),
  });
  return (
    <div className="space-y-3">
      <Panel className="!p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">ИИ-разбор раунда</span>
          <Badge tone={source === 'llm' ? 'good' : 'neutral'} title={model ?? undefined}>{source === 'llm' ? `LLM · ${model}` : 'правила'}</Badge>
        </div>
        <p className="text-sm leading-relaxed text-slate-200">{review?.summary ?? '—'}</p>
        {review?.tags?.length ? <div className="mt-2 flex flex-wrap gap-1">{review.tags.map((t) => <Badge key={t} tone="info">{t}</Badge>)}</div> : null}
        {review?.llm?.priorities?.length ? (
          <ul className="mt-3 space-y-2 border-t border-white/[0.05] pt-3">
            {review.llm.priorities.map((p, i) => (
              <li key={i} className="text-xs">
                <button type="button" disabled={!p.tick} onClick={() => p.tick && onSeek(p.tick, p.player)} className="text-left hover:text-white">
                  <span className="font-semibold text-[var(--color-signal)]">{p.player ?? 'Команда'}:</span> {p.point}
                  {p.fix && <span className="block text-slate-400">→ {p.fix}</span>}
                </button>
              </li>
            ))}
          </ul>
        ) : isStaff && source !== 'llm' ? (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => llm.mutate()} loading={llm.isPending}><Zap className="h-3.5 w-3.5" />Переписать через LLM</Button>
        ) : null}
      </Panel>

      <Panel className="!p-3">
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Ошибки и решения · {mistakes.length}</p>
        {mistakes.length === 0 ? <p className="px-1 text-sm text-slate-500">В этом раунде правила ошибок не нашли.</p> : (
          <ul className="space-y-2">
            {mistakes.map((m) => (
              <li key={m.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" onClick={() => (m.tick_end ?? m.tick_start) && onSeek((m.tick_end ?? m.tick_start)!, m.player_name)} className="text-left">
                    <span className="flex items-center gap-1.5">
                      <Badge tone={SEVERITY_TONE[m.severity]}>{SEVERITY_RU[m.severity]}</Badge>
                      <span className="text-sm font-semibold hover:text-[var(--color-signal)]">{m.title}</span>
                      {m.confidence === 'estimated' && <span title="Оценка" className="text-[10px] text-amber-300">≈</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-400">{m.player_name ?? m.team_name}</span>
                  </button>
                  {isStaff && m.player_name && m.status === 'open' && (
                    <Button size="sm" variant="ghost" onClick={() => assign.mutate(m.id)} title="Назначить ДЗ"><ShieldCheck className="h-3.5 w-3.5" />ДЗ</Button>
                  )}
                  {m.status !== 'open' && <Badge tone={m.status === 'fixed' ? 'good' : m.status === 'recurring' ? 'bad' : 'neutral'}>{m.status === 'assigned_as_homework' ? 'ДЗ' : m.status}</Badge>}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{m.explanation}</p>
                <p className="mt-1 text-xs text-emerald-300/90">→ {m.recommendation}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {review?.positives?.length ? (
        <Panel className="!p-3">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Что сделано хорошо</p>
          <ul className="space-y-1">
            {review.positives.map((p, i) => (
              <li key={i}>
                <button type="button" onClick={() => p.tick && onSeek(p.tick, p.player)} className="flex w-full items-center gap-2 rounded-md px-1 py-1 text-left text-xs hover:bg-white/[0.04]">
                  <Scissors className="h-3 w-3 text-emerald-300" /><span className="font-semibold">{p.player}</span><span className="text-slate-400">{p.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}

function RoundNotes({ round, tick, freeze, selected, onSeek }: { round: number; tick: number; freeze: number; selected: string | null; onSeek: (t: number) => void }) {
  const { matchId, tickRate } = useHub();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const notes = useQuery({ queryKey: ['academy', 'match', matchId, 'notes'], queryFn: () => academyApi.notes(matchId) });
  const add = useMutation({
    mutationFn: () => academyApi.addNote(matchId, { round_number: round, tick, player_name: selected, text }),
    onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['academy', 'match', matchId] }); },
  });
  const del = useMutation({ mutationFn: (id: string) => academyApi.deleteNote(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'match', matchId] }) });
  const list = (notes.data ?? []).filter((n) => n.round_number === round);
  return (
    <Panel className="!p-3">
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }} className="space-y-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder={`Заметка на ${fmtClock((tick - freeze) / tickRate)}${selected ? ` · ${selected}` : ''} — что обсудить с командой`} className={inputCls} />
        <Button type="submit" size="sm" variant="primary" loading={add.isPending} disabled={!text.trim()}>Добавить на таймлайн</Button>
      </form>
      <ul className="mt-3 space-y-2">
        {list.map((n) => (
          <li key={n.id} className="rounded-lg bg-white/[0.03] p-2 text-xs">
            <div className="mb-1 flex items-center justify-between text-[10px] text-slate-500">
              <button type="button" onClick={() => n.tick && onSeek(n.tick)} className="font-mono hover:text-white">{n.tick ? fmtClock((n.tick - freeze) / tickRate) : '—'} · {n.author_name}{n.player_name ? ` · ${n.player_name}` : ''}</button>
              <button type="button" onClick={() => del.mutate(n.id)} className="text-slate-600 hover:text-rose-300"><Trash2 className="h-3 w-3" /></button>
            </div>
            <p className="whitespace-pre-wrap text-slate-200">{n.text}</p>
          </li>
        ))}
        {list.length === 0 && <li className="text-xs text-slate-500">Заметок к раунду пока нет.</li>}
      </ul>
    </Panel>
  );
}
