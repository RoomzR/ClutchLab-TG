import { apiClient } from './client';

export interface UserLimits {
  max_demos: number;
  max_file_mb: number;
}

export interface UserGamification {
  level: number;
  xp: number;
  xp_into_level: number;
  xp_for_next_level: number;
  progress_percent: number;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatar_url: string | null;
  steam_id: string | null;
  role: string;
  is_verified: boolean;
  totp_enabled?: boolean;
  discord_webhook_url?: string | null;
  created_at: string | null;
  permissions: string[];
  limits: UserLimits;
  gamification?: UserGamification;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

/** Returned by /auth/login when the account has 2FA enabled. */
export interface Pending2FA {
  requires_2fa: true;
  pending_token: string;
}

export type LoginResult = AuthTokens | Pending2FA;

export function isPending2FA(result: LoginResult): result is Pending2FA {
  return (result as Pending2FA).requires_2fa === true;
}

export interface UsageInfo {
  role: string;
  demos_used_this_month: number;
  demos_limit: number;
  demos_remaining: number;
  bonus_demos: number;
  max_file_size_mb: number;
}

export async function register(params: {
  email: string;
  username: string;
  password: string;
  referral_code?: string;
}): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>('/auth/register', params);
  return data;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const { data } = await apiClient.post<LoginResult>('/auth/login', { email, password });
  return data;
}

export async function verify2FA(pendingToken: string, code: string): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>('/auth/2fa/verify', {
    pending_token: pendingToken,
    code,
  });
  return data;
}

export async function setup2FA(): Promise<{ secret: string; otpauth_uri: string }> {
  const { data } = await apiClient.post('/auth/2fa/setup');
  return data;
}

export async function enable2FA(code: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/auth/2fa/enable', { code });
  return data;
}

export async function disable2FA(code: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/auth/2fa/disable', { code });
  return data;
}

export async function setDiscordWebhook(webhookUrl: string | null): Promise<{ detail: string }> {
  const { data } = await apiClient.put('/auth/discord-webhook', { webhook_url: webhookUrl });
  return data;
}

export async function testDiscordWebhook(): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/integrations/discord/test');
  return data;
}

export async function importFaceitMatch(matchUrl: string): Promise<{
  match_id: string;
  queue: string;
  detail: string;
}> {
  const { data } = await apiClient.post('/integrations/faceit/import', { match_url: matchUrl });
  return data;
}

export async function refreshTokens(refreshToken: string): Promise<AuthTokens> {
  const { data } = await apiClient.post<AuthTokens>('/auth/refresh', {
    refresh_token: refreshToken,
  });
  return data;
}

export async function logout(refreshToken: string): Promise<void> {
  await apiClient.post('/auth/logout', { refresh_token: refreshToken });
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await apiClient.get<AuthUser>('/auth/me');
  return data;
}

export async function updateMe(params: {
  username?: string;
  avatar_url?: string;
}): Promise<AuthUser> {
  const { data } = await apiClient.patch<AuthUser>('/auth/me', params);
  return data;
}

export async function verifyEmail(token: string): Promise<{ detail: string }> {
  const { data } = await apiClient.get<{ detail: string }>(`/auth/verify-email/${token}`);
  return data;
}

export async function forgotPassword(email: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post<{ detail: string }>('/auth/forgot-password', { email });
  return data;
}

export async function resetPassword(token: string, password: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post<{ detail: string }>(
    `/auth/reset-password/${token}`,
    { password },
  );
  return data;
}

export async function getUsage(): Promise<UsageInfo> {
  const { data } = await apiClient.get<UsageInfo>('/auth/usage');
  return data;
}

export async function getSteamAuthorizeUrl(): Promise<{ url: string }> {
  const { data } = await apiClient.get<{ url: string }>('/auth/steam/authorize-url');
  return data;
}

export async function linkSteam(openidParams: Record<string, string>): Promise<{ steam_id: string }> {
  const { data } = await apiClient.post<{ steam_id: string }>('/auth/link-steam', {
    openid_params: openidParams,
  });
  return data;
}
