import { apiClient } from './client';

export interface Tournament {
  id: string;
  name: string;
  description: string;
  status: string;
  owner: string | null;
  match_count: number;
  created_at: string;
}

export interface TournamentMatch {
  match_id: string;
  map_name: string;
  score_t: number;
  score_ct: number;
  team_t_name: string;
  team_ct_name: string;
  stage: string;
  created_at?: string | null;
}

export interface TournamentPlayerStat {
  name: string;
  kills: number;
  deaths: number;
  assists: number;
  headshots: number;
  headshot_pct: number;
  kd: number;
  kpr: number;
  dpr: number;
  adr: number;
  kast: number;
  impact: number;
  rating: number;
  rating_1: number;
  opening_kills: number;
  opening_deaths: number;
  fk_diff: number;
  multi_2k: number;
  multi_3k: number;
  multi_4k: number;
  multi_5k: number;
  rounds: number;
  matches_played: number;
  weapons: { weapon: string; kills: number }[];
  maps: { map_name: string; rounds: number; kills: number; deaths: number; kd: number; kpr: number }[];
  form: { match_id: string; map_name: string | null; rating: number; kills: number; deaths: number; score: string }[];
}

export interface TournamentAward {
  name: string;
  value: number;
}

export interface TournamentDetail extends Tournament {
  matches: TournamentMatch[];
  player_stats: TournamentPlayerStat[];
  mvp: string | null;
  awards: Record<string, TournamentAward | null>;
  map_pool: { map_name: string; matches: number }[];
  head_to_head: { a: string; b: string; a_kills: number; b_kills: number; total: number }[];
  summary: {
    matches: number;
    rounds: number;
    total_kills: number;
    players: number;
    avg_rating: number;
  };
  folders: { id: string; name: string; color: string; match_count: number }[];
  rating_note?: string;
}

export interface TournamentPlayerProfile {
  player: TournamentPlayerStat;
  duels: {
    a: string;
    b: string;
    a_kills: number;
    b_kills: number;
    total: number;
    opponent: string;
    won: number;
    lost: number;
  }[];
  tournament_mvp: string | null;
  summary: TournamentDetail['summary'];
}

export async function createTournament(payload: {
  name: string;
  description?: string;
}): Promise<Tournament> {
  const { data } = await apiClient.post<Tournament>('/tournaments', payload);
  return data;
}

export async function listTournaments(): Promise<Tournament[]> {
  const { data } = await apiClient.get<Tournament[]>('/tournaments');
  return data;
}

export async function getTournament(id: string): Promise<TournamentDetail> {
  const { data } = await apiClient.get<TournamentDetail>(`/tournaments/${id}`);
  return data;
}

export async function getTournamentPlayer(
  tournamentId: string,
  playerName: string,
): Promise<TournamentPlayerProfile> {
  const { data } = await apiClient.get<TournamentPlayerProfile>(
    `/tournaments/${tournamentId}/players/${encodeURIComponent(playerName)}`,
  );
  return data;
}

export async function addTournamentMatch(
  tournamentId: string,
  matchId: string,
  stage = 'group',
): Promise<void> {
  await apiClient.post(`/tournaments/${tournamentId}/matches`, { match_id: matchId, stage });
}

export async function importFolderIntoTournament(
  tournamentId: string,
  folderId: string,
  stage = 'group',
): Promise<{ added: number }> {
  const { data } = await apiClient.post<{ detail: string; added: number }>(
    `/tournaments/${tournamentId}/import-folder`,
    { folder_id: folderId, stage },
  );
  return data;
}

export async function removeTournamentMatch(tournamentId: string, matchId: string): Promise<void> {
  await apiClient.delete(`/tournaments/${tournamentId}/matches/${matchId}`);
}

export async function deleteTournament(tournamentId: string): Promise<void> {
  await apiClient.delete(`/tournaments/${tournamentId}`);
}
