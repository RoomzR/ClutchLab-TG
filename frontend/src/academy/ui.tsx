import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Inbox, Loader2, X } from 'lucide-react';
import { cn } from '../lib/cn';

export function Panel({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={cn('rounded-2xl border border-white/[0.08] bg-[#0d0d10]/85 shadow-[0_18px_60px_rgba(0,0,0,0.35)]', padded && 'p-5', className)}>
      {children}
    </section>
  );
}

export function PanelHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {icon && <span className="mt-0.5 text-[var(--color-signal)]">{icon}</span>}
        <div>
          <h3 className="font-display text-[15px] font-bold tracking-tight text-[var(--color-bone)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--color-steel)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--color-signal)]">{eyebrow}</p>}
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-white md:text-[34px]">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-3xl text-sm text-[var(--color-steel)]">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

type Tone = 'neutral' | 'signal' | 'ct' | 't' | 'good' | 'bad' | 'warn' | 'info';
const TONES: Record<Tone, string> = {
  neutral: 'border-white/10 bg-white/[0.04] text-slate-300',
  signal: 'border-[var(--color-signal)]/35 bg-[var(--color-signal)]/12 text-[#ffb08f]',
  ct: 'border-[#5b8cff]/35 bg-[#5b8cff]/12 text-[#a9c2ff]',
  t: 'border-[#f5a524]/35 bg-[#f5a524]/12 text-[#ffd590]',
  good: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  bad: 'border-rose-400/30 bg-rose-400/10 text-rose-300',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  info: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-200',
};

export function Badge({ children, tone = 'neutral', className, title }: { children: ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[11px] font-semibold', TONES[tone], className)}>
      {children}
    </span>
  );
}

export function SideBadge({ side }: { side: 'CT' | 'T' | string | null | undefined }) {
  if (side !== 'CT' && side !== 'T') return null;
  return <Badge tone={side === 'CT' ? 'ct' : 't'}>{side}</Badge>;
}

export const SEVERITY_TONE: Record<string, Tone> = { high: 'bad', medium: 'warn', low: 'neutral' };
export const SEVERITY_RU: Record<string, string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' };

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export function Button({
  children, onClick, variant = 'secondary', size = 'md', disabled, loading, className, type = 'button', title,
}: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant; size?: 'sm' | 'md'; disabled?: boolean; loading?: boolean;
  className?: string; type?: 'button' | 'submit'; title?: string;
}) {
  const styles: Record<BtnVariant, string> = {
    primary: 'bg-[var(--color-signal)] text-white hover:bg-[#ff7140] shadow-[0_8px_24px_rgba(255,90,31,0.25)]',
    secondary: 'border border-white/12 bg-white/[0.04] text-[var(--color-bone)] hover:border-white/25 hover:bg-white/[0.07]',
    ghost: 'text-[var(--color-steel)] hover:bg-white/[0.05] hover:text-white',
    danger: 'border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20',
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        styles[variant],
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, size = 'md',
}: { value: T; options: { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-md font-semibold transition-colors',
            size === 'sm' ? 'px-2 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
            value === o.value ? 'bg-white/[0.1] text-white' : 'text-[var(--color-steel)] hover:text-white',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TabBar<T extends string>({ value, tabs, onChange }: { value: T; tabs: { value: T; label: ReactNode; count?: number | null; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto border-b border-white/[0.07] pb-px">
      {tabs.map((t) => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={cn(
            'relative flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-colors',
            value === t.value ? 'text-white' : 'text-[var(--color-steel)] hover:text-[var(--color-bone)]',
          )}
        >
          {t.icon}
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className="rounded bg-white/[0.08] px-1.5 text-[10px] font-bold text-slate-300">{t.count}</span>
          )}
          {value === t.value && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded bg-[var(--color-signal)]" />}
        </button>
      ))}
    </div>
  );
}

export function Kpi({ label, value, hint, tone, icon }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: 'good' | 'bad' | 'signal'; icon?: ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-steel)]">
        {label}
        {icon && <span className="text-slate-500">{icon}</span>}
      </div>
      <div className={cn('mt-2 font-display text-2xl font-extrabold tabular-nums',
        tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : tone === 'signal' ? 'text-[var(--color-signal)]' : 'text-white')}>
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-[var(--color-steel)]">{hint}</div>}
    </div>
  );
}

