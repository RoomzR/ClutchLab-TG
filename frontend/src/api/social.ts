import { apiClient } from './client';

export interface FeedEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
  username: string;
  avatar_url: string | null;
  level: number;
  role: string;
  is_me: boolean;
  is_following: boolean;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
}

export interface FeedComment {
  id: string;
  text: string;
  created_at: string;
  username: string;
  avatar_url: string | null;
  level: number;
  is_me: boolean;
}

export type FeedScope = 'global' | 'following' | 'clan';

export interface Challenge {
  code: string;
  name: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  claimed: boolean;
  reward_xp: number;
  reward_demos: number;
}

export interface ChallengesResponse {
  week_start: string;
  ends_in_hours: number;
  challenges: Challenge[];
}

export async function getFeed(scope: FeedScope = 'global'): Promise<FeedEvent[]> {
  const { data } = await apiClient.get<FeedEvent[]>('/social/feed', { params: { scope } });
  return data;
}

export async function followUser(username: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post(`/social/follow/${encodeURIComponent(username)}`);
  return data;
}

export async function unfollowUser(username: string): Promise<{ detail: string }> {
  const { data } = await apiClient.delete(`/social/follow/${encodeURIComponent(username)}`);
  return data;
}

export async function getCurrentChallenges(): Promise<ChallengesResponse> {
  const { data } = await apiClient.get<ChallengesResponse>('/challenges/current');
  return data;
}

export async function claimChallenge(code: string): Promise<{
  detail: string;
  reward_xp: number;
  reward_demos: number;
}> {
  const { data } = await apiClient.post(`/challenges/${code}/claim`);
  return data;
}

export async function likeActivity(activityId: string): Promise<void> {
  await apiClient.post(`/social/feed/${activityId}/like`);
}

export async function unlikeActivity(activityId: string): Promise<void> {
  await apiClient.delete(`/social/feed/${activityId}/like`);
}

export async function getComments(activityId: string): Promise<FeedComment[]> {
  const { data } = await apiClient.get<FeedComment[]>(`/social/feed/${activityId}/comments`);
  return data;
}

export async function addComment(activityId: string, text: string): Promise<FeedComment> {
  const { data } = await apiClient.post<FeedComment>(`/social/feed/${activityId}/comments`, {
    text,
  });
  return data;
}

export async function deleteComment(commentId: string): Promise<void> {
  await apiClient.delete(`/social/comments/${commentId}`);
}
