import { createContext, type ReactNode, useContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { academyApi } from '../api/academy';
import type { MetricDef, MetricsRegistry, MetricValues } from '../types/academy';
import { useLocale } from '../i18n/LocaleContext';
import { cn } from '../lib/cn';

interface Ctx {
  registry: MetricsRegistry | null;
  byId: Record<string, MetricDef>;
  name: (id: string) => string;
}

const MetricsCtx = createContext<Ctx>({ registry: null, byId: {}, name: (id) => id });

export function MetricsProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const { data } = useQuery({ queryKey: ['academy', 'metrics'], queryFn: academyApi.metrics, staleTime: Infinity, retry: 1 });
  const value = useMemo<Ctx>(() => {
    const byId: Record<string, MetricDef> = {};
    for (const m of data?.metrics ?? []) byId[m.id] = m;
    return { registry: data ?? null, byId, name: (id) => (byId[id] ? (locale === 'en' ? byId[id].en : byId[id].ru) : id) };
  }, [data, locale]);
  return <MetricsCtx.Provider value={value}>{children}</MetricsCtx.Provider>;
}

export function useMetrics() {
  return useContext(MetricsCtx);
}

export function fmtValue(value: number | null | undefined, unit?: string, digits?: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  switch (unit) {
    case 'pct':
      return `${value.toFixed(digits ?? 1)}%`;
    case 'money':
      return `$${Math.round(value).toLocaleString('ru-RU')}`;
    case 'sec':
      return `${value.toFixed(digits ?? 1)} с`;
    case 'ms':
      return `${Math.round(value)} мс`;
    case 'deg':
      return `${value.toFixed(digits ?? 1)}°`;
    case 'units':
      return Math.round(value).toLocaleString('ru-RU');
    case 'ratio':
      return value.toFixed(digits ?? 2);
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(digits ?? 1);
  }
}

export function useFmt() {
  const { byId } = useMetrics();
  return (id: string, value: number | null | undefined, digits?: number) => fmtValue(value, byId[id]?.unit, digits);
}

const CONF_RU = { exact: 'точно из демки', derived: 'вычислено по правилу', estimated: 'оценка (приблизительно)' };

export function ConfidenceMark({ confidence }: { confidence?: string }) {
  if (confidence !== 'estimated') return null;
  return <span title={CONF_RU.estimated} className="ml-0.5 align-super text-[9px] font-bold text-amber-300/80">≈</span>;
}

export function MetricLabel({ id, className, short }: { id: string; className?: string; short?: boolean }) {
  const { byId, name } = useMetrics();
  const m = byId[id];
  return (
    <span className={cn('group/ml relative inline-flex items-center gap-1', className)}>
      <span className={short ? 'truncate' : undefined}>{name(id)}</span>
      <ConfidenceMark confidence={m?.confidence} />
      {m && (
        <>
          <Info className="h-3 w-3 shrink-0 text-slate-600 transition-colors group-hover/ml:text-slate-300" />
          <span className="pointer-events-none absolute left-0 top-full z-50 mt-1.5 hidden w-72 rounded-lg border border-white/10 bg-[#141418] p-3 text-left text-xs font-normal normal-case tracking-normal text-slate-300 shadow-2xl group-hover/ml:block">
            <span className="block font-semibold text-white">{name(id)}</span>
            <span className="mt-1 block">{m.description}</span>
            <span className="mt-2 block font-mono text-[10.5px] text-[#ffb08f]">{m.formula}</span>
            <span className="mt-2 block text-[10.5px] text-slate-500">
              Источник: {m.source} · {CONF_RU[m.confidence]}
              {m.min_sample ? ` · выборка ${m.min_sample}` : ''}
              {m.better !== 'neutral' ? ` · ${m.better === 'higher' ? 'больше — лучше' : 'меньше — лучше'}` : ''}
            </span>
          </span>
        </>
      )}
    </span>
  );
}

export function percentileTone(p: number | null | undefined): string {
  if (p == null) return 'bg-slate-600';
  if (p >= 80) return 'bg-emerald-400';
  if (p >= 60) return 'bg-lime-400';
  if (p >= 40) return 'bg-slate-300';
  if (p >= 20) return 'bg-amber-400';
  return 'bg-rose-400';
}

export function percentileText(p: number | null | undefined): string {
  if (p == null) return 'text-slate-500';
  if (p >= 80) return 'text-emerald-300';
  if (p >= 60) return 'text-lime-300';
  if (p >= 40) return 'text-slate-200';
  if (p >= 20) return 'text-amber-300';
  return 'text-rose-300';
}

export function PercentileBar({ value, className }: { value: number | null | undefined; className?: string }) {
  return (
    <div className={cn('relative h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]', className)} title={value != null ? `Перцентиль в академии: ${Math.round(value)}` : 'Недостаточно данных для сравнения'}>
      {value != null && <div className={cn('h-full rounded-full', percentileTone(value))} style={{ width: `${Math.max(3, value)}%` }} />}
    </div>
  );
}

/** Colored delta vs a reference value, respecting the metric direction. */
export function Delta({ id, value, reference }: { id: string; value: number | null | undefined; reference: number | null | undefined }) {
  const { byId } = useMetrics();
  const m = byId[id];
  if (value == null || reference == null || !m || m.better === 'neutral') return null;
  const diff = value - reference;
  if (Math.abs(diff) < 1e-9) return null;
  const good = m.better === 'higher' ? diff > 0 : diff < 0;
  return (
    <span className={cn('text-[11px] font-semibold tabular-nums', good ? 'text-emerald-400' : 'text-rose-400')}>
      {diff > 0 ? '+' : ''}
      {fmtValue(diff, m.unit === 'pct' ? 'num' : m.unit)}
    </span>
  );
}

export function metricsOfGroup(registry: MetricsRegistry | null, group: string): MetricDef[] {
  return (registry?.metrics ?? []).filter((m) => m.group === group);
}

export function valueOf(metrics: MetricValues | undefined, id: string): number | null {
  const v = metrics?.[id];
  return v == null ? null : v;
}
