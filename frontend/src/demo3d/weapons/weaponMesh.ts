/** Classify CS2 weapon short names for 3D stubs / models. */
import { ALL_WEAPON_GLBS } from './weaponCatalog';

export type WeaponClass =
  | 'rifle'
  | 'sniper'
  | 'smg'
  | 'pistol'
  | 'shotgun'
  | 'knife'
  | 'nade'
  | 'other';

const KNOWN_GLBS = new Set<string>(ALL_WEAPON_GLBS);

/**
 * demoparser2 / HUD display names → exported GLB basenames.
 * Keys are slugified (lowercase, spaces/hyphens → `_`).
 */
const WEAPON_ALIASES: Record<string, string> = {
  // knives
  knife_default_ct: 'knife_ct',
  knife_default_t: 'knife_t',
  knife_default: 'knife',
  knife_m9: 'knife_m9_bayonet',
  m9_bayonet: 'knife_m9_bayonet',
  knife_bowie: 'knife_survival_bowie',
  bowie_knife: 'knife_survival_bowie',
  survival_bowie: 'knife_survival_bowie',
  knife_navaja: 'knife_gypsy_jackknife',
  navaja_knife: 'knife_gypsy_jackknife',
  gypsy_jackknife: 'knife_gypsy_jackknife',
  knife_talon: 'knife_widowmaker',
  talon_knife: 'knife_widowmaker',
  widowmaker: 'knife_widowmaker',
  knife_shadow_daggers: 'knife_push',
  shadow_daggers: 'knife_push',
  knife_daggers: 'knife_push',
  knife_nomad: 'knife_outdoor',
  nomad_knife: 'knife_outdoor',
  knife_paracord: 'knife_cord',
  paracord_knife: 'knife_cord',
  knife_survival: 'knife_canis',
  survival_knife: 'knife_canis',
  karambit: 'knife_karambit',
  karambit_knife: 'knife_karambit',
  butterfly: 'knife_butterfly',
  butterfly_knife: 'knife_butterfly',
  gut: 'knife_gut',
  gut_knife: 'knife_gut',
  flip: 'knife_flip',
  flip_knife: 'knife_flip',
  falchion: 'knife_falchion',
  falchion_knife: 'knife_falchion',
  stiletto: 'knife_stiletto',
  stiletto_knife: 'knife_stiletto',
  ursus: 'knife_ursus',
  ursus_knife: 'knife_ursus',
  skeleton: 'knife_skeleton',
  skeleton_knife: 'knife_skeleton',
  kukri: 'knife_kukri',
  kukri_knife: 'knife_kukri',
  bayonet_knife: 'bayonet',
  classic_knife: 'knife_css',
  css_knife: 'knife_css',
  cord_knife: 'knife_cord',
  outdoor_knife: 'knife_outdoor',
  canis_knife: 'knife_canis',
  tactical_knife: 'knife_tactical',
  huntsman_knife: 'knife_tactical',
  push_knife: 'knife_push',

  // rifles / snipers
  galil: 'galilar',
  galil_ar: 'galilar',
  sg553: 'sg556',
  m4a4: 'm4a1',
  m4a1s: 'm4a1_silencer',
  m4a1_s: 'm4a1_silencer',
  ak: 'ak47',
  ak_47: 'ak47',
  scout: 'ssg08',
  ssg_08: 'ssg08',
  auto_sniper: 'scar20',
  g3sg1_auto: 'g3sg1',

  // pistols
  usp: 'usp_silencer',
  usps: 'usp_silencer',
  usp_s: 'usp_silencer',
  glock_18: 'glock',
  glock18: 'glock',
  r8: 'revolver',
  r8_revolver: 'revolver',
  cz75: 'cz75a',
  cz75_auto: 'cz75a',
  dual_elites: 'elite',
  dualberettas: 'elite',
  dual_berettas: 'elite',
  five_seven: 'fiveseven',
  fiveseven: 'fiveseven',
  desert_eagle: 'deagle',
  p2000: 'hkp2000',
  tec_9: 'tec9',
  p_250: 'p250',

  // smg
  mac_10: 'mac10',
  mp5_sd: 'mp5sd',
  ump_45: 'ump45',
  p_90: 'p90',
  pp_bizon: 'bizon',

  // heavy
  xm_1014: 'xm1014',
  mag_7: 'mag7',
  sawed_off: 'sawedoff',
  m_249: 'm249',

  // nades / util
  he: 'hegrenade',
  he_grenade: 'hegrenade',
  high_explosive_grenade: 'hegrenade',
  flash: 'flashbang',
  smoke: 'smokegrenade',
  smoke_grenade: 'smokegrenade',
  molly: 'molotov',
  inc: 'incgrenade',
  incendiary: 'incgrenade',
  incendiary_grenade: 'incgrenade',
  decoy_grenade: 'decoy',
  c4_explosive: 'c4',
  bomb: 'c4',
  planted_c4: 'c4',
};

