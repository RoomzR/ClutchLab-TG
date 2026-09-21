import { cn } from '../lib/cn';

interface BrandMarkProps {
  className?: string;
}

/** Roundcraft mark — industrial R cut from a scope plate. */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn('h-10 w-10', className)} aria-hidden>
      <rect x="2" y="2" width="60" height="60" fill="#0c0c0e" />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" stroke="#f4f0e6" strokeOpacity="0.35" strokeWidth="1.5" />
      <path
        d="M18 46V18h16.5c6.2 0 10.5 3.4 10.5 9.1 0 4.4-2.4 7.4-6.4 8.5L46 46h-7.2l-6.6-9.6H25.2V46H18Zm7.2-15.8h8.4c2.7 0 4.3-1.4 4.3-3.7s-1.6-3.7-4.3-3.7h-8.4v7.4Z"
        fill="#f4f0e6"
      />
      <path d="M48 12h6v6M10 46H16v6" stroke="#ff5a1f" strokeWidth="2" strokeLinecap="square" />
    </svg>
  );
}

interface BrandWordmarkProps {
  className?: string;
  tagline?: boolean;
  inverted?: boolean;
}

export function BrandWordmark({ className, tagline = true, inverted = false }: BrandWordmarkProps) {
  return (
    <div className={className}>
      <span
        className={cn(
          'font-display text-[1.4rem] font-extrabold uppercase tracking-[-0.05em]',
          inverted ? 'text-[var(--color-bone)]' : 'text-[var(--color-navy)]',
        )}
      >
        Round<span className="text-[var(--color-signal)]">craft</span>
      </span>
      {tagline && (
        <p
          className={cn(
            'font-mono text-[9px] uppercase tracking-[0.38em]',
            inverted ? 'text-[var(--color-steel)]' : 'text-[var(--color-muted)]',
          )}
        >
          Demo Intel
        </p>
      )}
    </div>
  );
}
