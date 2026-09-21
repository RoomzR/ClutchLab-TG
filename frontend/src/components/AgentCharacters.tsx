import { cn } from '../lib/cn';

interface AgentCharacterProps {
  side: 'ct' | 't';
  className?: string;
}

/** Stylized CS operator silhouette for hero sections. */
export function AgentCharacter({ side, className }: AgentCharacterProps) {
  const isCt = side === 'ct';
  const primary = isCt ? '#5eb6ff' : '#ff8a3d';
  const glow = isCt ? 'rgba(94,182,255,0.35)' : 'rgba(255,138,61,0.35)';

  return (
    <div
      className={cn('pointer-events-none select-none', className)}
      aria-hidden
    >
      <svg viewBox="0 0 120 200" className="h-full w-full drop-shadow-2xl">
        <defs>
          <linearGradient id={`agent-grad-${side}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={primary} stopOpacity="0.9" />
            <stop offset="100%" stopColor={primary} stopOpacity="0.15" />
          </linearGradient>
          <filter id={`agent-glow-${side}`}>
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ground glow */}
        <ellipse cx="60" cy="188" rx="38" ry="8" fill={glow} opacity="0.6" />

        {/* Body silhouette */}
        <g filter={`url(#agent-glow-${side})`}>
          {/* Head / helmet */}
          <path
            d="M45 28 Q60 12 75 28 L78 48 Q60 58 42 48 Z"
            fill={`url(#agent-grad-${side})`}
            stroke={primary}
            strokeWidth="1.5"
          />
          {/* Visor */}
          <rect x="48" y="34" width="24" height="6" rx="2" fill={primary} opacity="0.5" />

          {/* Torso */}
          <path
            d="M38 52 L82 52 L88 110 L32 110 Z"
            fill={`url(#agent-grad-${side})`}
            stroke={primary}
            strokeWidth="1.2"
            opacity="0.85"
          />

          {/* Vest detail */}
          <path d="M52 58 L68 58 L70 95 L50 95 Z" fill={primary} opacity="0.25" />

          {/* Arms */}
          <path
            d="M38 55 L18 90 L24 98 L42 68 Z"
            fill={`url(#agent-grad-${side})`}
            opacity="0.7"
          />
          <path
            d="M82 55 L102 82 L96 90 L78 68 Z"
            fill={`url(#agent-grad-${side})`}
            opacity="0.7"
          />

          {/* Weapon */}
          <rect x="96" y="78" width="18" height="5" rx="1.5" fill={primary} opacity="0.8" />
          <rect x="108" y="76" width="8" height="9" rx="1" fill={primary} opacity="0.5" />

          {/* Legs */}
          <path d="M42 110 L36 170 L48 170 L54 118 Z" fill={`url(#agent-grad-${side})`} opacity="0.75" />
          <path d="M78 110 L72 118 L66 170 L78 170 Z" fill={`url(#agent-grad-${side})`} opacity="0.75" />
        </g>

        {/* Scan line overlay */}
        <rect
          x="0"
          y="0"
          width="120"
          height="200"
          fill="url(#scan-lines)"
          opacity="0.04"
        />
        <defs>
          <pattern id="scan-lines" width="4" height="4" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="4" y2="0" stroke="white" strokeWidth="1" />
          </pattern>
        </defs>
      </svg>
    </div>
  );
}

export function HeroAgents() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-8 -z-10 hidden h-72 md:block lg:h-96">
      <AgentCharacter
        side="t"
        className="animate-agent-slide-left absolute bottom-0 left-[4%] h-56 w-32 opacity-80 lg:left-[8%] lg:h-72 lg:w-40"
      />
      <AgentCharacter
        side="ct"
        className="animate-agent-slide-right absolute bottom-0 right-[4%] h-56 w-32 opacity-80 lg:right-[8%] lg:h-72 lg:w-40"
      />
    </div>
  );
}

export function FloatingParticles() {
  const particles = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: `${(i * 17 + 7) % 100}%`,
    delay: `${(i * 0.7) % 5}s`,
    size: 2 + (i % 3),
  }));

  return (
    <div className="pointer-events-none absolute inset-0 -z-20 overflow-hidden" aria-hidden>
      {particles.map((p) => (
        <span
          key={p.id}
          className="animate-particle absolute rounded-full bg-[var(--color-accent)]"
          style={{
            left: p.left,
            bottom: '-4px',
            width: p.size,
            height: p.size,
            animationDelay: p.delay,
            opacity: 0.35 + (p.id % 4) * 0.1,
          }}
        />
      ))}
    </div>
  );
}
