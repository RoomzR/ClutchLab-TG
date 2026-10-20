import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, ChevronDown, Dumbbell, EyeOff, Play } from 'lucide-react';
import { academyApi } from '../../../api/academy';
import { useHub } from './hub';
import { Badge, Button, Empty, Loading, Panel, SEVERITY_RU, SEVERITY_TONE, Segmented, Select, inputCls } from '../../../academy/ui';
import type { Mistake } from '../../../types/academy';
import { useMetrics } from '../../../academy/metrics';
import { cn } from '../../../lib/cn';

const CATEGORY_RU: Record<string, string> = {
  aim: 'Стрельба', positioning: 'Позиционирование', utility: 'Утилити', teamplay: 'Командная игра', economy: 'Экономика', decision: 'Решения', comms: 'Коммуникация',
};
const STATUS_RU: Record<string, string> = { open: 'Открыта', assigned_as_homework: 'ДЗ назначено', fixed: 'Исправлена', recurring: 'Повторяется', dismissed: 'Отклонена' };

export function MistakesTab() {
  const { matchId, summary, isStaff } = useHub();
  const [severity, setSeverity] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('open');
  const [group, setGroup] = useState<'player' | 'round' | 'type'>('player');
  const q = useQuery({ queryKey: ['academy', 'match', matchId, 'mistakes'], queryFn: () => academyApi.matchMistakes(matchId) });

  const filtered = useMemo(() => (q.data ?? []).filter((m) =>
    (severity === 'all' || m.severity === severity) && (!category || m.category === category) && (!status || m.status === status)), [q.data, severity, category, status]);

  const groups = useMemo(() => {
    const g = new Map<string, Mistake[]>();
    for (const m of filtered) {
      const key = group === 'player' ? (m.player_name ?? `Команда ${m.team_name ?? ''}`) : group === 'round' ? `Раунд ${m.round_number ?? '— (весь матч)'}` : m.title;
      const list = g.get(key);
      if (list) list.push(m);
      else g.set(key, [m]);
    }
    return [...g.entries()].sort((a, b) => score(b[1]) - score(a[1]));
  }, [filtered, group]);

  if (q.isLoading) return <Loading />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented size="sm" value={severity} onChange={setSeverity} options={[{ value: 'all', label: 'Все' }, { value: 'high', label: 'Высокий' }, { value: 'medium', label: 'Средний' }, { value: 'low', label: 'Низкий' }]} />
        <Select value={category} onChange={setCategory} placeholder="Все категории" options={Object.entries(CATEGORY_RU).map(([value, label]) => ({ value, label }))} className="w-44" />
        <Select value={status} onChange={setStatus} placeholder="Любой статус" options={Object.entries(STATUS_RU).map(([value, label]) => ({ value, label }))} className="w-40" />
        <span className="ml-auto text-xs text-slate-500">Группировка</span>
        <Segmented size="sm" value={group} onChange={setGroup} options={[{ value: 'player', label: 'По игрокам' }, { value: 'round', label: 'По раундам' }, { value: 'type', label: 'По типу' }]} />
      </div>
      <p className="text-xs text-slate-500">
        Ошибки находят детерминированные правила по событиям демки. У каждой — доказательство и момент в реплее, решение и метрика, по которой система проверит исправление на следующих матчах.
      </p>
      {groups.length === 0 ? <Empty title="Ошибок по фильтрам нет" hint="Смени фильтр статуса — возможно, всё уже назначено как ДЗ." /> : groups.map(([key, items]) => (
        <Panel key={key} padded={false}>
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5">
            <span className="font-display font-bold">{key}{group === 'player' && summary.roster.includes(key) && <span className="ml-1.5 text-[10px] text-[var(--color-signal)]">● академия</span>}</span>
            <span className="flex gap-1">{(['high', 'medium', 'low'] as const).map((s) => { const n = items.filter((m) => m.severity === s).length; return n ? <Badge key={s} tone={SEVERITY_TONE[s]}>{n}</Badge> : null; })}</span>
          </div>
          <ul className="divide-y divide-white/[0.04]">
            {items.map((m) => <MistakeRow key={m.id} m={m} isStaff={isStaff} />)}
          </ul>
        </Panel>
      ))}
    </div>
  );
}

function score(items: Mistake[]): number {
  return items.reduce((a, m) => a + (m.severity === 'high' ? 3 : m.severity === 'medium' ? 2 : 1), 0);
}

