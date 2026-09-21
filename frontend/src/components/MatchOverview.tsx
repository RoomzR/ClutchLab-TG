import { memo, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Crosshair,
  Map,
  RotateCcw,
  Shield,
  Skull,
  Swords,
  Target,
  Trophy,
  Users,
} from 'lucide-react';
import type { KillData, MatchOverview as MatchOverviewType, RoundData } from '../types/match';
import type { OpeningDuelStat, RoundHighlight, TradeKillEvent } from '../utils/matchAnalytics';
import type { MatchEconomySummary } from '../utils/matchEconomy';
import type { MatchMapPatterns } from '../utils/mapPatterns';
import { getMapConfig } from '../utils/mapConfig';
import { computeAllPlayerStats } from '../utils/playerStats';
import { filterKillsThroughRound, getRoundWinCounts, getScoreAtRound } from '../utils/roundStats';
import { EmptyState } from './EmptyState';
import { KeyRoundsStrip } from './KeyRoundsStrip';
import { MatchEconomyPanel } from './MatchEconomyPanel';
import { MapPatternsPanel } from './MapPatternsPanel';
import { OpeningDuelsPanel } from './OpeningDuelsPanel';
import { cn } from '../lib/cn';

interface MatchOverviewProps {
  match: MatchOverviewType;
  matchId: string;
  kills?: KillData[];
  rounds?: RoundData[];
  selectedRound?: number | null;
  onRoundSelect?: (round: number | null) => void;
  roundHighlights?: RoundHighlight[];
  openingStats?: OpeningDuelStat[];
  tradeKills?: TradeKillEvent[];
  onReplayRound?: (roundNumber: number, jumpTick?: number) => void;
  onJumpToKill?: (kill: KillData) => void;
  economy?: MatchEconomySummary | null;
  economyLoading?: boolean;
  mapPatterns?: MatchMapPatterns | null;
  mapPatternsLoading?: boolean;
}

