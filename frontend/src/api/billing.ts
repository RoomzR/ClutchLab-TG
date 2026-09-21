import { apiClient } from './client';
import { FALLBACK_PLANS } from '../data/defaultPlans';

export interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  yearly_price: number;
  max_demos: number;
  max_file_size_mb: number;
  max_users: number;
  features: string[];
}

export interface Subscription {
  id?: string;
  plan_type: string;
  status: string;
  billing_interval?: string;
  current_period_start?: string | null;
  current_period_end?: string | null;
  canceled_at?: string | null;
  is_stripe?: boolean;
}

export interface Payment {
  id: string;
  amount: number;
  currency: string;
  status: string;
  created_at: string;
}

export interface ReferralStats {
  code: string | null;
  signups: number;
  rewards: { type: string; granted_at: string }[];
  bonus_demos_total: number;
}

export async function getPlans(): Promise<Plan[]> {
  try {
    const { data } = await apiClient.get<Plan[]>('/plans');
    return data.length > 0 ? data : FALLBACK_PLANS;
  } catch {
    return FALLBACK_PLANS;
  }
}

export async function getCurrentSubscription(): Promise<Subscription> {
  const { data } = await apiClient.get<Subscription>('/subscription/current');
  return data;
}

export async function subscribe(params: {
  plan_type: string;
  billing_interval: 'monthly' | 'yearly';
  promo_code?: string;
}): Promise<{ checkout_url: string }> {
  const { data } = await apiClient.post<{ checkout_url: string }>('/subscribe', params);
  return data;
}

export async function cancelSubscription(): Promise<{ detail: string }> {
  const { data } = await apiClient.post<{ detail: string }>('/subscription/cancel');
  return data;
}

export async function reactivateSubscription(): Promise<{ detail: string }> {
  const { data } = await apiClient.post<{ detail: string }>('/subscription/reactivate');
  return data;
}

export async function getPaymentsHistory(): Promise<Payment[]> {
  const { data } = await apiClient.get<Payment[]>('/payments/history');
  return data;
}

export async function applyPromo(code: string): Promise<{
  code: string;
  discount_percent: number;
  detail: string;
}> {
  const { data } = await apiClient.post('/promo/apply', { code });
  return data;
}

export async function generateReferral(): Promise<{ code: string; url: string }> {
  const { data } = await apiClient.post<{ code: string; url: string }>('/referral/generate');
  return data;
}

export async function getReferralStats(): Promise<ReferralStats> {
  const { data } = await apiClient.get<ReferralStats>('/referral/stats');
  return data;
}
