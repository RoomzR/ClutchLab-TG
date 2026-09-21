import type { KillData, RoundData, RoundPause, TickData } from '../types/match';
import { getMapConfig } from '../utils/mapConfig';
import { computeRoundClock } from '../utils/roundClock';
import { countKillsInReplayRound, getDeadPlayersAtTick, getScoreAtTick } from '../utils/roundStats';
import { cn } from '../lib/cn';

interface MapReplayHudProps {
  mapName: string;
  currentTick: number;
  tickRate?: number;
  teamTName?: string;
  teamCtName?: string;
  selectedRound?: number | null;
  rounds?: RoundData[];
  roundTickRanges?: import('../utils/roundStats').RoundTickRange[];
  roundPauses?: RoundPause[];
  kills?: KillData[];
  positions?: TickData[];
  className?: string;
}

export function MapReplayHud({
  mapName,
  currentTick,
  tickRate = 64,
  teamTName = 'T',
  teamCtName = 'CT',
  selectedRound,
  rounds = [],
  roundTickRanges = [],
  roundPauses = [],
  kills = [],
  positions = [],
  className,
}: MapReplayHudProps) {
  const mapConfig = getMapConfig(mapName);
  const roundClock = computeRoundClock(currentTick, roundTickRanges, rounds, roundPauses, tickRate);
  const score = getScoreAtTick(currentTick, rounds, {
    teamT: teamTName,
    teamCt: teamCtName,
  });

  const displayRound =
    selectedRound !== null && selectedRound !== undefined
      ? selectedRound
      : (() => {
          for (const range of roundTickRanges) {
            if (currentTick >= range.start && currentTick <= range.end) {
              return range.round_number;
            }
          }
          return 0;
        })();

  const roundInfo = rounds.find((r) => r.round_number === displayRound);

  const latestByPlayer = new Map<string, TickData>();
  for (const pos of positions) {
    if (pos.tick > currentTick) continue;
    const existing = latestByPlayer.get(pos.player_name);
    if (!existing || pos.tick > existing.tick) latestByPlayer.set(pos.player_name, pos);
  }

  const positionRoundHint = (() => {
    const rounds = new Set<number>();
    for (const pos of positions) {
      if (pos.tick > currentTick) continue;
      if (Number.isFinite(pos.round_number) && pos.round_number > 0) {
        rounds.add(pos.round_number);
      }
    }
    return rounds.size === 1 ? [...rounds][0] : undefined;
  })();

  const deadPlayers = getDeadPlayersAtTick(
    currentTick,
    kills,
    roundTickRanges,
    selectedRound,
    positionRoundHint,
  );

  let ctAlive = 0;
  let tAlive = 0;
  for (const pos of latestByPlayer.values()) {
    if (deadPlayers.has(pos.player_name)) continue;
    if (pos.team === 'CT') ctAlive += 1;
    else tAlive += 1;
  }

  const fragsInView = countKillsInReplayRound(
    currentTick,
    kills,
    roundTickRanges,
    selectedRound,
    positionRoundHint,
  );

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-2 p-3',
        className,
      )}
    >
      <div className="rounded-lg border border-white/10 bg-black/75 px-3 py-2 backdrop-blur-md min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 truncate">
          {mapConfig.displayName}
        </p>
        <p className="font-mono text-lg font-bold text-white">
          <span className="text-orange-400">{score.score_t}</span>
          <span className="mx-2 text-slate-500">{teamTName}</span>
          <span className="text-slate-600">·</span>
          <span className="mx-2 text-slate-500">{teamCtName}</span>
          <span className="text-blue-400">{score.score_ct}</span>
        </p>
        <p className="font-mono text-xs text-cyan-300">
          {displayRound === 0 ? 'Старт · 0:0' : `Раунд ${displayRound}/${rounds.length || '?'}`}
          {roundInfo?.winner_team ? ` · ${roundInfo.winner_team}` : roundInfo ? ` · ${roundInfo.winner}` : ''}
        </p>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/75 px-4 py-2 text-center backdrop-blur-md">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">
          {roundClock.sublabel ?? 'Таймер'}
        </p>
        <p
          className={cn(
            'font-mono text-xl font-bold',
            roundClock.phase === 'timeout' ? 'text-amber-300' : 'text-white',
            roundClock.phase === 'break' && 'text-slate-400',
          )}
        >
          {roundClock.display}
        </p>
        <p className="font-mono text-[10px] text-slate-500">{Math.floor(currentTick).toLocaleString()} tick</p>
      </div>

      <div className="rounded-lg border border-white/10 bg-black/75 px-3 py-2 backdrop-blur-md">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">Живы</p>
        <p className="font-mono text-sm font-bold">
          <span className="text-blue-400">{ctAlive}</span>
          <span className="mx-1 text-slate-600">vs</span>
          <span className="text-orange-400">{tAlive}</span>
        </p>
        <p className="text-xs text-slate-400">{fragsInView} фрагов</p>
      </div>
    </div>
  );
}
