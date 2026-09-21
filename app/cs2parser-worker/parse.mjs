#!/usr/bin/env node
/**
 * ClutchLab demo parser worker powered by osztenkurden/cs2parser.
 * Usage: node parse.mjs <demo.dem> [tick_step] [max_ticks]
 * Writes progress lines to stderr: {"progress":N}
 * Writes ParseResult JSON to stdout.
 */

import { parsePlayerInfo, parseTicks } from '@laihoe/demoparser2';
import { DemoReader, EntityMode, TeamNumber, WinRoundReason } from 'cs2parser';
import fs from 'node:fs';
import path from 'node:path';

/**
 * parsePlayerInfo has NO crosshair_code — only name/steamid/team.
 * Crosshair share codes live on ticks (m_szCrosshairCodes).
 */
function stripWeaponPrefix(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/^weapon_/, '')
    .replace(/^item_/, '')
    .trim();
}

/**
 * Overwrite position.weapon + position.scoped from demoparser2.
 * Event-only tracking often sticks on knife_t because item_equip is sparse.
 * Position tuple: [tick,name,team,x,y,z,round,yaw,health,armor,pitch,weapon,scoped]
 */
function fillActiveWeaponsFromDemo(filePath, positions, ownedKnife, playerTeams, activeWeapon) {
  if (!positions.length) return;

  const ticks = [...new Set(positions.map((p) => p[0]))].sort((a, b) => a - b);
  /** @type {Map<string, string>} `${tick}\0${name}` → weapon */
  const byTickName = new Map();
  /** @type {Map<string, boolean>} `${tick}\0${name}` → is_scoped */
  const scopedByTickName = new Map();
  const CHUNK = 2000;

  for (let i = 0; i < ticks.length; i += CHUNK) {
    const chunk = ticks.slice(i, i + CHUNK);
    let rows = [];
    try {
      rows =
        parseTicks(
          filePath,
          ['active_weapon_name', 'inventory', 'name', 'player_name', 'is_scoped'],
          chunk,
        ) || [];
    } catch (err) {
      console.error('active_weapon_name fill failed:', err?.message || err);
      break;
    }
    for (const row of rows) {
      const name = String(row.name || row.player_name || '').trim();
      const tick = Number(row.tick);
      if (!name || !Number.isFinite(tick)) continue;

      scopedByTickName.set(
        `${tick}\0${name}`,
        row.is_scoped === true || row.is_scoped === 1,
      );

      let w = stripWeaponPrefix(row.active_weapon_name);
      if (!w) continue;

      // Learn knife skins from inventory even when active weapon is a gun.
      const invRaw = row.inventory;
      const invList = Array.isArray(invRaw)
        ? invRaw
        : typeof invRaw === 'string'
          ? invRaw.split(/[,;|]/).map((s) => s.trim())
          : [];
      for (const item of invList) {
        const iw = stripWeaponPrefix(item);
        if (
          iw &&
          (iw.includes('knife') || iw === 'bayonet') &&
          iw !== 'knife' &&
          iw !== 'knife_t' &&
          iw !== 'knife_ct'
        ) {
          ownedKnife.set(name, iw);
        }
      }

      if (w.includes('knife') || w === 'bayonet' || w.includes('karambit') || w.includes('butterfly')) {
        if (w === 'knife' || w === 'knife_t' || w === 'knife_ct') {
          w = ownedKnife.get(name) || w;
          if (w === 'knife') {
            w = playerTeams.get(name) === 'CT' ? 'knife_ct' : 'knife_t';
          }
        } else {
          ownedKnife.set(name, w);
        }
      }

      byTickName.set(`${tick}\0${name}`, w);
      activeWeapon.set(name, w);
    }
  }

  /** @type {Map<string, string>} forward-fill weapon */
  const lastW = new Map();
  /** @type {Map<string, boolean>} forward-fill scoped */
  const lastS = new Map();
  let filled = 0;
  let scopedHits = 0;
  for (const pos of positions) {
    const tick = pos[0];
    const name = pos[1];
    const key = `${tick}\0${name}`;

    const hitW = byTickName.get(key);
    if (hitW) {
      lastW.set(name, hitW);
      pos[11] = hitW;
      filled += 1;
    } else if (lastW.has(name)) {
      pos[11] = lastW.get(name);
      filled += 1;
    } else if (!pos[11]) {
      const team = pos[2];
      pos[11] = ownedKnife.get(name) || (team === 'CT' ? 'knife_ct' : 'knife_t');
    }

    if (scopedByTickName.has(key)) {
      const s = scopedByTickName.get(key);
      lastS.set(name, s);
      pos[12] = s;
      if (s) scopedHits += 1;
    } else if (lastS.has(name)) {
      pos[12] = lastS.get(name);
      if (pos[12]) scopedHits += 1;
    } else {
      pos[12] = false;
    }
  }
  console.error(
    `active_weapon_name: ${byTickName.size} samples, updated ${filled}/${positions.length}; scoped=true ${scopedHits}`,
  );
}

