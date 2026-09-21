import type {
  FlashEvent,
  GrenadeSpot,
  PlayerHabitsData,
  PlayerStats,
  DuelRecord,
  PurchaseEvent,
} from '../types/match';
import { apiClient } from './client';

export async function getPlayerHabits(
  matchId: string,
  playerName: string,
): Promise<PlayerHabitsData> {
  const { data } = await apiClient.get<PlayerHabitsData>(
    `/matches/${matchId}/players/${encodeURIComponent(playerName)}/habits`,
  );
  return data;
}

export async function getPlayerPurchases(
  matchId: string,
  playerName: string,
): Promise<PurchaseEvent[]> {
  const { data } = await apiClient.get<PurchaseEvent[]>(
    `/matches/${matchId}/players/${encodeURIComponent(playerName)}/purchases`,
  );
  return data;
}

export async function getPlayerFlashEvents(
  matchId: string,
  playerName: string,
): Promise<FlashEvent[]> {
  const { data } = await apiClient.get<FlashEvent[]>(
    `/matches/${matchId}/players/${encodeURIComponent(playerName)}/flash-events`,
  );
  return data;
}

export async function getPlayerStats(
  matchId: string,
  playerName: string,
): Promise<PlayerStats> {
  const { data } = await apiClient.get<PlayerStats>(
    `/matches/${matchId}/players/${encodeURIComponent(playerName)}/stats`,
  );
  return data;
}

export async function getPlayerDuels(
  matchId: string,
  playerName: string,
): Promise<DuelRecord[]> {
  const { data } = await apiClient.get<DuelRecord[]>(
    `/matches/${matchId}/players/${encodeURIComponent(playerName)}/duels`,
  );
  return data;
}

export async function getPlayerGrenadeSpots(
  matchId: string,
  playerName: string,
): Promise<GrenadeSpot[]> {
  const { data } = await apiClient.get<GrenadeSpot[]>(
    `/matches/${matchId}/players/${encodeURIComponent(playerName)}/grenade-spots`,
  );
  return data;
}
