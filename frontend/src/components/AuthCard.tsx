import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from './BrandLogo';

interface AuthCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-12">
      <div className="premium-orb left-1/2 top-10 h-64 w-64 -translate-x-1/2 bg-[var(--color-signal)]/10" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Link to="/" className="transition-transform hover:scale-105">
            <BrandMark className="h-14 w-14" />
          </Link>
          <div>
            <h1 className="font-display text-3xl font-extrabold uppercase tracking-tight text-[var(--color-bone)]">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-sm text-[var(--color-steel)]">{subtitle}</p>}
          </div>
        </div>

        <div className="card-premium p-6 md:p-8">{children}</div>

        {footer && <div className="mt-6 text-center text-sm text-[var(--color-steel)]">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthInput({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--color-bone)]/80">{label}</span>
      <input
        {...props}
        className="w-full border border-white/10 bg-black/40 px-4 py-2.5 text-sm text-[var(--color-bone)] placeholder-[var(--color-steel)] outline-none transition-colors focus:border-[var(--color-signal)]/60 focus:ring-1 focus:ring-[var(--color-signal)]/30"
      />
      {error && <span className="mt-1 block text-xs text-red-400">{error}</span>}
    </label>
  );
}

export function AuthSubmitButton({
  loading,
  children,
}: {
  loading?: boolean;
  children: ReactNode;
}) {
  return (
    <button type="submit" disabled={loading} className="btn-primary w-full disabled:opacity-60">
      {loading ? 'Please wait…' : children}
    </button>
  );
}
