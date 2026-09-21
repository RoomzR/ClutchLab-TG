import type { PurchaseEvent, PurchaseRoundCategory, RoundPurchaseSummary } from '../types/match';

const PISTOL_ROUNDS = new Set([1, 16]);

const CATEGORY_LABELS: Record<PurchaseRoundCategory, string> = {
  0: 'Ничего',
  1: 'Эко',
  2: 'Полузакуп',
  3: 'Полный закуп',
};

export function getCategoryLabel(category: PurchaseRoundCategory): string {
  return CATEGORY_LABELS[category];
}

export function determinePurchaseCategory(
  roundNumber: number,
  totalCost: number,
  itemCount: number,
): PurchaseRoundCategory {
  if (itemCount === 0 || totalCost === 0) return 0;
  if (PISTOL_ROUNDS.has(roundNumber)) return 2;
  if (totalCost < 1500) return 1;
  if (totalCost < 3500) return 2;
  return 3;
}

export function groupPurchasesByRound(
  purchases: PurchaseEvent[],
): RoundPurchaseSummary[] {
  const byRound = purchases.reduce<
    Record<number, { items: string[]; total_cost: number }>
  >((acc, purchase) => {
    if (!acc[purchase.round_number]) {
      acc[purchase.round_number] = { items: [], total_cost: 0 };
    }
    acc[purchase.round_number].items.push(purchase.item);
    acc[purchase.round_number].total_cost += purchase.cost;
    return acc;
  }, {});

  return Object.entries(byRound)
    .map(([round, data]) => {
      const roundNumber = Number(round);
      return {
        round_number: roundNumber,
        category: determinePurchaseCategory(
          roundNumber,
          data.total_cost,
          data.items.length,
        ),
        items: data.items,
        total_cost: data.total_cost,
      };
    })
    .sort((a, b) => a.round_number - b.round_number);
}

export function getPurchasePatterns(summaries: RoundPurchaseSummary[]) {
  const pistol = summaries.filter((s) => PISTOL_ROUNDS.has(s.round_number));
  const eco = summaries.filter((s) => s.category === 1);
  const full = summaries.filter((s) => s.category === 3);

  const topItems = (list: RoundPurchaseSummary[]) => {
    const counts: Record<string, number> = {};
    for (const s of list) {
      for (const item of s.items) {
        counts[item] = (counts[item] ?? 0) + 1;
      }
    }
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([item]) => item);
  };

  return {
    pistol: topItems(pistol),
    eco: topItems(eco),
    full: topItems(full),
  };
}
