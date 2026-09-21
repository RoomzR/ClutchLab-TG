import { cn } from '../lib/cn';
import { getGrenadeIconConfig } from '../utils/grenadeIcons';

interface GrenadeIconProps {
  type: string;
  size?: number;
  className?: string;
  withBackdrop?: boolean;
  title?: string;
}

/** CS2-style grenade icon (white silhouette from game assets). */
export function GrenadeIcon({
  type,
  size = 18,
  className,
  withBackdrop = false,
  title,
}: GrenadeIconProps) {
  const config = getGrenadeIconConfig(type);

  return (
    <span
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      title={title ?? config.label}
    >
      {withBackdrop && (
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: 'rgba(0,0,0,0.72)',
            border: `1px solid ${config.color}88`,
            boxShadow: `0 0 0 1px rgba(0,0,0,0.45), 0 2px 6px rgba(0,0,0,0.55)`,
          }}
        />
      )}
      <img
        src={config.src}
        alt={config.label}
        width={size}
        height={size}
        draggable={false}
        className="relative z-[1] pointer-events-none object-contain drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]"
      />
    </span>
  );
}
