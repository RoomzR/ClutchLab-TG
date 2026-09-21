import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Copy,
  Crown,
  Loader2,
  LogOut,
  Map as MapIcon,
  Shield,
  ShieldCheck,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  createClan,
  createClanInvite,
  getMyClan,
  getPublicClans,
  joinClan,
  kickClanMember,
  leaveClan,
  promoteClanMember,
  type ClanMember,
} from '../api/clans';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import { getMapConfig } from '../utils/mapConfig';
import { cn } from '../lib/cn';

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  owner: { label: 'Owner', className: 'bg-amber-500/15 text-amber-300 ring-amber-400/30' },
  admin: { label: 'Admin', className: 'bg-cyan-500/15 text-cyan-300 ring-cyan-400/30' },
  member: { label: 'Member', className: 'bg-white/5 text-slate-400 ring-white/10' },
};

function MemberRow({
  member,
  canManage,
  isOwner,
  onKick,
  onPromote,
}: {
  member: ClanMember;
  canManage: boolean;
  isOwner: boolean;
  onKick: (id: string) => void;
  onPromote: (id: string) => void;
}) {
  const badge = ROLE_BADGES[member.clan_role] ?? ROLE_BADGES.member;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-3">
      {member.avatar_url ? (
        <img src={member.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 text-xs font-bold text-cyan-300">
          {member.username.slice(0, 2).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{member.username}</p>
        <p className="text-xs text-slate-500">{member.xp.toLocaleString()} XP</p>
      </div>
      <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold ring-1', badge.className)}>
        {badge.label}
      </span>
      {canManage && member.clan_role !== 'owner' && (
        <div className="flex gap-1">
          {isOwner && (
            <button
              type="button"
              onClick={() => onPromote(member.user_id)}
              title={member.clan_role === 'admin' ? 'Demote to member' : 'Promote to admin'}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-300"
            >
              <ShieldCheck className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => onKick(member.user_id)}
            title="Kick member"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-300"
          >
            <UserMinus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export function TeamPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'create' | 'join'>('create');

  const { data, isLoading } = useQuery({
    queryKey: ['clan', 'mine'],
    queryFn: getMyClan,
  });

  const { data: publicClans = [] } = useQuery({
    queryKey: ['clan', 'public'],
    queryFn: getPublicClans,
    enabled: !isLoading && !data?.clan,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['clan'] });

  const createMutation = useMutation({
    mutationFn: () => createClan({ name, tag, description: description || undefined }),
    onSuccess: () => {
      toast.success('Clan created! Achievement unlocked: Founder 🏆');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const joinMutation = useMutation({
    mutationFn: () => joinClan(joinCode),
    onSuccess: () => {
      toast.success('Welcome to the clan!');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const inviteMutation = useMutation({
    mutationFn: createClanInvite,
    onSuccess: async (res) => {
      await navigator.clipboard.writeText(res.code);
      toast.success(`Invite code ${res.code} copied (valid ${res.expires_in_days} days)`);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const leaveMutation = useMutation({
    mutationFn: leaveClan,
    onSuccess: (res) => {
      toast.success(res.detail);
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const kickMutation = useMutation({
    mutationFn: kickClanMember,
    onSuccess: (res) => {
      toast.success(res.detail);
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const promoteMutation = useMutation({
    mutationFn: promoteClanMember,
    onSuccess: (res) => {
      toast.success(res.detail);
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const clan = data?.clan ?? null;

  // ---------- No clan: create / join ----------
  if (!clan) {
    const handleSubmit = (e: FormEvent) => {
      e.preventDefault();
      if (mode === 'create') createMutation.mutate();
      else joinMutation.mutate();
    };

    return (
      <div className="mx-auto max-w-4xl space-y-10">
        <div className="text-center">
          <h1 className="font-display text-2xl font-bold text-white md:text-3xl">Team Hub</h1>
          <p className="mt-1 text-sm text-slate-400">
            Create a clan or join one to unlock shared analytics and team leaderboards.
          </p>
        </div>

        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-slate-900/60 p-6">
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-slate-950/60 p-1">
            {(['create', 'join'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  'rounded-lg py-2 text-sm font-semibold transition-all',
                  mode === m
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-white'
                    : 'text-slate-400 hover:text-white',
                )}
              >
                {m === 'create' ? 'Create Clan' : 'Join Clan'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'create' ? (
              <>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">Clan name</label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={32}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Natus Vincere"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Tag (2–6 chars)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={6}
                    value={tag}
                    onChange={(e) => setTag(e.target.value.toUpperCase())}
                    placeholder="NAVI"
                    className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-300">
                    Description (optional)
                  </label>
                  <textarea
                    maxLength={300}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Who are you and what do you play?"
                    className="w-full resize-none rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
                  />
                </div>
              </>
            ) : (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-300">Invite code</label>
                <input
                  type="text"
                  required
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="A1B2C3D4"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 font-mono text-sm tracking-widest text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
                />
                <p className="mt-1.5 text-xs text-slate-500">
                  Ask a clan owner or admin for an invite code.
                </p>
              </div>
            )}

            <button
              type="submit"
              disabled={createMutation.isPending || joinMutation.isPending}
              className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 py-3 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
            >
              {mode === 'create' ? 'Create Clan' : 'Join Clan'}
            </button>
          </form>
        </div>

        {publicClans.length > 0 && (
          <section>
            <h2 className="mb-4 text-center font-display text-lg font-bold text-white">
              Top Clans
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {publicClans.slice(0, 9).map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl border border-white/10 bg-slate-900/50 p-4"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-600/20 font-mono text-xs font-bold text-orange-300 ring-1 ring-orange-400/30">
                      {c.tag}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-white">{c.name}</p>
                      <p className="text-xs text-slate-500">
                        {c.members} members · {c.total_xp.toLocaleString()} XP
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ---------- Has clan: dashboard ----------
  const myRole = clan.my_role ?? 'member';
  const canManage = myRole === 'owner' || myRole === 'admin';
  const isOwner = myRole === 'owner';

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-6 md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {clan.logo_url ? (
              <img
                src={clan.logo_url}
                alt={clan.name}
                className="h-16 w-16 rounded-2xl object-cover ring-1 ring-cyan-400/30"
              />
            ) : (
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 font-display text-lg font-bold text-cyan-300 ring-1 ring-cyan-400/30">
                {clan.tag}
              </span>
            )}
            <div>
              <h1 className="font-display text-2xl font-bold text-white">
                <span className="text-cyan-400">[{clan.tag}]</span> {clan.name}
              </h1>
              {clan.description && (
                <p className="mt-1 max-w-md text-sm text-slate-400">{clan.description}</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {canManage && (
              <button
                type="button"
                onClick={() => inviteMutation.mutate()}
                disabled={inviteMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-4 py-2.5 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
              >
                <UserPlus className="h-4 w-4" />
                Invite
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                if (window.confirm(isOwner ? 'Disband the clan?' : 'Leave the clan?')) {
                  leaveMutation.mutate();
                }
              }}
              className="flex items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 hover:bg-red-500/20"
            >
              <LogOut className="h-4 w-4" />
              {isOwner ? 'Disband' : 'Leave'}
            </button>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Users, label: 'Members', value: `${clan.stats.member_count} / 20` },
          { icon: MapIcon, label: 'Demos analyzed', value: clan.stats.demos_analyzed.toLocaleString() },
          { icon: Trophy, label: 'Total clan XP', value: clan.stats.total_xp.toLocaleString() },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
            <Icon className="mb-2 h-5 w-5 text-cyan-400" />
            <p className="font-display text-2xl font-bold text-white">{value}</p>
            <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Members */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-white">
            <Shield className="h-5 w-5 text-cyan-400" />
            Roster
          </h2>
          <div className="space-y-2">
            {clan.members.map((member) => (
              <MemberRow
                key={member.user_id}
                member={member}
                canManage={canManage && member.user_id !== user?.id}
                isOwner={isOwner}
                onKick={(id) => {
                  if (window.confirm('Kick this member?')) kickMutation.mutate(id);
                }}
                onPromote={(id) => promoteMutation.mutate(id)}
              />
            ))}
          </div>
        </section>

        {/* Top maps */}
        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-white">
            <Crown className="h-5 w-5 text-orange-400" />
            Most Played Maps
          </h2>
          {clan.stats.top_maps.length === 0 ? (
            <p className="rounded-xl border border-dashed border-white/10 p-6 text-center text-xs text-slate-500">
              Upload demos to see clan map stats
            </p>
          ) : (
            <div className="space-y-2">
              {clan.stats.top_maps.map((m, i) => (
                <div
                  key={m.map}
                  className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-4 py-2.5"
                >
                  <span className="font-mono text-xs text-slate-600">#{i + 1}</span>
                  <span className="flex-1 text-sm font-medium text-white">
                    {getMapConfig(m.map).displayName}
                  </span>
                  <span className="font-mono text-xs text-cyan-300">{m.games} games</span>
                </div>
              ))}
            </div>
          )}

          {canManage && (
            <button
              type="button"
              onClick={() => inviteMutation.mutate()}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-400/30 bg-cyan-500/5 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-500/15"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy invite code
            </button>
          )}
        </section>
      </div>
    </div>
  );
}
