import { lazy, Suspense, useCallback, useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle, BadgeCheck, Bot, Box, Coins, Crosshair, FileText, Flame, LayoutDashboard, Loader2, MessagesSquare, Mic, MonitorPlay,
  MoreHorizontal, RefreshCw, Swords, Users,
} from 'lucide-react';
import { academyApi } from '../../../api/academy';
import { getErrorMessage } from '../../../api/client';
import { useIsStaff } from '../../../academy/AcademyLayout';
import { Badge, Button, ErrorBox, Loading, Select, TabBar, fmtDate } from '../../../academy/ui';
import { MATCH_TYPE_RU, mapTitle, radarImage } from '../../../academy/radar';
import { HubContext, type HubTab, useHub } from './hub';

const OverviewTab = lazy(() => import('./OverviewTab').then((m) => ({ default: m.OverviewTab })));
const ReviewTab = lazy(() => import('./ReviewTab').then((m) => ({ default: m.ReviewTab })));
const PlayersTab = lazy(() => import('./PlayersTab').then((m) => ({ default: m.PlayersTab })));
const DuelsTab = lazy(() => import('./DuelsTab').then((m) => ({ default: m.DuelsTab })));
const UtilityTab = lazy(() => import('./UtilityTab').then((m) => ({ default: m.UtilityTab })));
const HeatmapTab = lazy(() => import('./HeatmapTab').then((m) => ({ default: m.HeatmapTab })));
const EconomyTab = lazy(() => import('./EconomyTab').then((m) => ({ default: m.EconomyTab })));
const MistakesTab = lazy(() => import('./MistakesTab').then((m) => ({ default: m.MistakesTab })));
const CommsTab = lazy(() => import('./CommsTab').then((m) => ({ default: m.CommsTab })));
const CoachChat = lazy(() => import('./CoachChat').then((m) => ({ default: m.CoachChat })));
const ReportTab = lazy(() => import('./ReportTab').then((m) => ({ default: m.ReportTab })));

const TABS: HubTab[] = ['overview', 'review', 'players', 'duels', 'utility', 'heatmaps', 'economy', 'mistakes', 'comms', 'coach', 'report'];
const STAGE_RU: Record<string, string> = { pending: 'В очереди', parsing: 'Парсинг демки', saving: 'Сохранение событий', analyzing: 'Статистика и ИИ-разбор' };

