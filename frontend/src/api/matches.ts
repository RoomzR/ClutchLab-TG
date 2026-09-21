import type {
  GrenadeData,
  GrenadesParams,
  HeatmapParams,
  HeatmapPoint,
  KillData,
  MatchListItem,
  MatchOverview,
  MatchPurchase,
  MatchStatus,
  BombEvent,
  PositionsParams,
  RoundData,
  RoundPause,
  TickData,
  UploadResponse,
} from '../types/match';
import { apiClient } from './client';

export async function uploadDemo(
  file: File,
  onProgress?: (pct: number) => void,
  signal?: AbortSignal,
  options?: { folderId?: string | null; tournamentId?: string | null; stage?: string },
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (options?.folderId) formData.append('folder_id', options.folderId);
  if (options?.tournamentId) formData.append('tournament_id', options.tournamentId);
  if (options?.stage) formData.append('stage', options.stage);

  const { data } = await apiClient.post<UploadResponse>('/matches/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
    onUploadProgress: (event) => {
      if (event.total && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });

  return data;
}

export async function getMatchStatus(matchId: string): Promise<MatchStatus> {
  const { data } = await apiClient.get<MatchStatus>(`/matches/${matchId}/status`);
  return data;
}

export async function getMatchOverview(matchId: string): Promise<MatchOverview> {
  const { data } = await apiClient.get<MatchOverview>(`/matches/${matchId}`);
  return data;
}

export async function getPositions(
  matchId: string,
  params?: PositionsParams,
): Promise<TickData[]> {
  const { data } = await apiClient.get<TickData[]>(`/matches/${matchId}/positions`, {
    params: {
      round_number: params?.round_number,
      round_numbers: params?.round_numbers?.join(','),
      tick_start: params?.tick_start,
      tick_end: params?.tick_end,
      player_names: params?.player_names?.join(','),
      team: params?.team,
    },
  });
  return data;
}

export async function getGrenades(
  matchId: string,
  params?: GrenadesParams,
): Promise<GrenadeData[]> {
  const { data } = await apiClient.get<GrenadeData[]>(`/matches/${matchId}/grenades`, {
    params: {
      round_number: params?.round_number,
      round_numbers: params?.round_numbers?.join(','),
      grenade_types: params?.grenade_types?.join(','),
      team: params?.team,
      player_name: params?.player_name,
    },
  });
  return data;
}

export async function getKills(matchId: string): Promise<KillData[]> {
  const { data } = await apiClient.get<KillData[]>(`/matches/${matchId}/kills`);
  return data;
}

export async function getBombEvents(matchId: string): Promise<BombEvent[]> {
  const { data } = await apiClient.get<BombEvent[]>(`/matches/${matchId}/bomb-events`);
  return data;
}

export async function getRounds(matchId: string): Promise<RoundData[]> {
  const { data } = await apiClient.get<RoundData[]>(`/matches/${matchId}/rounds`);
  return data;
}

export async function getRoundPauses(matchId: string): Promise<RoundPause[]> {
  const { data } = await apiClient.get<RoundPause[]>(`/matches/${matchId}/round-pauses`);
  return data;
}

export async function listMatches(limit = 40, pro?: boolean): Promise<MatchListItem[]> {
  const { data } = await apiClient.get<MatchListItem[]>('/matches', {
    params: { limit, pro },
  });
  return data;
}

export async function getMatchPurchases(matchId: string): Promise<MatchPurchase[]> {
  const { data } = await apiClient.get<MatchPurchase[]>(`/matches/${matchId}/purchases`);
  return data;
}

export async function getHeatmap(
  matchId: string,
  playerName: string,
  params?: HeatmapParams,
): Promise<HeatmapPoint[]> {
  const { data } = await apiClient.get<HeatmapPoint[]>(
    `/matches/${matchId}/heatmap/${encodeURIComponent(playerName)}`,
    {
      params: {
        round_number: params?.round_number,
        round_numbers: params?.round_numbers?.join(','),
      },
    },
  );
  return data;
}
