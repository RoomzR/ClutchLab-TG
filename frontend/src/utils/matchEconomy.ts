import type { Player, RoundData } from '../types/match';

export type BuyType = 'eco' | 'force' | 'full' | 'none';

export interface MatchPurchaseRow {
  player_name: string;
  tick: number;
  round_number: number;
  item: string;
  cost: number;
  team?: 'CT' | 'T' | null;
}

export interface TeamRoundEconomy {
  round_number: number;
  team: 'CT' | 'T';
  total_spend: number;
  avg_equip: number;
  buy_type: BuyType;
  loss_streak: number;
  loss_bonus: number;
  buyers: number;
}

export interface MatchEconomySummary {
  rounds: TeamRoundEconomy[];
  avg_equip_ct: number;
  avg_equip_t: number;
  eco_rounds_ct: number;
  eco_rounds_t: number;
  force_rounds_ct: number;
  force_rounds_t: number;
  full_rounds_ct: number;
  full_rounds_t: number;
}

const LOSS_BONUS_STEPS = [1400, 1900, 2400, 2900, 3400];

export function lossBonusForStreak(streak: number): number {
  return LOSS_BONUS_STEPS[Math.min(Math.max(streak, 0), LOSS_BONUS_STEPS.length - 1)];
}

export function buyTypeFromAvgSpend(avgSpend: number, roundNumber: number): BuyType {
  if (avgSpend <= 0) return 'none';
  if (roundNumber === 1 || roundNumber === 16) return avgSpend >= 2500 ? 'full' : 'force';
  if (avgSpend < 1500) return 'eco';
  if (avgSpend < 3500) return 'force';
  return 'full';
}

export function buyTypeLabel(type: BuyType): string {
  switch (type) {
    case 'eco':
      return 'Eco';
    case 'force':
      return 'Force';
    case 'full':
      return 'Full';
    default:
      return '—';
  }
}

function buildLossStreakByRound(rounds: RoundData[]): Map<
  number,
  { ctStreak: number; tStreak: number; ctBonus: number; tBonus: number }
> {
  let ctStreak = 0;
  let tStreak = 0;
  const map = new Map<
    number,
    { ctStreak: number; tStreak: number; ctBonus: number; tBonus: number }
  >();

  for (const round of [...rounds].sort((a, b) => a.round_number - b.round_number)) {
    map.set(round.round_number, {
      ctStreak,
      tStreak,
      ctBonus: lossBonusForStreak(ctStreak),
      tBonus: lossBonusForStreak(tStreak),
    });

    if (round.winner === 'CT') {
      ctStreak = 0;
      tStreak += 1;
    } else {
      tStreak = 0;
      ctStreak += 1;
    }
  }

  return map;
}

export function computeMatchEconomy(
  purchases: MatchPurchaseRow[],
  rounds: RoundData[],
  players: Player[],
): MatchEconomySummary {
  const teamSizes = {
    CT: players.filter((p) => p.team === 'CT').length || 5,
    T: players.filter((p) => p.team === 'T').length || 5,
  };

  const playerTeam = new Map(players.map((p) => [p.name, p.team]));
  const lossByRound = buildLossStreakByRound(rounds);

  const spendByRoundTeam = new Map<string, { spend: number; buyers: Set<string> }>();

  for (const purchase of purchases) {
    const team = purchase.team ?? playerTeam.get(purchase.player_name);
    if (!team) continue;
    const key = `${purchase.round_number}:${team}`;
    const bucket = spendByRoundTeam.get(key) ?? { spend: 0, buyers: new Set<string>() };
    bucket.spend += purchase.cost;
    bucket.buyers.add(purchase.player_name);
    spendByRoundTeam.set(key, bucket);
  }

  const roundNumbers = rounds.length
    ? rounds.map((r) => r.round_number)
    : [...new Set(purchases.map((p) => p.round_number))].sort((a, b) => a - b);

  const teamRounds: TeamRoundEconomy[] = [];

  for (const roundNumber of roundNumbers) {
    const loss = lossByRound.get(roundNumber) ?? {
      ctStreak: 0,
      tStreak: 0,
      ctBonus: 1400,
      tBonus: 1400,
    };

    for (const team of ['CT', 'T'] as const) {
      const bucket = spendByRoundTeam.get(`${roundNumber}:${team}`);
      const totalSpend = bucket?.spend ?? 0;
      const buyers = bucket?.buyers.size ?? 0;
      const roster = teamSizes[team];
      const avgEquip = roster > 0 ? Math.round(totalSpend / roster) : 0;

      teamRounds.push({
        round_number: roundNumber,
        team,
        total_spend: totalSpend,
        avg_equip: avgEquip,
        buy_type: buyTypeFromAvgSpend(avgEquip, roundNumber),
        loss_streak: team === 'CT' ? loss.ctStreak : loss.tStreak,
        loss_bonus: team === 'CT' ? loss.ctBonus : loss.tBonus,
        buyers,
      });
    }
  }

  const ctRows = teamRounds.filter((r) => r.team === 'CT' && r.total_spend > 0);
  const tRows = teamRounds.filter((r) => r.team === 'T' && r.total_spend > 0);

  const avg = (rows: TeamRoundEconomy[]) =>
    rows.length ? Math.round(rows.reduce((n, r) => n + r.avg_equip, 0) / rows.length) : 0;

  const countType = (rows: TeamRoundEconomy[], type: BuyType) =>
    rows.filter((r) => r.buy_type === type).length;

  return {
    rounds: teamRounds,
    avg_equip_ct: avg(ctRows),
    avg_equip_t: avg(tRows),
    eco_rounds_ct: countType(ctRows, 'eco'),
    eco_rounds_t: countType(tRows, 'eco'),
    force_rounds_ct: countType(ctRows, 'force'),
    force_rounds_t: countType(tRows, 'force'),
    full_rounds_ct: countType(ctRows, 'full'),
    full_rounds_t: countType(tRows, 'full'),
  };
}

export function economyForRound(
  economy: MatchEconomySummary,
  roundNumber: number,
): { ct?: TeamRoundEconomy; t?: TeamRoundEconomy } {
  const rows = economy.rounds.filter((r) => r.round_number === roundNumber);
  return {
    ct: rows.find((r) => r.team === 'CT'),
    t: rows.find((r) => r.team === 'T'),
  };
}
