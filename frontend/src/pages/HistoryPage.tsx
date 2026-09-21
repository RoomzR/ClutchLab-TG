import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Calendar, History, Map, TrendingUp, Users } from 'lucide-react';
import { useMatchList } from '../hooks/useMatch';
import { usePlayerHistory, useTrackedPlayers } from '../hooks/useHistory';
import { getMapConfig } from '../utils/mapConfig';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { cn } from '../lib/cn';

export function HistoryPage() {
  const { data: matches = [], isLoading: matchesLoading } = useMatchList();
  const { data: trackedPlayers = [], isLoading: playersLoading } = useTrackedPlayers();
  const [selectedPlayer, setSelectedPlayer] = useState('');

  const { data: playerHistory, isLoading: historyLoading } = usePlayerHistory(
    selectedPlayer || undefined,
  );

  const mapChartData = useMemo(() => {
    if (!playerHistory) return [];
    return Object.entries(playerHistory.by_map)
      .map(([map, stats]) => ({
        map: getMapConfig(map).displayName,
        winrate: stats.winrate,
        games: stats.games,
        kd: stats.kd,
      }))
      .sort((a, b) => b.games - a.games);
  }, [playerHistory]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel p-6">
        <div className="mb-2 flex items-center gap-2 text-cyan-400/80">
          <History className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-[0.2em]">История</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-white">Матчи и тренды</h1>
        <p className="mt-2 text-sm text-slate-400">
          {matches.length} загруженных демок · winrate и K/D по картам
        </p>
      </div>

      <div className="glass-panel p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
          <Calendar className="h-4 w-4 text-cyan-400" />
          Загруженные матчи
        </h2>
        {matchesLoading ? (
          <SkeletonLoader variant="card" count={3} />
        ) : matches.length === 0 ? (
          <p className="text-sm text-slate-500">Нет матчей — загрузите демку на главной</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((match) => (
              <Link
                key={match.match_id}
                to={`/match/${match.match_id}`}
                className="rounded-xl border border-white/10 bg-black/30 p-4 transition-all hover:border-cyan-400/30 hover:bg-cyan-500/5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-semibold text-white">
                    {getMapConfig(match.map_name).displayName}
                  </span>
                  <span className="font-mono text-sm">
                    <span className="text-orange-400">{match.score_t}</span>
                    <span className="text-slate-600">:</span>
                    <span className="text-blue-400">{match.score_ct}</span>
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-slate-500">
                  {match.team_t_name} vs {match.team_ct_name}
                </p>
                <p className="mt-2 text-[10px] text-slate-600">
                  {match.player_count ?? '—'} игроков
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel p-5">
        <h2 className="mb-4 flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
          <Users className="h-4 w-4 text-violet-400" />
          Тренды по игроку
        </h2>

        {playersLoading ? (
          <SkeletonLoader variant="text" count={2} />
        ) : (
          <select
            value={selectedPlayer}
            onChange={(e) => setSelectedPlayer(e.target.value)}
            className="mb-4 w-full max-w-md rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white"
          >
            <option value="">Выберите игрока...</option>
            {trackedPlayers.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name} ({p.match_count} матч{p.match_count === 1 ? '' : 'ей'})
              </option>
            ))}
          </select>
        )}

        {historyLoading && selectedPlayer && <SkeletonLoader variant="card" count={2} />}

        {playerHistory && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {[
                { label: 'Матчей', value: playerHistory.match_count },
                { label: 'Winrate', value: `${playerHistory.winrate}%` },
                { label: 'K/D', value: playerHistory.kd.toFixed(2) },
                { label: 'Kills', value: playerHistory.kills },
                { label: 'Deaths', value: playerHistory.deaths },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border border-white/10 bg-black/30 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{item.label}</p>
                  <p className="font-display text-2xl font-bold text-cyan-400">{item.value}</p>
                </div>
              ))}
            </div>

            {mapChartData.length > 0 && (
              <div className="rounded-xl border border-white/10 bg-black/30 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
                  <Map className="h-4 w-4 text-cyan-400" />
                  Winrate по картам
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={mapChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="map" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1e293b',
                        border: '1px solid #475569',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar dataKey="winrate" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-black/30 text-left text-xs text-slate-500">
                    <th className="px-4 py-3">Карта</th>
                    <th className="px-4 py-3">Games</th>
                    <th className="px-4 py-3">W</th>
                    <th className="px-4 py-3">WR%</th>
                    <th className="px-4 py-3">K/D</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(playerHistory.by_map)
                    .sort((a, b) => b[1].games - a[1].games)
                    .map(([map, stats]) => (
                      <tr key={map} className="border-b border-white/5">
                        <td className="px-4 py-2.5 font-medium text-white">
                          {getMapConfig(map).displayName}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{stats.games}</td>
                        <td className="px-4 py-2.5 font-mono text-emerald-400">{stats.wins}</td>
                        <td className="px-4 py-2.5 font-mono text-cyan-400">{stats.winrate}%</td>
                        <td className="px-4 py-2.5 font-mono text-slate-300">{stats.kd}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
                <TrendingUp className="h-4 w-4 text-emerald-400" />
                Последние матчи
              </h3>
              <div className="space-y-2">
                {playerHistory.matches.slice(0, 10).map((m) => (
                  <Link
                    key={m.match_id}
                    to={`/match/${m.match_id}`}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-white/5 bg-black/20 px-4 py-2.5 text-sm hover:border-cyan-400/20"
                  >
                    <span className="font-medium text-white">
                      {getMapConfig(m.map_name).displayName}
                    </span>
                    <span className="font-mono text-xs text-slate-500">
                      {m.kills}/{m.deaths}
                    </span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-bold',
                        m.won ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300',
                      )}
                    >
                      {m.won ? 'W' : 'L'}
                    </span>
                    <span className="ml-auto text-xs text-slate-600">{m.team}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
