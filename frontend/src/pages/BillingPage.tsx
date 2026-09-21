import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, CreditCard, Crown, Loader2, RefreshCcw, XCircle } from 'lucide-react';
import {
  cancelSubscription,
  getCurrentSubscription,
  getPaymentsHistory,
  getPlans,
  reactivateSubscription,
  subscribe,
} from '../api/billing';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import { cn } from '../lib/cn';
import { useLocale, useT } from '../i18n/LocaleContext';

export function BillingPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const checkoutStatus = searchParams.get('status');
  const [yearly, setYearly] = useState(false);
  const [promo, setPromo] = useState('');
  const { locale } = useLocale();
  const t = useT();

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ['billing', 'plans'],
    queryFn: getPlans,
    staleTime: 3600_000,
  });

  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['billing', 'subscription'],
    queryFn: getCurrentSubscription,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ['billing', 'payments'],
    queryFn: getPaymentsHistory,
  });

  const subscribeMutation = useMutation({
    mutationFn: (planId: string) =>
      subscribe({
        plan_type: planId,
        billing_interval: yearly ? 'yearly' : 'monthly',
        promo_code: promo || undefined,
      }),
    onSuccess: (data) => {
      window.location.href = data.checkout_url;
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelSubscription,
    onSuccess: async (data) => {
      toast.success(data.detail);
      await queryClient.invalidateQueries({ queryKey: ['billing'] });
      await refreshUser();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateSubscription,
    onSuccess: async (data) => {
      toast.success(data.detail);
      await queryClient.invalidateQueries({ queryKey: ['billing'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const currentPlan = subscription?.plan_type ?? user?.role ?? 'FREE';
  const paidPlans = plans.filter((p) => p.id !== 'FREE');
  const dateLocale = locale === 'ru' ? 'ru-RU' : 'en-US';

  return (
    <div className="mx-auto max-w-5xl space-y-10">
      <div>
        <h1 className="font-display text-2xl text-[var(--color-navy)] md:text-3xl">{t('billing.title')}</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{t('billing.subtitle')}</p>
      </div>

      {checkoutStatus === 'success' && (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-3 text-sm text-emerald-100">
          <Check className="h-4 w-4" />
          {t('billing.checkoutSuccess')}
        </div>
      )}
      {checkoutStatus === 'canceled' && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-4 py-3 text-sm text-amber-100">
          <XCircle className="h-4 w-4" />
          {t('billing.checkoutCanceled')}
        </div>
      )}

      <section className="card-surface p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg text-[var(--color-navy)]">
          <Crown className="h-5 w-5 text-[var(--color-accent)]" />
          {t('billing.currentPlan')}
        </h2>
        {subLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-2xl text-gradient-accent">{currentPlan}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {t('billing.status')}:{' '}
                <span className="text-slate-300">{subscription?.status ?? t('billing.none')}</span>
                {subscription?.current_period_end && (
                  <>
                    {' · '}
                    {subscription.canceled_at ? t('billing.ends') : t('billing.renews')}{' '}
                    {new Date(subscription.current_period_end).toLocaleDateString(dateLocale)}
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              {subscription?.status !== 'none' && !subscription?.canceled_at && subscription?.is_stripe && (
                <button
                  type="button"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                  className="rounded-xl border border-red-300/25 bg-red-500/10 px-4 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15 disabled:opacity-60"
                >
                  {t('billing.cancelSubscription')}
                </button>
              )}
              {subscription?.canceled_at && (
                <button
                  type="button"
                  onClick={() => reactivateMutation.mutate()}
                  disabled={reactivateMutation.isPending}
                  className="flex items-center gap-1.5 rounded-xl border border-emerald-300/25 bg-emerald-300/10 px-4 py-2 text-xs font-semibold text-[var(--color-accent)] hover:bg-emerald-300/15 disabled:opacity-60"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  {t('billing.reactivate')}
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      <section>
        <div className="mb-6 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
          <h2 className="font-display text-lg text-[var(--color-navy)]">{t('billing.upgrade')}</h2>
          <div className="flex items-center gap-3">
            <span className={cn('text-xs', !yearly ? 'font-bold text-white' : 'text-slate-500')}>
              {t('billing.monthly')}
            </span>
            <button
              type="button"
              onClick={() => setYearly((v) => !v)}
              className="relative h-5 w-10 rounded-full border border-white/10 bg-white/10"
              aria-label="Toggle yearly"
            >
              <span
                className={cn(
                  'absolute top-0.5 h-4 w-4 rounded-full bg-[var(--color-accent)] transition-all',
                  yearly ? 'left-5' : 'left-0.5',
                )}
              />
            </button>
            <span className={cn('text-xs', yearly ? 'font-bold text-white' : 'text-slate-500')}>
              {t('billing.yearly')} <span className="text-amber-200">{t('billing.yearlyDiscount')}</span>
            </span>
          </div>
        </div>

        <div className="mb-4 flex gap-2">
          <input
            type="text"
            placeholder={t('billing.promoPlaceholder')}
            value={promo}
            onChange={(e) => setPromo(e.target.value.toUpperCase())}
            className="w-full max-w-xs rounded-xl border border-white/10 bg-black/25 px-4 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-300/55 focus:ring-2 focus:ring-emerald-300/15"
          />
        </div>

        {plansLoading ? (
          <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {paidPlans.map((plan) => {
              const isCurrent = plan.id === currentPlan;
              const price = yearly ? plan.yearly_price / 12 : plan.monthly_price;
              return (
                <div
                  key={plan.id}
                  className={cn(
                    'rounded-2xl border p-5',
                    isCurrent
                      ? 'border-emerald-300/45 bg-emerald-300/[0.09]'
                      : 'border-white/10 bg-white/[0.055] shadow-[0_24px_80px_rgba(0,0,0,0.22)]',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-[var(--color-navy)]">{plan.name}</h3>
                    {isCurrent && (
                      <span className="rounded-full bg-emerald-300/10 px-2 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
                        {t('billing.currentBadge')}
                      </span>
                    )}
                  </div>
                  <p className="mt-2">
                    <span className="font-display text-3xl text-[var(--color-navy)]">${price.toFixed(2)}</span>
                    <span className="text-xs text-[var(--color-muted)]"> /mo</span>
                  </p>
                  <ul className="mt-4 space-y-1.5">
                    {plan.features.slice(0, 6).map((f) => (
                      <li key={f} className="flex items-start gap-2 text-xs text-slate-300">
                        <Check className="mt-0.5 h-3 w-3 shrink-0 text-[var(--color-accent)]" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    disabled={isCurrent || subscribeMutation.isPending}
                    onClick={() => subscribeMutation.mutate(plan.id)}
                    className={cn(
                      'mt-5 w-full rounded-xl py-2.5 text-xs font-bold transition-all',
                      isCurrent
                        ? 'cursor-default border border-white/10 text-slate-500'
                        : 'btn-primary disabled:opacity-60',
                    )}
                  >
                    {isCurrent
                      ? t('billing.yourPlan')
                      : subscribeMutation.isPending
                        ? t('billing.redirecting')
                        : `${t('billing.getPlan')} ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card-surface p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg text-[var(--color-navy)]">
          <CreditCard className="h-5 w-5 text-[var(--color-accent)]" />
          {t('billing.paymentHistory')}
        </h2>
        {payments.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">{t('billing.noPaymentsYet')}</p>
        ) : (
          <div className="divide-y divide-white/10">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-[var(--color-muted)]">
                  {new Date(p.created_at).toLocaleDateString(dateLocale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                    p.status === 'succeeded'
                      ? 'bg-emerald-300/10 text-emerald-200'
                      : 'bg-amber-300/10 text-amber-200',
                  )}
                >
                  {p.status}
                </span>
                <span className="font-mono font-bold text-[var(--color-navy)]">
                  ${p.amount.toFixed(2)} {p.currency.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
