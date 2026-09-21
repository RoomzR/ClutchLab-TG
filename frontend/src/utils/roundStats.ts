import type { KillData, RoundData, RoundPause } from '../types/match';

export interface TeamNames {
  teamT: string;
  teamCt: string;
}

/** null = весь матч, 0 = до начала (0:0), N = накопительно через раунд N */
export function filterKillsThroughRound(kills: KillData[], round: number | null): KillData[] {
  if (round === null) return kills;
  if (round <= 0) return [];
  return kills.filter((k) => k.round_number <= round);
}

/** @deprecated alias */
export function filterKillsByRound(kills: KillData[], round: number | null): KillData[] {
  return filterKillsThroughRound(kills, round);
}

function countTeamWins(
  rounds: RoundData[],
  teamNames?: TeamNames,
): { score_ct: number; score_t: number } {
  if (!teamNames?.teamT || !teamNames?.teamCt) {
    return {
      score_ct: rounds.filter((r) => r.winner === 'CT').length,
      score_t: rounds.filter((r) => r.winner === 'T').length,
    };
  }

  let score_t = 0;
  let score_ct = 0;
  for (const round of rounds) {
    const winnerTeam = round.winner_team;
    if (winnerTeam === teamNames.teamT) score_t += 1;
    else if (winnerTeam === teamNames.teamCt) score_ct += 1;
    else if (winnerTeam) {
      // Unknown clan label — ignore
    } else if (round.winner === 'T') score_t += 1;
    else score_ct += 1;
  }
  return { score_t, score_ct };
}

/** Cumulative score after round N. Round 0 → 0:0. Uses team names when available. */
export function getScoreAtRound(
  rounds: RoundData[],
  upToRound: number | null,
  fallback: { score_ct: number; score_t: number },
  teamNames?: TeamNames,
): { score_ct: number; score_t: number } {
  if (upToRound !== null && upToRound <= 0) {
    return { score_ct: 0, score_t: 0 };
  }
  if (!rounds.length) {
    return upToRound === null ? fallback : { score_ct: 0, score_t: 0 };
  }

  const played =
    upToRound === null ? rounds : rounds.filter((r) => r.round_number <= upToRound);
  return countTeamWins(played, teamNames);
}

export function getRoundWinCounts(
  rounds: RoundData[],
  upToRound: number | null,
  teamNames?: TeamNames,
): { ct: number; t: number } {
  const { score_ct, score_t } = getScoreAtRound(rounds, upToRound, { score_ct: 0, score_t: 0 }, teamNames);
  return { ct: score_ct, t: score_t };
}

export interface RoundTickRange {
  round_number: number;
  start: number;
  end: number;
  winner: RoundData['winner'];
  winner_team?: string | null;
  freeze_end_tick?: number | null;
}

export type { RoundPause };

/** Build tick ranges from parsed round metadata (preferred over position sampling). */
export function buildRoundTickRanges(rounds: RoundData[]): RoundTickRange[] {
  return rounds
    .filter((r) => r.start_tick != null && r.end_tick != null)
    .map((r) => ({
      round_number: r.round_number,
      start: r.start_tick!,
      end: r.end_tick!,
      winner: r.winner,
      winner_team: r.winner_team,
      freeze_end_tick: r.freeze_end_tick,
    }));
}

/** Score at replay tick — count completed rounds by winning team. */
export function getScoreAtTick(
  tick: number,
  rounds: RoundData[],
  teamNames?: TeamNames,
): { score_ct: number; score_t: number } {
  const completed = rounds.filter((r) => r.end_tick != null && tick >= r.end_tick!);
  return countTeamWins(completed, teamNames);
}

/** Current round number and elapsed seconds within it. */
export function getRoundContextAtTick(
  tick: number,
  roundTickRanges: RoundTickRange[],
  tickRate = 64,
): { roundNumber: number; roundStart: number; roundEnd: number; elapsedSeconds: number } | null {
  if (!roundTickRanges.length) return null;

  for (const range of roundTickRanges) {
    if (tick >= range.start && tick <= range.end) {
      return {
        roundNumber: range.round_number,
        roundStart: range.start,
        roundEnd: range.end,
        elapsedSeconds: Math.max(0, (tick - range.start) / tickRate),
      };
    }
  }

  if (tick < roundTickRanges[0].start) {
    return {
      roundNumber: 0,
      roundStart: roundTickRanges[0].start,
      roundEnd: roundTickRanges[0].start,
      elapsedSeconds: 0,
    };
  }

  const last = roundTickRanges[roundTickRanges.length - 1];
  return {
    roundNumber: last.round_number,
    roundStart: last.start,
    roundEnd: last.end,
    elapsedSeconds: Math.max(0, (last.end - last.start) / tickRate),
  };
}

