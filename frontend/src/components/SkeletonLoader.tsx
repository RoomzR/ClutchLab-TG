import { cn } from '../lib/cn';

type SkeletonVariant = 'card' | 'chart' | 'table' | 'text';

interface SkeletonLoaderProps {
  variant?: SkeletonVariant;
  className?: string;
  count?: number;
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn('shimmer-bg rounded-lg', className)} />;
}

export function SkeletonLoader({
  variant = 'card',
  className,
  count = 1,
}: SkeletonLoaderProps) {
  if (variant === 'text') {
    return (
      <div className={cn('space-y-2', className)}>
        {Array.from({ length: count }).map((_, i) => (
          <SkeletonBlock key={i} className={cn('h-4', i === count - 1 ? 'w-3/4' : 'w-full')} />
        ))}
      </div>
    );
  }

  if (variant === 'chart') {
    return (
      <div className={cn('rounded-xl border border-slate-700 bg-slate-800 p-4', className)}>
        <SkeletonBlock className="mb-4 h-5 w-32" />
        <SkeletonBlock className="h-48 w-full" />
      </div>
    );
  }

  if (variant === 'table') {
    return (
      <div className={cn('rounded-xl border border-slate-700 bg-slate-800 p-4', className)}>
        <SkeletonBlock className="mb-4 h-5 w-40" />
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonBlock key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('grid gap-4', count > 1 && 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <SkeletonBlock className="mb-3 h-5 w-24" />
          <SkeletonBlock className="mb-2 h-8 w-16" />
          <SkeletonBlock className="h-4 w-full" />
        </div>
      ))}
    </div>
  );
}
