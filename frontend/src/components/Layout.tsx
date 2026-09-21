import { useEffect, useRef, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  ChevronDown,
  Code2,
  CreditCard,
  Crosshair,
  GitCompare,
  History,
  LayoutDashboard,
  LogOut,
  Settings,
  Shield,
  ShieldAlert,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useAuth } from '../context/AuthContext';
import { useLocale, useT } from '../i18n/LocaleContext';
import { BrandMark, BrandWordmark } from './BrandLogo';

function LanguageSwitch() {
  const { locale, setLocale } = useLocale();
  return (
    <div className="flex items-center border border-white/10 bg-black/30 p-0.5 font-mono text-[10px] font-bold uppercase tracking-wider">
      {(['en', 'ru'] as const).map((code) => (
        <button
          key={code}
          type="button"
          onClick={() => setLocale(code)}
          className={cn(
            'px-2.5 py-1 transition-colors',
            locale === code
              ? 'bg-[var(--color-signal)] text-black'
              : 'text-[var(--color-steel)] hover:text-[var(--color-bone)]',
          )}
        >
          {code}
        </button>
      ))}
    </div>
  );
}

function XpBadge() {
  const { user } = useAuth();
  const gamification = user?.gamification;
  if (!gamification) return null;

  return (
    <Link
      to="/achievements"
      title={`Level ${gamification.level} · ${gamification.xp.toLocaleString()} XP`}
      className="group hidden items-center gap-2 border border-white/10 bg-black/30 px-3 py-1.5 backdrop-blur transition-colors hover:border-[var(--color-signal)]/40 md:flex"
    >
      <span className="flex items-center gap-1 font-mono text-xs font-bold text-[var(--color-signal)]">
        <Zap className="h-3.5 w-3.5" />
        {gamification.level}
      </span>
      <span className="h-1.5 w-16 overflow-hidden bg-white/10">
        <span
          className="block h-full bg-[var(--color-signal)] transition-all"
          style={{ width: `${gamification.progress_percent}%` }}
        />
      </span>
    </Link>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!user) return null;

  const isAdmin = user.role === 'ADMIN' || user.role === 'SUPERADMIN';

  const menuItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/achievements', icon: Trophy, label: t('nav.achievements') },
    { to: '/billing', icon: CreditCard, label: t('nav.billing') },
    { to: '/settings', icon: Settings, label: t('nav.settings') },
    { to: '/api-docs', icon: Code2, label: t('nav.apiDocs') },
    ...(isAdmin ? [{ to: '/admin', icon: ShieldAlert, label: t('nav.admin') }] : []),
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full px-2.5 py-2 text-sm font-medium text-white transition-colors hover:bg-white/10"
      >
        {user.avatar_url ? (
          <img
            src={user.avatar_url}
            alt={user.username}
            className="h-8 w-8 rounded-full object-cover ring-1 ring-[var(--color-signal)]/30"
          />
        ) : (
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-signal)]/10 text-xs font-bold text-[var(--color-signal)] ring-1 ring-[var(--color-signal)]/25">
            {user.username.slice(0, 2).toUpperCase()}
          </span>
        )}
        <span className="hidden max-w-[110px] truncate lg:inline">{user.username}</span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-[var(--color-steel)] transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden border border-white/10 bg-[#101012]/95 py-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.45)] backdrop-blur-xl">
          <div className="border-b border-white/10 px-4 py-3">
            <p className="truncate text-sm font-semibold text-[var(--color-bone)]">{user.username}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--color-steel)]">
              <span className="bg-[var(--color-signal)]/10 px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-signal)]">
                {user.role}
              </span>
              {user.gamification && <span>Level {user.gamification.level}</span>}
            </p>
          </div>
          {menuItems.map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <Icon className="h-4 w-4 text-slate-500" />
              {label}
            </Link>
          ))}
          <div className="my-1 border-t border-white/10" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              void logout();
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-300 transition-colors hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.logout')}
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useAuth();
  const t = useT();
  const isLanding = location.pathname === '/';
  const isDemoWatch = /\/match\/[^/]+\/watch\/?$/.test(location.pathname);

  const navItems = [
    { to: '/dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { to: '/history', icon: History, label: t('nav.history') },
    { to: '/utility-lab', icon: Crosshair, label: 'Utility Lab' },
    { to: '/compare', icon: GitCompare, label: t('nav.compare') },
    { to: '/team', icon: Shield, label: t('nav.team') },
    { to: '/tournaments', icon: Trophy, label: t('nav.events') },
    { to: '/leaderboards', icon: TrendingUp, label: t('nav.ranks') },
  ];

  return (
    <div className="premium-page flex min-h-screen flex-col">
      {!isDemoWatch && (
      <header
        className={cn(
          'sticky top-0 z-50 border-b backdrop-blur-md',
          isLanding
            ? 'border-transparent bg-[#070708]/55'
            : 'border-white/[0.08] bg-[#070708]/90',
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
          <Link
            to={isAuthenticated ? '/dashboard' : '/'}
            className="group flex shrink-0 items-center gap-3"
          >
            <BrandMark className="h-9 w-9 transition-transform duration-300 group-hover:scale-105" />
            <BrandWordmark className="hidden sm:block" inverted />
          </Link>

          <nav className="flex items-center gap-1 md:gap-1.5">
            {isAuthenticated && (
              <>
                {navItems.map(({ to, icon: Icon, label }) => (
                  <Link
                    key={to}
                    to={to}
                    className={cn(
                      'flex items-center gap-2 px-2.5 py-2 text-sm font-medium transition-all md:px-3',
                      location.pathname === to
                        ? 'border border-[var(--color-signal)]/35 bg-[var(--color-signal)]/10 text-[var(--color-bone)]'
                        : 'text-[var(--color-steel)] hover:bg-white/[0.04] hover:text-[var(--color-bone)]',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden xl:inline">{label}</span>
                  </Link>
                ))}
                <XpBadge />
                <LanguageSwitch />
                <UserMenu />
              </>
            )}

            {!isAuthenticated && !isLoading && (
              <>
                <LanguageSwitch />
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium text-[var(--color-steel)] transition-colors hover:text-[var(--color-bone)]"
                >
                  {t('nav.login')}
                </Link>
                <Link to="/register" className="btn-primary px-4 py-2 text-sm">
                  {t('nav.getStarted')}
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      )}

      <main
        className={cn(
          'mx-auto w-full flex-1',
          isDemoWatch
            ? 'max-w-none px-2 py-2 md:px-3 md:py-3'
            : isLanding
              ? 'max-w-none px-0 py-0'
              : location.pathname.startsWith('/match/') || location.pathname.startsWith('/utility-lab')
                ? 'max-w-[1600px] px-3 py-5 md:px-5 md:py-6'
                : 'max-w-6xl px-4 py-8 md:px-8',
        )}
      >
        <Outlet />
      </main>

      {!isDemoWatch && (
      <footer className="border-t border-white/[0.08] bg-[#070708] py-12">
        <div className="mx-auto max-w-6xl space-y-4 px-4 text-center md:px-8">
          <div className="flex items-center justify-center gap-2">
            <BrandMark className="h-6 w-6" />
            <span className="font-display text-base font-extrabold uppercase tracking-tight text-[var(--color-bone)]">
              Round<span className="text-[var(--color-signal)]">craft</span>
            </span>
          </div>
          <p className="text-xs text-[var(--color-steel)]">{t('brand.footer')}</p>
          <p className="text-sm text-[var(--color-steel)]">
            {t('common.createdBy')}{' '}
            <span className="font-medium text-[var(--color-bone)]/80">Руденко Артем Павлович Roomz</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
            <a
              href="https://t.me/roomzrly"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-signal)] transition-colors hover:text-[var(--color-bone)]"
            >
              Telegram @roomzrly
            </a>
            <span className="text-white/20">·</span>
            <a
              href="https://instagram.com/roomzrly"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-signal)] transition-colors hover:text-[var(--color-bone)]"
            >
              Instagram @roomzrly
            </a>
          </div>
        </div>
      </footer>
      )}
    </div>
  );
}
