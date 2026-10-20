import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, Plus } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { useAcademyMe, useIsStaff } from '../../academy/AcademyLayout';
import { useFmt, useMetrics } from '../../academy/metrics';
import { Badge, Button, Empty, Field, Loading, Modal, PageHeader, Select, fmtDate, inputCls } from '../../academy/ui';
import type { Homework } from '../../types/academy';

const COLUMNS: { status: Homework['status']; title: string; tone: 'neutral' | 'warn' | 'info' | 'good' | 'bad' }[] = [
  { status: 'assigned', title: 'Назначено', tone: 'neutral' },
  { status: 'in_progress', title: 'В работе', tone: 'warn' },
  { status: 'done', title: 'Выполнено игроком', tone: 'info' },
  { status: 'verified', title: 'Подтверждено метриками', tone: 'good' },
  { status: 'recurring', title: 'Ошибка повторяется', tone: 'bad' },
];

export function TrainingPage() {
  const { data: me } = useAcademyMe();
  const isStaff = useIsStaff();
  const [player, setPlayer] = useState('');
  const [creating, setCreating] = useState(false);
  const qc = useQueryClient();
  const players = useQuery({ queryKey: ['academy', 'players', 'list'], queryFn: () => academyApi.players({ last: 50 }) });
  const q = useQuery({ queryKey: ['academy', 'homework', 'board', player], queryFn: () => academyApi.homework({ player: player || undefined }) });
  const update = useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => academyApi.updateHomework(id, { status: status as Homework['status'] }), onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'homework'] }) });
  const verify = useMutation({
    mutationFn: async () => {
      const names = [...new Set((q.data ?? []).map((h) => h.player_name))];
      let changed = 0;
      for (const n of names) changed += (await academyApi.verifyHomework(n)).changed;
      return changed;
    },
    onSuccess: (n) => { toast.success(`Проверка по метрикам: изменилось ${n}`); qc.invalidateQueries({ queryKey: ['academy', 'homework'] }); },
  });
  const list = q.data ?? [];

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Домашние задания"
        subtitle={me?.user.academy_role === 'player' ? 'Твои задания: отмечай выполнение — система сама проверит по следующим матчам, ушла ли ошибка.' : 'ДЗ назначаются из ошибок матча. Статус «Подтверждено» ставит система, когда метрика проверки достигла цели на 2+ новых матчах.'}
        actions={<>
          {isStaff && <Select value={player} onChange={setPlayer} placeholder="Все игроки" options={(players.data ?? []).map((p) => ({ value: p.name, label: p.name }))} className="w-44" />}
          {isStaff && <Button onClick={() => verify.mutate()} loading={verify.isPending}><BadgeCheck className="h-4 w-4" />Проверить по метрикам</Button>}
          {isStaff && <Button variant="primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Задание</Button>}
        </>}
      />
      {q.isLoading ? <Loading /> : list.length === 0 ? <Empty title="Заданий нет" hint="Открой матч → «Ошибки и решения» → «ДЗ» у нужной ошибки." /> : (
        <div className="grid gap-3 overflow-x-auto lg:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = list.filter((h) => h.status === col.status);
            return (
              <div key={col.status} className="min-w-[240px] rounded-2xl border border-white/[0.06] bg-[#0b0b0e] p-3">
                <div className="mb-3 flex items-center justify-between"><Badge tone={col.tone}>{col.title}</Badge><span className="text-xs text-slate-500">{items.length}</span></div>
                <div className="space-y-2">
                  {items.map((h) => <HwCard key={h.id} h={h} canEdit={isStaff || me?.user.player_name === h.player_name} onStatus={(s) => update.mutate({ id: h.id, status: s })} isStaff={isStaff} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {creating && <CreateHomework players={(players.data ?? []).map((p) => p.name)} onClose={() => setCreating(false)} />}
    </div>
  );
}

function HwCard({ h, canEdit, onStatus, isStaff }: { h: Homework; canEdit: boolean; onStatus: (s: string) => void; isStaff: boolean }) {
  const { name } = useMetrics();
  const fmt = useFmt();
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-white/[0.07] bg-[#111115] p-3">
      <button type="button" onClick={() => setOpen(!open)} className="w-full text-left">
        <p className="text-xs font-semibold text-[var(--color-signal)]">{h.player_name}</p>
        <p className="mt-0.5 text-sm font-semibold">{h.title}</p>
      </button>
      {h.check_metric && (
        <div className="mt-2 rounded-lg bg-black/30 p-2 text-[11px]">
          <p className="text-slate-500">Цель: {name(h.check_metric)} {h.check_op} {h.check_threshold}</p>
          <p className="text-slate-300">было {fmt(h.check_metric, h.baseline_value)} → сейчас {fmt(h.check_metric, h.last_value)}</p>
        </div>
      )}
      {open && <p className="mt-2 whitespace-pre-wrap text-xs text-slate-400">{h.description}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
        <span>до {h.due_date ? fmtDate(h.due_date) : '—'}</span>
        {h.match_id && <Link to={`/match/${h.match_id}?tab=mistakes`} className="hover:text-white">· матч</Link>}
      </div>
      {canEdit && (
        <div className="mt-2 flex flex-wrap gap-1">
          {h.status === 'assigned' && <Button size="sm" onClick={() => onStatus('in_progress')}>Взять в работу</Button>}
          {(h.status === 'assigned' || h.status === 'in_progress') && <Button size="sm" variant="primary" onClick={() => onStatus('done')}>Выполнено</Button>}
          {isStaff && h.status !== 'verified' && h.status !== 'cancelled' && <Button size="sm" variant="ghost" onClick={() => onStatus('cancelled')}>Отменить</Button>}
        </div>
      )}
    </div>
  );
}

function CreateHomework({ players, onClose }: { players: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { registry } = useMetrics();
  const [f, setF] = useState({ player_name: players[0] ?? '', title: '', description: '', solution_code: '', due_date: '' });
  const create = useMutation({
    mutationFn: () => academyApi.createHomework({ ...f, solution_code: f.solution_code || null, due_date: f.due_date || null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['academy', 'homework'] }); onClose(); },
  });
  return (
    <Modal open onClose={onClose} title="Новое задание">
      <div className="space-y-3">
        <Field label="Игрок"><Select value={f.player_name} onChange={(v) => setF({ ...f, player_name: v })} options={players.map((p) => ({ value: p, label: p }))} /></Field>
        <Field label="Тема (из справочника решений)" hint="Подставит упражнение и метрику проверки"><Select value={f.solution_code} onChange={(v) => {
          const item = registry?.mistakes.find((m) => m.type === v);
          setF({ ...f, solution_code: v, title: f.title || item?.solution.title || '', description: f.description || (item ? `${item.solution.steps.join('\n')}\n\nУпражнение: ${item.solution.drill}` : '') });
        }} placeholder="Без привязки" options={(registry?.mistakes ?? []).map((m) => ({ value: m.type, label: m.title }))} /></Field>
        <Field label="Название"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className={inputCls} /></Field>
        <Field label="Описание"><textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={5} className={inputCls} /></Field>
        <Field label="Срок"><input type="date" value={f.due_date} onChange={(e) => setF({ ...f, due_date: e.target.value })} className={inputCls} /></Field>
        <div className="flex justify-end gap-2"><Button onClick={onClose}>Отмена</Button><Button variant="primary" onClick={() => create.mutate()} disabled={!f.player_name || !f.title} loading={create.isPending}>Назначить</Button></div>
      </div>
    </Modal>
  );
}
