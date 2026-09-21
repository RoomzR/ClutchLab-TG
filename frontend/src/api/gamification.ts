import { apiClient } from './client';

export interface XpInfo {
  level: number;
  xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  progress_percent: number;
  recent_events: { amount: number; reason: string; created_at: string }[];
}

export interface Achievement {
  code: string;
  name: string;
  description: string;
  icon: string;
  xp_reward: number;
  tier: 'bronze' | 'silver' | 'gold' | 'diamond';
  earned: boolean;
  earned_at: string | null;
}

export interface AchievementsResponse {
  total: number;
  earned_count: number;
  achievements: Achievement[];
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  avatar_url: string | null;
  role: string;
  value: number;
  level: number | null;
}

export type LeaderboardType = 'xp' | 'uploads' | 'clans';

export async function getMyXp(): Promise<XpInfo> {
  const { data } = await apiClient.get<XpInfo>('/me/xp');
  return data;
}

export async function getMyAchievements(): Promise<AchievementsResponse> {
  const { data } = await apiClient.get<AchievementsResponse>('/me/achievements');
  return data;
}

export async function getLeaderboard(board: LeaderboardType): Promise<{
  board: string;
  entries: LeaderboardEntry[];
}> {
  const { data } = await apiClient.get(`/leaderboards?board=${board}`);
  return data;
}
