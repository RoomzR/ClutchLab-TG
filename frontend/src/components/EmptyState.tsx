import {
  Bomb,
  Crosshair,
  MapPin,
  Package,
  Search,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '../lib/cn';

type EmptyStateVariant = 'grenades' | 'kills' | 'purchases' | 'positions' | 'default';

interface EmptyStateProps {
  variant?: EmptyStateVariant;
  title?: string;
  description?: string;
  className?: string;
}

const variantConfig: Record<
  EmptyStateVariant,
  { icon: LucideIcon; title: string; description: string }
> = {
  grenades: {
    icon: Bomb,
    title: 'Нет гранат',
    description: 'Гранаты не найдены для выбранных фильтров',
  },
  kills: {
    icon: Crosshair,
    title: 'Нет убийств',
    description: 'Данные об убийствах отсутствуют',
  },
  purchases: {
    icon: Package,
    title: 'Нет покупок',
    description: 'История покупок игрока пуста',
  },
  positions: {
    icon: MapPin,
    title: 'Нет позиций',
    description: 'Позиции игроков не найдены для выбранного периода',
  },
  default: {
    icon: Search,
    title: 'Нет данных',
    description: 'Данные для отображения отсутствуют',
  },
};

export function EmptyState({ variant = 'default', title, description, className }: EmptyStateProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-4 rounded-3xl border border-white/10 bg-white/[0.045] p-10 text-center animate-fade-in backdrop-blur',
        className,
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-300/10 ring-1 ring-emerald-300/20">
        <Icon className="h-7 w-7 text-[var(--color-accent)]" />
      </div>
      <div>
        <h3 className="font-medium text-white">{title ?? config.title}</h3>
        <p className="mt-1 text-sm text-slate-400">{description ?? config.description}</p>
      </div>
    </div>
  );
}
