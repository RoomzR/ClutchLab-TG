import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BadgeCheck, BookOpenCheck, FileText, Sparkles } from 'lucide-react';
import { academyApi } from '../../../api/academy';
import { useHub } from './hub';
import { Badge, Button, Empty, Loading, Panel, PanelHeader, fmtDateTime, inputCls } from '../../../academy/ui';
import type { AnalystReport } from '../../../types/academy';

const STATUS: Record<string, { label: string; tone: 'neutral' | 'warn' | 'good' }> = {
  ai_draft: { label: 'Черновик ИИ', tone: 'neutral' }, in_review: { label: 'На проверке у аналитика', tone: 'warn' }, human_final: { label: 'Финальный отчёт', tone: 'good' },
};

export function ReportTab() {
  const { matchId, isStaff } = useHub();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['academy', 'match', matchId, 'report'], queryFn: () => academyApi.report(matchId) });
  const draft = useMutation({ mutationFn: () => academyApi.createDraft(matchId), onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'match', matchId, 'report'] }) });
  const book = useMutation({ mutationFn: () => academyApi.createBooking({ match_id: matchId, focus: 'Полный разбор матча' }), onSuccess: (b) => toast.success(`Заявка в очереди аналитиков${b.queue_position ? `: #${b.queue_position}` : ''}`) });

  if (q.isLoading) return <Loading />;
  if (!q.data) {
    return (
      <Empty
        icon={<FileText className="h-8 w-8" />}
        title="Отчёта аналитика ещё нет"
        hint="ИИ делает первый проход: черновик собирается из разбора раундов, ошибок и статистики. Аналитик дописывает выводы и план — отчёт становится финальным."
        action={<div className="flex gap-2">
          {isStaff && <Button variant="primary" onClick={() => draft.mutate()} loading={draft.isPending}><Sparkles className="h-4 w-4" />Создать черновик из ИИ-разбора</Button>}
          <Button onClick={() => book.mutate()} loading={book.isPending}><BookOpenCheck className="h-4 w-4" />Заказать разбор аналитиком</Button>
        </div>}
      />
    );
  }
  return <ReportEditor report={q.data} editable={isStaff} />;
}

function ReportEditor({ report, editable }: { report: AnalystReport; editable: boolean }) {
  const { matchId } = useHub();
  const qc = useQueryClient();
  const [summary, setSummary] = useState(report.summary);
  const [sections, setSections] = useState(report.sections);
  useEffect(() => { setSummary(report.summary); setSections(report.sections); }, [report]);
  const save = useMutation({
    mutationFn: (status?: AnalystReport['status']) => academyApi.updateReport(report.id, { summary, sections, status }),
    onSuccess: (_d, status) => {
      toast.success(status === 'human_final' ? 'Отчёт опубликован — матч помечен как разобранный аналитиком' : 'Сохранено');
      qc.invalidateQueries({ queryKey: ['academy', 'match', matchId] });
    },
  });
  const st = STATUS[report.status];
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Panel>
        <PanelHeader
          title="Отчёт аналитика"
          subtitle={`${report.analyst_name ?? ''} · обновлён ${fmtDateTime(report.updated_at)}`}
          actions={<>
            <Badge tone={st.tone}>{report.status === 'human_final' && <BadgeCheck className="h-3 w-3" />}{st.label}</Badge>
            {editable && report.status !== 'human_final' && <>
              <Button size="sm" onClick={() => save.mutate('in_review')} loading={save.isPending}>Сохранить</Button>
              <Button size="sm" variant="primary" onClick={() => save.mutate('human_final')}>Опубликовать финальный</Button>
            </>}
          </>}
        />
        {editable && report.status !== 'human_final'
          ? <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} className={inputCls} />
          : <p className="text-sm text-slate-200">{summary}</p>}
      </Panel>
      {sections.map((s, i) => (
        <Panel key={s.key}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-display font-bold">{s.title}</h3>
            <Badge tone={s.source === 'ai' ? 'info' : 'signal'}>{s.source === 'ai' ? 'из ИИ-разбора' : 'аналитик'}</Badge>
          </div>
          {editable && report.status !== 'human_final' ? (
            <textarea
              value={s.body}
              rows={Math.min(14, Math.max(3, s.body.split('\n').length + 1))}
              onChange={(e) => setSections(sections.map((x, j) => (j === i ? { ...x, body: e.target.value, source: 'analyst' } : x)))}
              className={`${inputCls} font-mono text-[13px]`}
              placeholder="Выводы аналитика…"
            />
          ) : <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-300">{s.body || '—'}</p>}
        </Panel>
      ))}
      <p className="text-center text-xs text-slate-500">Брони и очередь аналитиков — в разделе <Link to="/analysts" className="text-[var(--color-signal)] hover:underline">Живые аналитики</Link></p>
    </div>
  );
}
