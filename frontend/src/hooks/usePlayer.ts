import { useQuery } from '@tanstack/react-query';
import {
  getPlayerDuels,
  getPlayerFlashEvents,
  getPlayerGrenadeSpots,
  getPlayerHabits,
  getPlayerPurchases,
  getPlayerStats,
} from '../api/players';

export function usePlayerHabits(matchId: string | undefined, playerName: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'player', playerName, 'habits'],
    queryFn: () => getPlayerHabits(matchId!, playerName!),
    enabled: !!matchId && !!playerName,
  });
}

export function usePlayerPurchases(matchId: string | undefined, playerName: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'player', playerName, 'purchases'],
    queryFn: () => getPlayerPurchases(matchId!, playerName!),
    enabled: !!matchId && !!playerName,
  });
}

export function usePlayerFlashEvents(matchId: string | undefined, playerName: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'player', playerName, 'flash-events'],
    queryFn: () => getPlayerFlashEvents(matchId!, playerName!),
    enabled: !!matchId && !!playerName,
  });
}

export function usePlayerStats(matchId: string | undefined, playerName: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'player', playerName, 'stats'],
    queryFn: () => getPlayerStats(matchId!, playerName!),
    enabled: !!matchId && !!playerName,
    retry: false,
  });
}

export function usePlayerDuels(matchId: string | undefined, playerName: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'player', playerName, 'duels'],
    queryFn: () => getPlayerDuels(matchId!, playerName!),
    enabled: !!matchId && !!playerName,
    retry: false,
  });
}

export function usePlayerGrenadeSpots(matchId: string | undefined, playerName: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'player', playerName, 'grenade-spots'],
    queryFn: () => getPlayerGrenadeSpots(matchId!, playerName!),
    enabled: !!matchId && !!playerName,
    retry: false,
  });
}
