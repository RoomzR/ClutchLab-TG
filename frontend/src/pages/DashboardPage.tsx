import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  Crown,
  GitCompare,
  History,
  Map as MapIcon,
  Upload,
  Users,
} from 'lucide-react';
import { FileUpload } from '../components/FileUpload';
import { ProgressBar } from '../components/ProgressBar';
import { ErrorState } from '../components/ErrorState';
import { WeeklyChallenges } from '../components/WeeklyChallenges';
import { ActivityFeed } from '../components/ActivityFeed';
import { useMatchStatus } from '../hooks/useMatchStatus';
import { useMatchList } from '../hooks/useMatch';
import { useAuth } from '../context/AuthContext';
import { getUsage, type UsageInfo } from '../api/auth';
import { getMapConfig } from '../utils/mapConfig';
import { getErrorMessage } from '../api/client';
import { cn } from '../lib/cn';
import { useT } from '../i18n/LocaleContext';

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [matchId, setMatchId] = useState<string | null>(null);
  const t = useT();
  const statusLabels = {
    pending: t('dashboard.status.pending'),
    parsing: t('dashboard.status.parsing'),
  };
  const { data: status, error, refetch, isError } = useMatchStatus(matchId ?? undefined);
  const { data: matches = [] } = useMatchList();

  const { data: usage } = useQuery<UsageInfo>({
    queryKey: ['auth', 'usage'],
    queryFn: getUsage,
    enabled: !!user,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (status?.status === 'ready' && matchId) {
      const timer = setTimeout(() => navigate(`/match/${matchId}`), 800);
      return () => clearTimeout(timer);
    }
  }, [status?.status, matchId, navigate]);

  const recentMatches = matches.slice(0, 5);
  const quotaPct =
    usage && usage.demos_limit > 0
      ? Math.min(100, Math.round((usage.demos_used_this_month / usage.demos_limit) * 100))
      : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-display text-2xl text-[var(--color-navy)] md:text-3xl">
            {t('dashboard.welcomeBack')}
            {user ? `, ${user.username}` : ''}!
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{t('dashboard.welcomeSubtitle')}</p>
        </div>

        {user && usage && (
          <div className="card-surface px-5 py-3">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-gray-400">
                  {t('dashboard.demosThisMonth')}
                </p>
                <p className="font-mono text-lg font-bold text-[var(--color-navy)]">
                  {usage.demos_used_this_month}
                  <span className="text-sm text-gray-400"> / {usage.demos_limit}</span>
                </p>
              </div>
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-300/10 px-2.5 py-1 ring-1 ring-emerald-300/20">
                <Crown className="h-3.5 w-3.5 text-[var(--color-accent)]" />
                <span className="text-xs font-bold text-[var(--color-accent)]">{user.role}</span>
              </div>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  quotaPct > 90 ? 'bg-red-500' : 'bg-[var(--color-accent)]',
                )}
                style={{ width: `${quotaPct}%` }}
              />
            </div>
            {quotaPct >= 90 && (
              <Link
                to="/billing"
                className="mt-1.5 block text-[11px] text-[var(--color-accent)] hover:text-[var(--color-accent-secondary)]"
              >
                {t('dashboard.quotaAlmostOut')}
              </Link>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            to: '/history',
            icon: History,
            label: t('dashboard.actions.historyTitle'),
            desc: t('dashboard.actions.historyDesc'),
          },
          {
            to: '/compare',
            icon: GitCompare,
            label: t('dashboard.actions.compareTitle'),
            desc: t('dashboard.actions.compareDesc'),
          },
          {
            to: '/team',
            icon: Users,
            label: t('dashboard.actions.teamTitle'),
            desc: t('dashboard.actions.teamDesc'),
          },
          {
            to: '/billing',
            icon: BarChart3,
            label: t('dashboard.actions.billingTitle'),
            desc: t('dashboard.actions.billingDesc'),
          },
        ].map(({ to, icon: Icon, label, desc }) => (
          <Link key={to} to={to} className="group card-surface-hover flex items-center gap-4 p-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-300/10 ring-1 ring-emerald-300/20">
              <Icon className="h-5 w-5 text-[var(--color-accent)]" />
            </div>
            <div>
              <p className="font-semibold text-[var(--color-navy)] group-hover:text-[var(--color-accent)]">
                {label}
              </p>
              <p className="text-xs text-[var(--color-muted)]">{desc}</p>
            </div>
          </Link>
        ))}
      </div>

      <section className="card-surface p-6">
        <div className="mb-4 flex items-center gap-3">
          <Upload className="h-5 w-5 text-[var(--color-accent)]" />
          <h2 className="font-display text-lg text-[var(--color-navy)]">{t('dashboard.uploadDemoTitle')}</h2>
          {usage && (
            <span className="ml-auto text-xs text-[var(--color-muted)]">
              {t('dashboard.max')} {usage.max_file_size_mb} {t('dashboard.mb')} · {usage.demos_remaining}{' '}
              {t('dashboard.uploadsLeft')}
            </span>
          )}
        </div>

        {!matchId && <FileUpload onUploadComplete={setMatchId} />}

        {matchId && status && !isError && status.status !== 'error' && (
          <div className="space-y-3 py-4">
            <p className="text-sm text-slate-400">
              {status.status === 'pending'
                ? statusLabels.pending
                : status.status === 'parsing'
                  ? statusLabels.parsing
                  : t('match.processingTitle')}
            </p>
            <ProgressBar progress={status.progress ?? 0} />
          </div>
        )}

        {matchId && (isError || status?.status === 'error') && (
          <ErrorState
            message={status?.message ?? (error ? getErrorMessage(error) : 'Parse failed')}
            onRetry={() => {
              setMatchId(null);
              refetch();
            }}
          />
        )}
      </section>

      <WeeklyChallenges />

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-[var(--color-navy)]">{t('dashboard.recentMatchesTitle')}</h2>
          <Link
            to="/history"
            className="text-xs text-[var(--color-accent)] hover:text-[var(--color-accent-secondary)]"
          >
            {t('dashboard.viewAll')}
          </Link>
        </div>

        {recentMatches.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.045] p-10 text-center">
            <MapIcon className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            <p className="text-sm text-[var(--color-muted)]">{t('dashboard.noMatchesYet')}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recentMatches.map((match) => {
              const mapConfig = getMapConfig(match.map_name ?? 'de_dust2');
              return (
                <Link
                  key={match.match_id}
                  to={`/match/${match.match_id}`}
                  className="group card-surface-hover overflow-hidden p-0"
                >
                  <div className="relative h-28 overflow-hidden">
                    <img
                      src={mapConfig.imageUrl}
                      alt={mapConfig.displayName}
                      className="h-full w-full object-cover opacity-80 transition-transform group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-navy)]/80 to-transparent" />
                    <p className="absolute bottom-2 left-3 font-display text-sm text-white">
                      {mapConfig.displayName}
                    </p>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2.5">
                    <p className="truncate text-xs text-[var(--color-muted)]">
                      {match.team_t_name} vs {match.team_ct_name}
                    </p>
                    <p className="font-mono text-sm font-bold">
                      <span className="text-orange-500">{match.score_t}</span>
                      <span className="text-gray-300">:</span>
                      <span className="text-blue-500">{match.score_ct}</span>
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <ActivityFeed />

      {user && (
        <section className="flex flex-col items-start justify-between gap-3 rounded-3xl border border-emerald-300/20 bg-emerald-300/[0.075] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.2)] sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-[var(--color-accent)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--color-navy)]">{t('dashboard.referralTitle')}</p>
              <p className="text-xs text-[var(--color-muted)]">{t('dashboard.referralSubtitle')}</p>
            </div>
          </div>
          <Link to="/settings" className="btn-secondary px-4 py-2 text-xs">
            {t('dashboard.getReferralLink')}
          </Link>
        </section>
      )}
    </div>
  );
}
