import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, BookOpenCheck, Dumbbell, FileVideo, Flame, Trophy, Upload } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { useAcademyMe } from '../../academy/AcademyLayout';
import { MatchCard } from '../../academy/MatchCard';
import { fmtValue, percentileText } from '../../academy/metrics';
import { Badge, Button, Empty, Kpi, Loading, PageHeader, Panel, PanelHeader, SEVERITY_TONE, fmtDateTime } from '../../academy/ui';

export function HomePage() {
  const { data: me } = useAcademyMe();
  const matches = useQuery({ queryKey: ['academy', 'matches', 'home'], queryFn: () => academyApi.matches({ limit: 30 }), refetchInterval: (q) => (q.state.data?.some((m) => m.status !== 'ready' && m.status !== 'error') ? 2500 : 30_000) });
  const players = useQuery({ queryKey: ['academy', 'players', 'home'], queryFn: () => academyApi.players({ last: 10 }) });
  const mistakes = useQuery({ queryKey: ['academy', 'mistakes', 'open'], queryFn: () => academyApi.mistakes({ status: 'open', limit: 400 }) });
  const homework = useQuery({ queryKey: ['academy', 'homework', 'active'], queryFn: () => academyApi.homework() });
  const bookings = useQuery({ queryKey: ['academy', 'bookings'], queryFn: () => academyApi.bookings() });

  const all = matches.data ?? [];
  const processing = all.filter((m) => m.status !== 'ready' && m.status !== 'error');
  const ready = all.filter((m) => m.status === 'ready');
  const week = ready.filter((m) => Date.now() - new Date(m.played_at ?? m.created_at).getTime() < 7 * 86400_000);
  const withResult = ready.filter((m) => m.result);
  const wins = withResult.filter((m) => m.result === 'W').length;
  const form = withResult.slice(0, 10);

  const topMistakes = Object.values(
    (mistakes.data ?? []).reduce<Record<string, { type: string; title: string; n: number; high: number; players: Set<string> }>>((acc, m) => {
      const t = (acc[m.type] ??= { type: m.type, title: m.title, n: 0, high: 0, players: new Set() });
      t.n += 1;
      if (m.severity === 'high') t.high += 1;
      if (m.player_name) t.players.add(m.player_name);
      return acc;
    }, {}),
  ).sort((a, b) => b.high * 3 + b.n - (a.high * 3 + a.n)).slice(0, 6);

  const activeHw = (homework.data ?? []).filter((h) => h.status === 'assigned' || h.status === 'in_progress');
  const verified = (homework.data ?? []).filter((h) => h.status === 'verified').length;
  const upcoming = (bookings.data ?? []).filter((b) => b.status === 'requested' || b.status === 'confirmed').slice(0, 4);
  const leaders = (players.data ?? []).filter((p) => p.matches > 0).slice(0, 8);

  return (
    <div className="animate-fade-in">
      <PageHeader
        eyebrow={me?.org?.name ?? 'Академия'}
        title={`Привет${me?.user.username ? `, ${me.user.username}` : ''}`}
        subtitle="Скрим → загрузил демку → разбор за 20–40 минут → ДЗ каждому игроку → через неделю видно, исправлена ли ошибка."
        actions={<Link to="/upload"><Button variant="primary"><Upload className="h-4 w-4" />Загрузить демки</Button></Link>}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Матчей за неделю" value={week.length} hint={`${ready.length} всего разобрано`} icon={<FileVideo className="h-4 w-4" />} />
        <Kpi label="Винрейт академии" value={withResult.length ? `${Math.round((100 * wins) / withResult.length)}%` : '—'} hint={withResult.length ? `${wins}–${withResult.length - wins} в последних ${withResult.length}` : 'Добавьте команду академии в админке'} icon={<Trophy className="h-4 w-4" />} tone={withResult.length && wins / withResult.length >= 0.5 ? 'good' : undefined} />
        <Kpi label="Открытые ошибки" value={mistakes.data?.length ?? '—'} hint={`${(mistakes.data ?? []).filter((m) => m.severity === 'high').length} с высоким приоритетом`} icon={<AlertTriangle className="h-4 w-4" />} tone="signal" />
        <Kpi label="Активные ДЗ" value={activeHw.length} hint={`${verified} подтверждено метриками`} icon={<Dumbbell className="h-4 w-4" />} />
        <Kpi label="Брони аналитиков" value={upcoming.length} hint="в работе" icon={<BookOpenCheck className="h-4 w-4" />} />
      </div>

      {form.length > 0 && (
        <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
          Форма:
          {form.map((m) => (
            <Link key={m.match_id} to={`/match/${m.match_id}`} title={`${m.team_t_name} ${m.score_t}:${m.score_ct} ${m.team_ct_name}`}
              className={`flex h-6 w-6 items-center justify-center rounded text-[11px] font-bold ${m.result === 'W' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
              {m.result === 'W' ? 'W' : 'L'}
            </Link>
          ))}
        </div>
      )}

      {processing.length > 0 && (
        <Panel className="mt-6">
          <PanelHeader title="Очередь разбора" subtitle="Парсинг и анализ идут в фоне — можно закрыть страницу" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{processing.map((m) => <MatchCard key={m.match_id} m={m} compact />)}</div>
        </Panel>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Panel>
          <PanelHeader title="Последние матчи" actions={<Link to="/matches" className="text-xs text-[var(--color-signal)] hover:underline">Все матчи →</Link>} />
          {matches.isLoading ? <Loading /> : ready.length === 0 ? (
            <Empty title="Пока нет матчей" hint="Загрузите демку скрима — через пару минут здесь появится полный разбор." action={<Link to="/upload"><Button variant="primary">Загрузить</Button></Link>} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">{ready.slice(0, 6).map((m) => <MatchCard key={m.match_id} m={m} />)}</div>
          )}
        </Panel>

        <div className="space-y-6">
          <Panel>
            <PanelHeader title="Игроки (10 матчей)" icon={<Flame className="h-4 w-4" />} actions={<Link to="/players" className="text-xs text-[var(--color-signal)] hover:underline">Все →</Link>} />
            {players.isLoading ? <Loading /> : leaders.length === 0 ? <Empty title="Нет данных" /> : (
              <ol className="space-y-1">
                {leaders.map((p, i) => (
                  <li key={p.name}>
                    <Link to={`/players/${encodeURIComponent(p.name)}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                      <span className="w-4 text-xs text-slate-600">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{p.name}{p.in_roster && <span className="ml-1.5 text-[10px] text-[var(--color-signal)]">● академия</span>}</span>
                        <span className="block truncate text-[11px] text-slate-500">{p.team} · {p.matches} матчей</span>
                      </span>
                      <span className="text-right">
                        <span className={`block font-display text-lg font-bold tabular-nums ${percentileText(((p.metrics.rating ?? 1) - 0.6) * 125)}`}>{fmtValue(p.metrics.rating, 'ratio')}</span>
                        <span className="block text-[10px] text-slate-500">ADR {fmtValue(p.metrics.adr, 'num', 0)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Частые ошибки академии" subtitle="Открытые, по всем матчам" />
            {topMistakes.length === 0 ? <Empty title="Открытых ошибок нет" /> : (
              <ul className="space-y-2">
                {topMistakes.map((t) => (
                  <li key={t.type} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.025] px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{t.title}</span>
                      <span className="block truncate text-[11px] text-slate-500">{[...t.players].slice(0, 4).join(', ')}{t.players.size > 4 ? ` +${t.players.size - 4}` : ''}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {t.high > 0 && <Badge tone={SEVERITY_TONE.high}>{t.high} high</Badge>}
                      <Badge>{t.n}</Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="ДЗ и аналитики" actions={<Link to="/training" className="text-xs text-[var(--color-signal)] hover:underline">Все ДЗ →</Link>} />
            <ul className="space-y-2 text-sm">
              {activeHw.slice(0, 4).map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2">
                  <span className="truncate"><span className="font-semibold">{h.player_name}</span> · {h.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">до {h.due_date ? new Date(h.due_date).toLocaleDateString('ru-RU') : '—'}</span>
                </li>
              ))}
              {upcoming.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span className="truncate"><BookOpenCheck className="mr-1 inline h-3.5 w-3.5 text-cyan-300" />{b.team_t_name} vs {b.team_ct_name}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{b.starts_at ? fmtDateTime(b.starts_at) : `очередь #${b.queue_position ?? '—'}`}</span>
                </li>
              ))}
              {activeHw.length === 0 && upcoming.length === 0 && <li className="text-slate-500">Нет активных задач</li>}
            </ul>
            <Link to="/analysts" className="mt-3 inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white">Забронировать разбор аналитиком <ArrowRight className="h-3 w-3" /></Link>
          </Panel>
        </div>
      </div>
    </div>
  );
}
