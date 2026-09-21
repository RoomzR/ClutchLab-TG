import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Box } from 'lucide-react';
import { Demo3DViewer } from '../demo3d';
import { ErrorState } from '../components/ErrorState';
import { ProgressBar } from '../components/ProgressBar';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { useMatchStatus } from '../hooks/useMatchStatus';
import {
  useMatchBombEvents,
  useMatchGrenades,
  useMatchKills,
  useMatchOverview,
  useMatchPositions,
  useMatchRoundPauses,
  useMatchRounds,
} from '../hooks/useMatch';
import { useReplayPlayback } from '../hooks/useReplayPlayback';
import { getErrorMessage } from '../api/client';
import { getMapConfig } from '../utils/mapConfig';
import {
  buildRoundTickRanges,
  getMatchTickBounds,
  getRoundContextAtTick,
} from '../utils/roundStats';
import { resolvePlaybackTickRate } from '../utils/tickRate';
import { useT } from '../i18n/LocaleContext';

export function DemoWatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
  const t = useT();
  const { data: status, isError: statusError, refetch: refetchStatus } = useMatchStatus(matchId);
  const isReady = status?.status === 'ready';
  const isProcessing = status?.status === 'pending' || status?.status === 'parsing';

  const {
    data: match,
    isLoading: matchLoading,
    isError: matchIsError,
    error: matchError,
    refetch: refetchMatch,
  } = useMatchOverview(isReady ? matchId : undefined);

  const [selectedRound, setSelectedRound] = useState<number | null>(1);
  const [currentTick, setCurrentTick] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const { data: rounds = [] } = useMatchRounds(matchId, isReady);
  const { data: roundPauses = [] } = useMatchRoundPauses(matchId, isReady);
  const { data: kills = [] } = useMatchKills(matchId, isReady);
  const { data: bombEvents = [] } = useMatchBombEvents(matchId, isReady);

  const activeRoundRange = useMemo(() => {
    if (!selectedRound || selectedRound <= 0) return null;
    const meta = rounds.find((r) => r.round_number === selectedRound);
    if (meta?.start_tick != null && meta?.end_tick != null) {
      return { start: meta.start_tick, end: meta.end_tick };
    }
    return null;
  }, [selectedRound, rounds]);

  const positionParams = useMemo(
    () => ({
      round_number: selectedRound && selectedRound > 0 ? selectedRound : undefined,
      tick_start: activeRoundRange?.start,
      tick_end: activeRoundRange?.end,
    }),
    [selectedRound, activeRoundRange],
  );

  const { data: positions = [] } = useMatchPositions(matchId, positionParams, isReady);
  const { data: grenades = [] } = useMatchGrenades(
    matchId,
    { round_number: selectedRound && selectedRound > 0 ? selectedRound : undefined },
    isReady,
  );

  const tickRate = useMemo(
    () => resolvePlaybackTickRate(match?.tick_rate ?? 64, positions),
    [match?.tick_rate, positions],
  );

  const roundTickRanges = useMemo(() => {
    const fromRounds = buildRoundTickRanges(rounds);
    if (fromRounds.length > 0) return fromRounds;

    const ranges = new Map<number, { start: number; end: number }>();
    for (const pos of positions) {
      const current = ranges.get(pos.round_number) ?? { start: pos.tick, end: pos.tick };
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
    if (activeRoundRange) return activeRoundRange;
    const posFallback =
      positions.length > 0
        ? {
            start: Math.min(...positions.map((p) => p.tick)),
            end: Math.max(...positions.map((p) => p.tick)),
          }
        : { start: 0, end: 128000 };
    if (selectedRound && selectedRound > 0) {
      const range = roundTickRanges.find((r) => r.round_number === selectedRound);
      if (range) return { start: range.start, end: range.end };
    }
    return getMatchTickBounds(roundTickRanges, posFallback);
  }, [activeRoundRange, positions, selectedRound, roundTickRanges]);

  const handleTickChange = useCallback(
    (tick: number) => {
      setCurrentTick(tick);
      if (!roundTickRanges.length) return;
      let nextRound: number;
      if (tick < roundTickRanges[0].start) nextRound = 0;
      else nextRound = getRoundContextAtTick(tick, roundTickRanges, tickRate)?.roundNumber ?? 0;
      setSelectedRound((prev) => (prev === nextRound ? prev : nextRound));
    },
    [roundTickRanges, tickRate],
  );

  const handleRoundSelect = useCallback(
    (round: number | null) => {
      setSelectedRound(round);
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
    [roundTickRanges, rounds, tickBounds.start],
  );

  const advanceAfterRound = useCallback(() => {
    if (!selectedRound || !rounds.length) {
      setIsPlaying(false);
      return;
    }
    const idx = rounds.findIndex((r) => r.round_number === selectedRound);
    if (idx >= 0 && idx < rounds.length - 1) {
      const next = rounds[idx + 1];
      handleRoundSelect(next.round_number);
      setIsPlaying(true);
      return;
    }
    setIsPlaying(false);
  }, [selectedRound, rounds, handleRoundSelect]);

  useEffect(() => {
    if (selectedRound === 1 && roundTickRanges.length) {
      const range = roundTickRanges.find((r) => r.round_number === 1);
      if (range) setCurrentTick(range.start);
    }
  }, [roundTickRanges, selectedRound]);

  useReplayPlayback({
    isPlaying,
    playbackSpeed,
    currentTick,
    tickEnd: tickBounds.end,
    tickRate,
    onTickChange: handleTickChange,
    onPlaybackEnd: advanceAfterRound,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (statusError && !status) {
    return <ErrorState message={getErrorMessage(statusError)} onRetry={() => refetchStatus()} />;
  }

  if (isProcessing) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-8">
        <h1 className="text-center font-display text-2xl font-bold text-white">
          {t('match.processingTitle')}
        </h1>
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
      <div className="space-y-6 p-4">
        <SkeletonLoader variant="text" count={2} />
        <SkeletonLoader variant="card" count={2} />
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

  const mapConfig = getMapConfig(match.map_name);
  const playerNames = match.players.map((p) => p.name);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col gap-3 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex items-center gap-3">
          <Link
            to={`/match/${matchId}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Analytics
          </Link>
          <div>
            <h1 className="flex items-center gap-2 font-display text-xl font-bold text-white">
              <Box className="h-5 w-5 text-cyan-400" />
              {mapConfig.displayName}
              <span className="rounded bg-cyan-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                3D
              </span>
            </h1>
            <p className="text-xs text-slate-500">
              Watch demo in browser · WebGL · GPU recommended
            </p>
          </div>
        </div>
        <p className="font-mono text-sm">
          <span className="font-bold text-orange-400">{match.score_t}</span>
          <span className="mx-2 text-slate-500">{match.team_t_name}</span>
          <span className="text-slate-600">:</span>
          <span className="mx-2 font-bold text-blue-400">{match.score_ct}</span>
          <span className="text-slate-500">{match.team_ct_name}</span>
        </p>
      </div>

      <Demo3DViewer
        mapName={match.map_name}
        positions={positions}
        grenades={grenades}
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
        onPlayPause={() => setIsPlaying((p) => !p)}
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
        className="flex-1"
      />
    </div>
  );
}
