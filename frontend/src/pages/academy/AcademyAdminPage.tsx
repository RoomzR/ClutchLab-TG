import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { RefreshCw, Trash2 } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { Badge, Button, DataTable, Field, Kpi, Loading, PageHeader, Panel, PanelHeader, Select, TabBar, fmtDateTime, inputCls } from '../../academy/ui';
import { ROLE_RU } from '../../academy/radar';

type Tab = 'org' | 'members' | 'roster' | 'teams' | 'jobs';

export function AcademyAdminPage() {
  const [tab, setTab] = useState<Tab>('org');
  return (
    <div className="animate-fade-in">
      <PageHeader title="Админка академии" subtitle="Организация, роли, состав, команды и журнал задач парсинга" />
      <TabBar value={tab} onChange={setTab} tabs={[{ value: 'org', label: 'Организация' }, { value: 'members', label: 'Участники и роли' }, { value: 'roster', label: 'Состав' }, { value: 'teams', label: 'Команды академии' }, { value: 'jobs', label: 'Задачи парсинга' }]} />
      {tab === 'org' && <OrgTab />}
      {tab === 'members' && <MembersTab />}
      {tab === 'roster' && <RosterTab />}
      {tab === 'teams' && <TeamsTab />}
      {tab === 'jobs' && <JobsTab />}
    </div>
  );
}

function OrgTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['academy', 'org'], queryFn: academyApi.org });
  const ai = useQuery({ queryKey: ['academy', 'ai'], queryFn: academyApi.aiStatus });
  const [name, setName] = useState('');
  const [ret, setRet] = useState('');
  const save = useMutation({ mutationFn: () => academyApi.updateOrg({ name: name || undefined, retention_days: ret ? Number(ret) : undefined }), onSuccess: () => { toast.success('Сохранено'); qc.invalidateQueries({ queryKey: ['academy'] }); } });
  if (q.isLoading) return <Loading />;
  const o = q.data!;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
      <Panel>
        <PanelHeader title={o.name} subtitle="Настройки организации" />
        <div className="space-y-3">
          <Field label="Название"><input defaultValue={o.name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
          <Field label="Хранение разобранных матчей, дней" hint="Сама .dem хранится 30 дней (нужна только для перепарсинга); статистика, ошибки и отчёты — столько, сколько указано здесь.">
            <input type="number" min={7} max={3650} defaultValue={o.retention_days} onChange={(e) => setRet(e.target.value)} className={inputCls} />
          </Field>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isPending}>Сохранить</Button>
        </div>
      </Panel>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Kpi label="Матчей" value={o.counts.matches} hint={`${o.counts.failed} с ошибкой парсинга`} />
          <Kpi label="Участников" value={o.counts.members} hint={`${o.counts.roster} в составе`} />
          <Kpi label="Демки на диске" value={`${(Number(o.counts.storage_bytes) / 1024 / 1024 / 1024).toFixed(2)} ГБ`} />
          <Kpi label="ИИ" value={ai.data?.available ? 'подключён' : 'правила'} hint={ai.data?.model ?? ai.data?.note ?? ''} tone={ai.data?.available ? 'good' : undefined} />
        </div>
        {!ai.data?.available && <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 text-xs text-slate-400">Чтобы включить LLM для разбора раундов и ИИ-тренера, задайте в окружении бэкенда <code className="text-[#ffb08f]">ANTHROPIC_API_KEY</code> или <code className="text-[#ffb08f]">OPENAI_API_KEY</code> (и опционально <code className="text-[#ffb08f]">LLM_MODEL</code>). Без ключа всё работает на правилах.</p>}
      </div>
    </div>
  );
}

function MembersTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['academy', 'members'], queryFn: academyApi.members });
  const upd = useMutation({ mutationFn: ({ id, body }: { id: string; body: { academy_role?: string; player_name?: string } }) => academyApi.updateMember(id, body), onSuccess: () => { toast.success('Обновлено'); qc.invalidateQueries({ queryKey: ['academy', 'members'] }); } });
  if (q.isLoading) return <Loading />;
  return (
    <DataTable
      rows={q.data ?? []}
      rowKey={(m) => m.id}
      columns={[
        { key: 'u', header: 'Пользователь', cell: (m) => <span><b>{m.username}</b> <span className="text-xs text-slate-500">{m.email}</span></span> },
        { key: 'r', header: 'Роль в академии', cell: (m) => <Select value={m.academy_role} onChange={(v) => upd.mutate({ id: m.id, body: { academy_role: v } })} options={Object.entries(ROLE_RU).map(([value, label]) => ({ value, label }))} className="w-36" /> },
        { key: 'p', header: 'Ник в демках', cell: (m) => <input defaultValue={m.player_name ?? ''} placeholder="как в игре" onBlur={(e) => e.target.value !== (m.player_name ?? '') && upd.mutate({ id: m.id, body: { player_name: e.target.value } })} className={`${inputCls} w-40 py-1`} /> },
        { key: 'l', header: 'Последний вход', cell: (m) => fmtDateTime(m.last_login_at) },
      ]}
    />
  );
}

function RosterTab() {
  const qc = useQueryClient();
  const roster = useQuery({ queryKey: ['academy', 'roster'], queryFn: academyApi.roster });
  const players = useQuery({ queryKey: ['academy', 'players', 'all'], queryFn: () => academyApi.players({ last: 50 }) });
  const teams = useQuery({ queryKey: ['academy', 'academy-teams'], queryFn: academyApi.academyTeams });
  const [f, setF] = useState({ player_name: '', ingame_role: '', team_id: '' });
  const add = useMutation({ mutationFn: () => academyApi.addRoster({ player_name: f.player_name, ingame_role: f.ingame_role || undefined, team_id: f.team_id || undefined }), onSuccess: () => { setF({ player_name: '', ingame_role: '', team_id: '' }); qc.invalidateQueries({ queryKey: ['academy'] }); } });
  const del = useMutation({ mutationFn: (id: string) => academyApi.removeRoster(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'roster'] }) });
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Добавить в состав" subtitle="Игроки состава выделяются во всех таблицах и определяют, какая команда в матче — наша" />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Ник из демок"><Select value={f.player_name} onChange={(v) => setF({ ...f, player_name: v })} placeholder="Выбери игрока" options={(players.data ?? []).filter((p) => !p.in_roster).map((p) => ({ value: p.name, label: `${p.name} (${p.team ?? '—'})` }))} className="w-56" /></Field>
          <Field label="Роль в игре"><input value={f.ingame_role} onChange={(e) => setF({ ...f, ingame_role: e.target.value })} placeholder="энтри, AWP, IGL…" className={`${inputCls} w-40`} /></Field>
          <Field label="Команда"><Select value={f.team_id} onChange={(v) => setF({ ...f, team_id: v })} placeholder="—" options={(teams.data ?? []).map((t) => ({ value: t.id, label: t.name }))} className="w-40" /></Field>
          <Button variant="primary" disabled={!f.player_name} onClick={() => add.mutate()} loading={add.isPending}>Добавить</Button>
        </div>
      </Panel>
      <DataTable
        rows={roster.data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: 'n', header: 'Игрок', cell: (r) => <Link to={`/players/${encodeURIComponent(r.player_name)}`} className="font-semibold hover:text-[var(--color-signal)]">{r.player_name}</Link> },
          { key: 't', header: 'Команда', cell: (r) => r.team_name ?? '—' },
          { key: 'r', header: 'Роль', cell: (r) => r.ingame_role ?? '—' },
          { key: 'a', header: 'Статус', cell: (r) => <Badge tone={r.active ? 'good' : 'neutral'}>{r.active ? 'в составе' : 'неактивен'}</Badge> },
          { key: 'x', header: '', cell: (r) => r.active && <Button size="sm" variant="ghost" onClick={() => del.mutate(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button> },
        ]}
      />
    </div>
  );
}

function TeamsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['academy', 'academy-teams'], queryFn: academyApi.academyTeams });
  const seen = useQuery({ queryKey: ['academy', 'teams'], queryFn: academyApi.teams });
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const add = useMutation({ mutationFn: () => academyApi.createAcademyTeam({ name, demo_names: aliases.split(',').map((s) => s.trim()).filter(Boolean) }), onSuccess: () => { setName(''); setAliases(''); qc.invalidateQueries({ queryKey: ['academy'] }); } });
  const del = useMutation({ mutationFn: (id: string) => academyApi.deleteAcademyTeam(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['academy'] }) });
  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader title="Команда академии" subtitle="Название, под которым команда играет в демках (clan tag). Нужно для W/L, винрейта и «нашей стороны» в матчах." />
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Название"><Select value={name} onChange={setName} placeholder="Из загруженных демок" options={(seen.data ?? []).map((t) => ({ value: t.team_name, label: t.team_name }))} className="w-56" /></Field>
          <Field label="Другие названия в демках" hint="через запятую"><input value={aliases} onChange={(e) => setAliases(e.target.value)} className={`${inputCls} w-64`} /></Field>
          <Button variant="primary" disabled={!name} onClick={() => add.mutate()} loading={add.isPending}>Добавить</Button>
        </div>
      </Panel>
      <ul className="space-y-2">{(q.data ?? []).map((t) => (
        <li key={t.id} className="flex items-center justify-between rounded-xl border border-white/[0.07] bg-[#0d0d10] px-4 py-3"><span><b>{t.name}</b> <span className="text-xs text-slate-500">{t.demo_names.join(', ')}</span></span><Button size="sm" variant="ghost" onClick={() => del.mutate(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button></li>
      ))}</ul>
    </div>
  );
}

function JobsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['academy', 'jobs'], queryFn: academyApi.jobs, refetchInterval: 4000 });
  const retry = useMutation({ mutationFn: (id: string) => academyApi.reparse(id), onSuccess: () => { toast.success('Поставлено в очередь'); qc.invalidateQueries({ queryKey: ['academy', 'jobs'] }); } });
  const tone = { queued: 'neutral', running: 'warn', done: 'good', failed: 'bad' } as const;
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-400">Очередь: высокий приоритет {q.data?.queue.high ?? 0}, обычный {q.data?.queue.normal ?? 0}. Упавший парсинг не списывает квоту.</p>
      <DataTable
        rows={q.data?.jobs ?? []}
        rowKey={(j) => j.id}
        columns={[
          { key: 'q', header: 'Поставлена', cell: (j) => fmtDateTime(j.queued_at), sort: (j) => j.queued_at },
          { key: 'm', header: 'Матч', cell: (j) => <Link to={`/match/${j.match_id}`} className="hover:text-[var(--color-signal)]">{j.team_t_name && j.team_ct_name ? `${j.team_t_name} vs ${j.team_ct_name}` : j.original_filename ?? j.match_id.slice(0, 8)}</Link> },
          { key: 'k', header: 'Тип', cell: (j) => (j.kind === 'analyze' ? 'переанализ' : 'парсинг') },
          { key: 's', header: 'Статус', cell: (j) => <Badge tone={tone[j.status]}>{j.status}</Badge> },
          { key: 'a', header: 'Попытка', align: 'right', cell: (j) => j.attempt },
          { key: 'd', header: 'Длительность', align: 'right', cell: (j) => (j.duration_ms ? `${(j.duration_ms / 1000).toFixed(1)} с` : '—') },
          { key: 'e', header: 'Ошибка', cell: (j) => <span className="block max-w-[340px] truncate text-xs text-rose-300" title={j.error ?? ''}>{j.error ?? ''}</span> },
          { key: 'x', header: '', cell: (j) => j.status === 'failed' && <Button size="sm" onClick={() => retry.mutate(j.match_id)}><RefreshCw className="h-3.5 w-3.5" />Повторить</Button> },
        ]}
      />
    </div>
  );
}
