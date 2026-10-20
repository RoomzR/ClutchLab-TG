import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck, Bot, ChevronsLeft, ChevronsRight, Crosshair, Dumbbell, FileVideo, GitCompare, Home, Keyboard, LayoutGrid, LogOut,
  PenTool, Radar, Search, Settings2, Shield, Upload, UserSearch, Users,
} from 'lucide-react';
import { academyApi } from '../api/academy';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../i18n/LocaleContext';
import { cn } from '../lib/cn';
import { BrandMark } from '../components/BrandLogo';
import { MetricsProvider } from './metrics';
import { Badge, Modal } from './ui';
import { ROLE_RU, mapTitle } from './radar';

const NAV = [
  { section: 'Работа', items: [
    { to: '/dashboard', label: 'Главная', icon: Home },
    { to: '/upload', label: 'Загрузка демок', icon: Upload },
    { to: '/matches', label: 'Матчи', icon: FileVideo },
  ] },
  { section: 'Статистика', items: [
    { to: '/players', label: 'Игроки', icon: Users },
    { to: '/teams', label: 'Команды', icon: Shield },
    { to: '/compare', label: 'Сравнение', icon: GitCompare },
    { to: '/scouting', label: 'Разведка соперника', icon: UserSearch },
  ] },
  { section: 'Тренировки', items: [
    { to: '/training', label: 'Домашние задания', icon: Dumbbell },
    { to: '/lineups', label: 'Раскидки', icon: Crosshair },
    { to: '/boards', label: 'Тактическая доска', icon: PenTool },
    { to: '/analysts', label: 'Живые аналитики', icon: BookOpenCheck },
  ] },
];

export function useAcademyMe() {
  return useQuery({ queryKey: ['academy', 'me'], queryFn: academyApi.me, staleTime: 60_000 });
}

export function useIsStaff(): boolean {
  const { data } = useAcademyMe();
  const r = data?.user.academy_role;
  return r === 'admin' || r === 'manager' || r === 'coach' || r === 'analyst';
}

