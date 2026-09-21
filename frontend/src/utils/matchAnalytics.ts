import type { GrenadeData, KillData, Player, RoundData } from '../types/match';

const TRADE_WINDOW_TICKS = 320; // ~5 sec @ 64 tick
const PISTOL_WEAPONS = new Set([
  'glock', 'usp_silencer', 'hkp2000', 'p250', 'cz75a', 'deagle', 'elite',
  'tec9', 'fiveseven', 'revolver',
]);
const FORCE_WEAPONS = new Set([
  'galil', 'famas', 'sg556', 'aug', 'ssg08', 'scout', 'mp9', 'mac10',
  'mp7', 'ump45', 'bizon', 'mag7', 'nova', 'sawedoff', 'xm1014',
]);

export interface RoundHighlight {
  round_number: number;
  tags: string[];
  players: string[];
  /** Tick to jump to when opening replay. */
  jump_tick?: number;
}

export interface TradeKillEvent {
  round_number: number;
  tick: number;
  trader: string;
  original_victim: string;
  traded_killer: string;
}

export interface OpeningDuelStat {
  player_name: string;
  team: 'CT' | 'T';
  openings: number;
  opening_kills: number;
  opening_deaths: number;
  traded: number;
  traded_deaths: number;
}

export interface MatchAnalytics {
  round_highlights: RoundHighlight[];
  trade_kills: TradeKillEvent[];
  opening_stats: OpeningDuelStat[];
}

function normalizeWeapon(weapon: string): string {
  return weapon.toLowerCase().replace(/^weapon_/, '');
}

function isValidKill(kill: KillData): boolean {
  return (
    kill.killer !== kill.victim &&
    kill.killer !== 'unknown' &&
    kill.victim !== 'unknown' &&
    Boolean(kill.killer?.trim()) &&
    Boolean(kill.victim?.trim())
  );
}

function playerTeamMap(players: Player[]): Map<string, 'CT' | 'T'> {
  return new Map(players.map((p) => [p.name, p.team]));
}

function killsInRound(kills: KillData[], roundNumber: number): KillData[] {
  return kills
    .filter((k) => k.round_number === roundNumber && isValidKill(k))
    .sort((a, b) => a.tick - b.tick);
}

function teamKillsWeapons(
  roundKills: KillData[],
  team: 'CT' | 'T',
  teams: Map<string, 'CT' | 'T'>,
): string[] {
  return roundKills
    .filter((k) => teams.get(k.killer) === team)
    .map((k) => normalizeWeapon(k.weapon));
}

function analyzeRoundHighlight(
  round: RoundData,
  kills: KillData[],
  players: Player[],
): RoundHighlight | null {
  const roundKills = killsInRound(kills, round.round_number);
  if (!roundKills.length && round.win_type !== 'bomb_defused') {
    return null;
  }

  const teams = playerTeamMap(players);
  const tags: string[] = [];
  const highlightPlayers = new Set<string>();
  let jumpTick = round.start_tick ?? roundKills[0]?.tick;

  const ctStart = new Set(players.filter((p) => p.team === 'CT').map((p) => p.name));
  const tStart = new Set(players.filter((p) => p.team === 'T').map((p) => p.name));
  const ctAlive = new Set(ctStart);
  const tAlive = new Set(tStart);

  let clutch: { player: string; team: 'CT' | 'T'; enemies: number; tick: number } | null =
    null;

  for (const kill of roundKills) {
    ctAlive.delete(kill.victim);
    tAlive.delete(kill.victim);

    if (ctAlive.size === 1 && tAlive.size >= 1) {
      const player = [...ctAlive][0];
      clutch = { player, team: 'CT', enemies: tAlive.size, tick: kill.tick };
    } else if (tAlive.size === 1 && ctAlive.size >= 1) {
      const player = [...tAlive][0];
      clutch = { player, team: 'T', enemies: ctAlive.size, tick: kill.tick };
    } else if (clutch) {
      if (clutch.team === 'CT' && ctAlive.size === 1) {
        clutch.enemies = tAlive.size;
      } else if (clutch.team === 'T' && tAlive.size === 1) {
        clutch.enemies = ctAlive.size;
      } else {
        clutch = null;
      }
    }

    if (clutch && kill.victim === clutch.player) {
      clutch = null;
    }
  }

  if (clutch && clutch.team === round.winner && clutch.enemies >= 1) {
    tags.push(`1v${clutch.enemies}`);
    highlightPlayers.add(clutch.player);
    jumpTick = clutch.tick;
  }

  const killerCounts = new Map<string, number>();
  for (const kill of roundKills) {
    killerCounts.set(kill.killer, (killerCounts.get(kill.killer) ?? 0) + 1);
  }
  for (const [killer, count] of killerCounts) {
    if (count >= 5) {
      tags.push('ACE');
      highlightPlayers.add(killer);
    }
  }

  if (round.winner === 'CT' && round.win_type === 'bomb_defused') {
    tags.push('Retake');
  }

  const winnerWeapons = teamKillsWeapons(roundKills, round.winner, teams);
  if (winnerWeapons.length >= 2) {
    const pistolRatio =
      winnerWeapons.filter((w) => PISTOL_WEAPONS.has(w)).length / winnerWeapons.length;
    const forceRatio =
      winnerWeapons.filter((w) => FORCE_WEAPONS.has(w)).length / winnerWeapons.length;

    if (pistolRatio >= 0.65) {
      tags.push('Eco Win');
    } else if (forceRatio >= 0.35 && pistolRatio < 0.35) {
      tags.push('Force Win');
    }
  }

  if (!tags.length) return null;

  return {
    round_number: round.round_number,
    tags,
    players: [...highlightPlayers],
    jump_tick: jumpTick,
  };
}

