import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ChevronLeft,
  Crosshair,
  Crown,
  FolderOpen,
  FolderPlus,
  Loader2,
  Plus,
  Swords,
  Target,
  Trash2,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import {
  addTournamentMatch,
  createTournament,
  deleteTournament,
  getTournament,
  getTournamentPlayer,
  listTournaments,
  removeTournamentMatch,
  type Tournament,
  type TournamentPlayerStat,
} from '../api/tournaments';
import {
  createFolder,
  deleteFolder,
  getFolder,
  importFolderToTournament,
  listFolders,
} from '../api/folders';
import { listMatches } from '../api/matches';
import { getErrorMessage } from '../api/client';
import { getMapConfig } from '../utils/mapConfig';
import { cn } from '../lib/cn';
import { FileUpload } from '../components/FileUpload';

const STAGES = [
  { value: 'group', label: 'Group' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'semi', label: 'Semi' },
  { value: 'final', label: 'Final' },
] as const;

function ratingColor(r: number) {
  if (r >= 1.2) return 'text-emerald-300';
  if (r >= 1.05) return 'text-cyan-300';
  if (r >= 0.95) return 'text-slate-200';
  if (r >= 0.8) return 'text-amber-300';
  return 'text-red-300';
}

function FormSpark({ form }: { form: TournamentPlayerStat['form'] }) {
  if (!form?.length) return <span className="text-slate-600">—</span>;
  const last = form.slice(-8);
  const max = Math.max(...last.map((f) => f.rating), 1.2);
  const min = Math.min(...last.map((f) => f.rating), 0.6);
  return (
    <div className="flex h-6 items-end gap-0.5" title={last.map((f) => f.rating.toFixed(2)).join(' → ')}>
      {last.map((f) => {
        const h = ((f.rating - min) / (max - min || 1)) * 100;
        return (
          <span
            key={f.match_id}
            className={cn('w-1.5 rounded-sm', f.rating >= 1 ? 'bg-emerald-400/80' : 'bg-slate-500/70')}
            style={{ height: `${Math.max(18, h)}%` }}
          />
        );
      })}
    </div>
  );
}

function CreateTournamentForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const mutation = useMutation({
    mutationFn: () => createTournament({ name, description }),
    onSuccess: () => {
      toast.success('Tournament created');
      setName('');
      setDescription('');
      onCreated();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        mutation.mutate();
      }}
      className="card-premium space-y-3 p-5"
    >
      <h2 className="font-display text-base font-bold text-white">New tournament</h2>
      <input
        type="text"
        required
        minLength={3}
        maxLength={80}
        placeholder="e.g. Spring Cup 2026"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
      />
      <input
        type="text"
        maxLength={500}
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
      />
      <button
        type="submit"
        disabled={mutation.isPending}
        className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        <Plus className="h-4 w-4" />
        Create
      </button>
    </form>
  );
}