export function MatchOverview({
  match,
  matchId,
  kills = [],
  rounds = [],
  selectedRound = null,
  onRoundSelect,
  roundHighlights = [],
  openingStats = [],
  tradeKills = [],
  onReplayRound,
  onJumpToKill,
  economy = null,
  economyLoading = false,
  mapPatterns = null,
  mapPatternsLoading = false,
}: MatchOverviewProps) {
  const mapConfig = getMapConfig(match.map_name);

  const ctPlayers = useMemo(() => match.players.filter((p) => p.team === 'CT'), [match.players]);
  const tPlayers = useMemo(() => match.players.filter((p) => p.team === 'T'), [match.players]);
  const playerNames = useMemo(() => match.players.map((p) => p.name), [match.players]);

  const filteredKills = useMemo(
    () => filterKillsThroughRound(kills, selectedRound),
    [kills, selectedRound],
  );

  const teamNames = useMemo(
    () => ({ teamT: match.team_t_name, teamCt: match.team_ct_name }),
    [match.team_t_name, match.team_ct_name],
  );

  const score = useMemo(
    () =>
      getScoreAtRound(
        rounds,
        selectedRound,
        { score_ct: match.score_ct, score_t: match.score_t },
        teamNames,
      ),
    [rounds, selectedRound, match.score_ct, match.score_t, teamNames],
  );

  const { ct: ctRoundWins, t: tRoundWins } = useMemo(
    () => getRoundWinCounts(rounds, selectedRound, teamNames),
    [rounds, selectedRound, teamNames],
  );

  const playerStats = useMemo(
    () => computeAllPlayerStats(filteredKills, playerNames),
    [filteredKills, playerNames],
  );

  const headshotCount = useMemo(
    () => filteredKills.reduce((n, k) => n + (k.headshot ? 1 : 0), 0),
    [filteredKills],
  );

  const recentKills = useMemo(
    () => [...filteredKills].sort((a, b) => b.tick - a.tick).slice(0, 8),
    [filteredKills],
  );

  const handleRoundClick = useCallback(
    (roundNumber: number) => {
      if (!onRoundSelect) return;
      onRoundSelect(selectedRound === roundNumber ? null : roundNumber);
    },
    [onRoundSelect, selectedRound],
  );

  const handleResetRound = useCallback(() => onRoundSelect?.(null), [onRoundSelect]);

  if (match.players.length === 0) {
    return (
      <EmptyState
        variant="default"
        title="Игроки не найдены"
        description="Парсер не смог извлечь игроков из демки. Попробуйте загрузить другой файл."
      />
    );
  }

  const renderScoreboard = (players: typeof match.players, team: 'CT' | 'T') => {
    const isCT = team === 'CT';

    return (
      <div
        className={cn(
          'glass-panel overflow-hidden',
          isCT ? 'glow-ct border-blue-500/20' : 'glow-t border-orange-500/20',
        )}
      >
        <div
          className={cn(
            'flex items-center justify-between border-b border-white/5 px-5 py-4',
            isCT ? 'bg-blue-500/10' : 'bg-orange-500/10',
          )}
        >
          <div className="flex items-center gap-3">
            {isCT ? (
              <Shield className="h-5 w-5 text-blue-400" />
            ) : (
              <Users className="h-5 w-5 text-orange-400" />
            )}
            <div>
              <h3 className={cn('font-display text-lg font-bold', isCT ? 'text-blue-300' : 'text-orange-300')}>
                {isCT ? match.team_ct_name || 'Counter-Terrorists' : match.team_t_name || 'Terrorists'}
              </h3>
              <p className="text-xs text-slate-400">
                {players.length} игроков
                {selectedRound !== null && (
                  <span className="ml-2 text-cyan-400">· раунд {selectedRound}</span>
                )}
              </p>
            </div>
          </div>
          <span className={cn('font-mono text-3xl font-bold', isCT ? 'text-blue-400' : 'text-orange-400')}>
            {isCT ? score.score_ct : score.score_t}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-xs uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3 font-medium">Игрок</th>
                <th className="px-3 py-3 text-center font-medium">K</th>
                <th className="px-3 py-3 text-center font-medium">D</th>
                <th className="px-3 py-3 text-center font-medium">HS%</th>
                <th className="px-5 py-3 text-right font-medium" />
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const stats = playerStats.get(player.name) ?? {
                  kills: 0,
                  deaths: 0,
                  headshot_pct: 0,
                };
                const kd =
                  stats.deaths > 0
                    ? (stats.kills / stats.deaths).toFixed(2)
                    : stats.kills.toFixed(2);

                return (
                  <tr
                    key={player.name}
                    className="group border-b border-white/5 transition-colors last:border-0 hover:bg-white/[0.03]"
                  >
                    <td className="px-5 py-3">
                      <Link
                        to={`/match/${matchId}/player/${encodeURIComponent(player.name)}`}
                        className="flex items-center gap-3"
                      >
                        <div
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold',
                            isCT ? 'bg-blue-500/20 text-blue-300' : 'bg-orange-500/20 text-orange-300',
                          )}
                        >
                          {player.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-white transition-colors group-hover:text-cyan-300">
                            {player.name}
                          </p>
                          <p className="font-mono text-xs text-slate-500">K/D {kd}</p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-semibold text-green-400">
                      {stats.kills}
                    </td>
                    <td className="px-3 py-3 text-center font-mono font-semibold text-red-400">
                      {stats.deaths}
                    </td>
                    <td className="px-3 py-3 text-center font-mono text-violet-400">
                      {stats.headshot_pct}%
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        to={`/match/${matchId}/player/${encodeURIComponent(player.name)}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 opacity-0 transition-opacity group-hover:opacity-100"
                      >
                        Профиль
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="glass-panel glow-cyan relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-25"
          style={{
            backgroundImage: `url(${mapConfig.imageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            maskImage: 'linear-gradient(to bottom, black 20%, transparent 100%)',
          }}
        />
        <div className="relative flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between md:p-8">
          <div>
            <div className="mb-2 flex items-center gap-2 text-cyan-400/80">
              <Map className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.2em]">Матч</span>
              {selectedRound !== null && (
                <span className="rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
                  {selectedRound === 0 ? '0 : 0' : `Через R${selectedRound}`}
                </span>
              )}
            </div>
            <h2 className="font-display text-3xl font-bold text-white md:text-4xl">
              {mapConfig.displayName}
            </h2>
            <p className="mt-1 font-mono text-sm text-slate-400">{match.map_name}</p>
          </div>

          <div className="flex items-center gap-6 md:gap-10">
            <div className="text-center">
              <p className="mb-1 text-xs uppercase tracking-wider text-orange-400/80 truncate max-w-[120px]">
                {match.team_t_name || 'T'}
              </p>
              <p className="font-display text-5xl font-bold text-orange-400 md:text-6xl">{score.score_t}</p>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Swords className="h-6 w-6 text-slate-600" />
              <span className="font-mono text-xs text-slate-500">
                {selectedRound === null
                  ? `${rounds.length || match.score_ct + match.score_t} rnd`
                  : selectedRound === 0
                    ? 'Старт'
                    : `R${selectedRound}`}
              </span>
            </div>
            <div className="text-center">
              <p className="mb-1 text-xs uppercase tracking-wider text-blue-400/80 truncate max-w-[120px]">
                {match.team_ct_name || 'CT'}
              </p>
              <p className="font-display text-5xl font-bold text-blue-400 md:text-6xl">{score.score_ct}</p>
            </div>
          </div>
        </div>
      </div>

      {selectedRound !== null && onRoundSelect && (
        <div className="flex items-center justify-between rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3">
          <p className="text-sm text-cyan-200">
            {selectedRound === 0 ? (
              <>Старт матча · счёт <span className="font-mono font-bold">0 : 0</span></>
            ) : (
              <>
                Статистика через раунд{' '}
                <span className="font-mono font-bold">#{selectedRound}</span>
                {rounds.find((r) => r.round_number === selectedRound) && (
                  <span className="ml-2 text-cyan-400/80">
                    · {rounds.find((r) => r.round_number === selectedRound)!.winner} win
                  </span>
                )}
              </>
            )}
          </p>
          <button
            type="button"
            onClick={handleResetRound}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Весь матч
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { icon: Users, label: 'Игроков', value: match.players.length, color: 'text-cyan-400' },
          { icon: Trophy, label: 'Раундов', value: rounds.length || match.score_ct + match.score_t, color: 'text-yellow-400' },
          { icon: Skull, label: 'Убийств', value: filteredKills.length, color: 'text-red-400' },
          {
            icon: Target,
            label: 'Хедшотов',
            value: headshotCount,
            color: 'text-violet-400',
          },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="glass-panel glass-panel-hover p-4">
            <div className="mb-2 flex items-center gap-2 text-slate-400">
              <Icon className="h-4 w-4" />
              <span className="text-xs uppercase tracking-wider">{label}</span>
            </div>
            <p className={cn('font-display text-3xl font-bold', color)}>{value}</p>
          </div>
        ))}
      </div>

      {roundHighlights.length > 0 && onReplayRound && (
        <KeyRoundsStrip
          highlights={roundHighlights}
          selectedRound={selectedRound}
          onReplayRound={onReplayRound}
        />
      )}

      {(openingStats.length > 0 || tradeKills.length > 0) && (
        <OpeningDuelsPanel openingStats={openingStats} tradeKills={tradeKills} />
      )}

      <MatchEconomyPanel
        economy={economy}
        selectedRound={selectedRound}
        teamTName={match.team_t_name}
        teamCtName={match.team_ct_name}
        isLoading={economyLoading}
      />

      <MapPatternsPanel
        patterns={mapPatterns}
        teamTName={match.team_t_name}
        teamCtName={match.team_ct_name}
        isLoading={mapPatternsLoading}
      />

      {rounds.length > 0 && (
        <div className="glass-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
              <Trophy className="h-4 w-4 text-yellow-400" />
              Ход матча
            </h3>
            <p className="text-xs text-slate-500">0:0 → клик по раунду — накопительная статистика</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {onRoundSelect && (
              <button
                type="button"
                title="Старт матча · 0:0"
                onClick={() => handleRoundClick(0)}
                className={cn(
                  'h-8 min-w-8 rounded-lg border px-2 text-center font-mono text-xs leading-8 transition-all',
                  'border-slate-500/40 bg-slate-500/15 text-slate-300',
                  selectedRound === 0 && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 scale-110',
                  'cursor-pointer hover:scale-110',
                )}
              >
                0
              </button>
            )}
            {rounds.map((round) => {
              const isSelected = selectedRound === round.round_number;
              const tWin =
                round.winner_team != null
                  ? round.winner_team === match.team_t_name
                  : round.winner === 'T';
              return (
                <button
                  key={round.round_number}
                  type="button"
                  title={`Раунд ${round.round_number}: ${round.winner_team ?? round.winner}`}
                  onClick={() => handleRoundClick(round.round_number)}
                  className={cn(
                    'h-8 w-8 rounded-lg border text-center font-mono text-xs leading-8 transition-all',
                    tWin
                      ? 'border-orange-500/40 bg-orange-500/20 text-orange-300'
                      : 'border-blue-500/40 bg-blue-500/20 text-blue-300',
                    isSelected && 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-slate-950 scale-110',
                    onRoundSelect && 'cursor-pointer hover:scale-110',
                  )}
                >
                  {round.round_number}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-orange-500" />
              {match.team_t_name || 'T'} {tRoundWins}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded bg-blue-500" />
              {match.team_ct_name || 'CT'} {ctRoundWins}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {renderScoreboard(ctPlayers, 'CT')}
        {renderScoreboard(tPlayers, 'T')}
      </div>

      {recentKills.length > 0 && (
        <div className="glass-panel p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-display text-sm font-semibold text-slate-200">
              <Crosshair className="h-4 w-4 text-red-400" />
              {selectedRound === null
                ? 'Последние убийства'
                : selectedRound === 0
                  ? 'Убийства · старт'
                  : `Убийства · через R${selectedRound}`}
            </h3>
            {onJumpToKill && (
              <span className="text-[10px] uppercase tracking-wider text-cyan-400/80">
                Клик → kill-cam
              </span>
            )}
          </div>
          <ul className="space-y-2">
            {recentKills.map((kill, i) => (
              <li key={`${kill.tick}-${kill.killer}-${kill.victim}-${i}`}>
                <button
                  type="button"
                  onClick={() => onJumpToKill?.(kill)}
                  disabled={!onJumpToKill}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-4 py-2.5 text-left text-sm transition-all',
                    onJumpToKill && 'cursor-pointer hover:border-cyan-400/30 hover:bg-cyan-500/10',
                  )}
                >
                  <span className="font-mono text-xs text-slate-500">R{kill.round_number}</span>
                  {onJumpToKill ? (
                    <>
                      <span className="font-medium text-cyan-300">{kill.killer}</span>
                      <Skull className="h-3.5 w-3.5 text-red-400" />
                      <span className="font-medium text-slate-300">{kill.victim}</span>
                    </>
                  ) : (
                    <>
                      <Link
                        to={`/match/${matchId}/player/${encodeURIComponent(kill.killer)}`}
                        className="font-medium text-cyan-300 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {kill.killer}
                      </Link>
                      <Skull className="h-3.5 w-3.5 text-red-400" />
                      <Link
                        to={`/match/${matchId}/player/${encodeURIComponent(kill.victim)}`}
                        className="font-medium text-slate-300 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {kill.victim}
                      </Link>
                    </>
                  )}
                  <span className="ml-auto font-mono text-xs text-slate-500">{kill.weapon}</span>
                  {kill.headshot && (
                    <span className="rounded bg-violet-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-violet-300">
                      HS
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default memo(MatchOverview);
