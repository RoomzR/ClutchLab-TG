import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  Coins,
  Crosshair,
  Flame,
  Info,
  Lightbulb,
  Sparkles,
  ThumbsUp,
  Users,
} from 'lucide-react';
import type { GrenadeData, KillData, Player, RoundData } from '../types/match';
import type { MatchAnalytics } from '../utils/matchAnalytics';
import type { MatchEconomySummary } from '../utils/matchEconomy';
import {
  generateAiInsights,
  type InsightCategory,
  type InsightSeverity,
} from '../utils/aiInsights';
import { cn } from '../lib/cn';

const SEVERITY_STYLES: Record<
  InsightSeverity,
  { border: string; badge: string; label: string; icon: typeof Info }
> = {
  critical: {
    border: 'border-red-400/25 bg-red-500/5',
    badge: 'bg-red-500/15 text-red-300',
    label: 'Critical',
    icon: AlertTriangle,
  },
  warning: {
    border: 'border-amber-400/25 bg-amber-500/5',
    badge: 'bg-amber-500/15 text-amber-300',
    label: 'Fix this',
    icon: Flame,
  },
  positive: {
    border: 'border-emerald-400/25 bg-emerald-500/5',
    badge: 'bg-emerald-500/15 text-emerald-300',
    label: 'Strength',
    icon: ThumbsUp,
  },
  info: {
    border: 'border-white/10 bg-slate-900/40',
    badge: 'bg-cyan-500/15 text-cyan-300',
    label: 'Insight',
    icon: Lightbulb,
  },
};

const CATEGORY_META: Record<InsightCategory, { label: string; icon: typeof Info }> = {
  tactics: { label: 'Tactics', icon: Brain },
  duels: { label: 'Duels', icon: Crosshair },
  economy: { label: 'Economy', icon: Coins },
  utility: { label: 'Utility', icon: Flame },
  players: { label: 'Players', icon: Users },
};

interface AiInsightsPanelProps {
  kills: KillData[];
  rounds: RoundData[];
  players: Player[];
  analytics: MatchAnalytics | null;
  economy: MatchEconomySummary | null;
  grenades: GrenadeData[];
  loading?: boolean;
}

export function AiInsightsPanel({
  kills,
  rounds,
  players,
  analytics,
  economy,
  grenades,
  loading,
}: AiInsightsPanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<InsightCategory | 'all'>('all');

  const insights = useMemo(
    () => generateAiInsights({ kills, rounds, players, analytics, economy, grenades }),
    [kills, rounds, players, analytics, economy, grenades],
  );

  const filtered =
    categoryFilter === 'all'
      ? insights
      : insights.filter((insight) => insight.category === categoryFilter);

  const presentCategories = [...new Set(insights.map((i) => i.category))];

  if (loading) {
    return (
      <div className="glass-panel p-8 text-center text-sm text-slate-500">
        Analyzing match data…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card-premium flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/25 to-blue-600/25 ring-1 ring-cyan-400/30">
            <Sparkles className="h-5 w-5 text-cyan-300" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-white">AI Match Insights</h2>
            <p className="text-xs text-slate-500">
              {insights.length} findings generated from kills, rounds, economy and utility data
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCategoryFilter('all')}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
              categoryFilter === 'all'
                ? 'bg-cyan-500/20 text-cyan-300'
                : 'bg-white/5 text-slate-400 hover:text-white',
            )}
          >
            All
          </button>
          {presentCategories.map((category) => {
            const { label, icon: Icon } = CATEGORY_META[category];
            return (
              <button
                key={category}
                type="button"
                onClick={() => setCategoryFilter(category)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                  categoryFilter === category
                    ? 'bg-cyan-500/20 text-cyan-300'
                    : 'bg-white/5 text-slate-400 hover:text-white',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel p-10 text-center">
          <Brain className="mx-auto mb-3 h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">
            Not enough data for insights in this category — the engine needs more rounds, kills
            or economy events to find reliable patterns.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map((insight) => {
            const style = SEVERITY_STYLES[insight.severity];
            const category = CATEGORY_META[insight.category];
            const SeverityIcon = style.icon;
            return (
              <article
                key={insight.id}
                className={cn('rounded-2xl border p-5 transition-all', style.border)}
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider',
                      style.badge,
                    )}
                  >
                    <SeverityIcon className="h-3 w-3" />
                    {style.label}
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
                    <category.icon className="h-3 w-3" />
                    {category.label}
                  </span>
                </div>

                <h3 className="mb-1.5 text-sm font-semibold leading-snug text-white">
                  {insight.title}
                </h3>
                <p className="text-xs leading-relaxed text-slate-400">{insight.detail}</p>

                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-wider text-slate-600">
                    Confidence
                  </span>
                  <span className="h-1 w-20 overflow-hidden rounded-full bg-white/10">
                    <span
                      className={cn(
                        'block h-full rounded-full',
                        insight.confidence >= 70
                          ? 'bg-cyan-400'
                          : insight.confidence >= 45
                            ? 'bg-amber-400'
                            : 'bg-slate-500',
                      )}
                      style={{ width: `${insight.confidence}%` }}
                    />
                  </span>
                  <span className="font-mono text-[10px] text-slate-500">
                    {insight.confidence}%
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <p className="text-center text-[11px] text-slate-600">
        Insights are generated locally from parsed demo data using heuristic tactical models.
      </p>
    </div>
  );
}