function normalizeCrosshairCode(raw) {
  let code = String(raw || '').trim();
  if (!code) return null;
  // Ignore empty / placeholder / clearly broken payloads.
  if (code === '0' || code === 'null' || code.length < 10) return null;
  if (!code.startsWith('CSGO-') && /^[A-Za-z0-9-]{20,}$/.test(code)) {
    code = code.startsWith('-') ? `CSGO${code}` : `CSGO-${code}`;
  }
  if (!code.startsWith('CSGO-')) return null;
  return code;
}

/**
 * Extract stable per-player crosshair share codes.
 * Majority vote across many ticks — first-wins was picking lobby defaults
 * that later flip when the real code appears (looks like "прицел меняется").
 */
function extractCrosshairCodes(filePath, tickRate) {
  /** @type {Map<string, Map<string, number>>} */
  const votes = new Map();
  const rate = Math.max(16, Number(tickRate) || 64);
  /** @type {number[]} */
  const wanted = [];
  // Dense early (warmup/settings settle), then regular samples through the match.
  for (let t = rate * 4; t <= rate * 90; t += rate * 2) wanted.push(Math.floor(t));
  for (let t = rate * 100; t <= rate * 2400; t += rate * 8) wanted.push(Math.floor(t));

  try {
    const rows = parseTicks(filePath, ['crosshair_code', 'name', 'player_name'], wanted) || [];
    for (const row of rows) {
      const name = String(row.name || row.player_name || '').trim();
      const code = normalizeCrosshairCode(row.crosshair_code);
      if (!name || !code) continue;
      let bag = votes.get(name);
      if (!bag) {
        bag = new Map();
        votes.set(name, bag);
      }
      bag.set(code, (bag.get(code) || 0) + 1);
    }
  } catch (err) {
    console.error('crosshair tick parse failed:', err?.message || err);
  }

  /** @type {Map<string, string>} */
  const byName = new Map();
  for (const [name, bag] of votes) {
    let best = null;
    let bestN = 0;
    for (const [code, n] of bag) {
      if (n > bestN) {
        best = code;
        bestN = n;
      }
    }
    if (best) byName.set(name, best);
  }
  return byName;
}

const DEFAULT_TICK_STEP = 2;
const DEFAULT_MAX_TICKS = 2_000_000;

const ITEM_COSTS = {
  ak47: 2700,
  m4a1: 2900,
  m4a1_silencer: 2900,
  awp: 4750,
  ssg08: 1700,
  scout: 1700,
  aug: 3300,
  sg556: 3000,
  famas: 2050,
  galil: 1800,
  mp9: 1250,
  mac10: 1050,
  mp7: 1500,
  ump45: 1200,
  p90: 2350,
  bizon: 1400,
  nova: 1050,
  xm1014: 2000,
  mag7: 1300,
  sawedoff: 1100,
  m249: 5200,
  negev: 1700,
  glock: 200,
  hkp2000: 200,
  usp_silencer: 200,
  p250: 300,
  deagle: 700,
  cz75a: 500,
  tec9: 500,
  fiveseven: 500,
  elite: 400,
  revolver: 600,
  kevlar: 650,
  item_kevlar: 650,
  assaultsuit: 1000,
  item_assaultsuit: 1000,
  vesthelm: 1000,
  defuser: 400,
  item_defuser: 400,
  hegrenade: 300,
  flashbang: 200,
  smokegrenade: 300,
  molotov: 400,
  incgrenade: 600,
  decoy: 50,
  taser: 200,
  zeus: 200,
};

const WIN_REASON_NAMES = Object.fromEntries(
  Object.entries(WinRoundReason).map(([k, v]) => [v, k.toLowerCase()]),
);

function progress(pct) {
  process.stderr.write(JSON.stringify({ progress: Math.max(0, Math.min(100, pct | 0)) }) + '\n');
}

