import { getMapConfig } from '../utils/mapConfig';

export const RADAR = 1024;

/** World (Source units) → radar pixel in the 1024×1024 overview image. */
export function toRadar(mapName: string, x: number, y: number): [number, number] {
  const cfg = getMapConfig(mapName);
  return [(x - cfg.pos_x) / cfg.scale, (cfg.pos_y - y) / cfg.scale];
}

export function fromRadar(mapName: string, px: number, py: number): [number, number] {
  const cfg = getMapConfig(mapName);
  return [px * cfg.scale + cfg.pos_x, cfg.pos_y - py * cfg.scale];
}

export function radarImage(mapName: string): string {
  return getMapConfig(mapName).imageUrl;
}

export function mapTitle(mapName: string | null | undefined): string {
  if (!mapName) return '—';
  return getMapConfig(mapName).displayName;
}

export const MAPS = ['de_mirage', 'de_inferno', 'de_dust2', 'de_nuke', 'de_ancient', 'de_anubis', 'de_overpass', 'de_train', 'de_vertigo'];

export const CT_COLOR = '#5b8cff';
export const T_COLOR = '#f5a524';
export const sideColor = (side: string | null | undefined) => (side === 'CT' ? CT_COLOR : side === 'T' ? T_COLOR : '#9ca3af');

export const GRENADE_COLOR: Record<string, string> = {
  smoke: '#cbd5e1',
  flash: '#fde68a',
  he: '#f87171',
  molotov: '#fb923c',
  incendiary: '#fb923c',
  decoy: '#a3a3a3',
};

export const GRENADE_RU: Record<string, string> = {
  smoke: 'Смок',
  flash: 'Флешка',
  he: 'HE',
  molotov: 'Молотов',
  incendiary: 'Инцендиари',
  decoy: 'Декой',
};

export const BUY_RU: Record<string, string> = { pistol: 'Пистолетка', eco: 'Эко', force: 'Форс', full: 'Фулл-бай' };

export const REASON_RU: Record<string, string> = {
  ct_eliminated: 'Все CT убиты',
  t_eliminated: 'Все T убиты',
  terrorists_win: 'Все CT убиты',
  cts_win: 'Все T убиты',
  bomb_defused: 'Бомба обезврежена',
  target_bombed: 'Бомба взорвана',
  target_saved: 'Время вышло',
  time_ran_out: 'Время вышло',
};

export const MATCH_TYPE_RU: Record<string, string> = {
  scrim: 'Скрим', official: 'Официальный', faceit: 'FACEIT', pug: 'Паб', opponent: 'Демка соперника',
};

export const ROLE_RU: Record<string, string> = {
  admin: 'Админ', manager: 'Менеджер', coach: 'Тренер', analyst: 'Аналитик', player: 'Игрок',
};
