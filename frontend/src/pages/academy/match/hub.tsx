import { createContext, useContext } from 'react';
import type { MatchSummary, PlayerBlock } from '../../../types/academy';

export type HubTab = 'overview' | 'review' | 'players' | 'duels' | 'utility' | 'heatmaps' | 'economy' | 'mistakes' | 'comms' | 'coach' | 'report';

export interface HubCtx {
  matchId: string;
  summary: MatchSummary;
  tickRate: number;
  isStaff: boolean;
  openMoment: (round: number, tick?: number | null, player?: string | null) => void;
  setTab: (tab: HubTab) => void;
  teamPlayers: (team: string) => PlayerBlock[];
}

export const HubContext = createContext<HubCtx | null>(null);

export function useHub(): HubCtx {
  const ctx = useContext(HubContext);
  if (!ctx) throw new Error('useHub outside MatchHubPage');
  return ctx;
}
