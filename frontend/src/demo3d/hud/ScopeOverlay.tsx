/** CS2-style sniper scope overlay (AWP / Scout / etc.). */
export function ScopeOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-[28]" aria-hidden>
      {/* Outer vignette */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at center, transparent 18%, rgba(0,0,0,0.55) 42%, #000 68%)',
        }}
      />
      {/* Scope ring */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative rounded-full border border-black/80"
          style={{
            width: 'min(72vh, 72vw)',
            height: 'min(72vh, 72vw)',
            boxShadow: '0 0 0 9999px #000, inset 0 0 40px rgba(0,0,0,0.45)',
            background:
              'radial-gradient(circle, rgba(20,28,20,0.05) 0%, rgba(0,0,0,0.15) 100%)',
          }}
        >
          {/* Crosshair */}
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-black/70" />
          <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-black/70" />
          {/* Center mil-dot */}
          <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/90" />
          {/* Mild blur haze inside lens */}
          <div
            className="absolute inset-[8%] rounded-full"
            style={{ boxShadow: 'inset 0 0 60px rgba(0,0,0,0.35)' }}
          />
        </div>
      </div>
    </div>
  );
}
