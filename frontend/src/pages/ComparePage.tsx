import { useMemo, useState } from 'react';
import { GitCompare, Map, Users } from 'lucide-react';
import {
  useMatchHeatmap,
  useMatchKills,
  useMatchList,
  useMatchOverview,
} from '../hooks/useMatch';
import { MatchMap } from '../components/MatchMap';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { getMapConfig } from '../utils/mapConfig';
import { computeAllPlayerStats } from '../utils/playerStats';
import { cn } from '../lib/cn';

type CompareMode = 'matches' | 'players';

function normalizeMapKey(mapName: string): string {
  return getMapConfig(mapName).displayName.toLowerCase();
}

function matchLabel(
  mapName: string,
  teamT: string,
  teamCt: string,
  scoreT: number,
  scoreCt: number,
): string {
  const map = getMapConfig(mapName).displayName;
  return `${map} · ${scoreT}:${scoreCt} ${teamT} vs ${teamCt}`;
}

export function ComparePage() {
  const { data: matchList = [], isLoading: listLoading } = useMatchList();
  const [mode, setMode] = useState<CompareMode>('players');
  const [matchAId, setMatchAId] = useState('');
  const [matchBId, setMatchBId] = useState('');
  const [playerA, setPlayerA] = useState('');
  const [playerB, setPlayerB] = useState('');

  const { data: matchA, isLoading: loadingA } = useMatchOverview(matchAId || undefined);
  const { data: matchB, isLoading: loadingB } = useMatchOverview(matchBId || undefined);
  const { data: killsA = [] } = useMatchKills(matchAId || undefined, !!matchAId);
  const { data: killsB = [] } = useMatchKills(matchBId || undefined, !!matchBId);

  const heatmapPlayerA = mode === 'players' ? playerA : matchA?.players[0]?.name;
  const heatmapPlayerB = mode === 'players' ? playerB : matchB?.players[0]?.name;

  const { data: heatmapA = [], isLoading: heatA } = useMatchHeatmap(
    matchAId || undefined,
    heatmapPlayerA,
    undefined,
    !!matchAId && !!heatmapPlayerA,
  );
  const { data: heatmapB = [], isLoading: heatB } = useMatchHeatmap(
    matchBId || undefined,
    heatmapPlayerB,
    undefined,
    !!matchBId && !!heatmapPlayerB,
  );

  const sameMap = useMemo(() => {
    if (!matchA || !matchB) return false;
    return normalizeMapKey(matchA.map_name) === normalizeMapKey(matchB.map_name);
  }, [matchA, matchB]);

  const statsA = useMemo(() => {
    if (!matchA) return null;
    const names = mode === 'players' && playerA ? [playerA] : matchA.players.map((p) => p.name);
    const map = computeAllPlayerStats(killsA, names);
    return mode === 'players' && playerA ? map.get(playerA) : null;
  }, [matchA, killsA, mode, playerA]);

  const statsB = useMemo(() => {
    if (!matchB) return null;
    const names = mode === 'players' && playerB ? [playerB] : matchB.players.map((p) => p.name);
    const map = computeAllPlayerStats(killsB, names);
    return mode === 'players' && playerB ? map.get(playerB) : null;
  }, [matchB, killsB, mode, playerB]);

  const teamStatsA = useMemo(() => {
    if (!matchA || mode !== 'matches') return null;
    const ct = matchA.players.filter((p) => p.team === 'CT');
    const t = matchA.players.filter((p) => p.team === 'T');
    const all = computeAllPlayerStats(killsA, matchA.players.map((p) => p.name));
    const sum = (players: typeof ct) =>
      players.reduce(
        (acc, p) => {
          const s = all.get(p.name) ?? { kills: 0, deaths: 0, headshot_pct: 0 };
          return {
            kills: acc.kills + s.kills,
            deaths: acc.deaths + s.deaths,
            hs: acc.hs + s.headshot_pct,
          };
        },
        { kills: 0, deaths: 0, hs: 0 },
      );
    return { ct: sum(ct), t: sum(t) };
  }, [matchA, killsA, mode]);

  const teamStatsB = useMemo(() => {
    if (!matchB || mode !== 'matches') return null;
    const ct = matchB.players.filter((p) => p.team === 'CT');
    const t = matchB.players.filter((p) => p.team === 'T');
    const all = computeAllPlayerStats(killsB, matchB.players.map((p) => p.name));
    const sum = (players: typeof ct) =>
      players.reduce(
        (acc, p) => {
          const s = all.get(p.name) ?? { kills: 0, deaths: 0, headshot_pct: 0 };
          return {
            kills: acc.kills + s.kills,
            deaths: acc.deaths + s.deaths,
            hs: acc.hs + s.headshot_pct,
          };
        },
        { kills: 0, deaths: 0, hs: 0 },
      );
    return { ct: sum(ct), t: sum(t) };
  }, [matchB, killsB, mode]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel p-6">
        <div className="mb-2 flex items-center gap-2 text-cyan-400/80">
          <GitCompare className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">Compare</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-white">Compare demos & players</h1>
        <p className="mt-2 text-sm text-slate-400">
          Pick two demos — stats side-by-side, heatmaps when maps match. Demos marked{' '}
          <span className="font-semibold text-amber-300">★ PRO</span> are pro-player references
          uploaded by the Roundcraft team: pick one as side B to measure yourself against the pros.
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          {(['players', 'matches'] as CompareMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                'rounded-xl px-4 py-2 text-sm font-medium transition-all',
                mode === m
                  ? 'bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-400/30'
                  : 'bg-white/5 text-slate-400 hover:text-white',
              )}
            >
              {m === 'players' ? 'Players' : 'Matches'}
            </button>
          ))}
        </div>
      </div>

      {listLoading ? (
        <SkeletonLoader variant="card" count={2} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { label: 'A', value: matchAId, set: setMatchAId, match: matchA },
            { label: 'B', value: matchBId, set: setMatchBId, match: matchB },
          ].map(({ label, value, set, match }) => (
            <div key={label} className="glass-panel space-y-3 p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Demo {label}
              </p>
              <select
                value={value}
                onChange={(e) => set(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white"
              >
                <option value="">Select a match…</option>
                {matchList.filter((item) => item.is_pro).length > 0 && (
                  <optgroup label="★ Pro demos">
                    {matchList
                      .filter((item) => item.is_pro)
                      .map((item) => (
                        <option key={item.match_id} value={item.match_id}>
                          ★ {matchLabel(
                            item.map_name,
                            item.team_t_name,
                            item.team_ct_name,
                            item.score_t,
                            item.score_ct,
                          )}
                        </option>
                      ))}
                  </optgroup>
                )}
                {matchList
                  .filter((item) => !item.is_pro)
                  .map((item) => (
                    <option key={item.match_id} value={item.match_id}>
                      {matchLabel(
                        item.map_name,
                        item.team_t_name,
                        item.team_ct_name,
                        item.score_t,
                        item.score_ct,
                      )}
                    </option>
                  ))}
              </select>

              {mode === 'players' && match && (
                <select
                  value={label === 'A' ? playerA : playerB}
                  onChange={(e) =>
                    label === 'A' ? setPlayerA(e.target.value) : setPlayerB(e.target.value)
                  }
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white"
                >
                  <option value="">Player…</option>
                  {match.players.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name} ({p.team})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
        </div>
      )}

      {matchA && matchB && (
        <div className="grid gap-4 lg:grid-cols-2">
          {[matchA, matchB].map((match, i) => (
            <div key={match.match_id} className="glass-panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <Map className="h-4 w-4 text-cyan-400" />
                <h3 className="font-display font-semibold text-white">
                  {getMapConfig(match.map_name).displayName}
                </h3>
              </div>
              <p className="font-mono text-lg">
                <span className="text-orange-400">{match.score_t}</span>
                <span className="mx-2 text-slate-600">:</span>
                <span className="text-blue-400">{match.score_ct}</span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {match.team_t_name} vs {match.team_ct_name}
              </p>
              {i === 0 && !sameMap && (
                <p className="mt-2 text-xs text-amber-400/90">Different maps — heatmap unavailable</p>
              )}
            </div>
          ))}
        </div>
      )}

      {mode === 'players' && statsA && statsB && playerA && playerB && (
        <div className="glass-panel overflow-hidden">
          <h3 className="border-b border-white/10 px-5 py-4 font-display text-sm font-semibold text-slate-200">
            <Users className="mr-2 inline h-4 w-4 text-cyan-400" />
            {playerA} vs {playerB}
          </h3>
          <div className="grid grid-cols-3 gap-px bg-white/5 text-center text-sm">
            {[
              ['Kills', statsA.kills, statsB.kills],
              ['Deaths', statsA.deaths, statsB.deaths],
              [
                'K/D',
                statsA.deaths ? (statsA.kills / statsA.deaths).toFixed(2) : statsA.kills.toFixed(2),
                statsB.deaths ? (statsB.kills / statsB.deaths).toFixed(2) : statsB.kills.toFixed(2),
              ],
              ['HS%', `${statsA.headshot_pct}%`, `${statsB.headshot_pct}%`],
            ].map(([label, a, b]) => (
              <div key={String(label)} className="contents">
                <div className="bg-slate-950/80 px-4 py-3 font-mono text-orange-300">{a}</div>
                <div className="bg-slate-950/60 px-4 py-3 text-xs uppercase tracking-wider text-slate-500">
                  {label}
                </div>
                <div className="bg-slate-950/80 px-4 py-3 font-mono text-blue-300">{b}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'matches' && teamStatsA && teamStatsB && (
        <div className="glass-panel overflow-hidden">
          <h3 className="border-b border-white/10 px-5 py-4 font-display text-sm font-semibold text-slate-200">
            Team totals
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-slate-500">
                <th className="px-4 py-3">Side</th>
                <th className="px-4 py-3">Match A K/D</th>
                <th className="px-4 py-3">Match B K/D</th>
              </tr>
            </thead>
            <tbody>
              {(['t', 'ct'] as const).map((side) => {
                const a = teamStatsA[side];
                const b = teamStatsB[side];
                const kdA = a.deaths ? (a.kills / a.deaths).toFixed(2) : String(a.kills);
                const kdB = b.deaths ? (b.kills / b.deaths).toFixed(2) : String(b.kills);
                return (
                  <tr key={side} className="border-b border-white/5">
                    <td className="px-4 py-3 uppercase text-slate-400">{side}</td>
                    <td className="px-4 py-3 font-mono text-orange-300">
                      {a.kills}/{a.deaths} ({kdA})
                    </td>
                    <td className="px-4 py-3 font-mono text-blue-300">
                      {b.kills}/{b.deaths} ({kdB})
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sameMap && matchA && matchB && heatmapPlayerA && heatmapPlayerB && (
        <div className="space-y-3">
          <h3 className="font-display text-sm font-semibold text-slate-200">Heatmap side-by-side</h3>
          <div className="grid gap-4 lg:grid-cols-2">
            {[
              { match: matchA, player: heatmapPlayerA, points: heatmapA, loading: heatA || loadingA },
              { match: matchB, player: heatmapPlayerB, points: heatmapB, loading: heatB || loadingB },
            ].map(({ match, player, points, loading }) => (
              <div key={match.match_id} className="space-y-2">
                <p className="text-xs text-slate-400">
                  {player} · {getMapConfig(match.map_name).displayName}
                </p>
                {loading ? (
                  <SkeletonLoader variant="card" className="aspect-square" />
                ) : (
                  <MatchMap
                    mapName={match.map_name}
                    mode="heatmap"
                    heatmapPoints={points}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
