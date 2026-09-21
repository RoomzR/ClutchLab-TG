import { cn } from '../lib/cn';

interface ProgressBarProps {
  progress: number;
  label?: string;
  isParsing?: boolean;
  className?: string;
}

export function ProgressBar({ progress, label, isParsing, className }: ProgressBarProps) {
  const clampedProgress = Math.min(100, Math.max(0, progress));

  return (
    <div className={cn('w-full', className)}>
      {label && <p className="mb-2 text-sm text-slate-400">{label}</p>}
      <div className="relative h-9 overflow-hidden rounded-xl border border-white/10 bg-black/30">
        <div
          className={cn(
            'absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 via-emerald-300 to-amber-200 transition-all duration-500 ease-out',
            isParsing && 'animate-pulse-bar',
          )}
          style={{ width: `${clampedProgress}%` }}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-mono text-sm font-semibold text-white drop-shadow">
            {clampedProgress}%
          </span>
        </div>
      </div>
    </div>
  );
}
