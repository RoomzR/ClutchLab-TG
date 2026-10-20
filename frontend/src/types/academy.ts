export type Side = 'all' | 'CT' | 'T';
export type MetricValues = Record<string, number | null>;

export interface MetricDef {
  id: string;
  group: string;
  ru: string;
  en: string;
  description: string;
  formula: string;
  source: string;
  unit: 'num' | 'pct' | 'sec' | 'ms' | 'deg' | 'money' | 'units' | 'ratio';
  better: 'higher' | 'lower' | 'neutral';
  confidence: 'exact' | 'derived' | 'estimated';
  min_sample: string;
  key: boolean;
}

export interface MistakeCatalogItem {
  type: string;
  title: string;
  category: string;
  category_title: string;
  explanation: string;
  solution: Solution;
}

export interface Solution {
  title: string;
  steps: string[];
  drill: string;
  minutes_per_day: number;
  check: { metric: string; op: '>=' | '<='; threshold: number };
  code?: string;
  mistake_title?: string;
  category?: string;
}

export interface MetricsRegistry {
  version: string;
  groups: { id: string; ru: string; en: string }[];
  metrics: MetricDef[];
  team_metrics: { id: string; ru: string; unit: string; better: string; description: string }[];
  mistakes: MistakeCatalogItem[];
}

export interface AcademyMe {
  user: {
    id: string | null;
    username: string;
    role: string;
    academy_role: 'admin' | 'manager' | 'coach' | 'analyst' | 'player';
    org_id: string | null;
    player_name: string | null;
    is_guest: boolean;
  };
  org: { id: string; name: string; slug: string; retention_days: number } | null;
}

export interface AcademyMatch {
  match_id: string;
  map_name: string | null;
  score_t: number;
  score_ct: number;
  team_t_name: string;
  team_ct_name: string;
  status: 'pending' | 'parsing' | 'saving' | 'analyzing' | 'ready' | 'error';
  progress: number;
  message: string | null;
  match_type: string;
  opponent_name: string | null;
  created_at: string;
  played_at: string | null;
  analysis_status: string;
  reviewed_by_analyst: boolean;
  has_voice: boolean;
  original_filename: string | null;
  rounds: number;
  open_mistakes: number;
  mistakes: number;
  players: string[];
  academy_team: string | null;
  academy_players: string[];
  result?: 'W' | 'L' | 'D';
}

export interface RoundKill {
  tick: number;
  time: number;
  killer: string;
  victim: string;
  killer_side: 'CT' | 'T' | null;
  victim_side: 'CT' | 'T' | null;
  weapon: string;
  headshot: boolean;
  traded: boolean;
  trade_of: string | null;
  opening: boolean;
  victim_place: string | null;
  killer_place: string | null;
}

export interface RoundSummary {
  round: number;
  winner_side: 'CT' | 'T';
  winner_team: string | null;
  reason: string | null;
  duration: number;
  freeze_tick: number;
  end_tick: number;
  start_tick: number | null;
  teams: { T: string; CT: string };
  score: Record<string, number>;
  buy: Record<'T' | 'CT', { type: 'pistol' | 'eco' | 'force' | 'full'; avg_equip: number; avg_money: number }>;
  opening: { tick: number; time: number; killer: string; victim: string; killer_side: string; victim_side: string; weapon: string } | null;
  first_contact: number | null;
  kills: RoundKill[];
  plant: { tick: number; player: string; site: string | null; time: number; x: number; y: number } | null;
  defuse: { tick: number; player: string; time: number; no_kit?: boolean } | null;
  clutch: Record<string, { player: string; vs: number; won: boolean; tick: number; side: string }>;
  survivors: Record<'CT' | 'T', string[]>;
  mvp: string | null;
  players: Record<string, { side: 'CT' | 'T'; kills: number; assists: number; damage: number; died: boolean; kast: boolean; equip: number | null; money: number | null; spent: number | null }>;
  mistakes?: number;
}

export interface PlayerBlock {
  name: string;
  team: string;
  steam_id: string | null;
  won: boolean | null;
  sides: Partial<Record<Side, { metrics: MetricValues; rounds: number }>>;
  extras: Record<string, Record<string, number> | unknown[]>;
  counters?: Record<string, number>;
}

export interface TeamBlock {
  name: string;
  won: boolean | null;
  counters: Record<string, number>;
  metrics: MetricValues;
  series: { round: number; side: 'CT' | 'T'; won: boolean; buy_type: string; equip: number; money: number; spent: number }[];
  sites: Record<string, number>;
  win_reasons: Record<string, number>;
  score: number;
}

