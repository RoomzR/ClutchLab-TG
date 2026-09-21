import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crosshair, Loader2 } from 'lucide-react';
import { listMatches } from '../api/matches';
import { apiClient } from '../api/client';
import { UtilityLabRadar, type UtilityLabThrow } from '../components/UtilityLabRadar';
import type { MatchListItem } from '../types/match';
import { cn } from '../lib/cn';

interface UtilityAverage extends UtilityLabThrow {
  count: number;
  match_count: number;
}

interface UtilityLabResponse {
  map_name: string;
  player_name: string;
  team: 'CT' | 'T';
  match_ids: string[];
  throw_count: number;
  cluster_count: number;
  throws: UtilityLabThrow[];
  averages: UtilityAverage[];
}

const GRENADE_TYPES = ['smoke', 'flash', 'he', 'molotov', 'incendiary', 'decoy'] as const;

export function GrenadeLabPage() {
  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ['matches', 'utility-lab'],
    queryFn: () => listMatches(80),
  });

  const [mapFilter, setMapFilter] = useState<string>('all');
  const [selectedMatchIds, setSelectedMatchIds] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState('');
  const [team, setTeam] = useState<'CT' | 'T'>('T');
  const [grenadeTypes, setGrenadeTypes] = useState<string[]>([...GRENADE_TYPES]);
  const [showAllThrows, setShowAllThrows] = useState(false);
  const [result, setResult] = useState<UtilityLabResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maps = useMemo(() => {
    const set = new Set(matches.map((m) => m.map_name).filter(Boolean));
    return [...set].sort();
  }, [matches]);

  const filteredMatches = useMemo(() => {
    if (mapFilter === 'all') return matches;
    return matches.filter((m) => m.map_name === mapFilter);
  }, [matches, mapFilter]);

  const toggleMatch = (id: string) => {
    setSelectedMatchIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllVisible = () => {
    setSelectedMatchIds(filteredMatches.map((m) => m.match_id));
    if (mapFilter === 'all' && filteredMatches[0]) {
      setMapFilter(filteredMatches[0].map_name);
    }
  };

  const runAggregate = async () => {
    setError(null);
    setLoading(true);
    try {
      const { data } = await apiClient.post<UtilityLabResponse>('/utility-lab/aggregate', {
        match_ids: selectedMatchIds,
        player_name: playerName.trim(),
        team,
        grenade_types: grenadeTypes,
      });
      setResult(data);
    } catch (err) {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : null;
      setError(detail || 'Failed to aggregate utilities');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2 flex items-center gap-2 text-cyan-300">
          <Crosshair className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-[0.2em]">Utility Lab</span>
        </div>
        <h1 className="font-display text-2xl font-semibold text-white md:text-3xl">
          Multi-demo average utilities
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-400">
          ESL-style radar: pick demos on one map, choose player + side, watch average throws animate
          from release to landing.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="glass-panel h-fit space-y-4 p-4 xl:sticky xl:top-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Map</span>
            <select
              value={mapFilter}
              onChange={(e) => {
                setMapFilter(e.target.value);
                setSelectedMatchIds([]);
                setResult(null);
              }}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            >
              <option value="all">All maps</option>
              {maps.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Demos ({selectedMatchIds.length})
              </span>
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-[11px] text-cyan-400 hover:text-cyan-300"
              >
                Select all
              </button>
            </div>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-white/10 p-2">
              {matchesLoading && <p className="p-2 text-xs text-slate-500">Loading…</p>}
              {!matchesLoading && filteredMatches.length === 0 && (
                <p className="p-2 text-xs text-slate-500">No demos yet. Upload some first.</p>
              )}
              {filteredMatches.map((m: MatchListItem) => (
                <label
                  key={m.match_id}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs',
                    selectedMatchIds.includes(m.match_id)
                      ? 'bg-cyan-500/15 text-cyan-100'
                      : 'text-slate-300 hover:bg-white/5',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selectedMatchIds.includes(m.match_id)}
                    onChange={() => toggleMatch(m.match_id)}
                  />
                  <span className="truncate font-medium">{m.map_name}</span>
                  <span className="ml-auto font-mono text-[10px] text-slate-500">
                    {m.score_ct}:{m.score_t}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Player name
            </span>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Exact in-game name"
              className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Side</span>
            <div className="flex rounded-lg border border-white/10 p-0.5">
              {(['T', 'CT'] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setTeam(side)}
                  className={cn(
                    'flex-1 rounded-md px-3 py-1.5 text-xs font-semibold',
                    team === side
                      ? side === 'CT'
                        ? 'bg-blue-500/25 text-blue-200'
                        : 'bg-orange-500/25 text-orange-200'
                      : 'text-slate-400',
                  )}
                >
                  {side}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Grenade types
            </span>
            <div className="flex flex-wrap gap-1.5">
              {GRENADE_TYPES.map((type) => {
                const on = grenadeTypes.includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setGrenadeTypes((prev) =>
                        on ? prev.filter((t) => t !== type) : [...prev, type],
                      )
                    }
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[11px] font-medium',
                      on ? 'bg-white/15 text-white' : 'bg-white/5 text-slate-500',
                    )}
                  >
                    {type}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={loading || selectedMatchIds.length === 0 || !playerName.trim()}
            onClick={runAggregate}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-cyan-400 disabled:opacity-40"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Play average utilities
          </button>

          {error && <p className="text-xs text-red-300">{error}</p>}

          {result && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
              <p>
                <span className="text-white">{result.throw_count}</span> throws ·{' '}
                <span className="text-white">{result.cluster_count}</span> avg spots ·{' '}
                <span className="text-white">{result.match_ids.length}</span> demos
              </p>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={showAllThrows}
                  onChange={(e) => setShowAllThrows(e.target.checked)}
                />
                Ghost all individual throws under averages
              </label>
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-3">
          {result ? (
            <UtilityLabRadar
              mapName={result.map_name}
              averages={result.averages}
              throws={result.throws}
              showAllThrows={showAllThrows}
            />
          ) : (
            <div className="flex min-h-[520px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/30 text-sm text-slate-500">
              Select demos + player + side, then play the average radar.
            </div>
          )}

          {result && result.averages.length > 0 && (
            <div className="glass-panel overflow-hidden">
              <div className="border-b border-white/10 px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                Top average spots
              </div>
              <div className="max-h-56 overflow-y-auto">
                {result.averages.slice(0, 20).map((a, i) => (
                  <div
                    key={`${a.grenade_type}-${i}`}
                    className="flex items-center gap-3 border-b border-white/5 px-4 py-2 text-xs text-slate-300"
                  >
                    <span className="w-20 font-medium text-white">{a.grenade_type}</span>
                    <span className="font-mono text-slate-500">
                      ({Math.round(a.to_x)}, {Math.round(a.to_y)})
                    </span>
                    <span className="ml-auto text-cyan-300">{a.count}×</span>
                    <span className="text-slate-500">{a.match_count} demos</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
