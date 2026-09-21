import { apiClient } from './client';

export interface DemoFolder {
  id: string;
  name: string;
  description: string;
  color: string;
  tournament_id: string | null;
  match_count: number;
  created_at: string;
}

export interface FolderMatch {
  match_id: string;
  map_name: string | null;
  score_t: number | null;
  score_ct: number | null;
  team_t_name: string | null;
  team_ct_name: string | null;
  status: string;
  progress: number | null;
  created_at: string | null;
}

export interface FolderDetail extends DemoFolder {
  matches: FolderMatch[];
}

export async function listFolders(): Promise<DemoFolder[]> {
  const { data } = await apiClient.get<DemoFolder[]>('/folders');
  return data;
}

export async function createFolder(payload: {
  name: string;
  description?: string;
  color?: string;
  tournament_id?: string | null;
}): Promise<DemoFolder> {
  const { data } = await apiClient.post<DemoFolder>('/folders', payload);
  return data;
}

export async function getFolder(id: string): Promise<FolderDetail> {
  const { data } = await apiClient.get<FolderDetail>(`/folders/${id}`);
  return data;
}

export async function deleteFolder(id: string): Promise<void> {
  await apiClient.delete(`/folders/${id}`);
}

export async function addMatchToFolder(folderId: string, matchId: string): Promise<void> {
  await apiClient.post(`/folders/${folderId}/matches`, { match_id: matchId });
}

export async function removeMatchFromFolder(folderId: string, matchId: string): Promise<void> {
  await apiClient.delete(`/folders/${folderId}/matches/${matchId}`);
}

export async function importFolderToTournament(
  folderId: string,
  tournamentId: string,
  stage = 'group',
): Promise<{ added: number }> {
  const { data } = await apiClient.post<{ detail: string; added: number }>(
    `/folders/${folderId}/import-to-tournament/${tournamentId}`,
    null,
    { params: { stage } },
  );
  return data;
}