function computeTradeKills(kills: KillData[], players: Player[]): TradeKillEvent[] {
  const teams = playerTeamMap(players);
  const trades: TradeKillEvent[] = [];

  const byRound = new Map<number, KillData[]>();
  for (const kill of kills.filter(isValidKill)) {
    const list = byRound.get(kill.round_number) ?? [];
    list.push(kill);
    byRound.set(kill.round_number, list);
  }

  for (const [roundNumber, roundKills] of byRound) {
    const sorted = [...roundKills].sort((a, b) => a.tick - b.tick);
    for (let i = 0; i < sorted.length; i++) {
      const current = sorted[i];
      const killerTeam = teams.get(current.killer);
      if (!killerTeam) continue;

      for (let j = i - 1; j >= 0; j--) {
        const prev = sorted[j];
        if (current.tick - prev.tick > TRADE_WINDOW_TICKS) break;

        const prevVictimTeam = teams.get(prev.victim);
        if (!prevVictimTeam || prevVictimTeam !== killerTeam) continue;
        if (current.victim !== prev.killer) continue;

        trades.push({
          round_number: roundNumber,
          tick: current.tick,
          trader: current.killer,
          original_victim: prev.victim,
          traded_killer: prev.killer,
        });
        break;
      }
    }
  }

  return trades;
}

function computeOpeningStats(
  kills: KillData[],
  players: Player[],
  tradeKills: TradeKillEvent[],
): OpeningDuelStat[] {
  const stats = new Map<string, OpeningDuelStat>();

  for (const player of players) {
    stats.set(player.name, {
      player_name: player.name,
      team: player.team,
      openings: 0,
      opening_kills: 0,
      opening_deaths: 0,
      traded: 0,
      traded_deaths: 0,
    });
  }

  const byRound = new Map<number, KillData[]>();
  for (const kill of kills.filter(isValidKill)) {
    const list = byRound.get(kill.round_number) ?? [];
    list.push(kill);
    byRound.set(kill.round_number, list);
  }

  for (const roundKills of byRound.values()) {
    const sorted = [...roundKills].sort((a, b) => a.tick - b.tick);
    const opening = sorted[0];
    if (!opening) continue;

    const killerStat = stats.get(opening.killer);
    const victimStat = stats.get(opening.victim);
    if (killerStat) {
      killerStat.openings += 1;
      killerStat.opening_kills += 1;
    }
    if (victimStat) {
      victimStat.openings += 1;
      victimStat.opening_deaths += 1;
    }
  }

  for (const trade of tradeKills) {
    const traderStat = stats.get(trade.trader);
    if (traderStat) traderStat.traded += 1;
    const victimStat = stats.get(trade.original_victim);
    if (victimStat) victimStat.traded_deaths += 1;
  }

  return [...stats.values()]
    .filter((s) => s.openings > 0 || s.traded > 0)
    .sort((a, b) => b.opening_kills - a.opening_kills);
}

export function computeMatchAnalytics(
  kills: KillData[],
  rounds: RoundData[],
  players: Player[],
): MatchAnalytics {
  const trade_kills = computeTradeKills(kills, players);
  const opening_stats = computeOpeningStats(kills, players, trade_kills);

  const round_highlights = rounds
    .map((round) => analyzeRoundHighlight(round, kills, players))
    .filter((h): h is RoundHighlight => h !== null)
    .sort((a, b) => {
      const priority = (tags: string[]) =>
        tags.some((t) => t.startsWith('1v')) ? 3 : tags.includes('ACE') ? 2 : 1;
      return priority(b.tags) - priority(a.tags) || a.round_number - b.round_number;
    });

  return { round_highlights, trade_kills, opening_stats };
}

export interface UtilityTimelineEvent {
  tick: number;
  grenade_type: GrenadeData['grenade_type'];
  player_name: string;
  team: 'CT' | 'T';
}

const UTILITY_TYPES = new Set(['smoke', 'flash', 'molotov', 'incendiary']);

export function utilityEventsForRound(
  grenades: GrenadeData[],
  roundNumber: number,
): UtilityTimelineEvent[] {
  return grenades
    .filter((g) => g.round_number === roundNumber && UTILITY_TYPES.has(g.grenade_type))
    .map((g) => ({
      tick: g.tick,
      grenade_type: g.grenade_type,
      player_name: g.player_name,
      team: g.team,
    }))
    .sort((a, b) => a.tick - b.tick);
}
