import type {
  GrenadeData,
  GrenadeSpot,
  HeatmapPoint,
  PlayerHabitsData,
  RoundData,
} from '../types/match';
import { classifyPointLabel } from './mapZones';

export interface AntiStratInsight {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  pct?: number;
  category: 'position' | 'grenade' | 'timing' | 'tendency';
}

export function generateAntiStratReport(params: {
  mapName: string;
  playerName: string;
  team: 'CT' | 'T';
  habits?: PlayerHabitsData;
  grenadeSpots?: GrenadeSpot[];
  grenades?: GrenadeData[];
  heatmapPoints?: HeatmapPoint[];
  rounds?: RoundData[];
}): AntiStratInsight[] {
  const {
    mapName,
    playerName,
    team,
    habits,
    grenadeSpots = [],
    grenades = [],
    heatmapPoints = [],
    rounds = [],
  } = params;

  const insights: AntiStratInsight[] = [];
  const totalRounds = rounds.length || new Set(grenades.map((g) => g.round_number)).size || 1;

  const zoneCounts = new Map<string, number>();
  let zoneTotal = 0;

  for (const pos of habits?.favorite_positions ?? []) {
    const label = classifyPointLabel(mapName, pos.x, pos.y);
    zoneCounts.set(label, (zoneCounts.get(label) ?? 0) + pos.frequency);
    zoneTotal += pos.frequency;
  }

  for (const point of heatmapPoints) {
    const label = classifyPointLabel(mapName, point.x, point.y);
    const w = point.density ?? 1;
    zoneCounts.set(label, (zoneCounts.get(label) ?? 0) + w);
    zoneTotal += w;
  }

  const sortedZones = [...zoneCounts.entries()]
    .map(([label, count]) => ({
      label,
      pct: zoneTotal > 0 ? Math.round((count / zoneTotal) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  if (sortedZones[0] && sortedZones[0].pct >= 25) {
    insights.push({
      id: 'anchor-zone',
      severity: sortedZones[0].pct >= 40 ? 'high' : 'medium',
      title: `Часто играет ${sortedZones[0].label}`,
      detail: `${playerName} проводит ~${sortedZones[0].pct}% времени в зоне ${sortedZones[0].label} — можно префайрить или контр-smoke`,
      pct: sortedZones[0].pct,
      category: 'position',
    });
  }

  if (sortedZones[1] && sortedZones[1].pct >= 18) {
    insights.push({
      id: 'secondary-zone',
      severity: 'medium',
      title: `Вторичная зона: ${sortedZones[1].label}`,
      detail: `Дублирует ${sortedZones[1].label} (~${sortedZones[1].pct}%) — rotate или stack возможен`,
      pct: sortedZones[1].pct,
      category: 'position',
    });
  }

  const playerGrenades = grenades.filter((g) => g.player_name === playerName);

  const smokeByZone = new Map<string, Set<number>>();
  for (const smoke of playerGrenades.filter((g) => g.grenade_type === 'smoke')) {
    const label = classifyPointLabel(mapName, smoke.to_x, smoke.to_y);
    const set = smokeByZone.get(label) ?? new Set<number>();
    set.add(smoke.round_number);
    smokeByZone.set(label, set);
  }

  for (const [label, roundSet] of smokeByZone.entries()) {
    const pct = Math.round((roundSet.size / totalRounds) * 100);
    if (pct >= 35) {
      insights.push({
        id: `smoke-${label}`,
        severity: pct >= 65 ? 'high' : 'medium',
        title: `Smoke ${label} в ${pct}% раундов`,
        detail: `${playerName} стабильно smoke ${label} — ждите молли/флеш или играйте post-smoke`,
        pct,
        category: 'grenade',
      });
    }
  }

  for (const spot of grenadeSpots.filter((s) => s.grenade_type === 'smoke').slice(0, 3)) {
    const label =
      spot.to_x && spot.to_y
        ? classifyPointLabel(mapName, spot.to_x, spot.to_y)
        : spot.zone;
    const pct = Math.round((spot.frequency / Math.max(playerGrenades.length, 1)) * 100);
    if (spot.frequency >= 2) {
      insights.push({
        id: `spot-${label}-${spot.grenade_type}`,
        severity: spot.frequency >= 5 ? 'high' : 'low',
        title: `Любимый smoke spot: ${label}`,
        detail: `${spot.frequency}× ${spot.grenade_type} в ${label} — default utility`,
        pct,
        category: 'grenade',
      });
    }
  }

  const flashCount = playerGrenades.filter((g) => g.grenade_type === 'flash').length;
  if (flashCount >= 3 && totalRounds > 0) {
    const flashPct = Math.round((flashCount / totalRounds) * 100);
    if (flashPct >= 50) {
      insights.push({
        id: 'flash-heavy',
        severity: 'medium',
        title: 'Активно флешит',
        detail: `${flashPct}% раундов с flash — держите angle под counter-flash или отступайте`,
        pct: flashPct,
        category: 'grenade',
      });
    }
  }

  const topGrenade = Object.entries(habits?.grenade_preferences ?? {}).sort(
    (a, b) => b[1] - a[1],
  )[0];
  if (topGrenade && topGrenade[1] >= 3) {
    insights.push({
      id: 'nade-pref',
      severity: 'low',
      title: `Pref: ${topGrenade[0]}`,
      detail: `Чаще всего использует ${topGrenade[0]} (${topGrenade[1]}×)`,
      category: 'tendency',
    });
  }

  if (team === 'T' && sortedZones[0]?.label.toLowerCase().includes('long')) {
    insights.push({
      id: 'long-default',
      severity: 'high',
      title: 'Default Long',
      detail: 'Игрок часто на Long — CT может ранний pick или delay smoke',
      pct: sortedZones[0].pct,
      category: 'position',
    });
  }

  if (team === 'CT' && sortedZones[0]?.label.toLowerCase().includes('site')) {
    insights.push({
      id: 'site-anchor',
      severity: 'medium',
      title: `Anchor ${sortedZones[0].label}`,
      detail: 'Сидит на site — execute с другого входа или split',
      pct: sortedZones[0].pct,
      category: 'position',
    });
  }

  const seen = new Set<string>();
  return insights
    .filter((i) => {
      const key = `${i.category}-${i.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const rank = { high: 3, medium: 2, low: 1 };
      return rank[b.severity] - rank[a.severity] || (b.pct ?? 0) - (a.pct ?? 0);
    })
    .slice(0, 12);
}
