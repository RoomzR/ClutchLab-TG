import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { ArrowLeft, Crosshair, Shield, Target, Timer } from 'lucide-react';
import { useMatchOverview, useMatchGrenades, useMatchHeatmap, useMatchKills, useMatchRounds } from '../hooks/useMatch';
import {
  usePlayerDuels,
  usePlayerFlashEvents,
  usePlayerGrenadeSpots,
  usePlayerHabits,
  usePlayerPurchases,
  usePlayerStats,
} from '../hooks/usePlayer';
import { PlayerHabits } from '../components/PlayerHabits';
import { PlayerPositionsTab } from '../components/PlayerPositionsTab';
import { PlayerGrenadesTab } from '../components/PlayerGrenadesTab';
import { PlayerDuelsTab } from '../components/PlayerDuelsTab';
import { AntiStratReport } from '../components/AntiStratReport';
import { EconomyChart } from '../components/EconomyChart';
import { ExportReport } from '../components/ExportReport';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { ErrorState } from '../components/ErrorState';
import { computeDuelsFromKills, computePlayerStatsFromKills } from '../utils/playerStats';
import { generateAntiStratReport } from '../utils/antiStrat';
import { getErrorMessage } from '../api/client';
import { cn } from '../lib/cn';
import type { PlayerStats } from '../types/match';

