import type { GrenadeData, KillData, Player, RoundData } from '../types/match';
import type { MatchAnalytics } from './matchAnalytics';
import type { MatchEconomySummary } from './matchEconomy';

export type InsightSeverity = 'positive' | 'info' | 'warning' | 'critical';
export type InsightCategory = 'tactics' | 'duels' | 'economy' | 'utility' | 'players';

export interface AiInsight {
  id: string;
  category: InsightCategory;
  severity: InsightSeverity;
  title: string;
  detail: string;
  /** 0-100, how much data backs this insight */
  confidence: number;
  players?: string[];
}

const SEVERITY_WEIGHT: Record<InsightSeverity, number> = {
  critical: 3,
  warning: 2,
  positive: 1.5,
  info: 1,
};

function isValidKill(kill: KillData): boolean {
  return (
    kill.killer !== kill.victim &&
    kill.killer !== 'unknown' &&
    kill.victim !== 'unknown' &&
    Boolean(kill.killer?.trim()) &&
    Boolean(kill.victim?.trim())
  );
}

function normalizeWeapon(weapon: string): string {
  return weapon.toLowerCase().replace(/^weapon_/, '');
}

function pct(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** Confidence grows with sample size, capped at 95. */
function sampleConfidence(n: number, saturation: number): number {
  return Math.min(95, Math.round((n / saturation) * 95));
}

function pistolInsights(rounds: RoundData[]): AiInsight[] {
  const insights: AiInsight[] = [];
  const half = 12;
  const pistols = rounds.filter(
    (r) => r.round_number === 1 || r.round_number === half + 1,
  );
  if (pistols.length < 2) return insights;

  const winners = pistols.map((r) => r.winner);
  if (winners[0] === winners[1]) {
    const side = winners[0];
    insights.push({
      id: 'pistols-swept',
      category: 'tactics',
      severity: 'critical',
      title: `Both pistol rounds went to the ${side} starting side`,
      detail:
        'Pistol rounds decide the following two rounds through economy. Review positioning and utility usage in rounds 1 and 13 — losing both is a 4-6 round swing.',
      confidence: 90,
    });
  } else {
    insights.push({
      id: 'pistols-split',
      category: 'tactics',
      severity: 'info',
      title: 'Pistol rounds were split',
      detail: 'Each side converted one pistol round — economy started even in both halves.',
      confidence: 90,
    });
  }
  return insights;
}

function retakeInsights(rounds: RoundData[]): AiInsight[] {
  const defused = rounds.filter((r) => r.win_type === 'bomb_defused').length;
  const exploded = rounds.filter((r) => r.win_type === 'bomb_exploded').length;
  const plants = defused + exploded;
  if (plants < 4) return [];

  const successPct = pct(defused, plants);
  if (successPct >= 45) {
    return [
      {
        id: 'retake-strong',
        category: 'tactics',
        severity: 'positive',
        title: `Strong retakes: ${successPct}% of planted bombs were defused`,
        detail: `${defused} of ${plants} plants ended in a defuse. The CT side consistently regrouped and cleared sites after losing map control.`,
        confidence: sampleConfidence(plants, 10),
      },
    ];
  }
  if (successPct <= 20) {
    return [
      {
        id: 'retake-weak',
        category: 'tactics',
        severity: 'warning',
        title: `Retakes rarely succeed: only ${successPct}% of plants defused`,
        detail: `${exploded} of ${plants} plants exploded. Once the bomb was down, the round was effectively lost — consider earlier rotations or saving instead of dry retakes.`,
        confidence: sampleConfidence(plants, 10),
      },
    ];
  }
  return [];
}

function openingDuelInsights(analytics: MatchAnalytics): AiInsight[] {
  const insights: AiInsight[] = [];

  for (const stat of analytics.opening_stats) {
    if (stat.openings < 4) continue;
    const winRate = pct(stat.opening_kills, stat.openings);

    if (stat.opening_kills >= 4 && winRate >= 65) {
      insights.push({
        id: `opener-strong-${stat.player_name}`,
        category: 'duels',
        severity: 'positive',
        title: `${stat.player_name} dominates opening duels (${winRate}%)`,
        detail: `Won ${stat.opening_kills} of ${stat.openings} first duels. This player creates man-advantages — feed them entry support or, if scouting an opponent, avoid their first contact spot.`,
        confidence: sampleConfidence(stat.openings, 8),
        players: [stat.player_name],
      });
    }

    if (stat.opening_deaths >= 4 && winRate <= 30) {
      const tradedPct = pct(stat.traded_deaths, stat.opening_deaths);
      insights.push({
        id: `opener-weak-${stat.player_name}`,
        category: 'duels',
        severity: tradedPct < 40 ? 'critical' : 'warning',
        title: `${stat.player_name} keeps dying first (${stat.opening_deaths} opening deaths)`,
        detail:
          tradedPct < 40
            ? `Only ${tradedPct}% of those deaths were traded — the team starts most rounds a player down with nothing in return. Tighten spacing or change who takes first contact.`
            : `${tradedPct}% of those deaths were traded, so the aggression is at least creating exchanges — but the opening duel win rate of ${winRate}% is still a liability.`,
        confidence: sampleConfidence(stat.opening_deaths, 8),
        players: [stat.player_name],
      });
    }
  }

  return insights.slice(0, 3);
}

function tradeInsights(analytics: MatchAnalytics, players: Player[]): AiInsight[] {
  const byTeam: Record<'CT' | 'T', { deaths: number; traded: number }> = {
    CT: { deaths: 0, traded: 0 },
    T: { deaths: 0, traded: 0 },
  };
  for (const stat of analytics.opening_stats) {
    byTeam[stat.team].deaths += stat.opening_deaths;
    byTeam[stat.team].traded += stat.traded_deaths;
  }

  const insights: AiInsight[] = [];
  for (const side of ['CT', 'T'] as const) {
    const { deaths, traded } = byTeam[side];
    if (deaths < 6) continue;
    const ratio = pct(traded, deaths);
    if (ratio < 30) {
      insights.push({
        id: `trades-${side}`,
        category: 'duels',
        severity: 'warning',
        title: `${side} starting side trades poorly (${ratio}% of opening deaths traded)`,
        detail: `Out of ${deaths} opening deaths, only ${traded} were answered within 5 seconds. Players are taking fights alone — pair up and play refrag positions.`,
        confidence: sampleConfidence(deaths, 12),
        players: players.filter((p) => p.team === side).map((p) => p.name),
      });
    }
  }
  return insights;
}

function clutchInsights(analytics: MatchAnalytics): AiInsight[] {
  const clutchCount = new Map<string, { count: number; best: number }>();
  for (const highlight of analytics.round_highlights) {
    const clutchTag = highlight.tags.find((t) => /^1v\d$/.test(t));
    if (!clutchTag || highlight.players.length === 0) continue;
    const enemies = Number(clutchTag.slice(2));
    for (const player of highlight.players) {
      const entry = clutchCount.get(player) ?? { count: 0, best: 0 };
      entry.count += 1;
      entry.best = Math.max(entry.best, enemies);
      clutchCount.set(player, entry);
    }
  }

  const insights: AiInsight[] = [];
  for (const [player, { count, best }] of clutchCount) {
    if (count >= 2 || best >= 3) {
      insights.push({
        id: `clutch-${player}`,
        category: 'players',
        severity: 'positive',
        title: `${player} is a clutch factor (${count} clutch${count > 1 ? 'es' : ''} won, best 1v${best})`,
        detail:
          'In late-round situations this player converts man-disadvantages. When scouting: force them to use utility early and avoid giving them time to isolate 1v1s.',
        confidence: sampleConfidence(count, 3),
        players: [player],
      });
    }
  }
  return insights.slice(0, 2);
}

function fraggingInsights(kills: KillData[], players: Player[]): AiInsight[] {
  const valid = kills.filter(isValidKill);
  if (valid.length < 20) return [];

  const byPlayer = new Map<string, { kills: number; deaths: number; hs: number; awp: number }>();
  for (const player of players) {
    byPlayer.set(player.name, { kills: 0, deaths: 0, hs: 0, awp: 0 });
  }
  for (const kill of valid) {
    const killer = byPlayer.get(kill.killer);
    if (killer) {
      killer.kills += 1;
      if (kill.headshot) killer.hs += 1;
      if (['awp', 'ssg08', 'scar20', 'g3sg1'].includes(normalizeWeapon(kill.weapon))) {
        killer.awp += 1;
      }
    }
    const victim = byPlayer.get(kill.victim);
    if (victim) victim.deaths += 1;
  }

  const insights: AiInsight[] = [];

  for (const [name, stats] of byPlayer) {
    if (stats.kills >= 12) {
      const hsPct = pct(stats.hs, stats.kills);
      if (hsPct >= 60) {
        insights.push({
          id: `hs-${name}`,
          category: 'players',
          severity: 'info',
          title: `${name} lands ${hsPct}% headshots`,
          detail: `${stats.hs} of ${stats.kills} kills were headshots — crosshair placement at head level is consistently punishing wide peeks. Expect them to hold tight angles.`,
          confidence: sampleConfidence(stats.kills, 20),
          players: [name],
        });
      }
    }
    if (stats.awp >= 6) {
      insights.push({
        id: `awp-${name}`,
        category: 'players',
        severity: 'warning',
        title: `${name} is the sniper threat (${stats.awp} sniper kills)`,
        detail:
          'Long sightlines belong to this player. Smoke or flash their common angles before crossing — dry peeking them is losing rounds.',
        confidence: sampleConfidence(stats.awp, 10),
        players: [name],
      });
    }
  }

  return insights.slice(0, 3);
}

function economyInsights(economy: MatchEconomySummary | null, rounds: RoundData[]): AiInsight[] {
  if (!economy) return [];
  const insights: AiInsight[] = [];

  const roundWinner = new Map(rounds.map((r) => [r.round_number, r.winner]));

  for (const side of ['CT', 'T'] as const) {
    const forceRounds = economy.rounds.filter(
      (r) => r.team === side && r.buy_type === 'force',
    );
    if (forceRounds.length >= 4) {
      const wins = forceRounds.filter((r) => roundWinner.get(r.round_number) === side).length;
      const winRate = pct(wins, forceRounds.length);
      if (winRate >= 50) {
        insights.push({
          id: `force-good-${side}`,
          category: 'economy',
          severity: 'positive',
          title: `${side} side force-buys pay off (${winRate}% win rate)`,
          detail: `${wins} of ${forceRounds.length} force-buy rounds won. Aggressive economy is working — upgraded pistols and utility are out-trading full buys.`,
          confidence: sampleConfidence(forceRounds.length, 8),
        });
      } else if (winRate <= 20) {
        insights.push({
          id: `force-bad-${side}`,
          category: 'economy',
          severity: 'warning',
          title: `${side} side loses force-buys (${winRate}% win rate over ${forceRounds.length} attempts)`,
          detail:
            'Repeated failed forces reset the economy and gift free rounds. A disciplined full eco into a guaranteed buy would likely convert better.',
          confidence: sampleConfidence(forceRounds.length, 8),
        });
      }
    }
  }

  const equipDiff = Math.abs(economy.avg_equip_ct - economy.avg_equip_t);
  if (equipDiff > 4000) {
    const richer = economy.avg_equip_ct > economy.avg_equip_t ? 'CT' : 'T';
    insights.push({
      id: 'equip-gap',
      category: 'economy',
      severity: 'info',
      title: `Large average equipment gap ($${Math.round(equipDiff).toLocaleString()})`,
      detail: `The ${richer} starting side averaged much more equipment value per round — the match economy was one-sided, which usually follows the round score.`,
      confidence: 75,
    });
  }

  return insights;
}

function utilityInsights(grenades: GrenadeData[], rounds: RoundData[]): AiInsight[] {
  if (rounds.length < 8 || grenades.length === 0) return [];
  const insights: AiInsight[] = [];

  const byTeam: Record<'CT' | 'T', { smokes: number; flashes: number; total: number }> = {
    CT: { smokes: 0, flashes: 0, total: 0 },
    T: { smokes: 0, flashes: 0, total: 0 },
  };
  for (const grenade of grenades) {
    const entry = byTeam[grenade.team];
    if (!entry) continue;
    entry.total += 1;
    if (grenade.grenade_type === 'smoke') entry.smokes += 1;
    if (grenade.grenade_type === 'flash') entry.flashes += 1;
  }

  for (const side of ['CT', 'T'] as const) {
    const perRound = byTeam[side].total / rounds.length;
    if (perRound < 1.5) {
      insights.push({
        id: `util-low-${side}`,
        category: 'utility',
        severity: 'warning',
        title: `${side} starting side barely uses utility (${perRound.toFixed(1)} nades/round)`,
        detail:
          'Grenades win rounds before aim does. Executes without smokes and flashes hand the defenders free information and free duels.',
        confidence: sampleConfidence(rounds.length, 16),
      });
    }
  }

  const flashByPlayer = new Map<string, number>();
  for (const grenade of grenades) {
    if (grenade.grenade_type !== 'flash') continue;
    flashByPlayer.set(grenade.player_name, (flashByPlayer.get(grenade.player_name) ?? 0) + 1);
  }
  const topFlasher = [...flashByPlayer.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topFlasher && topFlasher[1] >= 10) {
    insights.push({
      id: `support-${topFlasher[0]}`,
      category: 'utility',
      severity: 'info',
      title: `${topFlasher[0]} is the support player (${topFlasher[1]} flashes thrown)`,
      detail:
        'Most flashbangs in the lobby. Their teammates enter after the pop — punishing or baiting these flashes disrupts the whole team rhythm.',
      confidence: sampleConfidence(topFlasher[1], 15),
      players: [topFlasher[0]],
    });
  }

  return insights;
}

function momentumInsights(rounds: RoundData[]): AiInsight[] {
  if (rounds.length < 10) return [];
  const sorted = [...rounds].sort((a, b) => a.round_number - b.round_number);

  let bestStreak = 0;
  let bestSide: 'CT' | 'T' = 'CT';
  let current = 0;
  let currentSide: 'CT' | 'T' | null = null;
  for (const round of sorted) {
    if (round.winner === currentSide) {
      current += 1;
    } else {
      currentSide = round.winner;
      current = 1;
    }
    if (current > bestStreak) {
      bestStreak = current;
      bestSide = round.winner;
    }
  }

  if (bestStreak >= 6) {
    return [
      {
        id: 'streak',
        category: 'tactics',
        severity: 'info',
        title: `${bestSide} starting side ran a ${bestStreak}-round streak`,
        detail:
          'Long streaks mean the losing side never adapted — same defaults, same site hits, same results. Timeouts and setup changes exist exactly for this.',
        confidence: 85,
      },
    ];
  }
  return [];
}

export function generateAiInsights(input: {
  kills: KillData[];
  rounds: RoundData[];
  players: Player[];
  analytics: MatchAnalytics | null;
  economy: MatchEconomySummary | null;
  grenades: GrenadeData[];
}): AiInsight[] {
  const { kills, rounds, players, analytics, economy, grenades } = input;
  const insights: AiInsight[] = [
    ...pistolInsights(rounds),
    ...retakeInsights(rounds),
    ...(analytics ? openingDuelInsights(analytics) : []),
    ...(analytics ? tradeInsights(analytics, players) : []),
    ...(analytics ? clutchInsights(analytics) : []),
    ...fraggingInsights(kills, players),
    ...economyInsights(economy, rounds),
    ...utilityInsights(grenades, rounds),
    ...momentumInsights(rounds),
  ];

  return insights.sort(
    (a, b) =>
      SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
      b.confidence - a.confidence,
  );
}