export function MatchHubPage() {
  const { matchId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const isStaff = useIsStaff();
  const qc = useQueryClient();
  const tab = (TABS.includes(params.get('tab') as HubTab) ? params.get('tab') : 'overview') as HubTab;

  const status = useQuery({
    queryKey: ['academy', 'match', matchId, 'status'],
    queryFn: () => academyApi.matchStatus(matchId),
    refetchInterval: (q) => (q.state.data && (q.state.data.status === 'ready' || q.state.data.status === 'error') ? false : 1500),
  });
  const ready = status.data?.status === 'ready';
  const summary = useQuery({ queryKey: ['academy', 'match', matchId, 'summary'], queryFn: () => academyApi.matchSummary(matchId), enabled: ready });

  const setTab = useCallback((t: HubTab) => {
    const next = new URLSearchParams(params);
    next.set('tab', t);
    if (t !== 'review') {
      next.delete('round');
      next.delete('tick');
    }
    setParams(next, { replace: false });
  }, [params, setParams]);

  const openMoment = useCallback((round: number, tick?: number | null, player?: string | null) => {
    const next = new URLSearchParams(params);
    next.set('tab', 'review');
    next.set('round', String(round));
    if (tick != null) next.set('tick', String(Math.round(tick)));
    else next.delete('tick');
    if (player) next.set('player', player);
    else next.delete('player');
    setParams(next);
  }, [params, setParams]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 9) setTab(TABS[n - 1]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [setTab]);

  const reanalyze = useMutation({
    mutationFn: () => academyApi.reanalyze(matchId),
    onSuccess: () => { toast.success('Переанализ поставлен в очередь'); qc.invalidateQueries({ queryKey: ['academy', 'match', matchId] }); },
  });
  const updateMeta = useMutation({
    mutationFn: (body: { match_type?: string; opponent_name?: string }) => academyApi.updateMatch(matchId, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['academy', 'match', matchId, 'summary'] }),
  });

  const ctx = useMemo(() => summary.data ? {
    matchId,
    summary: summary.data,
    tickRate: Number(summary.data.match.tick_rate) || 64,
    isStaff,
    openMoment,
    setTab,
    teamPlayers: (team: string) => summary.data!.players.filter((p) => p.team === team),
  } : null, [summary.data, matchId, isStaff, openMoment, setTab]);

  if (status.isError) return <ErrorBox message={getErrorMessage(status.error)} onRetry={() => status.refetch()} />;
  if (!status.data) return <Loading label="Открываем матч…" />;

  if (status.data.status === 'error') {
    return (
      <div className="mx-auto max-w-2xl space-y-4 pt-10">
        <ErrorBox message={<span><b>Парсинг не удался.</b> {status.data.message}</span>} />
        <div className="flex gap-2">
          {isStaff && <Button variant="primary" onClick={async () => { await academyApi.reparse(matchId); status.refetch(); }}><RefreshCw className="h-4 w-4" />Перепарсить</Button>}
          <Link to="/upload"><Button>Загрузить заново</Button></Link>
        </div>
        <p className="text-xs text-slate-500">Квота за неудачный парсинг не списывается. Причина сохранена в журнале задач (Админка → Задачи парсинга).</p>
      </div>
    );
  }

  if (!ready) {
    const pct = status.data.progress;
    return (
      <div className="mx-auto max-w-xl pt-16 text-center">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[var(--color-signal)]" />
        <h1 className="font-display text-2xl font-bold">{STAGE_RU[status.data.status] ?? status.data.status}</h1>
        <p className="mt-1 text-sm text-slate-500">Обычно это занимает около минуты. В очереди: {status.data.queue.high + status.data.queue.normal}</p>
        <div className="mt-6 h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[var(--color-signal)] transition-all duration-700" style={{ width: `${pct}%` }} /></div>
        <p className="mt-2 font-mono text-xs text-slate-500">{pct}%</p>
      </div>
    );
  }

  if (summary.isLoading || !ctx) return <Loading label="Собираем разбор…" />;
  if (summary.isError) return <ErrorBox message={getErrorMessage(summary.error)} onRetry={() => summary.refetch()} />;

  const m = ctx.summary.match;
  const teamT = ctx.summary.teams.find((t) => t.name === m.team_t_name);
  const teamCt = ctx.summary.teams.find((t) => t.name === m.team_ct_name);
  const openMistakes = Object.values(ctx.summary.mistakes_by_player).reduce((a, v) => a + (v.open ?? 0), 0);

  return (
    <HubContext.Provider value={ctx}>
      <div className="animate-fade-in">
        <header className="relative mb-5 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0b0e]">
          <img src={radarImage(m.map_name)} alt="" className="pointer-events-none absolute -right-16 -top-24 h-[420px] w-[420px] opacity-[0.13]" />
          <div className="relative flex flex-wrap items-center gap-6 p-5">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                <Badge tone="signal">{mapTitle(m.map_name)}</Badge>
                <Badge>{MATCH_TYPE_RU[m.match_type] ?? m.match_type}</Badge>
                <Badge>{fmtDate(m.played_at ?? m.created_at)}</Badge>
                {m.reviewed_by_analyst && <Badge tone="good"><BadgeCheck className="h-3 w-3" />Разобран аналитиком</Badge>}
                {m.has_voice ? <Badge tone="signal"><Mic className="h-3 w-3" />Войс</Badge> : null}
              </div>
              <div className="flex items-center gap-5">
                <TeamHead name={m.team_t_name} score={m.score_t} win={m.score_t > m.score_ct} academy={ctx.summary.academy_teams.includes(m.team_t_name)} sideT={teamT?.metrics.t_win_pct} sideCt={teamT?.metrics.ct_win_pct} />
                <span className="font-display text-3xl text-slate-600">:</span>
                <TeamHead name={m.team_ct_name} score={m.score_ct} win={m.score_ct > m.score_t} academy={ctx.summary.academy_teams.includes(m.team_ct_name)} sideT={teamCt?.metrics.t_win_pct} sideCt={teamCt?.metrics.ct_win_pct} right />
              </div>
            </div>
            <RoundFlow />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={() => setTab('review')}><MonitorPlay className="h-4 w-4" />Разбор</Button>
              <Link to={`/match/${matchId}/replay`}><Button><Box className="h-4 w-4" />2D/3D студия</Button></Link>
              {isStaff && (
                <details className="relative">
                  <summary className="list-none"><span className="inline-flex cursor-pointer items-center rounded-lg border border-white/12 bg-white/[0.04] p-2 hover:bg-white/[0.08]"><MoreHorizontal className="h-4 w-4" /></span></summary>
                  <div className="absolute right-0 z-30 mt-1 w-64 space-y-2 rounded-xl border border-white/10 bg-[#121216] p-3 shadow-2xl">
                    <Select value={m.match_type} onChange={(v) => updateMeta.mutate({ match_type: v })} options={Object.entries(MATCH_TYPE_RU).map(([value, label]) => ({ value, label }))} />
                    <input defaultValue={m.opponent_name ?? ''} placeholder="Соперник" onBlur={(e) => e.target.value !== (m.opponent_name ?? '') && updateMeta.mutate({ opponent_name: e.target.value })} className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-sm" />
                    <Button size="sm" className="w-full" onClick={() => reanalyze.mutate()} loading={reanalyze.isPending}><RefreshCw className="h-3.5 w-3.5" />Пересчитать статистику</Button>
                    <p className="text-[10px] text-slate-500">Парсер {String(m.parser_version ?? '—')} · метрики {String(m.analysis_version ?? '—')}</p>
                  </div>
                </details>
              )}
            </div>
          </div>
        </header>

        <TabBar<HubTab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'overview', label: 'Обзор', icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
            { value: 'review', label: 'Разбор', icon: <MonitorPlay className="h-3.5 w-3.5" /> },
            { value: 'players', label: 'Игроки', icon: <Users className="h-3.5 w-3.5" /> },
            { value: 'duels', label: 'Дуэли', icon: <Swords className="h-3.5 w-3.5" /> },
            { value: 'utility', label: 'Утилити', icon: <Crosshair className="h-3.5 w-3.5" /> },
            { value: 'heatmaps', label: 'Теплокарты', icon: <Flame className="h-3.5 w-3.5" /> },
            { value: 'economy', label: 'Экономика', icon: <Coins className="h-3.5 w-3.5" /> },
            { value: 'mistakes', label: 'Ошибки и решения', icon: <AlertTriangle className="h-3.5 w-3.5" />, count: openMistakes },
            { value: 'comms', label: 'Коммуникации', icon: <Mic className="h-3.5 w-3.5" /> },
            { value: 'coach', label: 'ИИ-тренер', icon: <Bot className="h-3.5 w-3.5" /> },
            { value: 'report', label: 'Отчёт аналитика', icon: <FileText className="h-3.5 w-3.5" /> },
          ]}
        />

        <Suspense fallback={<Loading />}>
          {tab === 'overview' && <OverviewTab />}
          {tab === 'review' && <ReviewTab />}
          {tab === 'players' && <PlayersTab />}
          {tab === 'duels' && <DuelsTab />}
          {tab === 'utility' && <UtilityTab />}
          {tab === 'heatmaps' && <HeatmapTab />}
          {tab === 'economy' && <EconomyTab />}
          {tab === 'mistakes' && <MistakesTab />}
          {tab === 'comms' && <CommsTab />}
          {tab === 'coach' && <div className="mx-auto max-w-4xl"><CoachChat /></div>}
          {tab === 'report' && <ReportTab />}
        </Suspense>
        <p className="mt-8 flex items-center gap-1.5 text-[11px] text-slate-600"><MessagesSquare className="h-3 w-3" />Клавиши 1–9 переключают вкладки · ⌘K — поиск · ? — все горячие клавиши</p>
      </div>
    </HubContext.Provider>
  );
}