export function Loading({ label = 'Загрузка…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} aria-busy>
      <div className="flex items-center gap-2 text-xs text-[var(--color-steel)]">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {label}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" style={{ opacity: 1 - i * 0.25 }} />
      ))}
    </div>
  );
}

export function Empty({ title, hint, action, icon }: { title: ReactNode; hint?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-white/10 px-6 py-10 text-center">
      <span className="mb-3 text-slate-600">{icon ?? <Inbox className="h-8 w-8" />}</span>
      <p className="font-semibold text-[var(--color-bone)]">{title}</p>
      {hint && <p className="mt-1 max-w-md text-sm text-[var(--color-steel)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: ReactNode; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-500/[0.07] px-4 py-3 text-sm text-rose-200">
      <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" />{message}</span>
      {onRetry && <Button size="sm" variant="danger" onClick={onRetry}>Повторить</Button>}
    </div>
  );
}

export function NotInDemo({ children = 'нет в демке' }: { children?: ReactNode }) {
  return <span className="text-[11px] italic text-slate-600">{children}</span>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-[8vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className={cn('w-full rounded-2xl border border-white/10 bg-[#0f0f13] p-5 shadow-2xl', wide ? 'max-w-4xl' : 'max-w-lg')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-white">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }: { label: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold text-[var(--color-steel)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none transition focus:border-[var(--color-signal)]/60';

export function Select({ value, onChange, options, className, placeholder }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; className?: string; placeholder?: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={cn(inputCls, 'py-1.5 pr-8', className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => number | string | null | undefined;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerTitle?: string;
}

export function DataTable<T>({ rows, columns, rowKey, initialSort, onRowClick, dense, stickyFirst, maxHeight }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (r: T) => void; dense?: boolean; stickyFirst?: boolean; maxHeight?: number;
}) {
  const [sort, setSort] = useState(initialSort);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    return [...rows].sort((a, b) => {
      const va = col.sort!(a);
      const vb = col.sort!(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const r = va < vb ? -1 : va > vb ? 1 : 0;
      return sort.dir === 'asc' ? r : -r;
    });
  }, [rows, columns, sort]);
  return (
    <div className="overflow-auto rounded-xl border border-white/[0.06]" style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[#121216]">
          <tr>
            {columns.map((c, i) => (
              <th
                key={c.key}
                title={c.headerTitle}
                onClick={() => c.sort && setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}
                className={cn(
                  'whitespace-nowrap border-b border-white/[0.07] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-steel)]',
                  c.sort && 'cursor-pointer select-none hover:text-white',
                  c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                  stickyFirst && i === 0 && 'sticky left-0 z-20 bg-[#121216]',
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {c.header}
                  {sort?.key === c.key && (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={rowKey(r)}
              onClick={onRowClick ? () => onRowClick(r) : undefined}
              className={cn('border-b border-white/[0.04] transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-white/[0.035]')}
            >
              {columns.map((c, i) => (
                <td
                  key={c.key}
                  className={cn(
                    dense ? 'px-3 py-1.5' : 'px-3 py-2.5',
                    'whitespace-nowrap tabular-nums',
                    c.align === 'right' ? 'text-right' : c.align === 'center' ? 'text-center' : 'text-left',
                    stickyFirst && i === 0 && 'sticky left-0 z-[5] bg-[#0d0d10]',
                    c.className,
                  )}
                >
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function useLocalState<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = (v: T) => {
    setValue(v);
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      /* storage full or disabled */
    }
  };
  return [value, set];
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'только что';
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ч назад`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} дн назад`;
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
