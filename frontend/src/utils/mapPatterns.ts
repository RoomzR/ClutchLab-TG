import type { GrenadeData, GrenadeSpot, Player, RoundData, TickData } from '../types/match';
import { aggregateZoneCounts, classifyPointLabel } from './mapZones';

export interface MapPatternInsight {
  id: string;
  label: string;
  detail: string;
  pct?: number;
  team?: 'CT' | 'T';
}

export interface TeamMapPattern {
  team: 'CT' | 'T';
  defaultSite?: string;
  topZones: Array<{ label: string; pct: number }>;
  topSmokes: Array<{ label: string; count: number; pct: number }>;
  retakeZones?: Array<{ label: string; pct: number }>;
}

export interface MatchMapPatterns {
  mapName: string;
  teams: TeamMapPattern[];
  insights: MapPatternInsight[];
}

function siteFromZoneLabel(label: string): 'A' | 'B' | 'Mid' | null {
  const lower = label.toLowerCase();
  if (lower.includes('a site') || lower.includes('long a') || lower.includes('palace') || lower.includes('apps')) {
    return 'A';
  }
  if (lower.includes('b site') || lower.includes('banana')) return 'B';
  if (lower.includes('mid') || lower.includes('connector') || lower.includes('cat')) return 'Mid';
  return null;
}

function inferDefaultSite(
  zonePcts: Array<{ label: string; pct: number }>,
): string | undefined {
  const siteScores = { A: 0, B: 0, Mid: 0 };
  for (const z of zonePcts) {
    const site = siteFromZoneLabel(z.label);
    if (site) siteScores[site] += z.pct;
  }
  const top = (Object.entries(siteScores) as Array<[keyof typeof siteScores, number]>).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (!top || top[1] < 20) return undefined;
  return top[0];
}

function smokeZoneStats(
  mapName: string,
  grenades: GrenadeData[],
  team: 'CT' | 'T',
  totalRounds: number,
): TeamMapPattern['topSmokes'] {
  const smokes = grenades.filter((g) => g.grenade_type === 'smoke' && g.team === team);
  const byZone = new Map<string, number>();

  for (const smoke of smokes) {
    const label = classifyPointLabel(mapName, smoke.to_x, smoke.to_y);
    byZone.set(label, (byZone.get(label) ?? 0) + 1);
  }

  return [...byZone.entries()]
    .map(([label, count]) => ({
      label,
      count,
      pct: totalRounds > 0 ? Math.round((count / totalRounds) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

export function computeMatchMapPatterns(
  mapName: string,
  _players: Player[],
  grenades: GrenadeData[],
  positions: TickData[],
  rounds: RoundData[],
): MatchMapPatterns {
  const totalRounds = rounds.length || 1;
  const retakeRoundNums = new Set(
    rounds
      .filter((r) => r.winner === 'CT' && r.win_type === 'bomb_defused')
      .map((r) => r.round_number),
  );

  const teams: TeamMapPattern[] = (['T', 'CT'] as const).map((team) => {
    const teamPositions = positions.filter((p) => p.team === team);
    let zoneAgg = aggregateZoneCounts(
      mapName,
      teamPositions.map((p) => ({ x: p.x, y: p.y, weight: 1 })),
    );

    if (zoneAgg.length === 0) {
      const teamNades = grenades.filter((g) => g.team === team);
      zoneAgg = aggregateZoneCounts(
        mapName,
        teamNades.map((g) => ({ x: g.to_x, y: g.to_y, weight: 1 })),
      );
    }

    const topZones = zoneAgg.slice(0, 4).map((z) => ({ label: z.zone.label, pct: z.pct }));

    const retakePositions =
      team === 'CT'
        ? teamPositions.filter((p) => retakeRoundNums.has(p.round_number))
        : [];
    const retakeAgg = aggregateZoneCounts(
      mapName,
      retakePositions.map((p) => ({ x: p.x, y: p.y })),
    );

    return {
      team,
      defaultSite: team === 'T' ? inferDefaultSite(topZones) : undefined,
      topZones,
      topSmokes: smokeZoneStats(mapName, grenades, team, totalRounds),
      retakeZones:
        team === 'CT'
          ? retakeAgg.slice(0, 4).map((z) => ({ label: z.zone.label, pct: z.pct }))
          : undefined,
    };
  });

  const insights: MapPatternInsight[] = [];
  const tPattern = teams.find((t) => t.team === 'T');
  const ctPattern = teams.find((t) => t.team === 'CT');

  if (tPattern?.defaultSite) {
    insights.push({
      id: 't-default',
      label: `Default ${tPattern.defaultSite}`,
      detail: `T чаще играет ${tPattern.defaultSite}-site (${tPattern.topZones[0]?.pct ?? 0}% активности в топ-зоне)`,
      team: 'T',
      pct: tPattern.topZones[0]?.pct,
    });
  }

  if (tPattern?.topSmokes[0]) {
    const s = tPattern.topSmokes[0];
    insights.push({
      id: 't-smoke',
      label: `Smoke ${s.label}`,
      detail: `T smoke ${s.label} в ~${s.pct}% раундов (${s.count}×)`,
      team: 'T',
      pct: s.pct,
    });
  }

  if (ctPattern?.retakeZones?.[0]) {
    const z = ctPattern.retakeZones[0];
    insights.push({
      id: 'ct-retake',
      label: `Retake ${z.label}`,
      detail: `CT retake через ${z.label} (${z.pct}% позиций на defuse wins)`,
      team: 'CT',
      pct: z.pct,
    });
  }

  if (ctPattern?.topSmokes[0]) {
    const s = ctPattern.topSmokes[0];
    insights.push({
      id: 'ct-smoke',
      label: `CT smoke ${s.label}`,
      detail: `CT smoke ${s.label} в ${s.pct}% раундов`,
      team: 'CT',
      pct: s.pct,
    });
  }

  return { mapName, teams, insights };
}

export function playerZoneFromHabits(
  mapName: string,
  spots: GrenadeSpot[],
): Array<{ label: string; count: number; grenadeType: string }> {
  return spots.slice(0, 8).map((s) => ({
    label:
      s.to_x && s.to_y
        ? classifyPointLabel(mapName, s.to_x, s.to_y)
        : s.zone,
    count: s.frequency,
    grenadeType: s.grenade_type,
  }));
}
