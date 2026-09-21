import { apiClient } from './client';

export interface ClanMember {
  user_id: string;
  username: string;
  avatar_url: string | null;
  clan_role: 'owner' | 'admin' | 'member';
  plan_role: string;
  xp: number;
  joined_at: string;
}

export interface ClanStats {
  member_count: number;
  demos_analyzed: number;
  total_xp: number;
  top_maps: { map: string; games: number }[];
}

export interface Clan {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  logo_url: string | null;
  is_public: boolean;
  owner_id: string;
  created_at: string;
  members: ClanMember[];
  stats: ClanStats;
  my_role?: string;
}

export interface PublicClan {
  id: string;
  name: string;
  tag: string;
  logo_url: string | null;
  description: string | null;
  members: number;
  total_xp: number;
}

export async function getMyClan(): Promise<{ clan: Clan | null }> {
  const { data } = await apiClient.get<{ clan: Clan | null }>('/clans/mine');
  return data;
}

export async function createClan(params: {
  name: string;
  tag: string;
  description?: string;
  logo_url?: string;
}): Promise<Clan> {
  const { data } = await apiClient.post<Clan>('/clans', params);
  return data;
}

export async function getPublicClans(): Promise<PublicClan[]> {
  const { data } = await apiClient.get<PublicClan[]>('/clans/public');
  return data;
}

export async function createClanInvite(): Promise<{ code: string; expires_in_days: number }> {
  const { data } = await apiClient.post('/clans/invite');
  return data;
}

export async function joinClan(code: string): Promise<Clan> {
  const { data } = await apiClient.post<Clan>('/clans/join', { code });
  return data;
}

export async function leaveClan(): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/clans/leave');
  return data;
}

export async function kickClanMember(userId: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/clans/kick', { user_id: userId });
  return data;
}

export async function promoteClanMember(userId: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/clans/promote', { user_id: userId });
  return data;
}

export async function updateClan(params: {
  description?: string;
  logo_url?: string;
  is_public?: boolean;
}): Promise<Clan> {
  const { data } = await apiClient.patch<Clan>('/clans/mine', params);
  return data;
}
