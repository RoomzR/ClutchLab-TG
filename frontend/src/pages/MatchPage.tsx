import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Box, Menu, X } from 'lucide-react';
import { useMatchStatus } from '../hooks/useMatchStatus';
import {
  useMatchBombEvents,
  useMatchGrenades,
  useMatchHeatmap,
  useMatchKills,
  useMatchOverview,
  useMatchPositions,
  useMatchPurchases,
  useMatchRounds,
  useMatchRoundPauses,
} from '../hooks/useMatch';
import { MatchOverview } from '../components/MatchOverview';
import { AiInsightsPanel } from '../components/AiInsightsPanel';
import { CoachPanel } from '../components/CoachPanel';
import { useAuth } from '../context/AuthContext';
import { MatchMap } from '../components/MatchMap';
import { MapLayerControls, DEFAULT_MAP_LAYERS, type MapLayerState, type MapTeamFilter } from '../components/MapLayerControls';
import { Demo3DViewer } from '../demo3d';
import { PlayerTimeline } from '../components/PlayerTimeline';
import { PlayerSelector } from '../components/PlayerSelector';
import { GrenadeFilters } from '../components/GrenadeFilters';
import { RoundTimeline } from '../components/RoundTimeline';
import { KeyRoundsStrip } from '../components/KeyRoundsStrip';
import { UtilityTimeline } from '../components/UtilityTimeline';
import { StatusBadge } from '../components/StatusBadge';
import { ProgressBar } from '../components/ProgressBar';
import { ErrorState } from '../components/ErrorState';
import { ExportReport } from '../components/ExportReport';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';
import { getMapConfig } from '../utils/mapConfig';
import { getScoreAtRound, getRoundContextAtTick, buildRoundTickRanges, getMatchTickBounds } from '../utils/roundStats';
import { getErrorMessage } from '../api/client';
import { useDebounce } from '../hooks/useDebounce';
import { useReplayPlayback } from '../hooks/useReplayPlayback';
import { computeMatchAnalytics, utilityEventsForRound } from '../utils/matchAnalytics';
import { computeMatchEconomy } from '../utils/matchEconomy';
import { resolvePlaybackTickRate } from '../utils/tickRate';
import { computeMatchMapPatterns } from '../utils/mapPatterns';
import { computePreAimForKill, formatDistance, getKillReplayTick } from '../utils/killReplay';
import { grenadeThrowTick, GRENADE_DURATION_TICKS } from '../utils/grenadeReplay';
import type { GrenadeData, KillData } from '../types/match';
import { cn } from '../lib/cn';
import { useT } from '../i18n/LocaleContext';

