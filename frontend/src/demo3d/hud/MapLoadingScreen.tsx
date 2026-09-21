import { cn } from '../../lib/cn';
import type { AssetLoadState } from '../loading/useDemoAssetLoader';

interface MapLoadingScreenProps {
  mapName: string;
  mapImageUrl?: string;
  state: AssetLoadState;
}

/**
 * CS2-style map entry screen — radar art + progress while GLBs warm the cache.
 */
export function MapLoadingScreen({ mapName, mapImageUrl, state }: MapLoadingScreenProps) {
  const pct = Math.round(Math.min(100, state.progress * 100));
  const pretty = mapName.replace(/^de_/, '').toUpperCase();

  return (
    <div className="absolute inset-0 z-50 flex flex-col overflow-hidden bg-[#0b0f14]">
      {mapImageUrl && (
        <div
          className="absolute inset-0 scale-110 bg-cover bg-center opacity-35 blur-[2px]"
          style={{ backgroundImage: `url(${mapImageUrl})` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/40 to-black/90" />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.35em] text-amber-400/90">
          Counter-Strike 2
        </p>
        <h1
          className="text-5xl font-black uppercase tracking-tight text-white md:text-7xl"
          style={{ fontFamily: 'Teko, Impact, sans-serif' }}
        >
          {pretty}
        </h1>
        <p className="mt-3 max-w-md text-center text-sm text-slate-300">{state.label}</p>

        <div className="mt-10 w-full max-w-md">
          <div className="mb-2 flex justify-between font-mono text-[11px] text-slate-400">
            <span>LOADING</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-sm bg-white/10">
            <div
              className={cn(
                'h-full rounded-sm bg-gradient-to-r from-amber-500 to-orange-400 transition-[width] duration-200',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {state.error && (
            <p className="mt-3 text-center text-xs text-rose-400">{state.error}</p>
          )}
        </div>
      </div>

      <div className="relative z-10 border-t border-white/10 bg-black/50 px-6 py-3 text-center font-mono text-[10px] uppercase tracking-wider text-slate-500">
        Warming map · players · weapons
      </div>
    </div>
  );
}
