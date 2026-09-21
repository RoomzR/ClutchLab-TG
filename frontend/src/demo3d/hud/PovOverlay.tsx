import { useMemo } from 'react';
import type { GrenadeData } from '../../types/match';
import { getActiveGrenadesAtTick } from '../../utils/grenadeReplay';
import { cn } from '../../lib/cn';
import { classifyWeapon, weaponDisplayName } from '../weapons/weaponMesh';
import { Cs2Crosshair } from './Cs2Crosshair';
import { ScopeOverlay } from './ScopeOverlay';

interface PovOverlayProps {
  enabled: boolean;
  cameraMode: string;
  followPlayer: string | null;
  followPos?: { x: number; y: number; z: number } | null;
  weapon?: string | null;
  scoped?: boolean | null;
  crosshairCode?: string | null;
  grenades: GrenadeData[];
  currentTick: number;
  tickRate: number;
}

function dist2(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function isScopeWeapon(weapon?: string | null): boolean {
  return classifyWeapon(weapon) === 'sniper';
}

export function PovOverlay({
  enabled,
  cameraMode,
  followPlayer,
  followPos,
  weapon,
  scoped,
  crosshairCode,
  grenades,
  currentTick,
  tickRate,
}: PovOverlayProps) {
  const flashIntensity = useMemo(() => {
    if (!enabled || cameraMode !== 'pov' || !followPos) return 0;
    const flashes = getActiveGrenadesAtTick(grenades, currentTick).filter(
      (g) => g.grenade_type === 'flash',
    );
    let best = 0;
    for (const f of flashes) {
      const age = currentTick - f.tick;
      if (age < 0 || age > tickRate * 1.4) continue;
      const d2 = dist2(followPos.x, followPos.y, f.to_x, f.to_y);
      if (d2 > 600 * 600) continue;
      const proximity = 1 - Math.sqrt(d2) / 600;
      const fade = 1 - age / (tickRate * 1.4);
      best = Math.max(best, proximity * fade);
    }
    return best;
  }, [enabled, cameraMode, followPos, grenades, currentTick, tickRate]);

  const showScope = cameraMode === 'pov' && Boolean(scoped) && isScopeWeapon(weapon);

  if (!enabled || (cameraMode !== 'pov' && cameraMode !== 'follow')) return null;

  return (
    <>
      {cameraMode === 'pov' && (
        <>
          <ScopeOverlay active={showScope} />
          {!showScope && <Cs2Crosshair code={crosshairCode} />}
          {followPlayer && (
            <div className="pointer-events-none absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-sm bg-black/60 px-3 py-1 text-[11px] font-semibold text-amber-200 backdrop-blur">
              POV · {followPlayer}
              <span className="ml-2 font-mono text-[10px] text-slate-300">
                {weaponDisplayName(weapon)}
                {showScope ? ' · SCOPED' : ''}
              </span>
              {crosshairCode && !showScope && (
                <span className="ml-2 font-mono text-[9px] text-slate-500" title={crosshairCode}>
                  xhair
                </span>
              )}
            </div>
          )}
        </>
      )}
      <div
        className={cn(
          'pointer-events-none absolute inset-0 z-[25] transition-opacity duration-75',
          flashIntensity > 0.05 ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          background: `rgba(255,255,255,${Math.min(0.95, flashIntensity * 1.15)})`,
        }}
      />
    </>
  );
}
