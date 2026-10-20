import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark } from './BrandLogo';

interface AuthCardProps {
  title: ReactNode;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthCard({ title, subtitle, children, footer }: AuthCardProps) {
  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center bg-[#050505] px-4 py-16">
      <div className="w-full max-w-[420px]">
        <Link to="/" className="mb-8 flex justify-center" aria-label="Roundcraft">
          <BrandMark className="h-11 w-11" />
        </Link>
        <div className="rounded-3xl border border-white/10 bg-[#0c0c0e] px-6 py-8 md:px-8">
          <h1 className="text-center font-display text-[clamp(1.35rem,4.2vw,1.85rem)] font-black uppercase leading-[1.05] tracking-tight text-white">
            {title}
          </h1>
          {subtitle && <p className="mt-3 text-center text-sm text-zinc-400">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-zinc-400">{footer}</div>}
      </div>
    </div>
  );
}

export function AuthInput({
  label,
  error,
  icon,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; icon?: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">{label}</span>
      <span className="relative block">
        {icon && <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">{icon}</span>}
        <input
          {...props}
          className={`w-full rounded-xl border border-white/10 bg-black py-3 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-[#d6ff3c]/70 ${icon ? 'pl-10 pr-4' : 'px-4'}`}
        />
      </span>
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
    <button
      type="submit"
      disabled={loading}
      className="h-12 w-full rounded-full bg-[#d6ff3c] text-sm font-extrabold uppercase tracking-wide text-black transition-transform hover:scale-[1.02] disabled:opacity-60"
    >
      {loading ? '…' : children}
    </button>
  );
}
