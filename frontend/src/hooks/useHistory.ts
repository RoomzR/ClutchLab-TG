import { useQuery } from '@tanstack/react-query';
import { getPlayerHistory, listTrackedPlayers } from '../api/history';

export function useTrackedPlayers(enabled = true) {
  return useQuery({
    queryKey: ['history', 'players'],
    queryFn: () => listTrackedPlayers(),
    enabled,
  });
}

export function usePlayerHistory(playerName: string | undefined) {
  return useQuery({
    queryKey: ['history', 'player', playerName],
    queryFn: () => getPlayerHistory(playerName!),
    enabled: !!playerName,
  });
}
