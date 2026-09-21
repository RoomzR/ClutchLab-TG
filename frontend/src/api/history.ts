import type { PlayerHistory, TrackedPlayer } from '../types/match';
import { apiClient } from './client';

export async function listTrackedPlayers(limit = 80): Promise<TrackedPlayer[]> {
  const { data } = await apiClient.get<TrackedPlayer[]>('/history/players', { params: { limit } });
  return data;
}

export async function getPlayerHistory(playerName: string): Promise<PlayerHistory> {
  const { data } = await apiClient.get<PlayerHistory>(
    `/history/players/${encodeURIComponent(playerName)}`,
  );
  return data;
}
