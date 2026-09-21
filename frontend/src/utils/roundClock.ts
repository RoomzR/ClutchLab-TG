import type { RoundData } from '../types/match';
import type { RoundPause, RoundTickRange } from './roundStats';
import { formatTime } from './formatTime';

/** Competitive round limit (1:55). */
export const ROUND_TIME_LIMIT_SEC = 115;

const DEFAULT_FREEZE_SEC = 15;

export type RoundClockPhase = 'break' | 'freeze' | 'live' | 'timeout' | 'ended';

export interface RoundClockState {
  phase: RoundClockPhase;
  display: string;
  remainingSeconds: number;
  sublabel?: string;
}

function pauseTicksInLiveWindow(
  tick: number,
  roundNumber: number,
  freezeEnd: number,
  pauses: RoundPause[],
): number {
  let total = 0;
  for (const pause of pauses) {
    if (pause.round_number !== roundNumber) continue;
    const pauseStart = Math.max(pause.start_tick, freezeEnd);
    const pauseEnd = pause.end_tick;
    if (pauseEnd <= pauseStart || pauseStart >= tick) continue;
    total += Math.min(tick, pauseEnd) - pauseStart;
  }
  return total;
}

function activePauseAt(
  tick: number,
  roundNumber: number,
  pauses: RoundPause[],
): RoundPause | null {
  for (const pause of pauses) {
    if (pause.round_number !== roundNumber) continue;
    if (tick >= pause.start_tick && tick < pause.end_tick) {
      return pause;
    }
  }
  return null;
}

function resolveFreezeEndTick(
  range: RoundTickRange,
  roundMeta?: RoundData,
  tickRate = 64,
): number {
  if (roundMeta?.freeze_end_tick != null && roundMeta.freeze_end_tick > range.start) {
    return roundMeta.freeze_end_tick;
  }
  return range.start + Math.round(DEFAULT_FREEZE_SEC * tickRate);
}

function liveRemainingSeconds(
  tick: number,
  range: RoundTickRange,
  freezeEnd: number,
  pauses: RoundPause[],
  tickRate: number,
): number {
  const pauseTicks = pauseTicksInLiveWindow(tick, range.round_number, freezeEnd, pauses);
  const liveTicks = Math.max(0, tick - freezeEnd - pauseTicks);
  return Math.max(0, ROUND_TIME_LIMIT_SEC - liveTicks / tickRate);
}

/** CS2-style round clock: 1:55 countdown after freeze, timeout pauses. */
export function computeRoundClock(
  tick: number,
  roundTickRanges: RoundTickRange[],
  rounds: RoundData[],
  pauses: RoundPause[],
  tickRate = 64,
): RoundClockState {
  if (!roundTickRanges.length) {
    return { phase: 'break', display: '--:--', remainingSeconds: ROUND_TIME_LIMIT_SEC };
  }

  if (tick < roundTickRanges[0].start) {
    return {
      phase: 'break',
      display: '--:--',
      remainingSeconds: ROUND_TIME_LIMIT_SEC,
      sublabel: 'До матча',
    };
  }

  for (let i = 0; i < roundTickRanges.length; i++) {
    const range = roundTickRanges[i];
    const next = roundTickRanges[i + 1];
    const roundMeta = rounds.find((r) => r.round_number === range.round_number);

    if (tick > range.end) {
      if (next && tick < next.start) {
        return {
          phase: 'break',
          display: '--:--',
          remainingSeconds: ROUND_TIME_LIMIT_SEC,
          sublabel: 'Между раундами',
        };
      }
      continue;
    }

    if (tick >= range.start && tick <= range.end) {
      const freezeEnd = resolveFreezeEndTick(range, roundMeta, tickRate);
      const pause = activePauseAt(tick, range.round_number, pauses);

      if (pause) {
        const remaining = liveRemainingSeconds(
          pause.start_tick,
          range,
          freezeEnd,
          pauses,
          tickRate,
        );
        return {
          phase: 'timeout',
          display: formatTime(remaining),
          remainingSeconds: remaining,
          sublabel: pause.pause_type === 'technical' ? 'Tech pause' : 'Timeout',
        };
      }

      if (tick < freezeEnd) {
        return {
          phase: 'freeze',
          display: formatTime(ROUND_TIME_LIMIT_SEC),
          remainingSeconds: ROUND_TIME_LIMIT_SEC,
          sublabel: 'Freeze',
        };
      }

      const remaining = liveRemainingSeconds(tick, range, freezeEnd, pauses, tickRate);
      return {
        phase: 'live',
        display: formatTime(remaining),
        remainingSeconds: remaining,
      };
    }
  }

  const last = roundTickRanges[roundTickRanges.length - 1];
  if (tick > last.end) {
    return { phase: 'ended', display: '0:00', remainingSeconds: 0, sublabel: 'Конец' };
  }

  return { phase: 'break', display: '--:--', remainingSeconds: ROUND_TIME_LIMIT_SEC };
}
