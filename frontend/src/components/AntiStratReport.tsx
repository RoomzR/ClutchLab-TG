import { AlertTriangle, Crosshair, Shield } from 'lucide-react';
import type { AntiStratInsight } from '../utils/antiStrat';
import { cn } from '../lib/cn';

interface AntiStratReportProps {
  insights: AntiStratInsight[];
  playerName: string;
  mapName: string;
  isLoading?: boolean;
  className?: string;
}

const SEVERITY_STYLE = {
  high: 'border-red-400/40 bg-red-500/10 text-red-200',
  medium: 'border-amber-400/30 bg-amber-500/10 text-amber-200',
  low: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
};

const CATEGORY_LABEL = {
  position: 'Позиция',
  grenade: 'Utility',
  timing: 'Тайминг',
  tendency: 'Привычка',
};

export function AntiStratReport({
  insights,
  playerName,
  mapName,
  isLoading,
  className,
}: AntiStratReportProps) {
  if (isLoading) {
    return <div className={cn('glass-panel h-48 animate-pulse rounded-xl', className)} />;
  }

  if (!insights.length) {
    return (
      <div className={cn('glass-panel rounded-xl px-4 py-6 text-center', className)}>
        <Crosshair className="mx-auto mb-2 h-8 w-8 text-slate-600" />
        <p className="text-sm text-slate-400">
          Недостаточно данных для anti-strat отчёта по {playerName}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('glass-panel p-5 animate-fade-in', className)}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-rose-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">
            Anti-strat · {playerName}
          </h3>
        </div>
        <span className="text-xs text-slate-500">{mapName}</span>
      </div>

      <div className="space-y-2">
        {insights.map((insight) => (
          <div
            key={insight.id}
            className={cn(
              'rounded-xl border px-4 py-3',
              SEVERITY_STYLE[insight.severity],
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {insight.severity === 'high' && (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              )}
              <span className="text-sm font-semibold">{insight.title}</span>
              <span className="rounded bg-black/30 px-1.5 py-0.5 text-[10px] uppercase tracking-wider opacity-80">
                {CATEGORY_LABEL[insight.category]}
              </span>
              {insight.pct != null && (
                <span className="ml-auto font-mono text-xs">{insight.pct}%</span>
              )}
            </div>
            <p className="mt-1 text-xs opacity-90">{insight.detail}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