function normalizeMapName(mapName) {
  let name = String(mapName || 'de_dust2').toLowerCase().replace(/^cs_/, '');
  const known = [
    'de_dust2',
    'de_mirage',
    'de_inferno',
    'de_nuke',
    'de_ancient',
    'de_anubis',
    'de_overpass',
    'de_cache',
  ];
  if (known.includes(name)) return name;
  for (const key of known) {
    if (name.startsWith(key)) return key;
  }
  return name || 'de_dust2';
}

function teamFromNum(teamNum) {
  return Number(teamNum) === TeamNumber.CounterTerrorists ? 'CT' : 'T';
}

function winnerTeam(value) {
  const n = Number(value);
  if (n === TeamNumber.CounterTerrorists) return 'CT';
  if (n === TeamNumber.Terrorists) return 'T';
  const text = String(value || '').toUpperCase();
  if (text.includes('CT') || text === '3') return 'CT';
  return 'T';
}

function weaponToGrenadeType(weapon) {
  const key = String(weapon || '')
    .toLowerCase()
    .replace(/^weapon_/, '');
  const mapping = {
    flashbang: 'flash',
    smokegrenade: 'smoke',
    hegrenade: 'he',
    molotov: 'molotov',
    incgrenade: 'molotov',
    decoy: 'decoy',
  };
  return mapping[key] || null;
}

function normalizeItemName(item) {
  return String(item || '')
    .toLowerCase()
    .trim()
    .replace(/^weapon_/, '')
    .replace(/^item_/, '');
}

function itemCost(item, parsedCost) {
  const cost = Number(parsedCost);
  if (Number.isFinite(cost) && cost > 0) return cost | 0;
  const key = normalizeItemName(item);
  if (ITEM_COSTS[key] != null) return ITEM_COSTS[key];
  for (const [name, price] of Object.entries(ITEM_COSTS)) {
    if (name.includes(key) || key.includes(name)) return price;
  }
  return 0;
}

function parseSiteLabel(raw) {
  const text = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (text === 'A' || text === 'B') return text;
  if (text === '0' || text.includes('B')) return 'B';
  if (text === '1' || text.includes('A')) return 'A';
  return text || '?';
}

function tickToRound(tick, roundEndTicks) {
  if (!roundEndTicks.length) return 1;
  for (const [endTick, roundNumber] of roundEndTicks) {
    if (tick <= endTick) return roundNumber;
  }
  return roundEndTicks[roundEndTicks.length - 1][1] + 1;
}

function positionAtTick(index, playerName, tick) {
  const samples = index.get(playerName);
  if (!samples?.length) return null;
  let best = null;
  for (const sample of samples) {
    if (sample[0] <= tick) best = sample;
    else break;
  }
  return best ? { x: best[1], y: best[2], z: best[3] } : null;
}

function clanOnSide(sideSnapshot, side) {
  if (!sideSnapshot) return null;
  const clan = side === 'CT' ? sideSnapshot.ct : sideSnapshot.t;
  return clan || null;
}

