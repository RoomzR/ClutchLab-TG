import type { GrenadeData } from '../types/match';

export type GrenadeIconType = GrenadeData['grenade_type'];

export interface GrenadeIconConfig {
  src: string;
  label: string;
  color: string;
  radarFill: string;
  radarStroke: string;
}

/** CS2 equipment icons (from game assets via Juknum/counter-strike-icons). */
export const GRENADE_ICON_CONFIG: Record<GrenadeIconType, GrenadeIconConfig> = {
  smoke: {
    src: '/grenades/smokegrenade.svg',
    label: 'Дым',
    color: '#94a3b8',
    radarFill: 'rgba(148,163,184,0.45)',
    radarStroke: 'rgba(203,213,225,0.7)',
  },
  flash: {
    src: '/grenades/flashbang.svg',
    label: 'Флешка',
    color: '#fbbf24',
    radarFill: 'rgba(250,204,21,0.55)',
    radarStroke: 'rgba(253,224,71,0.95)',
  },
  he: {
    src: '/grenades/hegrenade.svg',
    label: 'HE',
    color: '#ef4444',
    radarFill: 'rgba(239,68,68,0.5)',
    radarStroke: 'rgba(252,165,165,0.9)',
  },
  molotov: {
    src: '/grenades/molotov.svg',
    label: 'Молотов',
    color: '#f97316',
    radarFill: 'rgba(249,115,22,0.4)',
    radarStroke: 'rgba(251,146,60,0.85)',
  },
  incendiary: {
    src: '/grenades/incgrenade.svg',
    label: 'Зажигательная',
    color: '#f97316',
    radarFill: 'rgba(239,68,68,0.35)',
    radarStroke: 'rgba(248,113,113,0.85)',
  },
  decoy: {
    src: '/grenades/decoy.svg',
    label: 'Ловушка',
    color: '#a78bfa',
    radarFill: 'rgba(100,116,139,0.35)',
    radarStroke: 'rgba(148,163,184,0.7)',
  },
};

export function getGrenadeIconConfig(type: string): GrenadeIconConfig {
  return GRENADE_ICON_CONFIG[type as GrenadeIconType] ?? GRENADE_ICON_CONFIG.he;
}

export const GRENADE_FILTER_TYPES = (
  Object.entries(GRENADE_ICON_CONFIG) as [GrenadeIconType, GrenadeIconConfig][]
).map(([id, config]) => ({
  id,
  label: config.label,
  color: config.color,
}));