export interface MatchSummary {
  match: Record<string, unknown> & {
    match_id: string;
    map_name: string;
    score_t: number;
    score_ct: number;
    team_t_name: string;
    team_ct_name: string;
    tick_rate: number;
    match_type: string;
    opponent_name: string | null;
    created_at: string;
    played_at: string | null;
    has_voice: boolean;
    voice_reason: string | null;
    reviewed_by_analyst: boolean;
    status: string;
    analysis_status: string;
    parser_version: string | null;
    analysis_version: string | null;
  };
  players: PlayerBlock[];
  teams: TeamBlock[];
  rounds: RoundSummary[];
  mistakes_by_player: Record<string, Record<string, number>>;
  mistakes_total: number;
  analyst_report_status: string | null;
  academy_teams: string[];
  roster: string[];
}

export interface Mistake {
  id: string;
  match_id: string;
  round_number: number | null;
  player_name: string | null;
  team_name: string | null;
  side: 'CT' | 'T' | null;
  type: string;
  category: string;
  severity: 'high' | 'medium' | 'low';
  confidence: 'rule' | 'estimated' | 'llm' | 'human';
  tick_start: number | null;
  tick_end: number | null;
  title: string;
  explanation: string;
  recommendation: string;
  solution_code: string | null;
  evidence: Record<string, unknown>;
  status: 'open' | 'assigned_as_homework' | 'fixed' | 'recurring' | 'dismissed';
  coach_comment: string | null;
  solution?: Solution | null;
  homework?: { id: string; status: string } | null;
  map_name?: string;
  played_at?: string;
}

export interface RoundReview {
  round: number;
  summary: string;
  tags: string[];
  mistakes: { type: string; player: string | null; severity: string; tick: number | null; recommendation: string; title: string }[];
  positives: { player: string | null; tick: number | null; text: string }[];
  key_tick: number | null;
  llm?: { model: string; priorities: { player: string | null; tick: number | null; point: string; fix: string }[]; positives: { player: string | null; tick: number | null; point: string }[] } | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations: { round: number | null; tick: number | null; player: string | null; kind: string; label: string; text: string }[];
  source: string | null;
  created_at: string;
}

export interface Homework {
  id: string;
  player_name: string;
  mistake_id: string | null;
  mistake_type: string | null;
  match_id: string | null;
  title: string;
  description: string;
  solution_code: string | null;
  lineup_id: string | null;
  due_date: string | null;
  status: 'assigned' | 'in_progress' | 'done' | 'verified' | 'recurring' | 'cancelled';
  check_metric: string | null;
  check_op: string | null;
  check_threshold: number | null;
  baseline_value: number | null;
  last_value: number | null;
  last_checked_at: string | null;
  verification: { matches?: string[]; value?: number | null; passes?: boolean | null; recurring_mistakes?: number };
  created_at: string;
}

export interface TrainingPlan {
  id: string;
  player?: string;
  player_name?: string;
  summary: string;
  week_start: string;
  themes: { category: string; title: string; score: number; mistake_types: { type: string; title: string; count: number }[]; metrics: MetricValues }[];
  items: TrainingItem[] | { items: TrainingItem[]; schedule: Record<string, number[]>; minutes_per_day: Record<string, number> };
  schedule?: Record<string, number[]>;
  minutes_per_day?: Record<string, number>;
  created_at?: string;
}

export interface TrainingItem {
  kind: 'drill' | 'lineup' | 'review';
  theme: string;
  title: string;
  details: string;
  steps?: string[];
  minutes: number;
  days?: string[];
  check?: { metric: string; op: string; threshold: number };
  lineup_id?: string;
}

export interface PlayerProfile {
  name: string;
  team: string | null;
  matches: number;
  wins: number;
  steam_id: string | null;
  sides: Record<Side, { metrics: MetricValues; counters: Record<string, number> }>;
  percentiles: MetricValues;
  team_avg: MetricValues;
  academy_avg: MetricValues;
  population_size: number;
  extras: Record<string, Record<string, number> | unknown[]>;
  maps: { map: string; matches: number; wins: number; metrics: MetricValues }[];
  trend: ({ match_id: string; date: string; map: string; won: boolean | null; mistakes: number } & MetricValues)[];
  cards: PlayerMatchCard[];
  mistake_types: { type: string; title: string; category: string; count: number; open: number; fixed: number; high: number }[];
  strengths: { metric: string; name: string; value: number | null; percentile: number }[];
  weaknesses: { metric: string; name: string; value: number | null; percentile: number }[];
  form: number | null;
}

