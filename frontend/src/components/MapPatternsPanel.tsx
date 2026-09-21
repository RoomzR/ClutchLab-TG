import { Map, Shield, Target } from 'lucide-react';
import type { MatchMapPatterns } from '../utils/mapPatterns';
import { getMapConfig } from '../utils/mapConfig';
import { cn } from '../lib/cn';

interface MapPatternsPanelProps {
  patterns: MatchMapPatterns | null;
  teamTName?: string;
  teamCtName?: string;
  isLoading?: boolean;
  className?: string;
}

export function MapPatternsPanel({
  patterns,
  teamTName = 'T',
  teamCtName = 'CT',
  isLoading,
  className,
}: MapPatternsPanelProps) {
  if (isLoading) {
    return <div className={cn('glass-panel h-40 animate-pulse rounded-xl', className)} />;
  }

  if (!patterns || patterns.insights.length === 0) {
    return (
      <div className={cn('glass-panel rounded-xl px-4 py-3 text-sm text-slate-500', className)}>
        Паттерны по карте появятся после загрузки позиций и гранат
      </div>
    );
  }

  const mapLabel = getMapConfig(patterns.mapName).displayName;

  return (
    <div className={cn('space-y-4 animate-fade-in', className)}>
      <div className="glass-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <Map className="h-4 w-4 text-cyan-400" />
          <h3 className="font-display text-sm font-semibold text-slate-200">
            Паттерны · {mapLabel}
          </h3>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {patterns.insights.map((insight) => (
            <div
              key={insight.id}
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-sm font-semibold text-white">{insight.label}</span>
                {insight.pct != null && (
                  <span className="ml-auto font-mono text-xs text-cyan-400">{insight.pct}%</span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-400">{insight.detail}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {patterns.teams.map((teamPattern) => {
          const isT = teamPattern.team === 'T';
          const teamLabel = isT ? teamTName : teamCtName;
          return (
            <div key={teamPattern.team} className="glass-panel p-4">
              <div className="mb-3 flex items-center gap-2">
                <Shield className={cn('h-4 w-4', isT ? 'text-orange-400' : 'text-blue-400')} />
                <h4 className={cn('font-semibold', isT ? 'text-orange-300' : 'text-blue-300')}>
                  {teamLabel}
                </h4>
                {teamPattern.defaultSite && (
                  <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white">
                    Default {teamPattern.defaultSite}
                  </span>
                )}
              </div>

              <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                Топ зоны
              </p>
              <ul className="mb-4 space-y-1">
                {teamPattern.topZones.slice(0, 4).map((z) => (
                  <li key={z.label} className="flex justify-between text-xs">
                    <span className="text-slate-300">{z.label}</span>
                    <span className="font-mono text-slate-500">{z.pct}%</span>
                  </li>
                ))}
              </ul>

              <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                Smoke spots
              </p>
              <ul className="mb-4 space-y-1">
                {teamPattern.topSmokes.slice(0, 3).map((s) => (
                  <li key={s.label} className="flex justify-between text-xs">
                    <span className="text-slate-300">{s.label}</span>
                    <span className="font-mono text-cyan-400">
                      {s.count}× · {s.pct}%
                    </span>
                  </li>
                ))}
              </ul>

              {teamPattern.retakeZones && teamPattern.retakeZones.length > 0 && (
                <>
                  <p className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">
                    CT retake
                  </p>
                  <ul className="space-y-1">
                    {teamPattern.retakeZones.slice(0, 3).map((z) => (
                      <li key={z.label} className="flex justify-between text-xs">
                        <span className="text-slate-300">{z.label}</span>
                        <span className="font-mono text-blue-400">{z.pct}%</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
