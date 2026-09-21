import { apiClient } from './client';

export interface PlatformStats {
  users: { total: number; new_week: number; verified: number };
  subscriptions: Record<string, number>;
  demo_uploads: { total: number; this_month: number };
  matches: { total: number; ready: number; failed: number };
  revenue: { total: number; this_month: number };
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: string;
  is_active: boolean;
  is_verified: boolean;
  xp: number;
  last_login_at: string | null;
  created_at: string;
}

export interface AdminPromo {
  id: string;
  code: string;
  discount_percent: number;
  max_uses: number;
  current_uses: number;
  plan_type: string | null;
  expires_at: string | null;
}

export async function getPlatformStats(): Promise<PlatformStats> {
  const { data } = await apiClient.get<PlatformStats>('/admin/stats');
  return data;
}

export async function listAdminUsers(search = ''): Promise<AdminUser[]> {
  const { data } = await apiClient.get<AdminUser[]>('/admin/users', {
    params: { search },
  });
  return data;
}

export async function changeUserRole(userId: string, role: string): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/admin/users/role', { user_id: userId, role });
  return data;
}

export async function setUserActive(userId: string, isActive: boolean): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/admin/users/active', {
    user_id: userId,
    is_active: isActive,
  });
  return data;
}

export async function grantDemos(userId: string, amount: number): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/admin/users/grant-demos', {
    user_id: userId,
    amount,
  });
  return data;
}

export async function listPromoCodes(): Promise<AdminPromo[]> {
  const { data } = await apiClient.get<AdminPromo[]>('/admin/promo');
  return data;
}

export async function createPromoCode(params: {
  code: string;
  discount_percent: number;
  max_uses: number;
  plan_type?: string;
}): Promise<{ detail: string }> {
  const { data } = await apiClient.post('/admin/promo', params);
  return data;
}

export async function deletePromoCode(promoId: string): Promise<{ detail: string }> {
  const { data } = await apiClient.delete(`/admin/promo/${promoId}`);
  return data;
}

export async function setMatchPro(matchId: string, isPro: boolean): Promise<{ detail: string }> {
  const { data } = await apiClient.patch(`/admin/matches/${matchId}/pro`, { is_pro: isPro });
  return data;
}
