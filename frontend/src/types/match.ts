export interface Player {
  name: string;
  team: 'CT' | 'T';
  steam_id?: string | null;
  /** CSGO-… share code from demo (`m_szCrosshairCodes`). */
  crosshair_code?: string | null;
}

export interface MatchOverview {
  match_id: string;
  map_name: string;
  score_t: number;
  score_ct: number;
  team_t_name: string;
  team_ct_name: string;
  tick_rate?: number;
  position_tick_step?: number;
  players: Player[];
  status: MatchStatus['status'];
  progress: number;
}

export interface TickData {
  tick: number;
  player_name: string;
  team: 'CT' | 'T';
  x: number;
  y: number;
  z: number;
  round_number: number;
  /** View yaw in degrees (Source engine). Missing on older parses. */
  yaw?: number | null;
  /** HP 0–100. Missing on older parses. */
  health?: number | null;
  /** Armor 0–100. Missing on older parses. */
  armor?: number | null;
  /** View pitch in degrees. Missing on older parses. */
  pitch?: number | null;
  /** Active weapon short name (ak47, awp, …). Missing on older parses. */
  weapon?: string | null;
  /** True when player is scoped (AWP/Scout/…). Missing on older parses. */
  scoped?: boolean | null;
}

export interface GrenadeData {
  grenade_type: 'smoke' | 'flash' | 'he' | 'molotov' | 'incendiary' | 'decoy';
  player_name: string;
  team: 'CT' | 'T';
  from_x: number;
  from_y: number;
  from_z: number;
  to_x: number;
  to_y: number;
  to_z: number;
  tick: number;
  round_number: number;
}

export interface KillData {
  tick: number;
  killer: string;
  victim: string;
  weapon: string;
  headshot: boolean;
  round_number: number;
}

export interface BombEvent {
  event_type: 'bomb_planted' | 'bomb_defused';
  tick: number;
  round_number: number;
  site: string;
  player_name: string;
  x: number;
  y: number;
}

export interface RoundData {
  round_number: number;
  winner: 'CT' | 'T';
  win_type: string;
  duration_seconds: number;
  start_tick?: number | null;
  end_tick?: number | null;
  freeze_end_tick?: number | null;
  winner_team?: string | null;
}

export interface RoundPause {
  round_number: number;
  start_tick: number;
  end_tick: number;
  pause_type: 'timeout' | 'technical' | 'pause';
}

export interface Position {
  x: number;
  y: number;
  z: number;
  frequency: number;
  label?: string;
}

export interface PlayerHabitsData {
  favorite_positions: Position[];
  grenade_preferences: Record<string, number>;
  flash_reaction: {
    avg_reaction_time_ms: number;
    blinded_count: number;
    successful_counter_flashes: number;
    retreat_pct?: number;
  };
  purchase_pattern: Record<string, number>;
  duel_stats: {
    total_duels: number;
    wins: number;
    avg_damage: number;
  };
  frequent_loadouts?: string[];
}

export interface PlayerStats {
  kills: number;
  deaths: number;
  assists: number;
  headshot_pct: number;
  favorite_weapon: string;
  avg_blind_duration_ms: number;
  weapon_kills?: Record<string, number>;
}

export interface DuelRecord {
  opponent: string;
  kills: number;
  deaths: number;
}

export interface GrenadeSpot {
  grenade_type: string;
  zone: string;
  frequency: number;
  to_x: number;
  to_y: number;
}

export interface HeatmapLatLngPoint {
  lat: number;
  lng: number;
  intensity: number;
}

export interface TrajectoryData {
  player: string;
  color: string;
  points: { lat: number; lng: number }[];
  showArrow?: boolean;
}

export type PurchaseRoundCategory = 0 | 1 | 2 | 3;

export interface RoundPurchaseSummary {
  round_number: number;
  category: PurchaseRoundCategory;
  items: string[];
  total_cost: number;
}

export interface MatchStatus {
  status: 'pending' | 'parsing' | 'ready' | 'error';
  progress: number;
  message?: string;
}

export interface HeatmapPoint {
  x: number;
  y: number;
  z: number;
  density: number;
}

export interface PurchaseEvent {
  tick: number;
  round_number: number;
  item: string;
  cost: number;
  round_type?: 'pistol' | 'eco' | 'half' | 'full';
}

export interface FlashEvent {
  tick: number;
  round_number: number;
  duration_ms: number;
  enemies_blinded: number;
  was_blinded: boolean;
}

export interface PositionsParams {
  round_number?: number;
  round_numbers?: number[];
  tick_start?: number;
  tick_end?: number;
  player_names?: string[];
  team?: 'CT' | 'T';
}

export interface GrenadesParams {
  round_number?: number;
  round_numbers?: number[];
  grenade_types?: string[];
  team?: 'CT' | 'T';
  player_name?: string;
}

export interface HeatmapParams {
  round_number?: number;
  round_numbers?: number[];
}

export interface UploadResponse {
  match_id: string;
  xp_awarded?: number;
  new_achievements?: {
    code: string;
    name: string;
    xp_reward: number;
    tier: string;
  }[];
}

export interface MatchListItem {
  match_id: string;
  map_name: string;
  score_t: number;
  score_ct: number;
  team_t_name: string;
  team_ct_name: string;
  created_at?: string;
  player_count?: number;
  is_pro?: boolean;
}

export interface PlayerHistoryEntry {
  match_id: string;
  map_name: string;
  score_t: number;
  score_ct: number;
  team: 'CT' | 'T';
  won: boolean;
  kills: number;
  deaths: number;
  created_at?: string | null;
}

export interface PlayerMapStats {
  games: number;
  wins: number;
  kills: number;
  deaths: number;
  winrate: number;
  kd: number;
}

export interface PlayerHistory {
  player_name: string;
  match_count: number;
  wins: number;
  winrate: number;
  kills: number;
  deaths: number;
  kd: number;
  matches: PlayerHistoryEntry[];
  by_map: Record<string, PlayerMapStats>;
}

export interface TrackedPlayer {
  name: string;
  match_count: number;
}

export interface MatchPurchase {
  player_name: string;
  tick: number;
  round_number: number;
  item: string;
  cost: number;
  team?: 'CT' | 'T' | null;
}