function TeamHead({ name, score, win, academy, right, sideT, sideCt }: { name: string; score: number; win: boolean; academy: boolean; right?: boolean; sideT?: number | null; sideCt?: number | null }) {
  return (
    <div className={right ? 'text-right' : ''}>
      <Link to={`/teams/${encodeURIComponent(name)}`} className={`block max-w-[220px] truncate text-sm font-semibold hover:underline ${academy ? 'text-[var(--color-signal)]' : 'text-slate-300'}`}>{name}</Link>
      <p className={`font-display text-5xl font-extrabold leading-none tabular-nums ${win ? 'text-white' : 'text-slate-500'}`}>{score}</p>
      <p className="mt-1 text-[10px] text-slate-500">T {sideT ?? '—'}% · CT {sideCt ?? '—'}%</p>
    </div>
  );
}

function RoundFlow() {
  const ctx = useHub();
  const { rounds, match } = ctx.summary;
  return (
    <div className="hidden min-w-0 flex-1 lg:block">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Ход матча · клик — разбор раунда</p>
      <div className="flex gap-[3px]">
        {rounds.map((r) => {
          const tWin = r.winner_team === match.team_t_name;
          return (
            <button
              key={r.round}
              type="button"
              onClick={() => ctx.openMoment(r.round, r.opening?.tick ?? r.freeze_tick)}
              title={`R${r.round}: ${r.winner_team} (${r.winner_side}) · ${r.reason}${r.mistakes ? ` · ${r.mistakes} ошибок` : ''}`}
              className="group flex flex-1 flex-col items-center gap-[3px]"
            >
              <span className={`h-4 w-full rounded-sm transition-transform group-hover:scale-y-125 ${tWin ? 'bg-[var(--color-signal)]' : 'bg-transparent'}`} style={{ opacity: tWin ? 0.9 : 1 }} />
              <span className="font-mono text-[9px] text-slate-600 group-hover:text-white">{r.round}</span>
              <span className={`h-4 w-full rounded-sm transition-transform group-hover:scale-y-125 ${!tWin ? 'bg-slate-300' : 'bg-transparent'}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

