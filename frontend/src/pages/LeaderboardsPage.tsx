import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, Loader2, Medal, Shield, TrendingUp, Upload, Zap } from 'lucide-react';
import { getLeaderboard, type LeaderboardType } from '../api/gamification';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/cn';

const BOARDS: { id: LeaderboardType; label: string; icon: typeof Zap; hint: string }[] = [
  { id: 'xp', label: 'Top XP', icon: Zap, hint: 'All-time experience points' },
  { id: 'uploads', label: 'Top Uploaders', icon: Upload, hint: 'Demos uploaded this month' },
  { id: 'clans', label: 'Top Clans', icon: Shield, hint: 'Combined clan member XP' },
];

const RANK_STYLES = [
  'bg-gradient-to-br from-amber-400/25 to-amber-700/25 text-amber-300 ring-amber-400/40',
  'bg-gradient-to-br from-slate-300/20 to-slate-600/20 text-slate-200 ring-slate-300/40',
  'bg-gradient-to-br from-orange-600/20 to-orange-900/20 text-orange-400 ring-orange-500/40',
];

export function LeaderboardsPage() {
  const { user } = useAuth();
  const [board, setBoard] = useState<LeaderboardType>('xp');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', board],
    queryFn: () => getLeaderboard(board),
    staleTime: 60_000,
  });

  const entries = data?.entries ?? [];
  const activeBoard = BOARDS.find((b) => b.id === board)!;

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-3 font-display text-2xl font-bold text-white md:text-3xl">
          <TrendingUp className="h-7 w-7 text-cyan-400" />
          Leaderboards
        </h1>
        <p className="mt-1 text-sm text-slate-400">{activeBoard.hint}</p>
      </div>

      {/* Board switcher */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl bg-slate-950/60 p-1.5">
        {BOARDS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setBoard(id)}
            className={cn(
              'flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all sm:text-sm',
              board === id
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-500/20'
                : 'text-slate-400 hover:text-white',
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center">
          <Medal className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">No entries yet — be the first on the board!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const isMe = user && entry.username === user.username;
            const topStyle = entry.rank <= 3 ? RANK_STYLES[entry.rank - 1] : null;
            return (
              <div
                key={`${entry.rank}-${entry.username}`}
                className={cn(
                  'flex items-center gap-4 rounded-2xl border px-4 py-3 transition-colors',
                  isMe
                    ? 'border-cyan-400/40 bg-cyan-500/10'
                    : 'border-white/5 bg-slate-900/50',
                )}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-mono text-sm font-bold ring-1',
                    topStyle ?? 'bg-slate-950/60 text-slate-500 ring-white/5',
                  )}
                >
                  {entry.rank <= 3 ? <Crown className="h-4 w-4" /> : entry.rank}
                </span>

                {entry.avatar_url ? (
                  <img
                    src={entry.avatar_url}
                    alt=""
                    className="h-9 w-9 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 text-xs font-bold text-cyan-300">
                    {entry.username.replace(/^\[.*?\]\s*/, '').slice(0, 2).toUpperCase()}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {entry.username}
                    {isMe && <span className="ml-2 text-[10px] font-bold text-cyan-400">YOU</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.level != null ? `Level ${entry.level} · ${entry.role}` : entry.role}
                  </p>
                </div>

                <span className="font-mono text-sm font-bold text-cyan-300">
                  {entry.value.toLocaleString()}
                  <span className="ml-1 text-[10px] text-slate-500">
                    {board === 'uploads' ? 'demos' : 'XP'}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
