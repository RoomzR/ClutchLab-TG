import { Loader2 } from 'lucide-react';
import type { MatchStatus } from '../types/match';
import { cn } from '../lib/cn';

interface StatusBadgeProps {
  status: MatchStatus['status'];
  className?: string;
}

const statusConfig: Record<
  MatchStatus['status'],
  { label: string; className: string; showLoader?: boolean }
> = {
  pending: {
    label: 'В очереди',
    className: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  },
  parsing: {
    label: 'Парсинг...',
    className: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    showLoader: true,
  },
  ready: {
    label: 'Готово',
    className: 'bg-green-500/20 text-green-400 border-green-500/30',
  },
  error: {
    label: 'Ошибка',
    className: 'bg-red-500/20 text-red-400 border-red-500/30',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium',
        config.className,
        className,
      )}
    >
      {config.showLoader && <Loader2 className="h-3 w-3 animate-spin" />}
      {config.label}
    </span>
  );
}