export function PlayerPage() {
  const { matchId, playerName } = useParams<{ matchId: string; playerName: string }>();
  const decodedName = playerName ? decodeURIComponent(playerName) : '';

  const {
    data: match,
    isLoading: matchLoading,
    error: matchError,
    refetch: refetchMatch,
  } = useMatchOverview(matchId);

  const { data: habits, isLoading: habitsLoading } = usePlayerHabits(matchId, decodedName);
  const { data: purchases = [], isLoading: purchasesLoading } = usePlayerPurchases(
    matchId,
    decodedName,
  );
  const { data: flashEvents = [] } = usePlayerFlashEvents(matchId, decodedName);
  const { data: apiStats, isLoading: statsLoading } = usePlayerStats(matchId, decodedName);
  const { data: apiDuels, isLoading: duelsLoading } = usePlayerDuels(matchId, decodedName);
  const { data: grenadeSpots } = usePlayerGrenadeSpots(matchId, decodedName);
  const { data: playerGrenades = [] } = useMatchGrenades(matchId, {
    player_name: decodedName,
  });
  const { data: heatmapPoints = [] } = useMatchHeatmap(matchId, decodedName);
  const { data: kills = [] } = useMatchKills(matchId);
  const { data: rounds = [] } = useMatchRounds(matchId);

  const player = match?.players.find((p) => p.name === decodedName);
  const isCT = player?.team === 'CT';

  const stats: PlayerStats = useMemo(() => {
    const fallback = computePlayerStatsFromKills(kills, decodedName);
    if (!apiStats) {
      const avgBlind =
        flashEvents.length > 0
          ? Math.round(
              flashEvents.reduce((s, e) => s + e.duration_ms, 0) / flashEvents.length,
            )
          : fallback.avg_blind_duration_ms;
      return { ...fallback, avg_blind_duration_ms: avgBlind };
    }
    return {
      ...apiStats,
      avg_blind_duration_ms:
        apiStats.avg_blind_duration_ms ||
        (flashEvents.length > 0
          ? Math.round(
              flashEvents.reduce((s, e) => s + e.duration_ms, 0) / flashEvents.length,
            )
          : 0),
      weapon_kills: apiStats.weapon_kills ?? fallback.weapon_kills,
    };
  }, [apiStats, kills, decodedName, flashEvents]);

  const duels = useMemo(
    () => apiDuels ?? computeDuelsFromKills(kills, decodedName),
    [apiDuels, kills, decodedName],
  );

  const antiStratInsights = useMemo(
    () =>
      generateAntiStratReport({
        mapName: match?.map_name ?? 'de_dust2',
        playerName: decodedName,
        team: player?.team ?? 'CT',
        habits,
        grenadeSpots,
        grenades: playerGrenades,
        heatmapPoints,
        rounds,
      }),
    [
      match?.map_name,
      decodedName,
      player?.team,
      habits,
      grenadeSpots,
      playerGrenades,
      heatmapPoints,
      rounds,
    ],
  );

  if (matchLoading) {
    return (
      <div className="space-y-6">
        <SkeletonLoader variant="text" count={2} />
        <SkeletonLoader variant="card" count={4} />
      </div>
    );
  }

  if (matchError || !match) {
    return (
      <ErrorState
        message={getErrorMessage(matchError)}
        onRetry={() => refetchMatch()}
      />
    );
  }

  return (
    <div id="player-report" className="animate-fade-in">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            to={`/match/${matchId}`}
            className="mb-4 inline-flex items-center gap-2 text-sm text-slate-400 transition-colors hover:text-cyan-400"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад к матчу
          </Link>

          <div className="flex items-center gap-4">
            <div
              className={cn(
                'flex h-16 w-16 items-center justify-center rounded-2xl ring-1',
                isCT ? 'bg-blue-500/20 ring-blue-400/30 glow-ct' : 'bg-orange-500/20 ring-orange-400/30 glow-t',
              )}
            >
              <Shield className={cn('h-8 w-8', isCT ? 'text-blue-400' : 'text-orange-400')} />
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold text-white">{decodedName}</h1>
              <p className={cn('text-sm font-medium', isCT ? 'text-blue-400' : 'text-orange-400')}>
                {player?.team ?? 'Unknown'}
              </p>
            </div>
          </div>
        </div>

        <ExportReport
          match={match}
          player={{
            name: decodedName,
            team: player?.team ?? 'CT',
            stats,
          }}
          reportElementId="player-report"
          mapElementId="player-positions-map"
        />
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="glass-panel p-4">
          <div className="mb-1 flex items-center gap-2 text-slate-400">
            <Crosshair className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">K / D / A</span>
          </div>
          <p className="font-mono text-3xl font-bold text-white">
            <span className="text-green-400">{stats.kills}</span>
            <span className="mx-1 text-slate-500">/</span>
            <span className="text-red-400">{stats.deaths}</span>
            <span className="mx-1 text-slate-500">/</span>
            <span className="text-slate-300">{stats.assists}</span>
          </p>
        </div>

        <div className="glass-panel p-4">
          <div className="mb-1 flex items-center gap-2 text-slate-400">
            <Target className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Хедшоты</span>
          </div>
          <p className="font-mono text-3xl font-bold text-violet-400">{stats.headshot_pct}%</p>
        </div>

        <div className="glass-panel p-4">
          <div className="mb-1 flex items-center gap-2 text-slate-400">
            <Crosshair className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Любимое оружие</span>
          </div>
          <p className="truncate text-xl font-semibold text-cyan-400">{stats.favorite_weapon}</p>
        </div>

        <div className="glass-panel p-4">
          <div className="mb-1 flex items-center gap-2 text-slate-400">
            <Timer className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Ср. ослепление</span>
          </div>
          <p className="font-mono text-3xl font-bold text-yellow-400">
            {stats.avg_blind_duration_ms}
            <span className="ml-1 text-lg text-slate-400">мс</span>
          </p>
        </div>
      </div>

      <PlayerHabits
        habits={habits}
        isLoading={habitsLoading}
        playerName={decodedName}
        className="mb-8"
      />

      <Tabs.Root defaultValue="positions">
        <Tabs.List className="glass-panel mb-6 flex gap-1 overflow-x-auto p-1.5 scrollbar-thin">
          {[
            { value: 'positions', label: 'Позиции' },
            { value: 'grenades', label: 'Гранаты' },
            { value: 'duels', label: 'Дуэли' },
            { value: 'economy', label: 'Экономика' },
            { value: 'antistrat', label: 'Anti-strat' },
          ].map((tab) => (
            <Tabs.Trigger key={tab.value} value={tab.value} className="tab-trigger">
              {tab.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="positions">
          <PlayerPositionsTab
            matchId={matchId!}
            playerName={decodedName}
            mapName={match.map_name}
            habits={habits}
            rounds={rounds}
            playerTeam={player?.team ?? 'CT'}
            mapElementId="player-positions-map"
          />
        </Tabs.Content>

        <Tabs.Content value="grenades">
          <PlayerGrenadesTab
            matchId={matchId!}
            playerName={decodedName}
            mapName={match.map_name}
            grenadeSpots={grenadeSpots}
            mapElementId="player-grenades-map"
          />
        </Tabs.Content>

        <Tabs.Content value="duels">
          <PlayerDuelsTab duels={duels} stats={stats} isLoading={duelsLoading || statsLoading} />
        </Tabs.Content>

        <Tabs.Content value="economy">
          <EconomyChart
            purchases={purchases}
            rounds={rounds}
            isLoading={purchasesLoading}
            variant="line"
          />
        </Tabs.Content>

        <Tabs.Content value="antistrat">
          <AntiStratReport
            insights={antiStratInsights}
            playerName={decodedName}
            mapName={match.map_name}
            isLoading={habitsLoading}
          />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
