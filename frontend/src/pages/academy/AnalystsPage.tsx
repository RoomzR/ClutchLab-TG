import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarPlus, MessageSquare, Trash2 } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { useAcademyMe, useIsStaff } from '../../academy/AcademyLayout';
import { Badge, Button, Empty, Field, Loading, Modal, PageHeader, Panel, PanelHeader, Select, fmtDateTime, inputCls } from '../../academy/ui';
import { mapTitle } from '../../academy/radar';
import type { AnalystBooking, AnalystSlot } from '../../types/academy';
import { cn } from '../../lib/cn';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'warn' | 'good' | 'bad' | 'info' }> = {
  requested: { label: 'Заявка', tone: 'warn' }, confirmed: { label: 'Подтверждено', tone: 'info' }, done: { label: 'Готово', tone: 'good' }, cancelled: { label: 'Отменено', tone: 'neutral' },
};

export function AnalystsPage() {
  const { data: me } = useAcademyMe();
  const isStaff = useIsStaff();
  const qc = useQueryClient();
  const slots = useQuery({ queryKey: ['academy', 'slots'], queryFn: academyApi.slots });
  const bookings = useQuery({ queryKey: ['academy', 'bookings'], queryFn: () => academyApi.bookings() });
  const [newSlot, setNewSlot] = useState(false);
  const [booking, setBooking] = useState<AnalystSlot | 'queue' | null>(null);
  const [open, setOpen] = useState<AnalystBooking | null>(null);
  const canSlot = me?.user.academy_role === 'analyst' || me?.user.academy_role === 'coach' || me?.user.academy_role === 'admin';
  const delSlot = useMutation({ mutationFn: (id: string) => academyApi.deleteSlot(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'slots'] }) });

  const days = useMemo(() => {
    const out: { date: Date; slots: AnalystSlot[] }[] = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const d = new Date(start.getTime() + i * 86400_000);
      out.push({ date: d, slots: (slots.data ?? []).filter((s) => new Date(s.starts_at).toDateString() === d.toDateString() && s.status !== 'closed') });
    }
    return out;
  }, [slots.data]);

  const queue = (bookings.data ?? []).filter((b) => b.status === 'requested' && !b.slot_id);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Живые аналитики" subtitle="ИИ делает первый проход по матчу, аналитик — углублённый разбор и финальный отчёт. Без оплаты внутри продукта." actions={<>
        <Button onClick={() => setBooking('queue')}>Встать в очередь</Button>
        {canSlot && <Button variant="primary" onClick={() => setNewSlot(true)}><CalendarPlus className="h-4 w-4" />Добавить слот</Button>}
      </>} />
      <Panel className="mb-6">
        <PanelHeader title="Слоты на 2 недели" subtitle="Клик по свободному слоту — забронировать разбор матча" />
        {slots.isLoading ? <Loading /> : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-7">
            {days.map(({ date, slots: ds }) => (
              <div key={date.toISOString()} className="min-h-[110px] rounded-xl border border-white/[0.06] bg-black/20 p-2">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-400">{date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' })}</p>
                <div className="space-y-1">
                  {ds.map((s) => (
                    <div key={s.id} className={cn('group flex items-center justify-between rounded-md px-1.5 py-1 text-[11px]', s.status === 'open' ? 'cursor-pointer bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20' : 'bg-white/[0.04] text-slate-500')}
                      onClick={() => s.status === 'open' && setBooking(s)}>
                      <span>{new Date(s.starts_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })} · {s.analyst_name}</span>
                      {canSlot && s.analyst_id === me?.user.id && s.status === 'open' && (
                        <button type="button" onClick={(e) => { e.stopPropagation(); delSlot.mutate(s.id); }} className="hidden text-slate-500 hover:text-rose-300 group-hover:block"><Trash2 className="h-3 w-3" /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <Panel>
          <PanelHeader title="Брони и заявки" />
          {bookings.isLoading ? <Loading /> : !(bookings.data ?? []).length ? <Empty title="Заявок пока нет" /> : (
            <ul className="divide-y divide-white/[0.05]">
              {bookings.data!.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-3">
                  <Badge tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Badge>
                  <div className="min-w-0 flex-1">
                    <Link to={`/match/${b.match_id}?tab=report`} className="font-semibold hover:text-[var(--color-signal)]">{mapTitle(b.map_name)} · {b.team_t_name} {b.score_t}:{b.score_ct} {b.team_ct_name}</Link>
                    <p className="text-xs text-slate-500">{b.focus || 'Без фокуса'} · от {b.requested_by_name ?? '—'} · {b.starts_at ? fmtDateTime(b.starts_at) : b.queue_position ? `в очереди #${b.queue_position}` : 'без слота'}{b.analyst_name ? ` · ${b.analyst_name}` : ''}</p>
                  </div>
                  {b.report_status && <Badge tone={b.report_status === 'human_final' ? 'good' : 'neutral'}>{b.report_status === 'human_final' ? 'отчёт готов' : 'черновик'}</Badge>}
                  <Button size="sm" variant="ghost" onClick={() => setOpen(b)}><MessageSquare className="h-3.5 w-3.5" /></Button>
                  {isStaff && b.status === 'requested' && <Button size="sm" onClick={async () => { await academyApi.updateBooking(b.id, { status: 'confirmed' }); qc.invalidateQueries({ queryKey: ['academy', 'bookings'] }); }}>Взять</Button>}
                  {isStaff && b.status === 'confirmed' && b.match_id && <Link to={`/match/${b.match_id}?tab=report`}><Button size="sm" variant="primary">Отчёт</Button></Link>}
                  {(b.status === 'requested' || b.status === 'confirmed') && <Button size="sm" variant="ghost" onClick={async () => { await academyApi.updateBooking(b.id, { status: 'cancelled' }); qc.invalidateQueries({ queryKey: ['academy'] }); }}>Отменить</Button>}
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <PanelHeader title={`Очередь · ${queue.length}`} subtitle="Заявки без конкретного слота — берутся по порядку" />
          <ol className="space-y-1.5 text-sm">{queue.map((b) => <li key={b.id} className="flex gap-2"><span className="font-mono text-slate-500">#{b.queue_position}</span><span className="truncate">{b.team_t_name} vs {b.team_ct_name}</span></li>)}</ol>
        </Panel>
      </div>
      {newSlot && <NewSlot onClose={() => setNewSlot(false)} />}
      {booking && <BookModal slot={booking === 'queue' ? null : booking} onClose={() => setBooking(null)} />}
      {open && <Comments booking={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function NewSlot({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState('60');
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: () => { const s = new Date(start); return academyApi.createSlot({ starts_at: s.toISOString(), ends_at: new Date(s.getTime() + Number(duration) * 60_000).toISOString(), note }); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['academy', 'slots'] }); onClose(); },
  });
  return (
    <Modal open onClose={onClose} title="Новый слот">
      <div className="space-y-3">
        <Field label="Начало"><input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={inputCls} /></Field>
        <Field label="Длительность"><Select value={duration} onChange={setDuration} options={['30', '45', '60', '90', '120'].map((v) => ({ value: v, label: `${v} мин` }))} /></Field>
        <Field label="Заметка"><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={!start} loading={m.isPending} onClick={() => m.mutate()}>Создать</Button></div>
      </div>
    </Modal>
  );
}

function BookModal({ slot, onClose }: { slot: AnalystSlot | null; onClose: () => void }) {
  const qc = useQueryClient();
  const matches = useQuery({ queryKey: ['academy', 'matches', 'book'], queryFn: () => academyApi.matches({ status: 'ready', limit: 50 }) });
  const [matchId, setMatchId] = useState('');
  const [focus, setFocus] = useState('');
  const m = useMutation({
    mutationFn: () => academyApi.createBooking({ match_id: matchId, slot_id: slot?.id ?? null, focus }),
    onSuccess: (b) => { toast.success(slot ? 'Слот забронирован' : `Вы в очереди: #${b.queue_position}`); qc.invalidateQueries({ queryKey: ['academy'] }); onClose(); },
  });
  return (
    <Modal open onClose={onClose} title={slot ? `Бронь: ${fmtDateTime(slot.starts_at)} · ${slot.analyst_name}` : 'Очередь на разбор'}>
      <div className="space-y-3">
        <Field label="Матч"><Select value={matchId} onChange={setMatchId} placeholder="Выбери матч" options={(matches.data ?? []).map((x) => ({ value: x.match_id, label: `${mapTitle(x.map_name)} · ${x.team_t_name} ${x.score_t}:${x.score_ct} ${x.team_ct_name}` }))} /></Field>
        <Field label="На что смотреть"><textarea value={focus} onChange={(e) => setFocus(e.target.value)} rows={3} className={inputCls} placeholder="Например: T-сторона, выходы на B, экономика после пистолетки" /></Field>
        <p className="text-xs text-slate-500">Аналитик получит готовый ИИ-черновик: разбор раундов, ошибки и статистику.</p>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Отмена</Button><Button variant="primary" disabled={!matchId} loading={m.isPending} onClick={() => m.mutate()}>{slot ? 'Забронировать' : 'В очередь'}</Button></div>
      </div>
    </Modal>
  );
}

function Comments({ booking, onClose }: { booking: AnalystBooking; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const q = useQuery({ queryKey: ['academy', 'booking', booking.id, 'comments'], queryFn: () => academyApi.bookingComments(booking.id) });
  const add = useMutation({ mutationFn: () => academyApi.addBookingComment(booking.id, text), onSuccess: () => { setText(''); qc.invalidateQueries({ queryKey: ['academy', 'booking', booking.id] }); } });
  return (
    <Modal open onClose={onClose} title="Комментарии к брони">
      <ul className="mb-3 max-h-72 space-y-2 overflow-y-auto">
        {(q.data ?? []).map((c) => <li key={c.id} className="rounded-lg bg-white/[0.04] p-2 text-sm"><p className="text-[11px] text-slate-500">{c.author_name} · {fmtDateTime(c.created_at)}</p><p>{c.text}</p></li>)}
        {q.data?.length === 0 && <li className="text-sm text-slate-500">Комментариев нет</li>}
      </ul>
      <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }} className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} className={inputCls} placeholder="Сообщение аналитику или тренеру" />
        <Button type="submit" variant="primary" loading={add.isPending}>Отправить</Button>
      </form>
    </Modal>
  );
}
