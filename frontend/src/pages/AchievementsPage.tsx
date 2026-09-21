import { useQuery } from '@tanstack/react-query';
import {
  Award,
  BadgeCheck,
  Calendar,
  CalendarCheck,
  Crown,
  Flame,
  Gift,
  Layers,
  Link as LinkIcon,
  Loader2,
  Lock,
  Megaphone,
  Shield,
  Star,
  Trophy,
  Upload,
  Users,
  Zap,
} from 'lucide-react';
import { getMyAchievements, getMyXp } from '../api/gamification';
import { cn } from '../lib/cn';

const ICONS: Record<string, typeof Trophy> = {
  trophy: Trophy,
  upload: Upload,
  layers: Layers,
  flame: Flame,
  crown: Crown,
  calendar: Calendar,
  'calendar-check': CalendarCheck,
  shield: Shield,
  users: Users,
  gift: Gift,
  megaphone: Megaphone,
  star: Star,
  'badge-check': BadgeCheck,
  link: LinkIcon,
};

const TIER_STYLES: Record<string, { ring: string; bg: string; text: string; label: string }> = {
  bronze: {
    ring: 'ring-orange-700/40',
    bg: 'from-orange-900/30 to-orange-950/30',
    text: 'text-orange-400',
    label: 'Bronze',
  },
  silver: {
    ring: 'ring-slate-400/40',
    bg: 'from-slate-600/20 to-slate-800/20',
    text: 'text-slate-300',
    label: 'Silver',
  },
  gold: {
    ring: 'ring-amber-400/40',
    bg: 'from-amber-600/20 to-amber-900/20',
    text: 'text-amber-300',
    label: 'Gold',
  },
  diamond: {
    ring: 'ring-cyan-400/40',
    bg: 'from-cyan-500/20 to-blue-900/20',
    text: 'text-cyan-300',
    label: 'Diamond',
  },
};

export function AchievementsPage() {
  const { data: xp, isLoading: xpLoading } = useQuery({
    queryKey: ['gamification', 'xp'],
    queryFn: getMyXp,
  });

  const { data: achievementsData, isLoading } = useQuery({
    queryKey: ['gamification', 'achievements'],
    queryFn: getMyAchievements,
  });

  if (isLoading || xpLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const achievements = achievementsData?.achievements ?? [];
  const earned = achievements.filter((a) => a.earned);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header with level */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8">
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-white md:text-3xl">
              Achievements
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {earned.length} of {achievements.length} unlocked ·{' '}
              {earned.reduce((sum, a) => sum + a.xp_reward, 0).toLocaleString()} XP from achievements
            </p>
          </div>

          {xp && (
            <div className="w-full max-w-xs">
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="flex items-center gap-1.5 font-display text-lg font-bold text-white">
                  <Zap className="h-4 w-4 text-cyan-400" />
                  Level {xp.level}
                </span>
                <span className="font-mono text-xs text-slate-400">
                  {xp.xp_into_level} / {xp.xp_for_next_level} XP
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all"
                  style={{ width: `${xp.progress_percent}%` }}
                />
              </div>
              <p className="mt-1 text-right text-[11px] text-slate-500">
                {xp.xp.toLocaleString()} total XP
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Achievements grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {achievements.map((a) => {
          const Icon = ICONS[a.icon] ?? Award;
          const tier = TIER_STYLES[a.tier] ?? TIER_STYLES.bronze;
          return (
            <div
              key={a.code}
              className={cn(
                'relative rounded-2xl border p-5 transition-all',
                a.earned
                  ? `border-white/10 bg-gradient-to-br ${tier.bg}`
                  : 'border-white/5 bg-slate-950/40 opacity-60',
              )}
            >
              <div className="flex items-start gap-4">
                <div
                  className={cn(
                    'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ring-1',
                    a.earned ? `bg-slate-900/60 ${tier.ring}` : 'bg-slate-900/40 ring-white/5',
                  )}
                >
                  {a.earned ? (
                    <Icon className={cn('h-6 w-6', tier.text)} />
                  ) : (
                    <Lock className="h-5 w-5 text-slate-600" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className={cn('font-semibold', a.earned ? 'text-white' : 'text-slate-400')}>
                      {a.name}
                    </h3>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                        a.earned ? `bg-slate-900/70 ${tier.text}` : 'bg-slate-900/40 text-slate-600',
                      )}
                    >
                      {tier.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">{a.description}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="font-mono text-[11px] font-bold text-cyan-400">
                      +{a.xp_reward} XP
                    </span>
                    {a.earned_at && (
                      <span className="text-[10px] text-slate-500">
                        {new Date(a.earned_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent XP */}
      {xp && xp.recent_events.length > 0 && (
        <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
          <h2 className="mb-4 font-display text-lg font-bold text-white">Recent XP</h2>
          <div className="divide-y divide-white/5">
            {xp.recent_events.map((event, i) => (
              <div key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-400">
                  {event.reason.startsWith('achievement:')
                    ? `Achievement: ${event.reason.slice(12).replaceAll('_', ' ')}`
                    : event.reason === 'demo_upload'
                      ? 'Demo uploaded'
                      : event.reason === 'referral_signup'
                        ? 'Referral signup'
                        : event.reason}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-slate-600">
                    {new Date(event.created_at).toLocaleDateString('en-US')}
                  </span>
                  <span className="font-mono font-bold text-cyan-400">+{event.amount}</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