async function parseDemo(filePath, tickStep, maxTicks) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Demo file not found: ${filePath}`);
  }

  progress(5);

  const header = DemoReader.parseHeader(filePath);
  const serverInfo = DemoReader.parseServerInfo(filePath);

  let mapName = normalizeMapName(header?.map_name || serverInfo?.map_name || 'de_dust2');
  let tickRate = 64;
  if (serverInfo?.tick_interval && Number(serverInfo.tick_interval) > 0) {
    tickRate = 1 / Number(serverInfo.tick_interval);
  } else if (header?.playback_ticks && header?.playback_time) {
    const ticks = Number(header.playback_ticks);
    const time = Number(header.playback_time);
    if (ticks > 0 && time > 0) tickRate = ticks / time;
  }
  if (!Number.isFinite(tickRate) || tickRate < 10) tickRate = 64;

  progress(15);

  const parser = new DemoReader();

  /** @type {Map<string, string>} */
  const playerTeams = new Map();
  /** @type {Map<string, string>} last equipped / fired weapon per player */
  const activeWeapon = new Map();
  /** @type {Map<string, string>} last known knife skin (karambit, knife_t, …) */
  const ownedKnife = new Map();

  function isGenericKnife(item) {
    const w = String(item || '')
      .toLowerCase()
      .replace(/^weapon_/, '');
    return w === 'knife' || w === 'knife_t' || w === 'knife_ct';
  }

  function isKnifeItem(item) {
    const w = String(item || '')
      .toLowerCase()
      .replace(/^weapon_/, '');
    return (
      w.includes('knife') ||
      w === 'bayonet' ||
      w.includes('karambit') ||
      w.includes('butterfly')
    );
  }

  function resolveEquipped(name, item, teamHint) {
    const w = String(item || '')
      .trim()
      .replace(/^weapon_/, '');
    if (!w) return null;
    if (isKnifeItem(w)) {
      if (!isGenericKnife(w)) {
        ownedKnife.set(name, w);
        return w;
      }
      return (
        ownedKnife.get(name) ||
        (teamHint === 'CT' ? 'knife_ct' : teamHint === 'T' ? 'knife_t' : w)
      );
    }
    return w;
  }
  /** @type {Array<[number, string, string, number, number, number, number, number|null, number|null, number|null, number|null, string|null]>} */
  const positions = [];
  /** @type {Array<[number, string, string, string, boolean, number]>} */
  const kills = [];
  /** @type {Array<[number, string, string]>} */
  const thrownRows = [];
  /** @type {Array<{tick:number, thrower:string, type:string, x:number, y:number, z:number}>} */
  const detonateRows = [];
  /** @type {Array<[string, number, number, string, number]>} */
  const purchases = [];
  /** @type {Array<{eventType:string, tick:number, site:string, player:string, x:number, y:number}>} */
  const bombRaw = [];
  /** @type {Array<{roundNumber:number, startTick:number, endTick:number, winner:string, winType:string, winnerTeam:string|null}>} */
  const roundEnds = [];
  /** @type {Map<number, number>} */
  const roundStarts = new Map();
  /** @type {Map<number, number>} */
  const freezeByRound = new Map();
  /** @type {Map<number, {t:string|null, ct:string|null}>} */
  const clansAtTick = new Map();
  /** @type {Array<{tick:number, freeze:boolean, tTimeout:boolean, ctTimeout:boolean, tech:boolean}>} */
  const clockSamples = [];

  let matchStarted = false;
  let positionSamples = 0;
  let lastProgressEmit = 15;

  const snapshotClans = (tick) => {
    let t = null;
    let ct = null;
    for (const team of parser.teams) {
      if (team.teamNumber === TeamNumber.Terrorists) t = (team.clanName || '').trim() || null;
      if (team.teamNumber === TeamNumber.CounterTerrorists) ct = (team.clanName || '').trim() || null;
    }
    clansAtTick.set(tick, { t, ct });
  };

  parser.on('progress', (fraction) => {
    const pct = 15 + Math.floor(Number(fraction || 0) * 70);
    if (pct > lastProgressEmit + 4) {
      lastProgressEmit = pct;
      progress(pct);
    }
  });

  parser.on('serverinfo', (info) => {
    if (info?.map_name) mapName = normalizeMapName(info.map_name);
    if (info?.tick_interval && Number(info.tick_interval) > 0) {
      tickRate = 1 / Number(info.tick_interval);
    }
  });

  parser.on('header', (hdr) => {
    if (hdr?.map_name) mapName = normalizeMapName(hdr.map_name);
  });

  parser.gameEvents.on('round_announce_match_start', () => {
    matchStarted = true;
  });

  parser.gameEvents.on('round_start', () => {
    const rules = parser.gameRules;
    if (rules?.isWarmup) return;
    const tick = parser.currentTick;
    if (tick < 50) return;
    const roundNum = Math.max(1, Number(rules?.roundsPlayed ?? 0) + 1);
    if (!roundStarts.has(roundNum) || tick < roundStarts.get(roundNum)) {
      roundStarts.set(roundNum, tick);
    }
    matchStarted = true;
  });

  parser.gameEvents.on('round_freeze_end', () => {
    const rules = parser.gameRules;
    if (rules?.isWarmup) return;
    const tick = parser.currentTick;
    const roundNum = Math.max(1, Number(rules?.roundsPlayed ?? 0) + 1);
    if (!freezeByRound.has(roundNum)) freezeByRound.set(roundNum, tick);
  });

  parser.gameEvents.on('round_end', (event) => {
    const rules = parser.gameRules;
    if (rules?.isWarmup) return;
    const tick = parser.currentTick;
    if (tick < 50) return;

    const reason = Number(event?.reason ?? WinRoundReason.INVALID);
    if (reason === WinRoundReason.GAME_COMMENCING || reason === WinRoundReason.ROUND_DRAW || reason === WinRoundReason.STILL_IN_PROGRESS) {
      return;
    }

    const roundNum = Math.max(1, Number(rules?.roundsPlayed ?? roundEnds.length + 1));
    const startTick = roundStarts.get(roundNum) ?? (roundEnds.length ? roundEnds[roundEnds.length - 1].endTick + 1 : Math.max(0, tick - Math.floor(tickRate * 115)));

    let winnerClan = null;
    snapshotClans(tick);
    const snap = clansAtTick.get(tick);
    const side = winnerTeam(event?.winner);
    winnerClan = clanOnSide(snap, side);

    roundEnds.push({
      roundNumber: roundNum,
      startTick: startTick >= tick ? Math.max(0, tick - Math.floor(tickRate * 5)) : startTick,
      endTick: tick,
      winner: side,
      winType: WIN_REASON_NAMES[reason] || String(event?.reason || 'elimination').toLowerCase(),
      winnerTeam: winnerClan,
    });
  });

  parser.gameEvents.on('item_equip', (event) => {
    const name = (event.player?.name || '').trim();
    const item = String(event.item || '').trim().replace(/^weapon_/, '');
    if (!name || !item) return;
    const team = playerTeams.get(name) || teamFromNum(event.player?.teamNumber);
    const resolved = resolveEquipped(name, item, team);
    if (resolved) activeWeapon.set(name, resolved);
  });

  parser.gameEvents.on('item_pickup', (event) => {
    const name = (event.player?.name || '').trim();
    const item = String(event.item || event.weapon || '').trim().replace(/^weapon_/, '');
    if (!name || !item || !isKnifeItem(item) || isGenericKnife(item)) return;
    ownedKnife.set(name, item);
  });

  parser.gameEvents.on('weapon_fire', (event) => {
    const name = (event.player?.name || '').trim();
    const weapon = String(event.weapon || '').trim().replace(/^weapon_/, '');
    if (!name || !weapon) return;
    const team = playerTeams.get(name);
    const resolved = resolveEquipped(name, weapon, team);
    if (resolved) activeWeapon.set(name, resolved);
  });

  parser.gameEvents.on('player_death', (event) => {
    const killer = event.attackerPlayer?.name || 'unknown';
    const victim = event.player?.name || 'unknown';
    const weapon = String(event.weapon || 'unknown').trim();
    const headshot = Boolean(event.headshot);
    const tick = parser.currentTick;
    kills.push([tick, killer, victim, weapon, headshot, 0]);

    if (event.attackerPlayer?.name) {
      const atk = event.attackerPlayer.name;
      playerTeams.set(atk, teamFromNum(event.attackerPlayer.teamNumber));
      const w = weapon.replace(/^weapon_/, '');
      if (w && w !== 'unknown') {
        const resolved = resolveEquipped(atk, w, playerTeams.get(atk));
        if (resolved) activeWeapon.set(atk, resolved);
      }
    }
    if (event.player?.name) {
      playerTeams.set(event.player.name, teamFromNum(event.player.teamNumber));
    }
  });

  parser.gameEvents.on('grenade_thrown', (event) => {
    const thrower = event.player?.name || '';
    const gtype = weaponToGrenadeType(event.weapon);
    if (!thrower || !gtype) return;
    thrownRows.push([parser.currentTick, thrower, gtype]);
    if (event.player) playerTeams.set(thrower, teamFromNum(event.player.teamNumber));
  });

  const onDetonate = (type) => (event) => {
    const thrower = event.player?.name || '';
    if (!thrower && type !== 'molotov') return;
    const x = Number(event.x);
    const y = Number(event.y);
    const z = Number(event.z || 0);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;

    let resolvedThrower = thrower;
    let team = event.player ? teamFromNum(event.player.teamNumber) : null;
    if (!resolvedThrower) {
      // inferno_startburn has no userid — attribute via recent molotov/inc throw
      for (let i = thrownRows.length - 1; i >= 0; i--) {
        const [tTick, tPlayer, tType] = thrownRows[i];
        if (tType !== 'molotov') continue;
        if (parser.currentTick - tTick > 640 || tTick > parser.currentTick) break;
        resolvedThrower = tPlayer;
        break;
      }
      if (!resolvedThrower) return;
    }

    if (!team && resolvedThrower) {
      const pc = parser.playerControllers.find((p) => (p.name || '').trim() === resolvedThrower);
      if (pc) team = teamFromNum(pc.teamNumber);
    }

    detonateRows.push({
      tick: parser.currentTick,
      thrower: resolvedThrower,
      type,
      x,
      y,
      z,
      team,
    });
    if (team) playerTeams.set(resolvedThrower, team);
  };

  parser.gameEvents.on('hegrenade_detonate', onDetonate('he'));
  parser.gameEvents.on('flashbang_detonate', onDetonate('flash'));
  parser.gameEvents.on('smokegrenade_detonate', onDetonate('smoke'));
  // Prefer molotov_detonate (has userid); inferno_startburn is a fallback without player.
  parser.gameEvents.on('molotov_detonate', onDetonate('molotov'));
  parser.gameEvents.on('inferno_startburn', (event) => {
    // Skip if we already recorded a molotov detonate near this tick.
    const tick = parser.currentTick;
    const already = detonateRows.some(
      (d) => d.type === 'molotov' && Math.abs(d.tick - tick) <= 64,
    );
    if (already) return;
    onDetonate('molotov')(event);
  });

  parser.gameEvents.on('item_purchase', (event) => {
    const name = event.player?.name || '';
    if (!name) return;
    const item = String(event.weapon || 'unknown').trim();
    const tick = parser.currentTick;
    const cost = itemCost(item, 0);
    purchases.push([name, tick, 0, item, cost]);
    if (event.player) playerTeams.set(name, teamFromNum(event.player.teamNumber));
    else playerTeams.set(name, playerTeams.get(name) || 'CT');
  });

  const onBomb = (eventType) => (event) => {
    const player = event.player?.name || '';
    if (!player) return;
    const tick = parser.currentTick;
    const site = parseSiteLabel(event.site);
    const pos = event.player?.position;
    bombRaw.push({
      eventType,
      tick,
      site,
      player,
      x: pos?.x ?? 0,
      y: pos?.y ?? 0,
    });
    playerTeams.set(player, eventType === 'bomb_planted' ? 'T' : 'CT');
  };

  parser.gameEvents.on('bomb_planted', onBomb('bomb_planted'));
  parser.gameEvents.on('bomb_defused', onBomb('bomb_defused'));

  parser.on('tickend', (tick) => {
    const rules = parser.gameRules;
    if (rules && !rules.isWarmup && tick % Math.max(1, Math.floor(tickRate / 2)) === 0) {
      clockSamples.push({
        tick,
        freeze: Boolean(rules.isFreezePeriod),
        tTimeout: Boolean(rules.isTerroristTimeOutActive),
        ctTimeout: Boolean(rules.isCTTimeOutActive),
        tech: Boolean(rules.isGamePaused) && !rules.isTerroristTimeOutActive && !rules.isCTTimeOutActive,
      });
    }

    if (tick % tickStep !== 0) return;
    if (positionSamples >= maxTicks) return;
    if (rules?.isWarmup) return;

    for (const pc of parser.playerControllers) {
      if (pc.teamNumber < TeamNumber.Terrorists) continue;
      const name = (pc.name || '').trim();
      if (!name) continue;
      const pos = pc.position;
      if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) continue;

      const team = teamFromNum(pc.teamNumber);
      playerTeams.set(name, team);
      const yaw = Number.isFinite(pc.eyeAngles?.yaw) ? Number(pc.eyeAngles.yaw) : null;
      const pitch = Number.isFinite(pc.eyeAngles?.pitch) ? Number(pc.eyeAngles.pitch) : null;
      const health = Number.isFinite(pc.health) ? Math.round(Number(pc.health)) : null;
      const armor = Number.isFinite(pc.armor) ? Math.round(Number(pc.armor)) : null;
      // Event-based hint only — authoritative active weapon filled after parse
      // via demoparser2 `active_weapon_name` (avoids sticky knife defaults).
      let weapon = activeWeapon.get(name) || null;
      if (weapon && isGenericKnife(weapon)) {
        weapon = ownedKnife.get(name) || (team === 'CT' ? 'knife_ct' : 'knife_t');
      }
      positions.push([
        tick,
        name,
        team,
        pos.x,
        pos.y,
        pos.z || 0,
        0,
        yaw,
        health,
        armor,
        pitch,
        weapon,
        false, // scoped — filled by demoparser2 is_scoped
      ]);
      positionSamples += 1;
      if (positionSamples >= maxTicks) break;
    }
  });

  await parser.parseDemo(filePath, { entities: EntityMode.ALL });

  progress(88);

  // Authoritative per-tick active weapon (pistol/rifle/knife…) from demoparser2.
  fillActiveWeaponsFromDemo(filePath, positions, ownedKnife, playerTeams, activeWeapon);

  progress(90);

  // Prefer final team names/scores from entities
  let teamTName = 'Terrorists';
  let teamCTName = 'Counter-Terrorists';
  let scoreT = 0;
  let scoreCT = 0;
  for (const team of parser.teams) {
    if (team.teamNumber === TeamNumber.Terrorists) {
      teamTName = (team.clanName || '').trim() || team.teamName || teamTName;
      scoreT = Number(team.score) || 0;
    }
    if (team.teamNumber === TeamNumber.CounterTerrorists) {
      teamCTName = (team.clanName || '').trim() || team.teamName || teamCTName;
      scoreCT = Number(team.score) || 0;
    }
  }

  // Build rounds list
  const rounds = [];
  const roundEndTicks = [];
  for (const rd of roundEnds) {
    const duration = Math.max(0, (rd.endTick - rd.startTick) / tickRate);
    const freeze = freezeByRound.get(rd.roundNumber);
    rounds.push({
      round_number: rd.roundNumber,
      winner: rd.winner,
      win_type: rd.winType,
      duration_seconds: duration,
      start_tick: rd.startTick,
      end_tick: rd.endTick,
      winner_team: rd.winnerTeam || undefined,
      freeze_end_tick: freeze != null && freeze >= rd.startTick ? freeze : undefined,
    });
    roundEndTicks.push([rd.endTick, rd.roundNumber]);
  }
  roundEndTicks.sort((a, b) => a[0] - b[0]);

  // Fallback freeze_end from clock samples
  for (const rd of rounds) {
    if (rd.freeze_end_tick != null) continue;
    const start = rd.start_tick;
    const end = rd.end_tick;
    let wasFrozen = false;
    for (const sample of clockSamples) {
      if (sample.tick < start || sample.tick > end) continue;
      if (sample.freeze) {
        wasFrozen = true;
      } else if (wasFrozen) {
        rd.freeze_end_tick = sample.tick;
        break;
      }
    }
  }

  // Round pauses from timeout flags
  const roundPauses = [];
  for (const rd of rounds) {
    const start = rd.start_tick;
    const end = rd.end_tick;
    let active = false;
    let pauseStart = 0;
    let pauseType = 'timeout';
    const samples = clockSamples.filter((s) => s.tick >= start && s.tick <= end);
    for (const sample of samples) {
      const timedOut = sample.tTimeout || sample.ctTimeout || sample.tech;
      if (timedOut && !active) {
        active = true;
        pauseStart = sample.tick;
        pauseType = sample.tech ? 'technical' : 'timeout';
      } else if (!timedOut && active) {
        active = false;
        roundPauses.push([rd.round_number, pauseStart, sample.tick, pauseType]);
      }
    }
    if (active) {
      roundPauses.push([rd.round_number, pauseStart, end, pauseType]);
    }
  }

  // Assign rounds to events
  for (const kill of kills) {
    kill[5] = tickToRound(kill[0], roundEndTicks);
  }
  for (const pos of positions) {
    pos[6] = tickToRound(pos[0], roundEndTicks);
  }
  for (const purchase of purchases) {
    purchase[2] = tickToRound(purchase[1], roundEndTicks);
  }

  // Position index for grenade throw origin
  /** @type {Map<string, Array<[number, number, number, number]>>} */
  const positionIndex = new Map();
  /** @type {Map<string, Array<[number, string]>>} */
  const teamTracks = new Map();
  for (const [tick, name, team, x, y, z] of positions) {
    if (!positionIndex.has(name)) positionIndex.set(name, []);
    positionIndex.get(name).push([tick, x, y, z]);
    if (!teamTracks.has(name)) teamTracks.set(name, []);
    teamTracks.get(name).push([tick, team]);
  }
  for (const samples of positionIndex.values()) {
    samples.sort((a, b) => a[0] - b[0]);
  }
  for (const samples of teamTracks.values()) {
    samples.sort((a, b) => a[0] - b[0]);
  }

  thrownRows.sort((a, b) => a[0] - b[0]);

  const teamAtTick = (playerName, tick) => {
    const track = teamTracks.get(playerName);
    if (!track?.length) return null;
    let bestTeam = null;
    for (const [t, team] of track) {
      if (t <= tick) bestTeam = team;
      else break;
    }
    return bestTeam;
  };

  const grenades = [];
  for (const det of detonateRows) {
    let fromX = det.x;
    let fromY = det.y;
    let fromZ = det.z;
    let throwTick = null;
    for (let i = thrownRows.length - 1; i >= 0; i--) {
      const [tTick, tPlayer, tType] = thrownRows[i];
      if (tTick >= det.tick) continue;
      if (tPlayer !== det.thrower || tType !== det.type) continue;
      if (det.tick - tTick > 640) break;
      throwTick = tTick;
      break;
    }
    if (throwTick != null) {
      const throwPos = positionAtTick(positionIndex, det.thrower, throwTick);
      if (throwPos) {
        fromX = throwPos.x;
        fromY = throwPos.y;
        fromZ = throwPos.z;
      }
    }
    // Side at throw tick (positions), not final roster side after half-time swap.
    const sideTick = throwTick ?? det.tick;
    const team =
      teamAtTick(det.thrower, sideTick) ||
      det.team ||
      teamAtTick(det.thrower, det.tick) ||
      playerTeams.get(det.thrower) ||
      'T';
    grenades.push([
      det.type,
      det.thrower,
      team,
      fromX,
      fromY,
      fromZ,
      det.x,
      det.y,
      det.z,
      det.tick,
      tickToRound(det.tick, roundEndTicks),
    ]);
  }

  const bombEvents = bombRaw.map((b) => {
    let x = b.x;
    let y = b.y;
    if (!x && !y) {
      const pos = positionAtTick(positionIndex, b.player, b.tick);
      if (pos) {
        x = pos.x;
        y = pos.y;
      }
    }
    return [b.eventType, b.tick, tickToRound(b.tick, roundEndTicks), b.site, b.player, x, y];
  });

  // If score from entities is zero but we have rounds, derive clan scores
  if ((!scoreT && !scoreCT) && rounds.length) {
    const clanScores = new Map();
    for (const rd of rounds) {
      const clan = rd.winner_team;
      if (!clan) continue;
      clanScores.set(clan, (clanScores.get(clan) || 0) + 1);
    }
    const firstSnap = clansAtTick.get(rounds[0]?.start_tick) || clansAtTick.values().next().value;
    if (firstSnap?.t) teamTName = firstSnap.t;
    if (firstSnap?.ct) teamCTName = firstSnap.ct;
    scoreT = clanScores.get(teamTName) || 0;
    scoreCT = clanScores.get(teamCTName) || 0;
    if (!scoreT && !scoreCT && clanScores.size) {
      const clans = [...clanScores.keys()];
      teamTName = clans[0];
      teamCTName = clans[1] || clans[0];
      scoreT = clanScores.get(teamTName) || 0;
      scoreCT = clanScores.get(teamCTName) || 0;
    }
  }

  // Collect any remaining playerControllers into roster
  for (const pc of parser.playerControllers) {
    if (pc.teamNumber < TeamNumber.Terrorists) continue;
    const name = (pc.name || '').trim();
    if (!name) continue;
    playerTeams.set(name, teamFromNum(pc.teamNumber));
  }

  /** @type {Map<string, string|null>} */
  const steamByName = new Map();
  try {
    const infoRows = parsePlayerInfo(filePath) || [];
    for (const row of infoRows) {
      const name = String(row.name || row.player_name || '').trim();
      if (!name) continue;
      const steam =
        row.steamid != null
          ? String(row.steamid)
          : row.steam_id != null
            ? String(row.steam_id)
            : null;
      steamByName.set(name, steam);
    }
  } catch (err) {
    console.error('player info parse skipped:', err?.message || err);
  }

  const crosshairByName = extractCrosshairCodes(filePath, tickRate);
  console.error(
    `crosshairs extracted: ${crosshairByName.size}/${playerTeams.size} players`,
  );

  const players = [...playerTeams.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, team]) => ({
      name,
      team,
      steam_id: steamByName.get(name) || null,
      crosshair_code: crosshairByName.get(name) || null,
    }));

  progress(100);

  return {
    map_name: mapName,
    score_t: scoreT,
    score_ct: scoreCT,
    team_t_name: teamTName,
    team_ct_name: teamCTName,
    tick_rate: tickRate,
    position_tick_step: tickStep,
    players,
    rounds,
    positions,
    grenades,
    kills,
    purchases,
    bomb_events: bombEvents,
    round_pauses: roundPauses,
  };
}

async function main() {
  const demoPath = process.argv[2];
  if (!demoPath) {
    console.error('Usage: node parse.mjs <demo.dem> [tick_step] [max_ticks]');
    process.exit(2);
  }

  const tickStep = Math.max(1, Number(process.argv[3]) || DEFAULT_TICK_STEP);
  const maxTicks = Math.max(1, Number(process.argv[4]) || DEFAULT_MAX_TICKS);
  const resolved = path.resolve(demoPath);

  try {
    const result = await parseDemo(resolved, tickStep, maxTicks);
    process.stdout.write(JSON.stringify(result));
  } catch (err) {
    console.error(err?.stack || String(err));
    process.exit(1);
  }
}

main();