export interface PlayerMatchCard {
  match_id: string;
  date: string;
  map: string;
  won: boolean | null;
  team: string;
  score_t: number;
  score_ct: number;
  team_t_name: string;
  team_ct_name: string;
  match_type: string;
  reviewed_by_analyst: boolean;
  kills: number;
  deaths: number;
  assists: number;
  rating: number | null;
  adr: number | null;
  kast_pct: number | null;
  hs_pct: number | null;
  mistakes: number;
  top_mistake: string | null;
}

export interface AcademyPlayerRow {
  name: string;
  team: string | null;
  matches: number;
  wins: number;
  last_played: string;
  metrics: MetricValues;
  in_roster: boolean;
  ingame_role: string | null;
  open_mistakes: number;
  active_homework: number;
  steam_id: string | null;
}

export interface Lineup {
  id: string;
  map_name: string;
  side: 'CT' | 'T';
  grenade_type: string;
  title: string;
  target: string;
  role: string | null;
  technique: string;
  throw_x: number | null;
  throw_y: number | null;
  throw_z: number | null;
  land_x: number | null;
  land_y: number | null;
  land_z: number | null;
  steps: string;
  video_url: string | null;
  video_src?: string;
  tags: string[];
  source_match_id: string | null;
  source_tick: number | null;
  created_at: string;
}

export interface Board {
  id: string;
  map_name: string;
  match_id: string | null;
  round_number: number | null;
  tick: number | null;
  title: string;
  shapes: BoardShape[];
  author?: string;
  shapes_count?: number;
  updated_at: string;
}

export interface BoardShape {
  id: string;
  kind: 'pen' | 'arrow' | 'line' | 'circle' | 'text' | 'ct' | 't' | 'smoke' | 'flash' | 'molotov' | 'he';
  points: [number, number][];
  color: string;
  width: number;
  text?: string;
  author?: string;
}

export interface AnalystSlot {
  id: string;
  analyst_id: string;
  analyst_name: string;
  starts_at: string;
  ends_at: string;
  status: 'open' | 'booked' | 'closed';
  note: string;
  booking_id: string | null;
}

export interface AnalystBooking {
  id: string;
  slot_id: string | null;
  analyst_id: string | null;
  analyst_name: string | null;
  requested_by_name: string | null;
  match_id: string | null;
  focus: string;
  status: 'requested' | 'confirmed' | 'done' | 'cancelled';
  starts_at: string | null;
  ends_at: string | null;
  map_name: string | null;
  team_t_name: string | null;
  team_ct_name: string | null;
  score_t: number | null;
  score_ct: number | null;
  report_status: string | null;
  queue_position: number | null;
  created_at: string;
}

export interface AnalystReport {
  id: string;
  match_id: string;
  booking_id: string | null;
  analyst_name?: string | null;
  status: 'ai_draft' | 'in_review' | 'human_final';
  summary: string;
  sections: { key: string; title: string; body: string; source: string }[];
  updated_at: string;
  finalized_at: string | null;
}

export interface CommsReport {
  has_voice: boolean;
  voice: { available: boolean; reason: string | null; message: string | null };
  summary: { pings: number; chat_messages: number; contacts: number; contacts_pinged_pct: number | null; late_pings: number; unmarked_contacts: number; duplicate_pings: number };
  players: Record<string, Record<string, number>>;
  events: { type: string; round: number; tick: number; player: string; team?: string; text: string; delay_s?: number }[];
  chat: { tick: number; round: number; player: string | null; side: string | null; time: number | null; text: string }[];
  notes: string[];
}

export interface TeamProfile {
  team: string;
  matches: number;
  wins: number;
  counters: Record<string, number>;
  metrics: MetricValues;
  sites: Record<string, number>;
  win_reasons: Record<string, number>;
  maps: { map: string; matches: number; wins: number; metrics: MetricValues }[];
  recent: { match_id: string; map: string; won: boolean | null; date: string; team_t_name: string; team_ct_name: string; score_t: number; score_ct: number; series: TeamBlock['series'] }[];
  players: { name: string; matches: number; metrics: MetricValues }[];
}

export interface ScoutingReport extends TeamProfile {
  utility_clusters: Record<string, Record<string, { grenade_type: string; count: number; x: number; y: number; from_x: number; from_y: number; players: Record<string, number>; matches: number }[]>>;
  early_positions: { side: string; place: string; map_name: string; n: number }[];
  awp_players: Record<string, number>;
  opening_players: Record<string, number>;
  kill_places: Record<string, number>;
  pistols: { round: number; won: boolean; map: string; match_id: string }[];
  kill_points: { killer: string; weapon: string; killer_place: string; killer_side: string; map_name: string; killer_x: number; killer_y: number }[];
}

export interface HeatPoint {
  player: string;
  x: number;
  y: number;
  side: 'CT' | 'T' | null;
  place: string | null;
  round_number: number;
  tick: number;
}
