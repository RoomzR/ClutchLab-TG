import type { KillData, PlayerStats } from '../types/match';

export function computeAllPlayerStats(
  kills: KillData[],
  playerNames: string[],
): Map<string, PlayerStats> {
  const acc = new Map<
    string,
    { kills: number; deaths: number; headshots: number; weapons: Record<string, number> }
  >();

  for (const name of playerNames) {
    acc.set(name, { kills: 0, deaths: 0, headshots: 0, weapons: {} });
  }

  for (const kill of kills) {
    const killer = acc.get(kill.killer);
    if (killer) {
      killer.kills += 1;
      if (kill.headshot) killer.headshots += 1;
      killer.weapons[kill.weapon] = (killer.weapons[kill.weapon] ?? 0) + 1;
    }
    const victim = acc.get(kill.victim);
    if (victim) victim.deaths += 1;
  }

  const result = new Map<string, PlayerStats>();
  for (const name of playerNames) {
    const s = acc.get(name)!;
    const favoriteWeapon =
      Object.entries(s.weapons).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
    result.set(name, {
      kills: s.kills,
      deaths: s.deaths,
      assists: 0,
      headshot_pct: s.kills > 0 ? Math.round((s.headshots / s.kills) * 100) : 0,
      favorite_weapon: favoriteWeapon,
      avg_blind_duration_ms: 0,
      weapon_kills: s.weapons,
    });
  }
  return result;
}

export function computePlayerStatsFromKills(
  kills: KillData[],
  playerName: string,
): PlayerStats {
  const playerKills = kills.filter((k) => k.killer === playerName);
  const playerDeaths = kills.filter((k) => k.victim === playerName);
  const headshots = playerKills.filter((k) => k.headshot).length;

  const weaponKills: Record<string, number> = {};
  for (const kill of playerKills) {
    weaponKills[kill.weapon] = (weaponKills[kill.weapon] ?? 0) + 1;
  }

  const favoriteWeapon =
    Object.entries(weaponKills).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  return {
    kills: playerKills.length,
    deaths: playerDeaths.length,
    assists: 0,
    headshot_pct:
      playerKills.length > 0 ? Math.round((headshots / playerKills.length) * 100) : 0,
    favorite_weapon: favoriteWeapon,
    avg_blind_duration_ms: 0,
    weapon_kills: weaponKills,
  };
}

export function computeDuelsFromKills(
  kills: KillData[],
  playerName: string,
): { opponent: string; kills: number; deaths: number }[] {
  const duelMap = new Map<string, { kills: number; deaths: number }>();

  for (const kill of kills) {
    if (kill.killer === playerName && kill.victim !== playerName) {
      const entry = duelMap.get(kill.victim) ?? { kills: 0, deaths: 0 };
      entry.kills += 1;
      duelMap.set(kill.victim, entry);
    }
    if (kill.victim === playerName && kill.killer !== playerName) {
      const entry = duelMap.get(kill.killer) ?? { kills: 0, deaths: 0 };
      entry.deaths += 1;
      duelMap.set(kill.killer, entry);
    }
  }

  return Array.from(duelMap.entries())
    .map(([opponent, stats]) => ({ opponent, ...stats }))
    .sort((a, b) => b.kills - b.deaths - (a.kills - a.deaths));
}
