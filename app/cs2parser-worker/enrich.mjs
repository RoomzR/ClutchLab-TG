/**
 * Second pass over the demo with demoparser2: everything the stats engine needs
 * that cs2parser events do not expose (damage, kill details, shots with velocity,
 * blinds, per-round economy, chat, pings, time per callout zone, voice presence).
 *
 * All rows are plain arrays to keep the JSON payload compact; column order is
 * documented next to each collection and mirrored in services/parsing/pipeline.py.
 */

import * as dp from '@laihoe/demoparser2';

const PLAYER_PROPS = ['X', 'Y', 'Z', 'last_place_name', 'velocity_X', 'velocity_Y', 'team_num'];

const NON_GUN_WEAPONS = new Set([
  'knife', 'knife_t', 'knife_ct', 'bayonet', 'c4', 'taser', 'zeus',
  'flashbang', 'smokegrenade', 'hegrenade', 'molotov', 'incgrenade', 'decoy',
]);

function sideOf(teamNum) {
  const n = Number(teamNum);
  if (n === 3) return 'CT';
  if (n === 2) return 'T';
  return null;
}

function cleanWeapon(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/^weapon_/, '')
    .replace(/^item_/, '')
    .trim();
}

function num(v, digits = 1) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function place(v) {
  const s = String(v || '').trim();
  return s || null;
}

function isKnife(w) {
  return w.includes('knife') || w === 'bayonet';
}

/**
 * @param {string} filePath
 * @param {{ roundForTick: (tick:number)=>number, rounds: Array<any>, tickRate: number }} ctx
 */
