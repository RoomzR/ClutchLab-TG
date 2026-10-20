import type {
  AcademyMatch,
  AcademyMe,
  AcademyPlayerRow,
  AnalystBooking,
  AnalystReport,
  AnalystSlot,
  Board,
  BoardShape,
  ChatMessage,
  CommsReport,
  HeatPoint,
  Homework,
  Lineup,
  MatchSummary,
  MetricsRegistry,
  MetricValues,
  Mistake,
  PlayerProfile,
  RoundReview,
  RoundSummary,
  ScoutingReport,
  TeamProfile,
  TrainingPlan,
} from '../types/academy';
import type { TickData } from '../types/match';
import { apiClient } from './client';

const A = '/academy';

const get = async <T>(url: string, params?: Record<string, unknown>) => (await apiClient.get<T>(url, { params })).data;
const post = async <T>(url: string, body?: unknown, params?: Record<string, unknown>) =>
  (await apiClient.post<T>(url, body ?? {}, { params })).data;
const patch = async <T>(url: string, body: unknown) => (await apiClient.patch<T>(url, body)).data;
const del = async <T>(url: string) => (await apiClient.delete<T>(url)).data;

export interface MatchFilters {
  map_name?: string;
  match_type?: string;
  team?: string;
  q?: string;
  status?: string;
  reviewed?: boolean;
  open_mistakes?: boolean;
  limit?: number;
}

export interface StatFilters {
  last?: number;
  map_name?: string;
  match_type?: string;
  side?: string;
}