export function AcademyLayout() {
  const { data: me } = useAcademyMe();
  const { data: ai } = useQuery({ queryKey: ['academy', 'ai'], queryFn: academyApi.aiStatus, staleTime: 300_000 });
  const { logout } = useAuth();
  const { locale, setLocale } = useLocale();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('cl_nav_collapsed') === '1');
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const location = useLocation();
  const role = me?.user.academy_role;
  const wide = location.pathname.startsWith('/match/') || location.pathname.startsWith('/boards/');

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (!typing && e.key === '?') {
        setHelpOpen(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const toggle = () => {
    localStorage.setItem('cl_nav_collapsed', collapsed ? '0' : '1');
    setCollapsed(!collapsed);
  };

  return (
    <MetricsProvider>
      <div className="flex min-h-screen bg-[#070708] text-[var(--color-bone)]">
        <aside className={cn('sticky top-0 hidden h-screen shrink-0 flex-col border-r border-white/[0.06] bg-[#09090b] transition-[width] md:flex', collapsed ? 'w-[68px]' : 'w-[232px]')}>
          <Link to="/dashboard" className="flex h-16 items-center gap-2.5 px-4">
            <BrandMark className="h-8 w-8 shrink-0" />
            {!collapsed && (
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px] font-extrabold uppercase tracking-tight">Clutch<span className="text-[var(--color-signal)]">Lab</span></span>
                <span className="block truncate text-[10px] uppercase tracking-[0.18em] text-slate-500">{me?.org?.name ?? 'Академия'}</span>
              </span>
            )}
          </Link>
          <nav className="flex-1 space-y-5 overflow-y-auto px-2.5 py-3">
            {NAV.map((g) => (
              <div key={g.section}>
                {!collapsed && <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">{g.section}</p>}
                {g.items.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    title={label}
                    className={({ isActive }) => cn(
                      'mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors',
                      isActive ? 'bg-[var(--color-signal)]/12 text-white shadow-[inset_2px_0_0_var(--color-signal)]' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
            {(role === 'admin' || role === 'manager') && (
              <div>
                {!collapsed && <p className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Управление</p>}
                <NavLink to="/academy/admin" title="Админка академии" className={({ isActive }) => cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium', isActive ? 'bg-[var(--color-signal)]/12 text-white' : 'text-slate-400 hover:bg-white/[0.04] hover:text-white')}>
                  <Settings2 className="h-4 w-4 shrink-0" />{!collapsed && 'Админка академии'}
                </NavLink>
              </div>
            )}
          </nav>
          <div className="border-t border-white/[0.06] p-2.5">
            {!collapsed && me && (
              <div className="mb-2 rounded-lg bg-white/[0.03] px-3 py-2">
                <p className="truncate text-sm font-semibold">{me.user.username}</p>
                <p className="text-[11px] text-slate-500">{ROLE_RU[me.user.academy_role] ?? me.user.academy_role}{me.user.player_name ? ` · ${me.user.player_name}` : ''}</p>
              </div>
            )}
            <div className={cn('flex items-center gap-1', collapsed && 'flex-col')}>
              <button type="button" onClick={() => setLocale(locale === 'ru' ? 'en' : 'ru')} className="rounded-md px-2 py-1.5 font-mono text-[10px] font-bold uppercase text-slate-400 hover:bg-white/10" title="Язык метрик">{locale}</button>
              <button type="button" onClick={() => setHelpOpen(true)} className="rounded-md p-1.5 text-slate-400 hover:bg-white/10" title="Горячие клавиши (?)"><Keyboard className="h-4 w-4" /></button>
              <Link to="/history" className="rounded-md p-1.5 text-slate-400 hover:bg-white/10" title="Классический анализатор"><LayoutGrid className="h-4 w-4" /></Link>
              <button type="button" onClick={() => void logout()} className="rounded-md p-1.5 text-slate-400 hover:bg-white/10 hover:text-rose-300" title="Выйти"><LogOut className="h-4 w-4" /></button>
              <button type="button" onClick={toggle} className="ml-auto rounded-md p-1.5 text-slate-500 hover:bg-white/10" title="Свернуть меню">
                {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-white/[0.06] bg-[#070708]/90 px-4 backdrop-blur-md md:px-6">
            <Link to="/dashboard" className="md:hidden"><BrandMark className="h-7 w-7" /></Link>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="flex h-9 w-full max-w-md items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 text-sm text-slate-500 transition hover:border-white/20 hover:text-slate-300"
            >
              <Search className="h-4 w-4" />
              <span className="flex-1 text-left">Поиск матча, игрока, раздела…</span>
              <kbd className="rounded border border-white/10 px-1.5 font-mono text-[10px]">⌘K</kbd>
            </button>
            <div className="ml-auto flex items-center gap-2">
              <Badge tone={ai?.available ? 'good' : 'neutral'} title={ai?.note ?? `Модель: ${ai?.model}`}>
                <Bot className="h-3 w-3" />{ai?.available ? `ИИ: ${ai.model}` : 'ИИ: правила'}
              </Badge>
              <Link to="/upload" className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--color-signal)] px-3 py-1.5 text-sm font-semibold text-white shadow-[0_6px_20px_rgba(255,90,31,0.3)] hover:bg-[#ff7140]">
                <Upload className="h-4 w-4" /> <span className="hidden sm:inline">Загрузить демку</span>
              </Link>
            </div>
          </header>
          <nav className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-3 py-2 md:hidden">
            {NAV.flatMap((g) => g.items).map(({ to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => cn('shrink-0 rounded-md px-2.5 py-1 text-xs', isActive ? 'bg-white/10 text-white' : 'text-slate-400')}>{label}</NavLink>
            ))}
          </nav>
          <main className={cn('mx-auto w-full flex-1 px-4 py-6 md:px-6', wide ? 'max-w-[1720px]' : 'max-w-[1400px]')}>
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <HotkeysHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </MetricsProvider>
  );
}

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  to: string;
  group: string;
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const { data: players = [] } = useQuery({ queryKey: ['academy', 'players', 'palette'], queryFn: () => academyApi.players({ last: 50 }), enabled: open, staleTime: 60_000 });
  const { data: matches = [] } = useQuery({ queryKey: ['academy', 'matches', 'palette'], queryFn: () => academyApi.matches({ limit: 80 }), enabled: open, staleTime: 30_000 });
  const { data: teams = [] } = useQuery({ queryKey: ['academy', 'teams'], queryFn: academyApi.teams, enabled: open, staleTime: 60_000 });

  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setTimeout(() => input.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const all: PaletteItem[] = [
      ...NAV.flatMap((g) => g.items).map((i) => ({ id: i.to, label: i.label, to: i.to, group: 'Разделы' })),
      { id: '/academy/admin', label: 'Админка академии', to: '/academy/admin', group: 'Разделы' },
      ...players.map((p) => ({ id: `p:${p.name}`, label: p.name, hint: `${p.team ?? ''} · ${p.matches} матчей`, to: `/players/${encodeURIComponent(p.name)}`, group: 'Игроки' })),
      ...teams.map((t) => ({ id: `t:${t.team_name}`, label: t.team_name, hint: `${t.matches} матчей`, to: `/teams/${encodeURIComponent(t.team_name)}`, group: 'Команды' })),
      ...matches.map((m) => ({
        id: `m:${m.match_id}`, label: `${m.team_t_name} ${m.score_t}:${m.score_ct} ${m.team_ct_name}`,
        hint: `${mapTitle(m.map_name)} · ${new Date(m.played_at ?? m.created_at).toLocaleDateString('ru-RU')}`, to: `/match/${m.match_id}`, group: 'Матчи',
      })),
    ];
    const s = q.trim().toLowerCase();
    if (!s) return all.slice(0, 14);
    return all.filter((i) => `${i.label} ${i.hint ?? ''}`.toLowerCase().includes(s)).slice(0, 30);
  }, [q, players, matches, teams]);

  const go = (item: PaletteItem | undefined) => {
    if (!item) return;
    navigate(item.to);
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[120] flex items-start justify-center bg-black/60 p-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f13] shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-4">
          <Search className="h-4 w-4 text-slate-500" />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
              if (e.key === 'Enter') go(items[idx]);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="Матч, игрок, команда или раздел"
            className="h-12 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
          />
          <kbd className="rounded border border-white/10 px-1.5 font-mono text-[10px] text-slate-500">Esc</kbd>
        </div>
        <ul className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">Ничего не найдено</li>}
          {items.map((it, i) => (
            <li key={it.id}>
              {(i === 0 || items[i - 1].group !== it.group) && <p className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">{it.group}</p>}
              <button
                type="button"
                onMouseEnter={() => setIdx(i)}
                onClick={() => go(it)}
                className={cn('flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm', i === idx ? 'bg-white/[0.07] text-white' : 'text-slate-300')}
              >
                <span className="truncate">{it.label}</span>
                {it.hint && <span className="shrink-0 text-xs text-slate-500">{it.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const HOTKEYS: [string, string][] = [
  ['⌘K / Ctrl+K', 'Поиск по академии'],
  ['?', 'Эта справка'],
  ['Пробел', 'Пауза / воспроизведение реплея'],
  ['← / →', '±5 секунд (Shift — ±1 с)'],
  [', / .', 'Кадр назад / вперёд'],
  ['[ / ]', 'Скорость реплея'],
  ['J / K', 'Предыдущий / следующий раунд в разборе'],
  ['1–9', 'Вкладки хаба матча'],
  ['V / P / A / L / C / T', 'Инструменты доски: выбор, перо, стрелка, линия, круг, текст'],
  ['Delete', 'Удалить выбранную фигуру на доске'],
];

function HotkeysHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Горячие клавиши">
      <ul className="space-y-1.5">
        {HOTKEYS.map(([k, v]) => (
          <li key={k} className="flex items-center justify-between gap-4 text-sm">
            <span className="text-slate-300">{v}</span>
            <kbd className="rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-xs text-white">{k}</kbd>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-500"><Radar className="h-3.5 w-3.5" />Любой момент матча открывается по ссылке — кнопка «Поделиться моментом» в разборе.</p>
    </Modal>
  );
}
