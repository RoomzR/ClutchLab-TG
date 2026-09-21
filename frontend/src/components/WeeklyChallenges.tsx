import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2, Clock, Gift, Target } from 'lucide-react';
import { claimChallenge, getCurrentChallenges } from '../api/social';
import { getErrorMessage } from '../api/client';
import { cn } from '../lib/cn';

export function WeeklyChallenges() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['challenges', 'current'],
    queryFn: getCurrentChallenges,
    staleTime: 60_000,
  });

  const claimMutation = useMutation({
    mutationFn: claimChallenge,
    onSuccess: (res) => {
      toast.success(res.detail);
      queryClient.invalidateQueries({ queryKey: ['challenges'] });
      queryClient.invalidateQueries({ queryKey: ['gamification'] });
      queryClient.invalidateQueries({ queryKey: ['auth', 'usage'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading || !data) return null;

  const daysLeft = Math.floor(data.ends_in_hours / 24);
  const hoursLeft = data.ends_in_hours % 24;

  return (
    <section className="card-premium p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <Target className="h-5 w-5 text-orange-400" />
          Weekly Challenges
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3.5 w-3.5" />
          {daysLeft > 0 ? `${daysLeft}d ${hoursLeft}h left` : `${hoursLeft}h left`}
        </span>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {data.challenges.map((challenge) => {
          const pct = Math.min(100, Math.round((challenge.progress / challenge.target) * 100));
          return (
            <div
              key={challenge.code}
              className={cn(
                'rounded-xl border p-4',
                challenge.claimed
                  ? 'border-emerald-400/20 bg-emerald-500/5'
                  : challenge.completed
                    ? 'border-orange-400/30 bg-orange-500/5'
                    : 'border-white/5 bg-slate-950/40',
              )}
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-white">{challenge.name}</p>
                {challenge.claimed && (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </div>
              <p className="mb-3 text-xs text-slate-400">{challenge.description}</p>

              <div className="mb-1.5 flex items-center justify-between text-[11px]">
                <span className="font-mono text-slate-400">
                  {challenge.progress} / {challenge.target}
                </span>
                <span className="font-mono text-cyan-400">
                  +{challenge.reward_xp} XP · +{challenge.reward_demos} demos
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    challenge.claimed
                      ? 'bg-emerald-400'
                      : 'bg-gradient-to-r from-orange-400 to-amber-500',
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              {challenge.completed && !challenge.claimed && (
                <button
                  type="button"
                  onClick={() => claimMutation.mutate(challenge.code)}
                  disabled={claimMutation.isPending}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 py-2 text-xs font-bold text-white transition-all hover:from-orange-400 hover:to-amber-400 disabled:opacity-60"
                >
                  <Gift className="h-3.5 w-3.5" />
                  Claim Reward
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