function slugifyWeapon(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/^weapon_/, '')
    .trim()
    .replace(/['’]/g, '')
    .replace(/[\s\-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function normalizeWeaponName(weapon?: string | null): string {
  if (!weapon) return '';

  const raw = weapon.toLowerCase().replace(/^weapon_/, '').trim();
  if (WEAPON_ALIASES[raw]) return WEAPON_ALIASES[raw];
  if (KNOWN_GLBS.has(raw)) return raw;

  const slug = slugifyWeapon(weapon);
  if (WEAPON_ALIASES[slug]) return WEAPON_ALIASES[slug];
  if (KNOWN_GLBS.has(slug)) return slug;

  // "Ursus Knife" → ursus_knife already handled; also try knife_<skin>
  if (slug.endsWith('_knife')) {
    const skin = slug.slice(0, -'_knife'.length);
    if (WEAPON_ALIASES[skin]) return WEAPON_ALIASES[skin];
    const asKnife = `knife_${skin}`;
    if (KNOWN_GLBS.has(asKnife) || WEAPON_ALIASES[asKnife]) {
      return WEAPON_ALIASES[asKnife] ?? asKnife;
    }
  }

  // ak_47 → ak47, mac_10 → mac10, ssg_08 → ssg08
  const compact = slug.replace(/_/g, '');
  if (WEAPON_ALIASES[compact]) return WEAPON_ALIASES[compact];
  if (KNOWN_GLBS.has(compact)) return compact;

  return slug;
}

/**
 * Resolve weapon for rendering.
 * - empty/null → null (do not invent a knife — hides parser bugs)
 * - bare "knife" → team default blade
 * - knife skins / guns pass through
 */
export function resolveActiveWeapon(
  weapon?: string | null,
  team: 'CT' | 'T' = 'T',
): string | null {
  const w = normalizeWeaponName(weapon);
  if (!w) return null;
  if (w === 'knife') return team === 'CT' ? 'knife_ct' : 'knife_t';
  return w;
}

/** @deprecated use resolveActiveWeapon */
export function resolveTeamKnife(weapon?: string | null, team: 'CT' | 'T' = 'T'): string {
  return resolveActiveWeapon(weapon, team) ?? (team === 'CT' ? 'knife_ct' : 'knife_t');
}

export function classifyWeapon(weapon?: string | null): WeaponClass {
  const w = normalizeWeaponName(weapon);
  if (!w) return 'other';
  if (
    w.includes('knife') ||
    w === 'bayonet' ||
    w.includes('karambit') ||
    w.includes('butterfly') ||
    w.includes('bayonet') ||
    w.includes('falchion') ||
    w.includes('stiletto') ||
    w.includes('ursus') ||
    w.includes('kukri') ||
    w.includes('bowie') ||
    w.includes('talon') ||
    w.includes('navaja') ||
    w.includes('skeleton')
  ) {
    return 'knife';
  }
  if (['awp', 'ssg08', 'scar20', 'g3sg1', 'scout'].includes(w)) return 'sniper';
  if (
    [
      'deagle',
      'glock',
      'usp_silencer',
      'hkp2000',
      'p250',
      'tec9',
      'fiveseven',
      'cz75a',
      'elite',
      'revolver',
    ].includes(w)
  ) {
    return 'pistol';
  }
  if (['mp9', 'mac10', 'mp7', 'ump45', 'p90', 'bizon', 'mp5sd'].includes(w)) return 'smg';
  if (['nova', 'xm1014', 'mag7', 'sawedoff'].includes(w)) return 'shotgun';
  if (
    w.includes('grenade') ||
    ['molotov', 'incgrenade', 'flashbang', 'decoy', 'hegrenade', 'smokegrenade'].includes(w)
  ) {
    return 'nade';
  }
  if (
    ['ak47', 'm4a1', 'm4a1_silencer', 'aug', 'sg556', 'famas', 'galilar', 'galil'].includes(w)
  ) {
    return 'rifle';
  }
  return 'rifle';
}

export function weaponDisplayName(weapon?: string | null): string {
  const w = normalizeWeaponName(weapon);
  if (!w) return '—';
  const map: Record<string, string> = {
    ak47: 'AK-47',
    m4a1: 'M4A4',
    m4a1_silencer: 'M4A1-S',
    awp: 'AWP',
    ssg08: 'SSG 08',
    deagle: 'Desert Eagle',
    glock: 'Glock-18',
    usp_silencer: 'USP-S',
    hkp2000: 'P2000',
    knife: 'Knife',
    knife_t: 'Knife',
    knife_ct: 'Knife',
  };
  return map[w] ?? w.replace(/_/g, ' ').toUpperCase();
}

export function weaponStubSize(cls: WeaponClass): { length: number; width: number; height: number } {
  switch (cls) {
    case 'sniper':
      return { length: 22, width: 2.2, height: 2.8 };
    case 'rifle':
      return { length: 18, width: 2.4, height: 2.8 };
    case 'smg':
      return { length: 14, width: 2.2, height: 2.6 };
    case 'shotgun':
      return { length: 16, width: 2.6, height: 2.8 };
    case 'pistol':
      return { length: 11, width: 1.8, height: 2.4 };
    case 'knife':
      return { length: 9, width: 1.2, height: 1.6 };
    case 'nade':
      return { length: 6, width: 5, height: 5 };
    default:
      return { length: 16, width: 2.2, height: 2.6 };
  }
}