export function MatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const { isAuthenticated } = useAuth();
  const t = useT();
  const { data: status, isError: statusError, refetch: refetchStatus } = useMatchStatus(matchId);
  const isReady = status?.status === 'ready';
  const {
    data: match,
    isLoading: matchLoading,
    isError: matchIsError,
    error: matchError,
    refetch: refetchMatch,
  } = useMatchOverview(isReady ? matchId : undefined);

  const [activeTab, setActiveTab] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [currentTick, setCurrentTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const [grenadeTypes, setGrenadeTypes] = useState<string[]>([
    'smoke', 'flash', 'he', 'molotov', 'incendiary', 'decoy',
  ]);
  const [grenadeTeam, setGrenadeTeam] = useState<'CT' | 'T' | 'all'>('all');
  const [grenadePlayer, setGrenadePlayer] = useState('');

  const [mapTeamFilter, setMapTeamFilter] = useState<MapTeamFilter>('all');
  const [mapLayers, setMapLayers] = useState<MapLayerState>(DEFAULT_MAP_LAYERS);
  const [mapTrajectoryPlayer, setMapTrajectoryPlayer] = useState<string | null>(null);
  const [highlightedKill, setHighlightedKill] = useState<KillData | null>(null);
  const [highlightedGrenade, setHighlightedGrenade] = useState<GrenadeData | null>(null);

  const dataEnabled = isReady && !!matchId;
  const isReplayTab = activeTab === 'map' || activeTab === 'watch3d';
  const positionsEnabled = dataEnabled && isReplayTab;
  const bombEventsEnabled = dataEnabled && isReplayTab;
  const grenadesEnabled =
    dataEnabled &&
    (activeTab === 'grenades' ||
      activeTab === 'map' ||
      activeTab === 'watch3d' ||
      activeTab === 'overview' ||
      activeTab === 'ai');
  const killsEnabled = dataEnabled;
  const purchasesEnabled = dataEnabled && (activeTab === 'overview' || activeTab === 'ai');

  const { data: rounds = [] } = useMatchRounds(matchId, dataEnabled);
  const { data: roundPauses = [] } = useMatchRoundPauses(matchId, dataEnabled);

  const effectiveRound = selectedRound && selectedRound > 0 ? selectedRound : undefined;

  const activeRoundRange = useMemo(() => {
    if (!effectiveRound) return null;
    const meta = rounds.find((r) => r.round_number === effectiveRound);
    if (meta?.start_tick != null && meta?.end_tick != null) {
      return { start: meta.start_tick, end: meta.end_tick };
    }
    return null;
  }, [effectiveRound, rounds]);

  const positionParams = useMemo(
    () => ({
      round_number: effectiveRound,
      tick_start: activeRoundRange?.start,
      tick_end: activeRoundRange?.end,
      // 3D spectator needs full roster; map tab can filter
      player_names:
        activeTab === 'watch3d'
          ? undefined
          : selectedPlayers.length > 0
            ? selectedPlayers
            : undefined,
    }),
    [effectiveRound, activeRoundRange, selectedPlayers, activeTab],
  );

  const grenadeParams = useMemo(
    () => ({
      round_number: effectiveRound,
      grenade_types: grenadeTypes,
      team: grenadeTeam === 'all' ? undefined : grenadeTeam,
      player_name: grenadePlayer || undefined,
    }),
    [effectiveRound, grenadeTypes, grenadeTeam, grenadePlayer],
  );

  const mapGrenadeParams = useMemo(
    () => ({
      round_number: effectiveRound,
    }),
    [effectiveRound],
  );

  const debouncedGrenadeParams = useDebounce(grenadeParams, 300);
  const debouncedPositionParams = useDebounce(positionParams, 200);

  const {
    data: positions = [],
    isLoading: positionsLoading,
    isError: positionsError,
  } = useMatchPositions(matchId, debouncedPositionParams, positionsEnabled);
  const { data: grenades = [] } = useMatchGrenades(matchId, debouncedGrenadeParams, grenadesEnabled && activeTab === 'grenades');
  const { data: mapGrenades = [] } = useMatchGrenades(
    matchId,
    mapGrenadeParams,
    positionsEnabled,
  );
  const { data: overviewGrenades = [], isLoading: overviewGrenadesLoading } = useMatchGrenades(
    matchId,
    {},
    dataEnabled && (activeTab === 'overview' || activeTab === 'ai'),
  );
  const { data: kills = [] } = useMatchKills(matchId, killsEnabled);
  const { data: bombEvents = [] } = useMatchBombEvents(matchId, bombEventsEnabled);
  const { data: purchases = [], isLoading: purchasesLoading } = useMatchPurchases(
    matchId,
    purchasesEnabled,
  );

  const matchAnalytics = useMemo(
    () => (match && kills.length ? computeMatchAnalytics(kills, rounds, match.players) : null),
    [kills, rounds, match],
  );

  const roundTagsMap = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const highlight of matchAnalytics?.round_highlights ?? []) {
      map.set(highlight.round_number, highlight.tags);
    }
    return map;
  }, [matchAnalytics?.round_highlights]);

  const matchEconomy = useMemo(() => {
    if (!match || purchasesLoading) return null;
    return computeMatchEconomy(purchases, rounds, match.players);
  }, [purchases, rounds, match, purchasesLoading]);

  const mapPatterns = useMemo(() => {
    if (!match || overviewGrenadesLoading) return null;
    return computeMatchMapPatterns(
      match.map_name,
      match.players,
      overviewGrenades,
      [],
      rounds,
    );
  }, [match, overviewGrenades, overviewGrenadesLoading, rounds]);

  const replayJumpTickRef = useRef<number | null>(null);

  const heatmapPlayer = selectedPlayers.length === 1 ? selectedPlayers[0] : undefined;
  const { data: heatmapPoints = [] } = useMatchHeatmap(
    matchId,
    heatmapPlayer,
    { round_number: effectiveRound },
    positionsEnabled && !!heatmapPlayer,
  );

  const tickRate = useMemo(
    () => resolvePlaybackTickRate(match?.tick_rate ?? 64, positions),
    [match?.tick_rate, positions],
  );

  const roundTickRanges = useMemo(() => {
    const fromRounds = buildRoundTickRanges(rounds);
    if (fromRounds.length > 0) return fromRounds;

    const ranges = new Map<number, { start: number; end: number; winner: 'CT' | 'T' }>();
    for (const pos of positions) {
      const current = ranges.get(pos.round_number) ?? {
        start: pos.tick,
        end: pos.tick,
        winner: 'CT' as const,
      };
      current.start = Math.min(current.start, pos.tick);
      current.end = Math.max(current.end, pos.tick);
      ranges.set(pos.round_number, current);
    }
    return rounds
      .map((round) => {
        const tickRange = ranges.get(round.round_number);
        if (!tickRange) return null;
        return {
          round_number: round.round_number,
          start: tickRange.start,
          end: tickRange.end,
          winner: round.winner,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [rounds, positions]);

  const tickBounds = useMemo(() => {
    const posFallback =
      positions.length > 0
        ? {
            start: Math.min(...positions.map((p) => p.tick)),
            end: Math.max(...positions.map((p) => p.tick)),
          }
        : { start: 0, end: 128000 };
    return getMatchTickBounds(roundTickRanges, posFallback);
  }, [roundTickRanges, positions]);

  const handleKeyRoundReplay = useCallback(
    (roundNumber: number, jumpTick?: number, prefer3d = false) => {
      replayJumpTickRef.current = jumpTick ?? null;
      setActiveTab(prefer3d ? 'watch3d' : 'map');
      setSelectedRound(roundNumber);
      setIsPlaying(prefer3d);
      setHighlightedKill(null);

      const range = roundTickRanges.find((r) => r.round_number === roundNumber);
      const meta = rounds.find((r) => r.round_number === roundNumber);
      const tick = jumpTick ?? range?.start ?? meta?.start_tick ?? tickBounds.start;
      setCurrentTick(tick);
    },
    [roundTickRanges, rounds, tickBounds.start],
  );

  const handleJumpToKill = useCallback(
    (kill: KillData) => {
      const jumpTick = getKillReplayTick(kill, tickRate);
      replayJumpTickRef.current = jumpTick;
      setActiveTab('map');
      setSelectedRound(kill.round_number);
      setHighlightedKill(kill);
      setHighlightedGrenade(null);
      setIsPlaying(false);
      setCurrentTick(jumpTick);
      setSelectedPlayers((prev) => {
        const next = new Set(prev);
        if (kill.killer !== 'unknown') next.add(kill.killer);
        if (kill.victim !== 'unknown') next.add(kill.victim);
        return [...next];
      });
    },
    [tickRate],
  );

  const handleGrenadeClick = useCallback(
    (grenade: GrenadeData) => {
      const throwTick = grenadeThrowTick(grenade, tickRate);
      const endTick =
        grenade.tick + Math.min(GRENADE_DURATION_TICKS[grenade.grenade_type] ?? tickRate, tickRate * 4);
      replayJumpTickRef.current = throwTick;
      setActiveTab('map');
      setSelectedRound(grenade.round_number);
      setHighlightedKill(null);
      setHighlightedGrenade(grenade);
      setCurrentTick(throwTick);
      setPlaybackSpeed(1);
      setIsPlaying(true);
      setSelectedPlayers((prev) =>
        prev.includes(grenade.player_name) ? prev : [...prev, grenade.player_name],
      );
      // Stop shortly after detonation so the throw "clip" feels intentional.
      window.setTimeout(() => {
        setIsPlaying(false);
        setCurrentTick(endTick);
      }, Math.max(800, ((endTick - throwTick) / tickRate) * 1000));
    },
    [tickRate],
  );

  const preAimData = useMemo(() => {
    if (!highlightedKill || !positions.length) return null;
    return computePreAimForKill(highlightedKill, positions, tickRate);
  }, [highlightedKill, positions, tickRate]);

  const handleRoundSelect = useCallback(
    (round: number | null) => {
      setSelectedRound(round);
      if (activeTab !== 'map' && activeTab !== 'watch3d') return;
      if (round === 0) {
        setCurrentTick(tickBounds.start);
        return;
      }
      if (round) {
        const range = roundTickRanges.find((r) => r.round_number === round);
        const meta = rounds.find((r) => r.round_number === round);
        const start = range?.start ?? meta?.start_tick;
        if (start != null) setCurrentTick(start);
      }
    },
    [activeTab, roundTickRanges, rounds, tickBounds.start],
  );

  const handleTickChange = useCallback(
    (tick: number) => {
      setCurrentTick(tick);
      if (!roundTickRanges.length) return;

      let nextRound: number;
      if (tick < roundTickRanges[0].start) {
        nextRound = 0;
      } else {
        nextRound = getRoundContextAtTick(tick, roundTickRanges, tickRate)?.roundNumber ?? 0;
      }

      setSelectedRound((prev) => (prev === nextRound ? prev : nextRound));
    },
    [roundTickRanges, tickRate],
  );

  useEffect(() => {
    if (activeTab !== 'map' && activeTab !== 'watch3d') return;

    if (replayJumpTickRef.current != null) {
      setCurrentTick(replayJumpTickRef.current);
      replayJumpTickRef.current = null;
      return;
    }

    if (selectedRound === 0) {
      setCurrentTick(tickBounds.start);
      return;
    }
    if (selectedRound && roundTickRanges.length) {
      const range = roundTickRanges.find((r) => r.round_number === selectedRound);
      if (range) setCurrentTick(range.start);
    }
  }, [activeTab, selectedRound, roundTickRanges, tickBounds.start]);

  const handlePlaybackEnd = useCallback(() => {
    if (activeTab === 'watch3d' && selectedRound && rounds.length) {
      const idx = rounds.findIndex((r) => r.round_number === selectedRound);
      if (idx >= 0 && idx < rounds.length - 1) {
        const next = rounds[idx + 1];
        setSelectedRound(next.round_number);
        const range = roundTickRanges.find((r) => r.round_number === next.round_number);
        const start = range?.start ?? next.start_tick;
        if (start != null) setCurrentTick(start);
        setIsPlaying(true);
        return;
      }
    }
    setIsPlaying(false);
  }, [activeTab, selectedRound, rounds, roundTickRanges]);

  useEffect(() => {
    if (activeTab !== 'map' && activeTab !== 'watch3d' && isPlaying) {
      setIsPlaying(false);
    }
  }, [activeTab, isPlaying]);

  useEffect(() => {
    if (activeTab !== 'watch3d') return;
    if (!selectedRound || selectedRound <= 0) {
      setSelectedRound(1);
    }
  }, [activeTab, selectedRound]);

  useReplayPlayback({
    isPlaying: isPlaying && isReplayTab,
    playbackSpeed,
    currentTick,
    tickEnd: tickBounds.end,
    tickRate,
    onTickChange: handleTickChange,
    onPlaybackEnd: handlePlaybackEnd,
  });

  const togglePlayer = useCallback((name: string) => {
    setSelectedPlayers((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }, []);

  const selectAllPlayers = useCallback(() => {
    if (!match?.players.length) return;
    setSelectedPlayers(match.players.map((p) => p.name));
  }, [match?.players]);

  const playerNames = useMemo(
    () => match?.players.map((p) => p.name) ?? [],
    [match?.players],
  );

  const isProcessing = status?.status === 'pending' || status?.status === 'parsing';
  const mapConfig = match ? getMapConfig(match.map_name) : null;
  const utilityTimelineRange = useMemo(() => {
    if (effectiveRound && activeRoundRange) {
      return activeRoundRange;
    }
    if (effectiveRound) {
      const range = roundTickRanges.find((r) => r.round_number === effectiveRound);
      if (range) return { start: range.start, end: range.end };
    }
    return { start: tickBounds.start, end: tickBounds.end };
  }, [effectiveRound, activeRoundRange, roundTickRanges, tickBounds]);

  const utilityEvents = useMemo(
    () =>
      effectiveRound
        ? utilityEventsForRound(mapGrenades, effectiveRound)
        : [],
    [mapGrenades, effectiveRound],
  );

  const displayScore = match
    ? getScoreAtRound(
        rounds,
        selectedRound,
        { score_ct: match.score_ct, score_t: match.score_t },
        { teamT: match.team_t_name, teamCt: match.team_ct_name },
      )
    : null;

  if (statusError && !status) {
    return (
      <ErrorState message={getErrorMessage(statusError)} onRetry={() => refetchStatus()} />
    );
  }

  if (isProcessing) {
    return (
      <div className="glass-panel glow-cyan mx-auto max-w-xl space-y-6 p-8 animate-fade-in">
        <h1 className="text-center font-display text-2xl font-bold text-white">{t('match.processingTitle')}</h1>
        <ProgressBar
          progress={status?.progress ?? 0}
          label={status?.status === 'parsing' ? t('match.status.parsing') : t('match.status.pending')}
          isParsing={status?.status === 'parsing'}
        />
      </div>
    );
  }

  if (status?.status === 'error') {
    return (
      <ErrorState
        message={status.message ?? 'Ошибка при парсинге демки'}
        onRetry={() => refetchStatus()}
      />
    );
  }

  if (matchLoading) {
    return (
      <div className="space-y-6">
        <SkeletonLoader variant="text" count={2} />
        <SkeletonLoader variant="card" count={4} />
      </div>
    );
  }

  if (matchIsError || !match) {
    return (
      <ErrorState
        message={getErrorMessage(matchError) || 'Не удалось загрузить данные матча'}
        onRetry={() => refetchMatch()}
      />
    );
  }

  return (
    <div id="match-report" className="animate-fade-in">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl font-bold text-white">{mapConfig?.displayName}</h1>
            <StatusBadge status={status?.status ?? 'ready'} />
          </div>
          <p className="mt-2 font-mono text-xl">
            <span className="font-bold text-orange-400">{displayScore?.score_t ?? match.score_t}</span>
            <span className="mx-2 text-slate-500 text-sm">{match.team_t_name}</span>
            <span className="mx-1 text-slate-600">:</span>
            <span className="font-bold text-blue-400">{displayScore?.score_ct ?? match.score_ct}</span>
            <span className="ml-2 text-slate-500 text-sm">{match.team_ct_name}</span>
            {selectedRound !== null && selectedRound > 0 && (
              <span className="ml-3 text-sm text-cyan-400">· через R{selectedRound}</span>
            )}
            {selectedRound === 0 && (
              <span className="ml-3 text-sm text-cyan-400">· 0:0</span>
            )}
            <span className="ml-4 text-sm text-slate-500">{match.players.length} игроков</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setActiveTab('watch3d');
              if (!selectedRound || selectedRound <= 0) setSelectedRound(1);
              setIsPlaying(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-cyan-400/50 bg-cyan-500 px-4 py-2.5 text-sm font-bold text-black shadow-[0_0_24px_rgba(34,211,238,0.35)] transition-colors hover:bg-cyan-400"
          >
            <Box className="h-4 w-4" />
            3D
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-slate-400 lg:hidden"
          >
            {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <ExportReport match={match} />
        </div>
      </div>

      <div className="flex gap-6">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 w-72 transform border-r border-white/10 bg-slate-950/95 p-4 pt-24 backdrop-blur-xl transition-transform lg:static lg:block lg:w-60 lg:shrink-0 lg:transform-none lg:border-0 lg:bg-transparent lg:p-0 lg:pt-0',
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
          )}
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            {t('match.playersSidebarTitle')} · {match.players.length}
          </h2>
          <PlayerSelector matchId={matchId!} players={match.players} />
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div className="min-w-0 flex-1">
          <Tabs.Root value={activeTab} onValueChange={setActiveTab}>
            <Tabs.List className="glass-panel mb-6 flex flex-wrap gap-1 p-1.5">
              {[
                { value: 'overview', label: t('match.tabs.overview') },
                { value: 'watch3d', label: t('match.tabs.watch3d'), highlight: true },
                { value: 'map', label: t('match.tabs.map') },
                { value: 'grenades', label: t('match.tabs.grenades') },
                { value: 'rounds', label: t('match.tabs.rounds') },
                { value: 'ai', label: t('match.tabs.ai') },
                ...(isAuthenticated ? [{ value: 'coach', label: t('match.tabs.coach'), highlight: false }] : []),
              ].map((tab) => (
                <Tabs.Trigger
                  key={tab.value}
                  value={tab.value}
                  className={cn(
                    'tab-trigger',
                    tab.highlight &&
                      'border border-cyan-400/40 bg-cyan-500/15 font-bold text-cyan-200 data-[state=active]:bg-cyan-500 data-[state=active]:text-black',
                  )}
                >
                  {tab.highlight ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Box className="h-3.5 w-3.5" />
                      {tab.label}
                    </span>
                  ) : (
                    tab.label
                  )}
                </Tabs.Trigger>
              ))}
            </Tabs.List>

            <Tabs.Content value="overview">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('watch3d');
                  if (!selectedRound || selectedRound <= 0) setSelectedRound(1);
                  setIsPlaying(true);
                }}
                className="mb-4 flex w-full items-center justify-between gap-3 rounded-xl border border-cyan-400/35 bg-gradient-to-r from-cyan-500/20 to-transparent px-4 py-3 text-left transition hover:border-cyan-300/60 hover:from-cyan-500/30"
              >
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500 text-black">
                    <Box className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-display text-sm font-bold text-cyan-100">
                      {t('match.watch3dBannerTitle')}
                    </span>
                    <span className="block text-xs text-slate-400">{t('match.watch3dBannerDesc')}</span>
                  </span>
                </span>
                <span className="shrink-0 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-black">
                  {t('match.watch3d')}
                </span>
              </button>
              <MatchOverview
                match={match}
                matchId={matchId!}
                kills={kills}
                rounds={rounds}
                selectedRound={selectedRound}
                onRoundSelect={handleRoundSelect}
                roundHighlights={matchAnalytics?.round_highlights ?? []}
                openingStats={matchAnalytics?.opening_stats ?? []}
                tradeKills={matchAnalytics?.trade_kills ?? []}
                onReplayRound={handleKeyRoundReplay}
                onJumpToKill={handleJumpToKill}
                economy={matchEconomy}
                economyLoading={purchasesLoading}
                mapPatterns={mapPatterns}
                mapPatternsLoading={overviewGrenadesLoading}
              />
            </Tabs.Content>

            <Tabs.Content value="map" className="space-y-4">
              {matchAnalytics && matchAnalytics.round_highlights.length > 0 && (
                <KeyRoundsStrip
                  highlights={matchAnalytics.round_highlights}
                  selectedRound={selectedRound}
                  onReplayRound={handleKeyRoundReplay}
                />
              )}

              <div className="relative">
                <MatchMap
                  mapName={match.map_name}
                  mode={heatmapPlayer ? 'heatmap' : 'positions'}
                  positions={positions}
                  grenades={mapGrenades}
                  heatmapPoints={heatmapPoints}
                  selectedPlayers={selectedPlayers}
                  currentTick={currentTick}
                  kills={kills}
                  rounds={rounds}
                  roundTickRanges={roundTickRanges}
                  roundPauses={roundPauses}
                  selectedRound={selectedRound}
                  tickRate={tickRate}
                  teamTName={match.team_t_name}
                  teamCtName={match.team_ct_name}
                  positionsLoading={positionsLoading}
                  positionsError={positionsError}
                  teamFilter={mapTeamFilter}
                  layers={mapLayers}
                  trajectoryPlayer={mapTrajectoryPlayer}
                  highlightedKill={highlightedKill}
                  highlightedGrenade={highlightedGrenade}
                  preAimData={preAimData}
                  bombEvents={bombEvents}
                  onGrenadeClick={handleGrenadeClick}
                  className="min-h-[520px]"
                />

                <div className="mt-3 lg:absolute lg:right-3 lg:top-14 lg:z-[40] lg:mt-0 lg:w-[220px]">
                  <MapLayerControls
                    layers={mapLayers}
                    onChange={setMapLayers}
                    teamFilter={mapTeamFilter}
                    onTeamFilterChange={setMapTeamFilter}
                    trajectoryPlayer={mapTrajectoryPlayer}
                    onTrajectoryPlayerChange={setMapTrajectoryPlayer}
                    players={
                      mapTrajectoryPlayer
                        ? [mapTrajectoryPlayer]
                        : selectedPlayers.length > 0
                          ? selectedPlayers
                          : playerNames
                    }
                    className="bg-[#05080d]/92 backdrop-blur-md"
                  />
                </div>
              </div>

              {highlightedGrenade && (
                <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-sm">
                  <p className="font-medium text-cyan-200">
                    Utility clip · {highlightedGrenade.player_name} · {highlightedGrenade.grenade_type}
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    Throw replay from release to detonation. Click another grenade to switch.
                  </p>
                  <button
                    type="button"
                    onClick={() => setHighlightedGrenade(null)}
                    className="mt-2 text-xs text-slate-400 hover:text-white"
                  >
                    Close clip
                  </button>
                </div>
              )}

              {highlightedKill && preAimData && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm">
                  <p className="font-medium text-amber-200">
                    {t('match.killcamLabel')} · {highlightedKill.killer} → {highlightedKill.victim}
                    <span className="ml-2 font-mono text-xs text-slate-400">
                      {highlightedKill.weapon}
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    {t('match.preAimLabel')} {formatDistance(preAimData.distance)} · {t('match.angleLabel')}{' '}
                    {preAimData.angleDeg}°
                    {preAimData.isSniper && (
                      <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                        {t('match.awpAngle')}
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={() => setHighlightedKill(null)}
                    className="mt-2 text-xs text-slate-400 hover:text-white"
                  >
                    {t('match.closeKillcam')}
                  </button>
                </div>
              )}

              {effectiveRound ? (
                <UtilityTimeline
                  events={utilityEvents}
                  tickStart={utilityTimelineRange.start}
                  tickEnd={utilityTimelineRange.end}
                  currentTick={Math.round(currentTick)}
                  onSeek={handleTickChange}
                />
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-xs text-slate-500">
                  {t('match.roundUtilityTimelineHint')}
                </div>
              )}

              <PlayerTimeline
                tickStart={tickBounds.start}
                tickEnd={tickBounds.end}
                currentTick={Math.round(currentTick)}
                onTickChange={handleTickChange}
                isPlaying={isPlaying}
                onPlayPause={() => setIsPlaying(!isPlaying)}
                playbackSpeed={playbackSpeed}
                onSpeedChange={setPlaybackSpeed}
                rounds={rounds}
                roundTickRanges={roundTickRanges}
                selectedRound={selectedRound}
                onRoundSelect={handleRoundSelect}
                teamTName={match.team_t_name}
              />

              <div className="glass-panel p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="font-display text-sm font-semibold text-slate-200">
                    {t('match.playersOnMap')}
                  </h3>
                  <button
                    type="button"
                    onClick={selectAllPlayers}
                    className="text-xs font-medium text-cyan-400 hover:text-cyan-300"
                  >
                    {t('match.selectAllPlayers')}
                  </button>
                </div>
                <PlayerSelector
                  matchId={matchId!}
                  players={match.players}
                  multiSelect
                  selectedPlayers={selectedPlayers}
                  onTogglePlayer={togglePlayer}
                />
              </div>
            </Tabs.Content>

            <Tabs.Content value="watch3d" className="space-y-4">
              {(!selectedRound || selectedRound <= 0) && (
                <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-2 text-xs text-cyan-200">
                  Выберите раунд на таймлайне или нажмите Play — 3D-реплей стартует с раунда 1.
                </p>
              )}
              {matchAnalytics && matchAnalytics.round_highlights.length > 0 && (
                <KeyRoundsStrip
                  highlights={matchAnalytics.round_highlights}
                  selectedRound={selectedRound}
                  onReplayRound={(roundNumber, jumpTick) => {
                    handleKeyRoundReplay(roundNumber, jumpTick, true);
                  }}
                />
              )}
              <Demo3DViewer
                mapName={match.map_name}
                positions={positions}
                grenades={mapGrenades}
                kills={kills}
                bombEvents={bombEvents}
                rounds={rounds}
                roundPauses={roundPauses}
                roundTickRanges={roundTickRanges}
                selectedRound={selectedRound}
                onRoundSelect={handleRoundSelect}
                currentTick={currentTick}
                onTickChange={handleTickChange}
                tickStart={tickBounds.start}
                tickEnd={tickBounds.end}
                tickRate={tickRate}
                isPlaying={isPlaying}
                onPlayPause={() => setIsPlaying(!isPlaying)}
                playbackSpeed={playbackSpeed}
                onSpeedChange={setPlaybackSpeed}
                teamTName={match.team_t_name}
                teamCtName={match.team_ct_name}
                playerNames={playerNames}
                players={match.players.map((p) => ({
                  name: p.name,
                  team: p.team,
                  crosshair_code: p.crosshair_code,
                }))}
                className="min-h-[min(86vh,980px)]"
              />
              {positionsLoading && (
                <p className="text-center text-xs text-slate-500">{t('match.status.parsing')}</p>
              )}
              {positionsError && (
                <p className="text-center text-xs text-red-400">Failed to load positions for 3D replay</p>
              )}
            </Tabs.Content>

            <Tabs.Content value="grenades" className="space-y-4">
              <GrenadeFilters
                selectedTypes={grenadeTypes}
                onTypesChange={setGrenadeTypes}
                selectedTeam={grenadeTeam}
                onTeamChange={setGrenadeTeam}
                selectedPlayer={grenadePlayer}
                onPlayerChange={setGrenadePlayer}
                players={playerNames}
                grenades={grenades}
              />

              {grenades.length > 0 ? (
                <MatchMap
                  mapName={match.map_name}
                  mode="grenades"
                  grenades={grenades}
                  highlightedGrenade={highlightedGrenade}
                  onGrenadeClick={handleGrenadeClick}
                />
              ) : (
                <EmptyState variant="grenades" />
              )}
            </Tabs.Content>

            <Tabs.Content value="rounds" className="space-y-4">
              {matchAnalytics && matchAnalytics.round_highlights.length > 0 && (
                <KeyRoundsStrip
                  highlights={matchAnalytics.round_highlights}
                  selectedRound={selectedRound}
                  onReplayRound={handleKeyRoundReplay}
                />
              )}
              <RoundTimeline
                rounds={rounds}
                selectedRound={selectedRound}
                onRoundSelect={handleRoundSelect}
                roundTags={roundTagsMap}
                onReplayRound={handleKeyRoundReplay}
              />
              {selectedRound !== null && selectedRound > 0 && (
                <p className="rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-300">
                  Клик по раунду открывает реплей на вкладке «Карта»
                </p>
              )}
            </Tabs.Content>

            {isAuthenticated && (
              <Tabs.Content value="coach">
                <CoachPanel matchId={matchId!} mapName={match.map_name} />
              </Tabs.Content>
            )}

            <Tabs.Content value="ai">
              <AiInsightsPanel
                kills={kills}
                rounds={rounds}
                players={match.players}
                analytics={matchAnalytics}
                economy={matchEconomy}
                grenades={overviewGrenades}
                loading={overviewGrenadesLoading || purchasesLoading}
              />
            </Tabs.Content>
          </Tabs.Root>
        </div>
      </div>
    </div>
  );
}
