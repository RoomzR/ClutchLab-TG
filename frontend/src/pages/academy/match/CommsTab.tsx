import { useQuery } from '@tanstack/react-query';
import { MessageSquare, MicOff, Play, Radio } from 'lucide-react';
import { academyApi } from '../../../api/academy';
import { useHub } from './hub';
import { Badge, DataTable, Empty, Kpi, Loading, Panel, PanelHeader } from '../../../academy/ui';
import { fmtClock } from '../../../academy/replay';

const EVENT_RU: Record<string, string> = { contact_unmarked: 'Контакт без пинга', late_ping: 'Поздний пинг', duplicate_ping: 'Дублирующий пинг' };

export function CommsTab() {
  const { matchId, openMoment } = useHub();
  const q = useQuery({ queryKey: ['academy', 'match', matchId, 'comms'], queryFn: () => academyApi.comms(matchId) });
  if (q.isLoading) return <Loading />;
  if (!q.data) return <Empty title="Отчёт по коммуникациям не построен" hint="Пересчитайте статистику матча." />;
  const r = q.data;
  const players: (Record<string, number> & { name: string })[] = Object.entries(r.players).map(([name, v]) => ({ ...v, name } as Record<string, number> & { name: string }));

  return (
    <div className="space-y-6">
      {!r.voice.available ? (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-4">
          <MicOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div>
            <p className="font-semibold text-amber-100">Голосовой анализ недоступен для этой демки</p>
            <p className="mt-1 text-sm text-amber-100/70">{r.voice.message}</p>
            <p className="mt-1 text-xs text-amber-100/50">Причина: {r.voice.reason}. Ниже — то, что демка реально содержит: пинги и текстовый чат.</p>
          </div>
        </div>
      ) : (
        <Badge tone="good">Голос в демке есть</Badge>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Пинги" value={r.summary.pings} icon={<Radio className="h-4 w-4" />} />
        <Kpi label="Контакты с врагом" value={r.summary.contacts} />
        <Kpi label="Отмечены пингом" value={r.summary.contacts_pinged_pct != null ? `${r.summary.contacts_pinged_pct}%` : '—'} />
        <Kpi label="Поздние пинги" value={r.summary.late_pings} hint="> 2 с после контакта" />
        <Kpi label="Дубли" value={r.summary.duplicate_pings} hint="одна точка, двое игроков" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Игроки" subtitle="Кто передаёт инфу пингами" />
          <DataTable
            rows={players}
            rowKey={(p) => p.name}
            initialSort={{ key: 'pings', dir: 'desc' }}
            dense
            columns={[
              { key: 'name', header: 'Игрок', cell: (p) => <span className="font-semibold">{p.name}</span> },
              { key: 'pings', header: 'Пинги', align: 'right', cell: (p) => p.pings ?? 0, sort: (p) => p.pings ?? 0 },
              { key: 'urgent', header: 'Срочные', align: 'right', cell: (p) => p.urgent_pings ?? 0, sort: (p) => p.urgent_pings ?? 0 },
              { key: 'unmarked', header: 'Контакт без пинга', align: 'right', cell: (p) => p.contacts_unmarked ?? 0, sort: (p) => p.contacts_unmarked ?? 0 },
              { key: 'late', header: 'Поздние', align: 'right', cell: (p) => p.late_pings ?? 0, sort: (p) => p.late_pings ?? 0 },
              { key: 'dup', header: 'Дубли', align: 'right', cell: (p) => p.duplicate_pings ?? 0, sort: (p) => p.duplicate_pings ?? 0 },
              { key: 'chat', header: 'Чат', align: 'right', cell: (p) => p.chat_messages ?? 0, sort: (p) => p.chat_messages ?? 0 },
            ]}
          />
          {r.notes.map((n) => <p key={n} className="mt-3 text-xs text-slate-500">{n}</p>)}
        </Panel>
        <Panel>
          <PanelHeader title="События" subtitle="Клик — открыть момент" />
          <ul className="max-h-[420px] space-y-1 overflow-y-auto">
            {r.events.slice(0, 150).map((e, i) => (
              <li key={i}>
                <button type="button" onClick={() => openMoment(e.round, e.tick - 64 * 3, e.player)} className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/[0.04]">
                  <span className="w-8 font-mono text-slate-500">R{e.round}</span>
                  <Badge tone={e.type === 'contact_unmarked' ? 'warn' : e.type === 'late_ping' ? 'info' : 'neutral'}>{EVENT_RU[e.type] ?? e.type}</Badge>
                  <span className="flex-1 text-slate-300"><b>{e.player}</b> — {e.text}</span>
                  <Play className="h-3 w-3 shrink-0 text-slate-600" />
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Текстовый чат" icon={<MessageSquare className="h-4 w-4" />} />
        {r.chat.length === 0 ? <p className="text-sm text-slate-500">Сообщений в чате нет.</p> : (
          <ul className="space-y-1 text-sm">
            {r.chat.map((c, i) => (
              <li key={i} className="flex gap-3">
                <span className="w-16 shrink-0 font-mono text-xs text-slate-500">R{c.round} {c.time != null ? fmtClock(c.time) : ''}</span>
                <span className="shrink-0 font-semibold">{c.player ?? 'сервер'}</span>
                <span className="text-slate-300">{c.text}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
