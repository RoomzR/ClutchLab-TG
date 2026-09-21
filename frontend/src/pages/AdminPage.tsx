import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Ban,
  CheckCircle2,
  DollarSign,
  Gift,
  Loader2,
  Search,
  ShieldAlert,
  Star,
  Ticket,
  Trash2,
  Users as UsersIcon,
} from 'lucide-react';
import {
  changeUserRole,
  createPromoCode,
  deletePromoCode,
  getPlatformStats,
  grantDemos,
  listAdminUsers,
  listPromoCodes,
  setMatchPro,
  setUserActive,
} from '../api/admin';
import { listMatches } from '../api/matches';
import { getMapConfig } from '../utils/mapConfig';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import { cn } from '../lib/cn';

const ROLES = ['FREE', 'PRO', 'TEAM', 'ORGANIZATION', 'ANALYST', 'COACH', 'ADMIN', 'SUPERADMIN'];

export function AdminPage() {
  const { user, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [promoCode, setPromoCode] = useState('');
  const [promoDiscount, setPromoDiscount] = useState(20);
  const [promoUses, setPromoUses] = useState(100);

  const isAdmin = user && (user.role === 'ADMIN' || user.role === 'SUPERADMIN');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: getPlatformStats,
    enabled: !!isAdmin,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => listAdminUsers(search),
    enabled: !!isAdmin,
  });

  const { data: promos = [] } = useQuery({
    queryKey: ['admin', 'promo'],
    queryFn: listPromoCodes,
    enabled: !!isAdmin,
  });

  const { data: allMatches = [] } = useQuery({
    queryKey: ['admin', 'matches'],
    queryFn: () => listMatches(100),
    enabled: !!isAdmin,
  });

  const proMutation = useMutation({
    mutationFn: ({ matchId, isPro }: { matchId: string; isPro: boolean }) =>
      setMatchPro(matchId, isPro),
    onSuccess: (res) => {
      toast.success(res.detail);
      queryClient.invalidateQueries({ queryKey: ['admin', 'matches'] });
      queryClient.invalidateQueries({ queryKey: ['matches'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });

  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      changeUserRole(userId, role),
    onSuccess: (res) => {
      toast.success(res.detail);
      invalidateUsers();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const activeMutation = useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      setUserActive(userId, isActive),
    onSuccess: (res) => {
      toast.success(res.detail);
      invalidateUsers();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const grantMutation = useMutation({
    mutationFn: ({ userId, amount }: { userId: string; amount: number }) =>
      grantDemos(userId, amount),
    onSuccess: (res) => toast.success(res.detail),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const createPromoMutation = useMutation({
    mutationFn: () =>
      createPromoCode({ code: promoCode, discount_percent: promoDiscount, max_uses: promoUses }),
    onSuccess: (res) => {
      toast.success(res.detail);
      setPromoCode('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'promo'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deletePromoMutation = useMutation({
    mutationFn: deletePromoCode,
    onSuccess: () => {
      toast.success('Promo deleted');
      queryClient.invalidateQueries({ queryKey: ['admin', 'promo'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-center gap-3">
        <ShieldAlert className="h-7 w-7 text-orange-400" />
        <div>
          <h1 className="font-display text-2xl font-bold text-white md:text-3xl">Admin Panel</h1>
          <p className="text-sm text-slate-400">Platform management · {user?.role}</p>
        </div>
      </div>

      {/* Stats */}
      {statsLoading ? (
        <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
      ) : stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: UsersIcon,
              label: 'Users',
              value: stats.users.total,
              sub: `+${stats.users.new_week} this week · ${stats.users.verified} verified`,
            },
            {
              icon: CheckCircle2,
              label: 'Demos parsed',
              value: stats.matches.ready,
              sub: `${stats.matches.failed} failed · ${stats.demo_uploads.this_month} uploads this month`,
            },
            {
              icon: DollarSign,
              label: 'Revenue',
              value: `$${stats.revenue.total.toFixed(0)}`,
              sub: `$${stats.revenue.this_month.toFixed(2)} this month`,
            },
            {
              icon: Ticket,
              label: 'Active subs',
              value: Object.values(stats.subscriptions).reduce((a, b) => a + b, 0),
              sub: Object.entries(stats.subscriptions)
                .map(([k, v]) => `${k}: ${v}`)
                .join(' · ') || 'none',
            },
          ].map(({ icon: Icon, label, value, sub }) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-slate-900/50 p-5">
              <Icon className="mb-2 h-5 w-5 text-cyan-400" />
              <p className="font-display text-2xl font-bold text-white">{value}</p>
              <p className="text-xs uppercase tracking-wider text-slate-500">{label}</p>
              <p className="mt-1 truncate text-[11px] text-slate-500" title={sub}>
                {sub}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Users */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-bold text-white">Users</h2>
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search email or username…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 py-2 pl-9 pr-4 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50 sm:w-72"
            />
          </form>
        </div>

        {usersLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">XP</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Joined</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-white">{u.username}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-3 py-2.5">
                      <select
                        value={u.role}
                        onChange={(e) =>
                          roleMutation.mutate({ userId: u.id, role: e.target.value })
                        }
                        className="rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs text-white outline-none focus:border-cyan-400/50"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-cyan-300">
                      {u.xp.toLocaleString()}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold',
                          u.is_active
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-red-500/15 text-red-300',
                        )}
                      >
                        {u.is_active ? 'ACTIVE' : 'BANNED'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {new Date(u.created_at).toLocaleDateString('en-US')}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-1">
                        <button
                          type="button"
                          title="Grant 10 bonus demos"
                          onClick={() => grantMutation.mutate({ userId: u.id, amount: 10 })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-300"
                        >
                          <Gift className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title={u.is_active ? 'Deactivate user' : 'Reactivate user'}
                          onClick={() =>
                            activeMutation.mutate({ userId: u.id, isActive: !u.is_active })
                          }
                          className={cn(
                            'rounded-lg p-1.5',
                            u.is_active
                              ? 'text-slate-400 hover:bg-red-500/10 hover:text-red-300'
                              : 'text-emerald-400 hover:bg-emerald-500/10',
                          )}
                        >
                          {u.is_active ? <Ban className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {users.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">No users found</p>
            )}
          </div>
        )}
      </section>

      {/* Pro demos */}
      <section className="rounded-2xl border border-amber-400/20 bg-amber-500/[0.04] p-6">
        <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-white">
          <Star className="h-5 w-5 text-amber-400" />
          Pro Demos
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          Mark parsed demos as pro references — they appear in the Compare page for all users to
          benchmark against.
        </p>
        {allMatches.length === 0 ? (
          <p className="text-sm text-slate-500">No parsed matches yet.</p>
        ) : (
          <div className="max-h-80 space-y-1.5 overflow-y-auto pr-1">
            {allMatches.map((m) => (
              <div
                key={m.match_id}
                className="flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-white">
                    {getMapConfig(m.map_name).displayName}{' '}
                    <span className="font-mono text-xs text-slate-500">
                      {m.score_t}:{m.score_ct}
                    </span>
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {m.team_t_name} vs {m.team_ct_name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => proMutation.mutate({ matchId: m.match_id, isPro: !m.is_pro })}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                    m.is_pro
                      ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-400/40'
                      : 'bg-white/5 text-slate-400 hover:text-amber-300',
                  )}
                >
                  <Star className={cn('h-3.5 w-3.5', m.is_pro && 'fill-current')} />
                  {m.is_pro ? 'PRO' : 'Mark pro'}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Promo codes */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">Promo Codes</h2>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createPromoMutation.mutate();
          }}
          className="mb-5 flex flex-wrap items-end gap-3"
        >
          <div>
            <label className="mb-1 block text-xs text-slate-400">Code</label>
            <input
              type="text"
              required
              minLength={3}
              value={promoCode}
              onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
              placeholder="SUMMER20"
              className="w-36 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Discount %</label>
            <input
              type="number"
              min={1}
              max={100}
              value={promoDiscount}
              onChange={(e) => setPromoDiscount(Number(e.target.value))}
              className="w-24 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-slate-400">Max uses</label>
            <input
              type="number"
              min={1}
              value={promoUses}
              onChange={(e) => setPromoUses(Number(e.target.value))}
              className="w-24 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </div>
          <button
            type="submit"
            disabled={createPromoMutation.isPending}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
          >
            Create
          </button>
        </form>

        {promos.length === 0 ? (
          <p className="text-sm text-slate-500">No promo codes yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {promos.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-mono font-bold text-cyan-300">{p.code}</span>
                <span className="text-slate-400">-{p.discount_percent}%</span>
                <span className="text-xs text-slate-500">
                  {p.current_uses} / {p.max_uses} used
                </span>
                <button
                  type="button"
                  onClick={() => deletePromoMutation.mutate(p.id)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