function FolderView({
  folderId,
  tournamentId,
  onBack,
  onImported,
}: {
  folderId: string;
  tournamentId: string;
  onBack: () => void;
  onImported: () => void;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState('group');

  const { data: folder, isLoading, refetch } = useQuery({
    queryKey: ['folder', folderId],
    queryFn: () => getFolder(folderId),
    refetchInterval: (q) => {
      const matches = q.state.data?.matches ?? [];
      const pending = matches.some((m) => m.status !== 'ready' && m.status !== 'error');
      return pending ? 3000 : false;
    },
  });

  const importMut = useMutation({
    mutationFn: () => importFolderToTournament(folderId, tournamentId, stage),
    onSuccess: (r) => {
      toast.success(`В турнир добавлено матчей: ${r.added}`);
      onImported();
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteFolder(folderId),
    onSuccess: () => {
      toast.success('Папка удалена');
      queryClient.invalidateQueries({ queryKey: ['folders'] });
      queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
      onBack();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  if (isLoading || !folder) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const readyCount = folder.matches.filter((m) => m.status === 'ready').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
        >
          <ChevronLeft className="h-4 w-4" />
          К турниру
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ background: folder.color }}
            />
            <h1 className="truncate font-display text-2xl font-bold text-white">{folder.name}</h1>
          </div>
          <p className="text-sm text-slate-400">
            {folder.matches.length} демок · {readyCount} готовы к импорту
          </p>
        </div>
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value)}
          className="rounded-lg border border-white/10 bg-slate-900 px-2 py-2 text-sm text-white"
        >
          {STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              Stage: {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={readyCount === 0 || importMut.isPending}
          onClick={() => importMut.mutate()}
          className="rounded-xl bg-violet-500/20 px-4 py-2 text-sm font-bold text-violet-300 disabled:opacity-40"
        >
          Импорт в турнир ({readyCount})
        </button>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Удалить папку? Демки останутся в системе.')) deleteMut.mutate();
          }}
          className="rounded-xl border border-red-400/20 p-2 text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="card-premium p-5">
        <h2 className="mb-1 font-display text-base font-bold text-white">Загрузить демки в папку</h2>
        <p className="mb-4 text-xs text-slate-400">
          Можно кинуть сразу много `.dem` — они привяжутся к этой папке и турниру после парса.
        </p>
        <FileUpload
          multiple
          folderId={folderId}
          tournamentId={tournamentId}
          stage={stage}
          onUploadComplete={() => {
            void refetch();
          }}
        />
      </div>

      <div className="card-premium p-4">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Демки в папке
        </h3>
        {folder.matches.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">Пока пусто — загрузи демки выше</p>
        ) : (
          <div className="space-y-1.5">
            {folder.matches.map((m) => (
              <div
                key={m.match_id}
                className="flex items-center gap-3 rounded-lg bg-white/[0.03] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-white">
                    {m.map_name ? getMapConfig(m.map_name).displayName : 'Parsing…'}
                  </p>
                  <p className="font-mono text-[11px] text-slate-500">
                    {m.status === 'ready'
                      ? `${m.score_t}:${m.score_ct}`
                      : m.status === 'error'
                        ? 'error'
                        : `${m.status}${m.progress != null ? ` ${m.progress}%` : ''}`}
                  </p>
                </div>
                {m.status === 'ready' ? (
                  <Link
                    to={`/match/${m.match_id}`}
                    className="text-xs font-semibold text-cyan-300 hover:underline"
                  >
                    Open
                  </Link>
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PlayerDrawer({
  tournamentId,
  playerName,
  onClose,
}: {
  tournamentId: string;
  playerName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['tournament-player', tournamentId, playerName],
    queryFn: () => getTournamentPlayer(tournamentId, playerName),
  });

  const p = data?.player;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-slate-950 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-white">{playerName}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-white/5">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        {isLoading || !p ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <p className="text-[10px] uppercase text-slate-500">Lab Rating</p>
                <p className={cn('font-display text-2xl font-bold', ratingColor(p.rating))}>
                  {p.rating.toFixed(2)}
                </p>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <p className="text-[10px] uppercase text-slate-500">Rating 1.0</p>
                <p className="font-display text-2xl font-bold text-white">{p.rating_1.toFixed(2)}</p>
              </div>
              <div className="rounded-xl bg-white/5 p-3 text-center">
                <p className="text-[10px] uppercase text-slate-500">ADR≈</p>
                <p className="font-display text-2xl font-bold text-amber-300">{p.adr}</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              {[
                ['K', p.kills, 'text-emerald-300'],
                ['D', p.deaths, 'text-red-300'],
                ['K/D', p.kd.toFixed(2), 'text-white'],
                ['HS%', `${p.headshot_pct}%`, 'text-slate-300'],
                ['KPR', p.kpr.toFixed(2), 'text-cyan-300'],
                ['DPR', p.dpr.toFixed(2), 'text-orange-300'],
                ['KAST≈', `${p.kast}%`, 'text-violet-300'],
                ['Impact', p.impact.toFixed(2), 'text-pink-300'],
              ].map(([l, v, c]) => (
                <div key={String(l)} className="rounded-lg bg-slate-900/80 py-2">
                  <p className="text-[10px] text-slate-500">{l}</p>
                  <p className={cn('font-mono font-bold', String(c))}>{String(v)}</p>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Opening / multi
              </h3>
              <p className="text-sm text-slate-300">
                FK {p.opening_kills} / FD {p.opening_deaths} (diff {p.fk_diff >= 0 ? '+' : ''}
                {p.fk_diff}) · 2K {p.multi_2k} · 3K {p.multi_3k} · 4K {p.multi_4k} · 5K {p.multi_5k}
              </p>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Form (by match)
              </h3>
              <div className="space-y-1.5">
                {p.form.map((f) => (
                  <Link
                    key={f.match_id}
                    to={`/match/${f.match_id}`}
                    className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm hover:bg-white/5"
                  >
                    <span className="text-slate-300">
                      {getMapConfig(f.map_name ?? 'de_dust2').displayName}{' '}
                      <span className="font-mono text-xs text-slate-500">{f.score}</span>
                    </span>
                    <span className={cn('font-mono font-bold', ratingColor(f.rating))}>
                      {f.rating.toFixed(2)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
            {p.maps.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  By map
                </h3>
                <div className="space-y-1">
                  {p.maps.map((m) => (
                    <div
                      key={m.map_name}
                      className="flex justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                    >
                      <span>{getMapConfig(m.map_name).displayName}</span>
                      <span className="font-mono text-slate-400">
                        {m.kills}/{m.deaths} · KPR {m.kpr.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {p.weapons.length > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Weapons
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {p.weapons.slice(0, 8).map((w) => (
                    <span
                      key={w.weapon}
                      className="rounded-full bg-white/5 px-2.5 py-1 font-mono text-xs text-slate-300"
                    >
                      {w.weapon} · {w.kills}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {(data?.duels?.length ?? 0) > 0 && (
              <div>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Head-to-head
                </h3>
                <div className="space-y-1">
                  {data!.duels.map((d) => (
                    <div
                      key={d.opponent}
                      className="flex justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-sm"
                    >
                      <span className="text-white">{d.opponent}</span>
                      <span className="font-mono">
                        <span className="text-emerald-300">{d.won}</span>
                        <span className="text-slate-600">-</span>
                        <span className="text-red-300">{d.lost}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentDetail({
  tournamentId,
  onBack,
}: {
  tournamentId: string;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const [showAddMatch, setShowAddMatch] = useState(false);
  const [stage, setStage] = useState('group');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');

  const { data: tournament, isLoading } = useQuery({
    queryKey: ['tournament', tournamentId],
    queryFn: () => getTournament(tournamentId),
  });

  const { data: allMatches = [] } = useQuery({
    queryKey: ['matches', 'list'],
    queryFn: () => listMatches(100),
    enabled: showAddMatch,
  });

  const { data: allFolders = [] } = useQuery({
    queryKey: ['folders'],
    queryFn: listFolders,
  });

  const folders = useMemo(() => {
    const linked = allFolders.filter((f) => f.tournament_id === tournamentId);
    // also show folders listed on tournament payload
    const fromT = (tournament?.folders ?? []).map((f) => ({
      id: f.id,
      name: f.name,
      color: f.color,
      match_count: f.match_count,
      tournament_id: tournamentId,
      description: '',
      created_at: '',
    }));
    const byId = new Map<string, (typeof fromT)[0]>();
    for (const f of [...fromT, ...linked]) byId.set(f.id, f as (typeof fromT)[0]);
    return [...byId.values()];
  }, [allFolders, tournament, tournamentId]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tournament', tournamentId] });
    queryClient.invalidateQueries({ queryKey: ['tournaments'] });
    queryClient.invalidateQueries({ queryKey: ['folders'] });
  };

  const createFolderMut = useMutation({
    mutationFn: () =>
      createFolder({ name: newFolderName.trim(), tournament_id: tournamentId }),
    onSuccess: (f) => {
      toast.success('Папка создана');
      setNewFolderName('');
      invalidate();
      setOpenFolderId(f.id);
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const addMutation = useMutation({
    mutationFn: (matchId: string) => addTournamentMatch(tournamentId, matchId, stage),
    onSuccess: () => {
      toast.success('Match added');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const removeMutation = useMutation({
    mutationFn: (matchId: string) => removeTournamentMatch(tournamentId, matchId),
    onSuccess: invalidate,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteTournament(tournamentId),
    onSuccess: () => {
      toast.success('Tournament deleted');
      queryClient.invalidateQueries({ queryKey: ['tournaments'] });
      onBack();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const filteredMatches = useMemo(() => {
    if (!tournament) return [];
    if (stageFilter === 'all') return tournament.matches;
    return tournament.matches.filter((m) => m.stage === stageFilter);
  }, [tournament, stageFilter]);

  if (openFolderId) {
    return (
      <FolderView
        folderId={openFolderId}
        tournamentId={tournamentId}
        onBack={() => {
          setOpenFolderId(null);
          invalidate();
        }}
        onImported={invalidate}
      />
    );
  }

  if (isLoading || !tournament) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
      </div>
    );
  }

  const inTournament = new Set(tournament.matches.map((m) => m.match_id));
  const addableMatches = allMatches.filter((m) => !inTournament.has(m.match_id));
  const awards = tournament.awards || {};

  return (
    <div className="space-y-6">
      {selectedPlayer && (
        <PlayerDrawer
          tournamentId={tournamentId}
          playerName={selectedPlayer}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-xl border border-white/10 px-3 py-2 text-sm text-slate-300 hover:bg-white/5"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-2xl font-bold text-white">{tournament.name}</h1>
          {tournament.description && (
            <p className="truncate text-sm text-slate-400">{tournament.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (window.confirm('Delete this tournament? Matches are kept.')) deleteMutation.mutate();
          }}
          className="rounded-xl border border-red-400/20 p-2 text-red-300 hover:bg-red-500/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Folders — enter to bulk-upload demos */}
      <div className="card-premium space-y-4 p-5">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-5 w-5 text-cyan-300" />
          <h2 className="font-display text-base font-bold text-white">Папки демок</h2>
        </div>
        <p className="text-xs text-slate-400">
          Создай папку → зайди внутрь → загрузи сразу много демок. Потом «Импорт в турнир».
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (newFolderName.trim().length < 1) return;
            createFolderMut.mutate();
          }}
          className="flex flex-wrap gap-2"
        >
          <input
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            placeholder="Название папки (например Day 1)"
            className="min-w-[180px] flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
          />
          <button
            type="submit"
            disabled={createFolderMut.isPending}
            className="flex items-center gap-1 rounded-lg bg-cyan-500/20 px-3 py-2 text-sm font-bold text-cyan-300 hover:bg-cyan-500/30"
          >
            <FolderPlus className="h-4 w-4" />
            Создать папку
          </button>
        </form>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setOpenFolderId(f.id)}
              className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-3 text-left transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/5"
              style={{ borderLeftColor: f.color || '#22d3ee', borderLeftWidth: 3 }}
            >
              <p className="truncate text-sm font-semibold text-white">{f.name}</p>
              <p className="text-xs text-slate-500">{f.match_count} demos · открыть →</p>
            </button>
          ))}
          {folders.length === 0 && (
            <p className="col-span-full text-center text-xs text-slate-500">
              Пока нет папок — создай первую выше
            </p>
          )}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {(
          [
            { label: 'Maps', value: tournament.summary?.matches ?? 0, Icon: Trophy },
            { label: 'Rounds', value: tournament.summary?.rounds ?? 0, Icon: Target },
            { label: 'Players', value: tournament.summary?.players ?? 0, Icon: Crosshair },
            { label: 'Kills', value: tournament.summary?.total_kills ?? 0, Icon: Zap },
            {
              label: 'Avg rating',
              value: (tournament.summary?.avg_rating ?? 0).toFixed(2),
              Icon: Crown,
            },
          ] as const
        ).map(({ label, value, Icon }) => (
          <div key={label} className="card-premium flex items-center gap-3 p-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500/10">
              <Icon className="h-5 w-5 text-cyan-300" />
            </span>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
              <p className="font-display text-xl font-bold text-white">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Awards */}
      {tournament.mvp && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card-premium flex items-center gap-4 border-amber-400/20 p-4 sm:col-span-2 lg:col-span-1">
            <Crown className="h-8 w-8 text-amber-300" />
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
                Tournament MVP
              </p>
              <button
                type="button"
                onClick={() => tournament.mvp && setSelectedPlayer(tournament.mvp)}
                className="font-display text-lg font-bold text-white hover:text-amber-200"
              >
                {tournament.mvp}
              </button>
            </div>
          </div>
          {Object.entries(awards).map(([key, award]) => {
            if (!award || key === 'mvp') return null;
            const labels: Record<string, string> = {
              entry_fragger: 'Entry fragger',
              hs_machine: 'HS machine',
              fragger: 'Top fragger',
              clutch_multi: 'Multi-kill',
              lowest_dpr: 'Hardest to kill',
            };
            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedPlayer(award.name)}
                className="card-premium p-4 text-left hover:border-cyan-400/30"
              >
                <p className="text-[10px] uppercase tracking-wider text-slate-500">
                  {labels[key] || key}
                </p>
                <p className="font-semibold text-white">{award.name}</p>
                <p className="font-mono text-xs text-cyan-300">{award.value}</p>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-5">
        {/* Matches + import */}
        <div className="space-y-4 xl:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-base font-bold text-white">
              Matches ({tournament.matches.length})
            </h2>
            <div className="flex gap-1.5">
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1.5 text-xs text-slate-300"
              >
                <option value="all">All stages</option>
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddMatch((v) => !v)}
                className="rounded-lg bg-cyan-500/15 px-3 py-1.5 text-xs font-bold text-cyan-300"
              >
                {showAddMatch ? 'Close' : 'Add'}
              </button>
            </div>
          </div>

          {showAddMatch && (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-cyan-400/20 bg-cyan-500/5 p-3">
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value)}
                className="mb-2 w-full rounded-lg border border-white/10 bg-slate-900 px-2 py-1.5 text-xs text-white"
              >
                {STAGES.map((s) => (
                  <option key={s.value} value={s.value}>
                    Stage: {s.label}
                  </option>
                ))}
              </select>
              {addableMatches.length === 0 ? (
                <p className="py-2 text-center text-xs text-slate-500">No matches to add</p>
              ) : (
                addableMatches.map((m) => (
                  <button
                    key={m.match_id}
                    type="button"
                    onClick={() => addMutation.mutate(m.match_id)}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/5"
                  >
                    <span className="text-sm text-white">
                      {getMapConfig(m.map_name).displayName}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {m.score_t}:{m.score_ct}
                    </span>
                    <Plus className="ml-auto h-3.5 w-3.5 text-cyan-400" />
                  </button>
                ))
              )}
            </div>
          )}

          <div className="space-y-2">
            {filteredMatches.length === 0 ? (
              <div className="card-premium p-6 text-center">
                <Swords className="mx-auto mb-2 h-8 w-8 text-slate-600" />
                <p className="text-sm text-slate-400">
                  Создай папку выше и загрузи туда демки.
                </p>
              </div>
            ) : (
              filteredMatches.map((m) => (
                <div key={m.match_id} className="group card-premium flex items-center gap-3 p-3">
                  <Link to={`/match/${m.match_id}`} className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white group-hover:text-cyan-300">
                      {getMapConfig(m.map_name).displayName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {m.team_t_name} {m.score_t} : {m.score_ct} {m.team_ct_name}
                    </p>
                  </Link>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                    {m.stage}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(m.match_id)}
                    className="rounded-lg p-1.5 text-slate-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Map pool + H2H */}
          {tournament.map_pool?.length > 0 && (
            <div className="card-premium p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Map pool
              </h3>
              <div className="flex flex-wrap gap-2">
                {tournament.map_pool.map((m) => (
                  <span
                    key={m.map_name}
                    className="rounded-full bg-white/5 px-3 py-1 text-xs text-slate-300"
                  >
                    {getMapConfig(m.map_name).displayName} ×{m.matches}
                  </span>
                ))}
              </div>
            </div>
          )}

          {tournament.head_to_head?.length > 0 && (
            <div className="card-premium p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Top duels
              </h3>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {tournament.head_to_head.slice(0, 12).map((h) => (
                  <div
                    key={`${h.a}-${h.b}`}
                    className="flex items-center justify-between text-sm text-slate-300"
                  >
                    <button
                      type="button"
                      className="hover:text-cyan-300"
                      onClick={() => setSelectedPlayer(h.a)}
                    >
                      {h.a}
                    </button>
                    <span className="font-mono text-xs">
                      <span className="text-emerald-300">{h.a_kills}</span>
                      <span className="text-slate-600">-</span>
                      <span className="text-red-300">{h.b_kills}</span>
                    </span>
                    <button
                      type="button"
                      className="hover:text-cyan-300"
                      onClick={() => setSelectedPlayer(h.b)}
                    >
                      {h.b}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Leaderboard */}
        <div className="xl:col-span-3">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-bold text-white">Lab Rating board</h2>
              <p className="max-w-md text-[11px] text-slate-500">
                {tournament.rating_note ||
                  'HLTV-style rating from kills/deaths/rounds (ADR & KAST estimated).'}
              </p>
            </div>
          </div>
          {tournament.player_stats.length === 0 ? (
            <div className="card-premium p-6 text-center text-sm text-slate-400">
              Stats appear after you add matches.
            </div>
          ) : (
            <div className="card-premium overflow-x-auto p-2">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-slate-500">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Player</th>
                    <th className="px-2 py-2 text-right">Rtg</th>
                    <th className="px-2 py-2 text-right">1.0</th>
                    <th className="px-2 py-2 text-right">K</th>
                    <th className="px-2 py-2 text-right">D</th>
                    <th className="px-2 py-2 text-right">K/D</th>
                    <th className="px-2 py-2 text-right">ADR≈</th>
                    <th className="px-2 py-2 text-right">KAST≈</th>
                    <th className="px-2 py-2 text-right">HS%</th>
                    <th className="px-2 py-2 text-right">FK±</th>
                    <th className="px-2 py-2">Form</th>
                    <th className="px-2 py-2 text-right">Maps</th>
                  </tr>
                </thead>
                <tbody>
                  {tournament.player_stats.map((p, i) => (
                    <tr
                      key={p.name}
                      className={cn(
                        'border-t border-white/5 cursor-pointer hover:bg-white/[0.03]',
                        i === 0 && 'bg-amber-500/[0.06]',
                      )}
                      onClick={() => setSelectedPlayer(p.name)}
                    >
                      <td className="px-2 py-2 font-mono text-xs text-slate-500">{i + 1}</td>
                      <td className="px-2 py-2 font-medium text-white">
                        <span className="flex items-center gap-1.5">
                          {p.name}
                          {p.name === tournament.mvp && (
                            <Crown className="h-3.5 w-3.5 text-amber-400" />
                          )}
                        </span>
                      </td>
                      <td
                        className={cn(
                          'px-2 py-2 text-right font-mono font-bold',
                          ratingColor(p.rating),
                        )}
                      >
                        {p.rating.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {p.rating_1.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-emerald-300">{p.kills}</td>
                      <td className="px-2 py-2 text-right font-mono text-red-300">{p.deaths}</td>
                      <td className="px-2 py-2 text-right font-mono text-white">
                        {p.kd.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-amber-200/90">{p.adr}</td>
                      <td className="px-2 py-2 text-right font-mono text-violet-300/90">
                        {p.kast}%
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {p.headshot_pct}%
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {p.fk_diff >= 0 ? '+' : ''}
                        {p.fk_diff}
                      </td>
                      <td className="px-2 py-2">
                        <FormSpark form={p.form} />
                      </td>
                      <td className="px-2 py-2 text-right font-mono text-slate-400">
                        {p.matches_played}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TournamentsPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ['tournaments'],
    queryFn: listTournaments,
  });

  if (selectedId) {
    return <TournamentDetail tournamentId={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-white md:text-3xl">Tournaments</h1>
          <p className="mt-1 text-sm text-slate-400">
            Папки внутри турнира · Lab Rating · аналитика игроков
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" />
          New tournament
        </button>
      </div>

      {showCreate && (
        <CreateTournamentForm
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['tournaments'] });
          }}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-cyan-400" />
        </div>
      ) : tournaments.length === 0 ? (
        <div className="card-premium p-12 text-center">
          <Trophy className="mx-auto mb-3 h-10 w-10 text-slate-600" />
          <h2 className="font-display text-lg font-bold text-white">No tournaments yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-400">
            Создай турнир → папку → загрузи туда кучу демок → импорт в рейтинг.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((tournament: Tournament) => (
            <button
              key={tournament.id}
              type="button"
              onClick={() => setSelectedId(tournament.id)}
              className="card-premium group p-5 text-left transition-transform hover:-translate-y-0.5"
            >
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20">
                  <Trophy className="h-5 w-5 text-cyan-300" />
                </span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                  {tournament.status}
                </span>
              </div>
              <h3 className="truncate font-display text-base font-bold text-white group-hover:text-cyan-300">
                {tournament.name}
              </h3>
              {tournament.description && (
                <p className="mt-1 line-clamp-2 text-xs text-slate-400">{tournament.description}</p>
              )}
              <p className="mt-3 text-xs text-slate-500">
                {tournament.match_count} {tournament.match_count === 1 ? 'match' : 'matches'} ·{' '}
                {new Date(tournament.created_at).toLocaleDateString('en-US')}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