export function enrichDemo(filePath, ctx) {
  const { roundForTick, rounds, tickRate } = ctx;
  const out = {
    kill_details: [],
    damages: [],
    shots: [],
    blinds: [],
    economy: [],
    chat: [],
    pings: [],
    zones: [],
    voice: { available: false, reason: 'not_checked' },
    enrich_errors: [],
  };

  let available = new Set();
  try {
    available = new Set(dp.listGameEvents(filePath) || []);
  } catch (err) {
    out.enrich_errors.push(`listGameEvents: ${err?.message || err}`);
  }

  const wanted = [
    'player_hurt', 'player_death', 'weapon_fire', 'chat_message', 'player_ping', 'flashbang_detonate',
  ].filter((e) => available.has(e));

  let events = [];
  try {
    events = dp.parseEvents(filePath, wanted, PLAYER_PROPS, ['is_warmup_period']) || [];
  } catch (err) {
    out.enrich_errors.push(`parseEvents: ${err?.message || err}`);
  }

  const firstStart = rounds.length ? Math.min(...rounds.map((r) => r.start_tick ?? Infinity)) : 0;
  const inMatch = (e) => !e.is_warmup_period && Number(e.tick) >= firstStart;

  const byName = new Map();
  for (const e of events) {
    if (!inMatch(e)) continue;
    const list = byName.get(e.event_name) || [];
    list.push(e);
    byName.set(e.event_name, list);
  }

  // ── Damage (capped to remaining HP, like scoreboard ADR) ──────────────────
  // [tick, round, attacker, victim, attacker_side, victim_side, weapon, dmg_health,
  //  dmg_armor, health_after, hitgroup, ax, ay, vx, vy, attacker_place, victim_place, raw_dmg]
  const hp = new Map();
  let hpRound = -1;
  const hurts = (byName.get('player_hurt') || []).sort((a, b) => a.tick - b.tick);
  for (const e of hurts) {
    const tick = Number(e.tick);
    const round = roundForTick(tick);
    if (round !== hpRound) {
      hp.clear();
      hpRound = round;
    }
    const victim = String(e.user_name || '').trim();
    if (!victim) continue;
    const before = hp.has(victim) ? hp.get(victim) : 100;
    const after = Math.max(0, Number(e.health) || 0);
    const raw = Math.max(0, Number(e.dmg_health) || 0);
    const dealt = Math.max(0, Math.min(raw, before));
    hp.set(victim, after);
    out.damages.push([
      tick,
      round,
      String(e.attacker_name || '').trim() || 'world',
      victim,
      sideOf(e.attacker_team_num),
      sideOf(e.user_team_num),
      cleanWeapon(e.weapon),
      dealt,
      Math.max(0, Number(e.dmg_armor) || 0),
      after,
      String(e.hitgroup || 'generic'),
      num(e.attacker_X), num(e.attacker_Y), num(e.user_X), num(e.user_Y),
      place(e.attacker_last_place_name), place(e.user_last_place_name),
      raw,
    ]);
  }

  // ── Kills with full context ───────────────────────────────────────────────
  // [tick, round, killer, victim, assister, weapon, headshot, assisted_flash, penetrated,
  //  thrusmoke, attacker_blind, noscope, attacker_in_air, distance, killer_side, victim_side,
  //  kx, ky, kz, vx, vy, vz, killer_place, victim_place, killer_speed, killer_steamid, victim_steamid]
  for (const e of byName.get('player_death') || []) {
    const tick = Number(e.tick);
    const kvx = Number(e.attacker_velocity_X) || 0;
    const kvy = Number(e.attacker_velocity_Y) || 0;
    out.kill_details.push([
      tick,
      roundForTick(tick),
      String(e.attacker_name || '').trim() || 'world',
      String(e.user_name || '').trim() || 'unknown',
      String(e.assister_name || '').trim() || null,
      cleanWeapon(e.weapon) || 'unknown',
      Boolean(e.headshot),
      Boolean(e.assistedflash),
      Number(e.penetrated) || 0,
      Boolean(e.thrusmoke),
      Boolean(e.attackerblind),
      Boolean(e.noscope),
      Boolean(e.attackerinair),
      num(e.distance, 2),
      sideOf(e.attacker_team_num),
      sideOf(e.user_team_num),
      num(e.attacker_X), num(e.attacker_Y), num(e.attacker_Z),
      num(e.user_X), num(e.user_Y), num(e.user_Z),
      place(e.attacker_last_place_name),
      place(e.user_last_place_name),
      num(Math.hypot(kvx, kvy)),
      e.attacker_steamid ? String(e.attacker_steamid) : null,
      e.user_steamid ? String(e.user_steamid) : null,
    ]);
  }

  // ── Shots (guns only) with horizontal speed at the moment of firing ──────
  // [tick, round, player, side, weapon, speed, x, y, place]
  for (const e of byName.get('weapon_fire') || []) {
    const weapon = cleanWeapon(e.weapon);
    if (!weapon || NON_GUN_WEAPONS.has(weapon) || isKnife(weapon)) continue;
    const tick = Number(e.tick);
    const vx = Number(e.user_velocity_X) || 0;
    const vy = Number(e.user_velocity_Y) || 0;
    out.shots.push([
      tick,
      roundForTick(tick),
      String(e.user_name || '').trim(),
      sideOf(e.user_team_num),
      weapon,
      num(Math.hypot(vx, vy)),
      num(e.user_X), num(e.user_Y),
      place(e.user_last_place_name),
    ]);
  }

  // ── Chat ─────────────────────────────────────────────────────────────────
  // [tick, round, player, side, text]
  for (const e of byName.get('chat_message') || []) {
    const text = String(e.chat_message || '').trim();
    if (!text) continue;
    const tick = Number(e.tick);
    out.chat.push([tick, roundForTick(tick), String(e.user_name || '').trim() || null, sideOf(e.user_team_num), text]);
  }

  // ── Pings (in-game info sharing) ─────────────────────────────────────────
  // [tick, round, player, side, x, y, z, player_place, urgent]
  for (const e of byName.get('player_ping') || []) {
    const tick = Number(e.tick);
    out.pings.push([
      tick,
      roundForTick(tick),
      String(e.user_name || '').trim(),
      sideOf(e.user_team_num),
      num(e.x), num(e.y), num(e.z),
      place(e.user_last_place_name),
      Boolean(e.urgent),
    ]);
  }

  // ── Blinds: flash_duration changes right after a flashbang detonates ─────
  // [tick, round, flasher, flasher_side, victim, victim_side, duration_s]
  const flashes = (byName.get('flashbang_detonate') || []).sort((a, b) => a.tick - b.tick);
  if (flashes.length) {
    try {
      const sampleTicks = [];
      for (const f of flashes) sampleTicks.push(Number(f.tick) - 2, Number(f.tick) + 4);
      const rows = dp.parseTicks(filePath, ['flash_duration', 'is_alive', 'team_num'], sampleTicks) || [];
      const at = new Map();
      for (const r of rows) at.set(`${r.tick}\0${r.name}`, r);
      const names = [...new Set(rows.map((r) => r.name))];
      for (const f of flashes) {
        const t = Number(f.tick);
        const flasher = String(f.user_name || '').trim();
        const flasherSide = sideOf(f.user_team_num);
        for (const name of names) {
          const after = at.get(`${t + 4}\0${name}`);
          if (!after || !after.is_alive) continue;
          const dur = Number(after.flash_duration) || 0;
          if (dur <= 0.05) continue;
          const before = at.get(`${t - 2}\0${name}`);
          const prev = Number(before?.flash_duration) || 0;
          if (Math.abs(prev - dur) < 1e-4) continue;
          out.blinds.push([t, roundForTick(t), flasher || null, flasherSide, name, sideOf(after.team_num), num(dur, 2)]);
        }
      }
    } catch (err) {
      out.enrich_errors.push(`blinds: ${err?.message || err}`);
    }
  }

  // ── Economy snapshot per round (after buy time settles) ──────────────────
  // [round, player, side, money_start, cash_spent, equip_value, round_start_equip,
  //  has_defuser, has_helmet, armor, steamid]
  const ecoTicks = [];
  const ecoRoundByTick = new Map();
  for (const rd of rounds) {
    const freeze = rd.freeze_end_tick ?? rd.start_tick;
    if (freeze == null) continue;
    const t = Math.min(Number(freeze) + Math.round(tickRate * 3), Number(rd.end_tick ?? freeze));
    ecoTicks.push(t);
    ecoRoundByTick.set(t, rd.round_number);
  }
  if (ecoTicks.length) {
    try {
      const rows =
        dp.parseTicks(
          filePath,
          [
            'balance', 'current_equip_value', 'round_start_equip_value', 'cash_spent_this_round',
            'has_defuser', 'has_helmet', 'armor_value', 'team_num',
          ],
          ecoTicks,
        ) || [];
      for (const r of rows) {
        const side = sideOf(r.team_num);
        if (!side) continue;
        const spent = Number(r.cash_spent_this_round) || 0;
        const balance = Number(r.balance) || 0;
        out.economy.push([
          ecoRoundByTick.get(Number(r.tick)),
          String(r.name || '').trim(),
          side,
          balance + spent,
          spent,
          Number(r.current_equip_value) || 0,
          Number(r.round_start_equip_value) || 0,
          Boolean(r.has_defuser),
          Boolean(r.has_helmet),
          Number(r.armor_value) || 0,
          r.steamid ? String(r.steamid) : null,
        ]);
      }
    } catch (err) {
      out.enrich_errors.push(`economy: ${err?.message || err}`);
    }
  }

  // ── Inventory at death: grenades the player never used ───────────────────
  // [tick, round, victim, grenade_items[], grenade_value]
  out.death_inventory = [];
  const deaths = byName.get('player_death') || [];
  if (deaths.length) {
    try {
      const ticks = [...new Set(deaths.map((e) => Number(e.tick) - 1))];
      const rows = dp.parseTicks(filePath, ['inventory'], ticks) || [];
      const inv = new Map();
      for (const r of rows) inv.set(`${r.tick}\0${r.name}`, r.inventory);
      for (const e of deaths) {
        const victim = String(e.user_name || '').trim();
        const items = inv.get(`${Number(e.tick) - 1}\0${victim}`);
        const list = Array.isArray(items) ? items : [];
        const nades = [];
        let value = 0;
        for (const raw of list) {
          const s = String(raw || '').toLowerCase();
          let v = 0;
          if (s.includes('smoke')) v = 300;
          else if (s.includes('flash')) v = 200;
          else if (s.includes('high explosive') || s.includes('he grenade') || s === 'hegrenade') v = 300;
          else if (s.includes('molotov')) v = 400;
          else if (s.includes('incendiary')) v = 600;
          else if (s.includes('decoy')) v = 50;
          if (v) {
            nades.push(String(raw));
            value += v;
          }
        }
        out.death_inventory.push([Number(e.tick), roundForTick(Number(e.tick)), victim, nades, value]);
      }
    } catch (err) {
      out.enrich_errors.push(`death_inventory: ${err?.message || err}`);
    }
  }

  // ── Time per callout zone while alive (sampled every 0.5 s) ──────────────
  // zones: [round, player, side, place, seconds]
  // early_places: [round, player, side, place] at freeze_end + 20 s
  const zoneTicks = [];
  const earlyTickRound = new Map();
  const step = Math.max(1, Math.round(tickRate / 2));
  for (const rd of rounds) {
    const s = rd.freeze_end_tick ?? rd.start_tick;
    const e = rd.end_tick;
    if (s == null || e == null) continue;
    for (let t = Number(s); t <= Number(e); t += step) zoneTicks.push(t);
    const early = Number(s) + Math.round(tickRate * 20);
    if (early <= Number(e)) {
      zoneTicks.push(early);
      earlyTickRound.set(early, rd.round_number);
    }
  }
  out.early_places = [];
  if (zoneTicks.length) {
    try {
      const rows = dp.parseTicks(filePath, ['last_place_name', 'is_alive', 'team_num'], [...new Set(zoneTicks)]) || [];
      const acc = new Map();
      for (const r of rows) {
        if (!r.is_alive) continue;
        const side = sideOf(r.team_num);
        const zone = place(r.last_place_name);
        if (!side || !zone) continue;
        const tick = Number(r.tick);
        if (earlyTickRound.has(tick)) {
          out.early_places.push([earlyTickRound.get(tick), r.name, side, zone]);
        }
        const round = roundForTick(tick);
        const key = `${round}\0${r.name}\0${side}\0${zone}`;
        acc.set(key, (acc.get(key) || 0) + 0.5);
      }
      for (const [key, seconds] of acc) {
        const [round, name, side, zone] = key.split('\0');
        out.zones.push([Number(round), name, side, zone, seconds]);
      }
    } catch (err) {
      out.enrich_errors.push(`zones: ${err?.message || err}`);
    }
  }

  // ── Voice: only GOTV demos recorded with tv_relayvoice carry it ──────────
  if (typeof dp.parseVoice === 'function') {
    try {
      const voice = dp.parseVoice(filePath);
      const speakers = voice ? Object.keys(voice).length : 0;
      out.voice = speakers
        ? { available: true, speakers, reason: 'voice_data_present' }
        : { available: false, reason: 'no_voice_packets' };
    } catch (err) {
      out.voice = { available: false, reason: `voice_parse_failed: ${err?.message || err}` };
    }
  } else {
    out.voice = { available: false, reason: 'parser_without_voice_support' };
  }

  return out;
}