function MistakeRow({ m, isStaff }: { m: Mistake; isStaff: boolean }) {
  const { matchId, openMoment, tickRate } = useHub();
  const { name } = useMetrics();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [comment, setComment] = useState(m.coach_comment ?? '');
  const refresh = () => qc.invalidateQueries({ queryKey: ['academy', 'match', matchId] });
  const assign = useMutation({ mutationFn: () => academyApi.assignHomework(m.id), onSuccess: () => { toast.success(`ДЗ назначено: ${m.player_name}`); refresh(); } });
  const update = useMutation({ mutationFn: (body: { status?: string; coach_comment?: string }) => academyApi.updateMistake(m.id, body), onSuccess: refresh });
  const tick = m.tick_end ?? m.tick_start;
  const ev = m.evidence as Record<string, unknown>;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <Badge tone={SEVERITY_TONE[m.severity]}>{SEVERITY_RU[m.severity]}</Badge>
        <button type="button" onClick={() => setOpen(!open)} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="font-semibold">{m.title}</span>
            {m.round_number && <span className="font-mono text-xs text-slate-500">R{m.round_number}</span>}
            <span className="text-xs text-slate-500">{CATEGORY_RU[m.category]}</span>
            {m.confidence === 'estimated' && <Badge tone="warn" title="Метрика-оценка">≈ оценка</Badge>}
            <ChevronDown className={cn('h-3.5 w-3.5 text-slate-500 transition-transform', open && 'rotate-180')} />
          </span>
          <span className="mt-0.5 block text-sm text-slate-400">{m.explanation}</span>
        </button>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {m.status !== 'open' && <Badge tone={m.status === 'fixed' ? 'good' : m.status === 'recurring' ? 'bad' : 'info'}>{STATUS_RU[m.status]}</Badge>}
          {m.round_number && <Button size="sm" onClick={() => openMoment(m.round_number!, tick ? tick - tickRate * 2 : null, m.player_name)}><Play className="h-3.5 w-3.5" />Момент</Button>}
          {isStaff && m.player_name && m.status === 'open' && <Button size="sm" variant="primary" onClick={() => assign.mutate()} loading={assign.isPending}><Dumbbell className="h-3.5 w-3.5" />ДЗ</Button>}
          {isStaff && m.status === 'open' && <Button size="sm" variant="ghost" onClick={() => update.mutate({ status: 'dismissed' })} title="Не ошибка (отклонить)"><EyeOff className="h-3.5 w-3.5" /></Button>}
          {isStaff && m.status !== 'fixed' && m.status !== 'open' && <Button size="sm" variant="ghost" onClick={() => update.mutate({ status: 'fixed' })} title="Отметить исправленной"><Check className="h-3.5 w-3.5" /></Button>}
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-4 rounded-xl bg-black/25 p-4 lg:grid-cols-2">
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Решение</p>
            {m.solution ? (
              <>
                <p className="font-semibold text-emerald-300">{m.solution.title}</p>
                <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-sm text-slate-300">{m.solution.steps.map((s) => <li key={s}>{s}</li>)}</ol>
                <p className="mt-2 text-sm"><span className="text-slate-500">Упражнение:</span> {m.solution.drill} <span className="text-slate-500">· {m.solution.minutes_per_day} мин/день</span></p>
                <p className="mt-1 text-xs text-slate-500">Проверка исправления: {name(m.solution.check.metric)} {m.solution.check.op} {m.solution.check.threshold} на 2+ следующих матчах</p>
              </>
            ) : <p className="text-sm text-slate-500">{m.recommendation}</p>}
          </div>
          <div>
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Доказательства из демки</p>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {Object.entries(ev).filter(([, v]) => v != null && typeof v !== 'object').slice(0, 12).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd className="truncate font-mono text-slate-300">{String(v)}</dd></div>
              ))}
            </dl>
            {isStaff && (
              <div className="mt-3 flex gap-2">
                <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий тренера" className={inputCls} />
                <Button size="sm" onClick={() => update.mutate({ coach_comment: comment })}>Сохранить</Button>
              </div>
            )}
            {m.homework && <p className="mt-2 text-xs text-cyan-300">ДЗ: {m.homework.status}</p>}
          </div>
        </div>
      )}
    </li>
  );
}
