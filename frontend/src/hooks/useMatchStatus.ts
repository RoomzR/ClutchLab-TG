import { useQuery } from '@tanstack/react-query';
import { getMatchStatus } from '../api/matches';

export function useMatchStatus(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'status'],
    queryFn: () => getMatchStatus(matchId!),
    enabled: !!matchId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'pending' || status === 'parsing') {
        return 2000;
      }
      return false;
    },
  });
}