export const academyApi = {
  me: () => get<AcademyMe>(`${A}/me`),
  metrics: () => get<MetricsRegistry>(`${A}/metrics`),
  aiStatus: () => get<{ available: boolean; provider: string | null; model: string | null; note: string | null }>(`${A}/ai/status`),

  matches: (f: MatchFilters = {}) => get<AcademyMatch[]>(`${A}/matches`, f as Record<string, unknown>),
  matchSummary: (id: string) => get<MatchSummary>(`${A}/matches/${id}/summary`),
  matchStatus: (id: string) =>
    get<{ status: string; progress: number; message: string | null; analysis_status: string; job: { status: string; attempt: number; error: string | null } | null; queue: { high: number; normal: number } }>(
      `${A}/matches/${id}/status`,
    ),
  updateMatch: (id: string, body: { match_type?: string; opponent_name?: string; played_at?: string }) => patch(`${A}/matches/${id}`, body),
  deleteMatch: (id: string) => del(`${A}/matches/${id}`),
  reparse: (id: string) => post(`${A}/matches/${id}/reparse`),
  reanalyze: (id: string) => post(`${A}/matches/${id}/reanalyze`),
  roundDetail: (id: string, round: number) =>
    get<{ summary: RoundSummary; review: { data: RoundReview; source: string; model: string | null } | null; mistakes: Mistake[]; notes: Note[]; damage: { attacker: string; victim: string; dmg: number; hits: number }[] }>(
      `${A}/matches/${id}/rounds/${round}`,
    ),
  duels: (id: string) =>
    get<{ kills: { killer: string; victim: string; kills: number; hs: number }[]; damage: { attacker: string; victim: string; dmg: number }[]; weapons: { killer: string; weapon: string; kills: number }[]; distance: Record<string, Record<string, { kills: number; deaths: number }>> }>(
      `${A}/matches/${id}/duels`,
    ),
  matchHeatmap: (id: string, params: { kind: string; player?: string; side?: string; round_number?: number }) =>
    get<HeatPoint[]>(`${A}/matches/${id}/heatmap`, params),
  jobs: () => get<{ jobs: ParseJob[]; queue: { high: number; normal: number } }>(`${A}/jobs`),

  roundPositions: (id: string, round: number, step = 4) => get<TickData[]>(`/matches/${id}/positions`, { round_number: round, step }),
  roundGrenades: (id: string, round: number) => get<import('../types/match').GrenadeData[]>(`/matches/${id}/grenades`, { round_number: round }),
  bombEvents: (id: string) => get<import('../types/match').BombEvent[]>(`/matches/${id}/bomb-events`),

  players: (f: StatFilters & { roster_only?: boolean } = {}) => get<AcademyPlayerRow[]>(`${A}/players`, f as Record<string, unknown>),
  player: (name: string, f: StatFilters & { date_from?: string; date_to?: string } = {}) =>
    get<PlayerProfile>(`${A}/players/${encodeURIComponent(name)}`, f as Record<string, unknown>),
  playerHeatmap: (name: string, params: { map_name: string; kind: string; side?: string; last?: number }) =>
    get<(HeatPoint & { weapon: string; match_id: string })[]>(`${A}/players/${encodeURIComponent(name)}/heatmap`, params),
  mistakesProgress: (name: string) =>
    get<{ matches: { match_id: string; date: string; map: string; counts: Record<string, number> }[]; types: { type: string; title: string; total: number; statuses: Record<string, number>; trend: string }[] }>(
      `${A}/players/${encodeURIComponent(name)}/mistakes/progress`,
    ),
  compare: (players: string[], f: StatFilters = {}) =>
    get<{ players: { name: string; matches: number; metrics: MetricValues; percentiles: MetricValues; radar: Record<string, number | null> }[]; groups: { id: string; ru: string }[]; population_size: number }>(
      `${A}/compare`,
      { players: players.join(','), ...f },
    ),
  comparePeriods: (player: string, a: [string, string], b: [string, string]) =>
    get<{ a: { matches: number; metrics: MetricValues }; b: { matches: number; metrics: MetricValues } }>(`${A}/compare/periods`, {
      player, a_from: a[0], a_to: a[1], b_from: b[0], b_to: b[1],
    }),
  teams: () => get<{ team_name: string; matches: number; wins: number; last_played: string; maps: string[]; is_academy: boolean }[]>(`${A}/teams`),
  team: (name: string, f: { map_name?: string; last?: number } = {}) => get<TeamProfile>(`${A}/teams/${encodeURIComponent(name)}`, f),
  scouting: (opponent: string, f: { map_name?: string; last?: number } = {}) => get<ScoutingReport>(`${A}/scouting`, { opponent, ...f }),

  matchMistakes: (id: string) => get<Mistake[]>(`${A}/matches/${id}/mistakes`),
  mistakes: (f: { player?: string; status?: string; type?: string; limit?: number } = {}) => get<Mistake[]>(`${A}/mistakes`, f),
  updateMistake: (id: string, body: { status?: string; coach_comment?: string }) => patch(`${A}/mistakes/${id}`, body),
  assignHomework: (id: string, body: { title?: string; description?: string; due_date?: string } = {}) =>
    post<{ id: string }>(`${A}/mistakes/${id}/homework`, body),

  homework: (f: { player?: string; status?: string } = {}) => get<Homework[]>(`${A}/homework`, f),
  createHomework: (body: Partial<Homework> & { player_name: string; title: string }) => post<{ id: string }>(`${A}/homework`, body),
  updateHomework: (id: string, body: Partial<Pick<Homework, 'status' | 'title' | 'description' | 'due_date'>>) => patch(`${A}/homework/${id}`, body),
  deleteHomework: (id: string) => del(`${A}/homework/${id}`),
  verifyHomework: (player: string) => post<{ changed: number }>(`${A}/homework/verify`, {}, { player }),
  generatePlan: (name: string, last = 10) => post<TrainingPlan>(`${A}/players/${encodeURIComponent(name)}/training-plan`, {}, { last }),
  plans: (name: string) => get<TrainingPlan[]>(`${A}/players/${encodeURIComponent(name)}/training-plans`),

  reviews: (id: string) => get<{ round: number; review: RoundReview; source: string; model: string | null }[]>(`${A}/matches/${id}/reviews`),
  llmReviews: (id: string, rounds?: number[]) => post<{ updated: number }>(`${A}/matches/${id}/reviews/llm`, {}, rounds ? { rounds: rounds.join(',') } : undefined),
  chatSessions: (id: string) => get<{ id: string; title: string; created_at: string; messages: number }[]>(`${A}/matches/${id}/chat/sessions`),
  createChatSession: (id: string) => post<{ id: string; title: string }>(`${A}/matches/${id}/chat/sessions`, {}),
  chatMessages: (sid: string) => get<ChatMessage[]>(`${A}/chat/sessions/${sid}/messages`),
  sendChat: (sid: string, content: string) => post<ChatMessage>(`${A}/chat/sessions/${sid}/messages`, { content }),

  notes: (id: string) => get<Note[]>(`${A}/matches/${id}/notes`),
  addNote: (id: string, body: { round_number?: number | null; tick?: number | null; player_name?: string | null; text: string }) => post<Note>(`${A}/matches/${id}/notes`, body),
  deleteNote: (noteId: string) => del(`${A}/notes/${noteId}`),
  comms: (id: string) => get<CommsReport>(`${A}/matches/${id}/comms`),

  lineups: (f: { map_name?: string; side?: string; grenade_type?: string; q?: string } = {}) => get<Lineup[]>(`${A}/lineups`, f),
  createLineup: (body: Partial<Lineup>) => post<Lineup>(`${A}/lineups`, body),
  updateLineup: (id: string, body: Partial<Lineup>) => patch<Lineup>(`${A}/lineups/${id}`, body),
  deleteLineup: (id: string) => del(`${A}/lineups/${id}`),
  uploadLineupVideo: async (id: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return (await apiClient.post(`${A}/lineups/${id}/video`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },
  lineupFromGrenade: (body: { match_id: string; tick: number; player_name: string; title: string; target?: string }) =>
    post<Lineup>(`${A}/lineups/from-grenade`, body),
  compareThrows: (id: string, player?: string) =>
    get<{ lineup: Lineup; throws: { match_id: string; player_name: string; tick: number; round_number: number; from_x: number; from_y: number; to_x: number; to_y: number; distance: number; hit: boolean; played_at: string }[]; players: { player: string; throws: number; hit_pct: number; avg_distance: number }[]; hit_radius: number }>(
      `${A}/lineups/${id}/compare`,
      player ? { player } : undefined,
    ),

  boards: (match_id?: string) => get<Board[]>(`${A}/boards`, match_id ? { match_id } : undefined),
  board: (id: string) => get<Board>(`${A}/boards/${id}`),
  createBoard: (body: { map_name: string; title?: string; match_id?: string | null; round_number?: number | null; tick?: number | null }) => post<Board>(`${A}/boards`, body),
  updateBoard: (id: string, body: { title?: string; shapes?: BoardShape[] }) => patch(`${A}/boards/${id}`, body),
  deleteBoard: (id: string) => del(`${A}/boards/${id}`),

  analysts: () => get<{ id: string; username: string; academy_role: string }[]>(`${A}/analysts`),
  slots: () => get<AnalystSlot[]>(`${A}/analyst/slots`),
  createSlot: (body: { starts_at: string; ends_at: string; note?: string }) => post<AnalystSlot>(`${A}/analyst/slots`, body),
  deleteSlot: (id: string) => del(`${A}/analyst/slots/${id}`),
  bookings: (status?: string) => get<AnalystBooking[]>(`${A}/analyst/bookings`, status ? { status } : undefined),
  createBooking: (body: { match_id: string; slot_id?: string | null; focus?: string }) => post<AnalystBooking>(`${A}/analyst/bookings`, body),
  updateBooking: (id: string, body: { status?: string; slot_id?: string; analyst_id?: string }) => patch(`${A}/analyst/bookings/${id}`, body),
  bookingComments: (id: string) => get<{ id: string; author_name: string; text: string; created_at: string }[]>(`${A}/analyst/bookings/${id}/comments`),
  addBookingComment: (id: string, text: string) => post(`${A}/analyst/bookings/${id}/comments`, { text }),
  report: (matchId: string) => get<AnalystReport | null>(`${A}/matches/${matchId}/analyst-report`),
  createDraft: (matchId: string, bookingId?: string) => post<AnalystReport>(`${A}/matches/${matchId}/analyst-report/draft`, {}, bookingId ? { booking_id: bookingId } : undefined),
  updateReport: (id: string, body: Partial<Pick<AnalystReport, 'summary' | 'sections' | 'status'>>) => patch(`${A}/analyst-reports/${id}`, body),

  org: () => get<{ id: string; name: string; retention_days: number; counts: Record<string, number> }>(`${A}/org`),
  updateOrg: (body: { name?: string; retention_days?: number }) => patch(`${A}/org`, body),
  members: () => get<{ id: string; username: string; email: string; role: string; academy_role: string; player_name: string | null; last_login_at: string | null }[]>(`${A}/members`),
  updateMember: (id: string, body: { academy_role?: string; player_name?: string }) => patch(`${A}/members/${id}`, body),
  roster: () => get<{ id: string; player_name: string; steam_id: string | null; team_name: string | null; ingame_role: string | null; active: boolean; username: string | null }[]>(`${A}/roster`),
  addRoster: (body: { player_name: string; steam_id?: string; team_id?: string; ingame_role?: string; user_id?: string }) => post(`${A}/roster`, body),
  removeRoster: (id: string) => del(`${A}/roster/${id}`),
  academyTeams: () => get<{ id: string; name: string; tag: string | null; demo_names: string[] }[]>(`${A}/academy-teams`),
  createAcademyTeam: (body: { name: string; tag?: string; demo_names?: string[] }) => post(`${A}/academy-teams`, body),
  deleteAcademyTeam: (id: string) => del(`${A}/academy-teams/${id}`),
};

export interface Note {
  id: string;
  match_id: string;
  round_number: number | null;
  tick: number | null;
  player_name: string | null;
  author_name: string | null;
  author_id: string | null;
  text: string;
  created_at: string;
}

export interface ParseJob {
  id: string;
  match_id: string;
  kind: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  attempt: number;
  error: string | null;
  worker: string | null;
  duration_ms: number | null;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  map_name: string | null;
  team_t_name: string | null;
  team_ct_name: string | null;
  original_filename: string | null;
  match_status: string;
}

export async function uploadAcademyDemo(
  file: File,
  meta: { match_type: string; opponent_name?: string; played_at?: string },
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
): Promise<{ match_id: string; queue: string; size_bytes: number }> {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('match_type', meta.match_type);
  if (meta.opponent_name) fd.append('opponent_name', meta.opponent_name);
  if (meta.played_at) fd.append('played_at', meta.played_at);
  const { data } = await apiClient.post('/matches/upload', fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 0,
    signal,
    onUploadProgress: (e) => {
      if (e.total && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}
