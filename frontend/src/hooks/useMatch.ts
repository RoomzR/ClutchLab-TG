import { useQuery } from '@tanstack/react-query';
import {
  getGrenades,
  getHeatmap,
  getKills,
  getMatchOverview,
  getMatchPurchases,
  getBombEvents,
  getPositions,
  getRounds,
  getRoundPauses,
  listMatches,
} from '../api/matches';
import type { GrenadesParams, HeatmapParams, PositionsParams } from '../types/match';

export function useMatchOverview(matchId: string | undefined) {
  return useQuery({
    queryKey: ['match', matchId, 'overview'],
    queryFn: () => getMatchOverview(matchId!),
    enabled: !!matchId,
  });
}

export function useMatchPositions(
  matchId: string | undefined,
  params?: PositionsParams,
  enabled = true,
) {
  return useQuery({
    queryKey: ['match', matchId, 'positions', params],
    queryFn: () => getPositions(matchId!, params),
    enabled: !!matchId && enabled,
  });
}

export function useMatchGrenades(
  matchId: string | undefined,
  params?: GrenadesParams,
  enabled = true,
) {
  return useQuery({
    queryKey: ['match', matchId, 'grenades', params],
    queryFn: () => getGrenades(matchId!, params),
    enabled: !!matchId && enabled,
  });
}

export function useMatchKills(matchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['match', matchId, 'kills'],
    queryFn: () => getKills(matchId!),
    enabled: !!matchId && enabled,
  });
}

export function useMatchBombEvents(matchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['match', matchId, 'bomb-events'],
    queryFn: () => getBombEvents(matchId!),
    enabled: !!matchId && enabled,
  });
}

export function useMatchRounds(matchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['match', matchId, 'rounds'],
    queryFn: () => getRounds(matchId!),
    enabled: !!matchId && enabled,
  });
}

export function useMatchRoundPauses(matchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['match', matchId, 'round-pauses'],
    queryFn: () => getRoundPauses(matchId!),
    enabled: !!matchId && enabled,
  });
}

export function useMatchHeatmap(
  matchId: string | undefined,
  playerName: string | undefined,
  params?: HeatmapParams,
  enabled = true,
) {
  return useQuery({
    queryKey: ['match', matchId, 'heatmap', playerName, params],
    queryFn: () => getHeatmap(matchId!, playerName!, params),
    enabled: !!matchId && !!playerName && enabled,
  });
}

export function useMatchPurchases(matchId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['match', matchId, 'purchases'],
    queryFn: () => getMatchPurchases(matchId!),
    enabled: !!matchId && enabled,
  });
}

export function useMatchList(enabled = true) {
  return useQuery({
    queryKey: ['matches', 'list'],
    queryFn: () => listMatches(),
    enabled,
  });
}