export function getMatchTickBounds(
  roundTickRanges: RoundTickRange[],
  fallback: { start: number; end: number },
): { start: number; end: number } {
  if (!roundTickRanges.length) return fallback;
  return {
    start: roundTickRanges[0].start,
    end: roundTickRanges[roundTickRanges.length - 1].end,
  };
}

/** Round at replay tick — derived from tick ranges first, selected round as fallback. */
export function resolveReplayRound(
  tick: number,
  roundTickRanges: RoundTickRange[],
  selectedRound?: number | null,
): number | null {
  if (roundTickRanges.length) {
    for (const range of roundTickRanges) {
      if (tick >= range.start && tick <= range.end) {
        return range.round_number;
      }
    }

    if (tick < roundTickRanges[0].start) {
      return null;
    }

    for (let i = 0; i < roundTickRanges.length - 1; i++) {
      const current = roundTickRanges[i];
      const next = roundTickRanges[i + 1];
      if (tick > current.end && tick < next.start) {
        return next.round_number;
      }
    }

    const last = roundTickRanges[roundTickRanges.length - 1];
    if (tick > last.end) {
      return last.round_number;
    }
  }

  if (selectedRound != null && selectedRound > 0) {
    return selectedRound;
  }

  return null;
}

function getRoundRange(
  roundNumber: number,
  roundTickRanges: RoundTickRange[],
): RoundTickRange | undefined {
  return roundTickRanges.find((r) => r.round_number === roundNumber);
}

function resolveRoundNumberForDeaths(
  tick: number,
  roundTickRanges: RoundTickRange[],
  selectedRound?: number | null,
  positionRoundHint?: number | null,
): number | null {
  let roundNumber = resolveReplayRound(tick, roundTickRanges, selectedRound);

  if ((roundNumber == null || roundNumber <= 0) && positionRoundHint != null && positionRoundHint > 0) {
    roundNumber = positionRoundHint;
  }

  if (
    (roundNumber == null || roundNumber <= 0) &&
    selectedRound != null &&
    selectedRound > 0
  ) {
    roundNumber = selectedRound;
  }

  return roundNumber != null && roundNumber > 0 ? roundNumber : null;
}

function normalizePlayerName(name: string): string {
  return name.trim();
}

function killBelongsToRound(
  kill: KillData,
  roundNumber: number,
  range?: RoundTickRange,
): boolean {
  if (Number(kill.round_number) === roundNumber) return true;
  if (range && kill.tick >= range.start && kill.tick <= range.end) return true;
  return false;
}

/** First death tick per victim in the active round (for corpse freeze). */
export function getDeathTicksInRound(
  tick: number,
  kills: KillData[],
  roundTickRanges: RoundTickRange[],
  selectedRound?: number | null,
  positionRoundHint?: number | null,
): Map<string, number> {
  const roundNumber = resolveRoundNumberForDeaths(
    tick,
    roundTickRanges,
    selectedRound,
    positionRoundHint,
  );

  const map = new Map<string, number>();
  if (roundNumber == null) return map;

  const range = getRoundRange(roundNumber, roundTickRanges);

  for (const kill of kills) {
    if (!killBelongsToRound(kill, roundNumber, range)) continue;
    const victim = normalizePlayerName(kill.victim);
    if (!victim) continue;
    const existing = map.get(victim);
    if (existing == null || kill.tick < existing) {
      map.set(victim, kill.tick);
    }
  }
  return map;
}

/** Players dead within the current round only — resets each new round. */
export function getDeadPlayersAtTick(
  tick: number,
  kills: KillData[],
  roundTickRanges: RoundTickRange[],
  selectedRound?: number | null,
  positionRoundHint?: number | null,
): Set<string> {
  const roundNumber = resolveRoundNumberForDeaths(
    tick,
    roundTickRanges,
    selectedRound,
    positionRoundHint,
  );

  const dead = new Set<string>();
  if (roundNumber == null) return dead;

  const range = getRoundRange(roundNumber, roundTickRanges);

  for (const kill of kills) {
    if (kill.tick > tick) continue;
    if (killBelongsToRound(kill, roundNumber, range)) {
      const victim = normalizePlayerName(kill.victim);
      if (victim) dead.add(victim);
    }
  }
  return dead;
}

export function countKillsInReplayRound(
  tick: number,
  kills: KillData[],
  roundTickRanges: RoundTickRange[],
  selectedRound?: number | null,
  positionRoundHint?: number | null,
): number {
  const roundNumber = resolveRoundNumberForDeaths(
    tick,
    roundTickRanges,
    selectedRound,
    positionRoundHint,
  );
  if (roundNumber == null) return 0;

  const range = getRoundRange(roundNumber, roundTickRanges);

  return kills.filter(
    (kill) => kill.tick <= tick && killBelongsToRound(kill, roundNumber, range),
  ).length;
}
