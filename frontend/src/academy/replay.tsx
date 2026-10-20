import { type MouseEvent as ReactMouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { BombEvent, GrenadeData, TickData } from '../types/match';
import type { RoundKill } from '../types/academy';
import { CT_COLOR, GRENADE_COLOR, RADAR, T_COLOR, radarImage, toRadar } from './radar';
import { cn } from '../lib/cn';

// ───────────────────────── clock ─────────────────────────

export function useReplayClock(start: number, end: number, tickRate: number) {
  const [tick, setTickState] = useState(start);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const tickRef = useRef(start);
  const raf = useRef<number | null>(null);
  const last = useRef<number | null>(null);

  const setTick = useCallback((t: number) => {
    const v = Math.max(start, Math.min(end, t));
    tickRef.current = v;
    setTickState(v);
  }, [start, end]);

  useEffect(() => {
    setTick(start);
    setPlaying(false);
  }, [start, end, setTick]);

  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    const step = (now: number) => {
      if (last.current != null) {
        const dt = (now - last.current) / 1000;
        const next = tickRef.current + dt * tickRate * speed;
        if (next >= end) {
          setTick(end);
          setPlaying(false);
          return;
        }
        setTick(next);
      }
      last.current = now;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, tickRate, end, setTick]);

  return { tick, setTick, playing, setPlaying, speed, setSpeed, tickRef };
}

export function useReplayHotkeys(clock: ReturnType<typeof useReplayClock>, tickRate: number, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const speeds = [0.25, 0.5, 1, 2, 4, 8];
    const h = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        clock.setPlaying(!clock.playing);
      } else if (e.key === 'ArrowRight') {
        clock.setTick(clock.tickRef.current + tickRate * (e.shiftKey ? 1 : 5));
      } else if (e.key === 'ArrowLeft') {
        clock.setTick(clock.tickRef.current - tickRate * (e.shiftKey ? 1 : 5));
      } else if (e.key === '.') {
        clock.setTick(clock.tickRef.current + 2);
      } else if (e.key === ',') {
        clock.setTick(clock.tickRef.current - 2);
      } else if (e.key === ']') {
        const i = speeds.indexOf(clock.speed);
        clock.setSpeed(speeds[Math.min(speeds.length - 1, i + 1)]);
      } else if (e.key === '[') {
        const i = speeds.indexOf(clock.speed);
        clock.setSpeed(speeds[Math.max(0, i - 1)]);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [clock, tickRate, enabled]);
}

// ───────────────────────── interpolation ─────────────────────────

interface Track {
  name: string;
  team: 'CT' | 'T';
  ticks: number[];
  rows: TickData[];
}

function buildTracks(positions: TickData[]): Track[] {
  const by = new Map<string, TickData[]>();
  for (const p of positions) {
    const list = by.get(p.player_name);
    if (list) list.push(p);
    else by.set(p.player_name, [p]);
  }
  const out: Track[] = [];
  for (const [name, rows] of by) {
    rows.sort((a, b) => a.tick - b.tick);
    out.push({ name, team: rows[rows.length - 1].team, ticks: rows.map((r) => r.tick), rows });
  }
  return out.sort((a, b) => (a.team === b.team ? a.name.localeCompare(b.name) : a.team === 'CT' ? -1 : 1));
}

function lowerIndex(arr: number[], t: number): number {
  let lo = 0;
  let hi = arr.length - 1;
  if (hi < 0 || t < arr[0]) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (arr[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return a + d * k;
}

export interface PlayerState {
  name: string;
  team: 'CT' | 'T';
  x: number;
  y: number;
  yaw: number | null;
  health: number;
  armor: number | null;
  weapon: string | null;
  scoped: boolean;
}

function stateAt(track: Track, t: number): PlayerState | null {
  const i = lowerIndex(track.ticks, t);
  if (i < 0) return null;
  const a = track.rows[i];
  const b = track.rows[Math.min(i + 1, track.rows.length - 1)];
  if (t - a.tick > 64) return null;
  const k = b.tick > a.tick ? Math.min(1, (t - a.tick) / (b.tick - a.tick)) : 0;
  return {
    name: track.name,
    team: a.team,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    yaw: a.yaw != null && b.yaw != null ? lerpAngle(a.yaw, b.yaw, k) : (a.yaw ?? null),
    health: a.health ?? 100,
    armor: a.armor ?? null,
    weapon: a.weapon ?? null,
    scoped: Boolean(a.scoped),
  };
}

// ───────────────────────── canvas ─────────────────────────

export interface ReplayMarker {
  tick: number;
  x?: number;
  y?: number;
  player?: string | null;
  label?: string;
  color: string;
}

const GRENADE_LIFETIME_S: Record<string, number> = { smoke: 18, molotov: 7, incendiary: 7, flash: 0.6, he: 0.5, decoy: 15 };
const GRENADE_RADIUS: Record<string, number> = { smoke: 144, molotov: 120, incendiary: 120, flash: 90, he: 130, decoy: 40 };

const imageCache = new Map<string, HTMLImageElement>();
function loadImage(src: string, onLoad: () => void): HTMLImageElement {
  let img = imageCache.get(src);
  if (!img) {
    img = new Image();
    img.src = src;
    imageCache.set(src, img);
  }
  if (!img.complete) img.addEventListener('load', onLoad, { once: true });
  return img;
}

export function ReplayCanvas({
  mapName, positions, kills = [], grenades = [], bombs = [], tick, tickRate, selected, onSelect, markers = [],
  trails = true, showNames = true, className, onCanvasClick, overlay,
}: {
  mapName: string;
  positions: TickData[];
  kills?: RoundKill[];
  grenades?: GrenadeData[];
  bombs?: BombEvent[];
  tick: number;
  tickRate: number;
  selected?: string | null;
  onSelect?: (name: string | null) => void;
  markers?: ReplayMarker[];
  trails?: boolean;
  showNames?: boolean;
  className?: string;
  onCanvasClick?: (radarX: number, radarY: number) => void;
  overlay?: (ctx: CanvasRenderingContext2D, scale: number) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(640);
  const [, force] = useState(0);
  const tracks = useMemo(() => buildTracks(positions), [positions]);
  const deathTick = useMemo(() => {
    const m = new Map<string, RoundKill>();
    for (const k of kills) if (!m.has(k.victim)) m.set(k.victim, k);
    return m;
  }, [kills]);
  const statesRef = useRef<PlayerState[]>([]);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0].contentRect.width;
      setSize(Math.max(280, Math.floor(w)));
    });
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== size * dpr) {
      c.width = size * dpr;
      c.height = size * dpr;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const s = (size * dpr) / RADAR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, c.width, c.height);
    const img = loadImage(radarImage(mapName), () => force((n) => n + 1));
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (img.complete && img.naturalWidth) {
      ctx.globalAlpha = 0.92;
      ctx.drawImage(img, 0, 0, RADAR, RADAR);
      ctx.globalAlpha = 1;
    }

    // grenades active at this tick
    for (const g of grenades) {
      const life = (GRENADE_LIFETIME_S[g.grenade_type] ?? 1) * tickRate;
      const throwTick = g.tick - Math.round(tickRate * 1.6);
      if (tick >= throwTick && tick < g.tick && (g.grenade_type === 'smoke' || g.grenade_type === 'flash' || g.grenade_type === 'he' || g.grenade_type === 'molotov')) {
        const k = (tick - throwTick) / (g.tick - throwTick);
        const [fx, fy] = toRadar(mapName, g.from_x, g.from_y);
        const [tx, ty] = toRadar(mapName, g.to_x, g.to_y);
        ctx.strokeStyle = (GRENADE_COLOR[g.grenade_type] ?? '#fff') + '99';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(fx + (tx - fx) * k, fy + (ty - fy) * k);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = GRENADE_COLOR[g.grenade_type] ?? '#fff';
        ctx.beginPath();
        ctx.arc(fx + (tx - fx) * k, fy + (ty - fy) * k, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      if (tick < g.tick || tick > g.tick + life) continue;
      const [x, y] = toRadar(mapName, g.to_x, g.to_y);
      const cfgScale = (GRENADE_RADIUS[g.grenade_type] ?? 80) / (positionsScale(mapName));
      const age = (tick - g.tick) / life;
      if (g.grenade_type === 'smoke') {
        const grad = ctx.createRadialGradient(x, y, 2, x, y, cfgScale);
        grad.addColorStop(0, 'rgba(226,232,240,0.85)');
        grad.addColorStop(1, 'rgba(148,163,184,0.45)');
        ctx.fillStyle = grad;
        ctx.globalAlpha = age > 0.9 ? (1 - age) * 10 : 1;
        ctx.beginPath();
        ctx.arc(x, y, cfgScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (g.grenade_type === 'molotov' || g.grenade_type === 'incendiary') {
        ctx.fillStyle = 'rgba(251,146,60,0.38)';
        ctx.strokeStyle = 'rgba(253,186,116,0.9)';
        ctx.beginPath();
        ctx.arc(x, y, cfgScale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.strokeStyle = g.grenade_type === 'flash' ? 'rgba(254,240,138,0.95)' : 'rgba(248,113,113,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x, y, cfgScale * (0.4 + age * 0.6), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // bomb
    const planted = bombs.find((b) => b.event_type === 'bomb_planted' && b.tick <= tick);
    if (planted) {
      const [bx, by] = toRadar(mapName, planted.x, planted.y);
      const pulse = 6 + Math.sin(tick / 6) * 2;
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(bx, by, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px Sora, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('C4', bx, by + 3);
    }

    // death markers
    for (const [victim, k] of deathTick) {
      if (k.tick > tick) continue;
      const tr = tracks.find((t) => t.name === victim);
      if (!tr) continue;
      const st = stateAt(tr, k.tick - 1) ?? (() => {
        const i = lowerIndex(tr.ticks, k.tick);
        return i >= 0 ? { x: tr.rows[i].x, y: tr.rows[i].y } as PlayerState : null;
      })();
      if (!st) continue;
      const [x, y] = toRadar(mapName, st.x, st.y);
      ctx.strokeStyle = (k.victim_side === 'CT' ? CT_COLOR : T_COLOR) + 'cc';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 6);
      ctx.lineTo(x + 6, y + 6);
      ctx.moveTo(x + 6, y - 6);
      ctx.lineTo(x - 6, y + 6);
      ctx.stroke();
      if (showNames) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.font = '10px Sora, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(victim, x, y + 18);
      }
    }

    // markers (mistakes etc.)
    for (const m of markers) {
      if (Math.abs(m.tick - tick) > tickRate * 1.5) continue;
      let mx = m.x;
      let my = m.y;
      if ((mx == null || my == null) && m.player) {
        const tr = tracks.find((t) => t.name === m.player);
        const st = tr ? stateAt(tr, m.tick) : null;
        if (st) {
          mx = st.x;
          my = st.y;
        }
      }
      if (mx == null || my == null) continue;
      const [x, y] = toRadar(mapName, mx, my);
      ctx.strokeStyle = m.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 18 + Math.sin(tick / 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
      if (m.label) {
        ctx.fillStyle = m.color;
        ctx.font = 'bold 11px Sora, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(m.label, x, y - 24);
      }
    }

    // players
    const states: PlayerState[] = [];
    for (const tr of tracks) {
      const dead = deathTick.get(tr.name);
      if (dead && dead.tick <= tick) continue;
      const st = stateAt(tr, tick);
      if (!st || st.health <= 0) continue;
      states.push(st);
      const [x, y] = toRadar(mapName, st.x, st.y);
      const color = st.team === 'CT' ? CT_COLOR : T_COLOR;
      const isSel = selected === tr.name;

      if (trails && (isSel || !selected)) {
        const from = tick - tickRate * (isSel ? 6 : 2.5);
        const i0 = Math.max(0, lowerIndex(tr.ticks, from));
        const i1 = lowerIndex(tr.ticks, tick);
        if (i1 > i0) {
          ctx.strokeStyle = color + (isSel ? '99' : '40');
          ctx.lineWidth = isSel ? 2.2 : 1.4;
          ctx.beginPath();
          for (let i = i0; i <= i1; i += 2) {
            const [px, py] = toRadar(mapName, tr.rows[i].x, tr.rows[i].y);
            if (i === i0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      }

      if (st.yaw != null) {
        const a = (-st.yaw * Math.PI) / 180;
        const len = st.scoped ? 90 : 46;
        const spread = st.scoped ? 0.06 : 0.42;
        const grad = ctx.createRadialGradient(x, y, 4, x, y, len);
        grad.addColorStop(0, color + '55');
        grad.addColorStop(1, color + '00');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, len, a - spread, a + spread);
        ctx.closePath();
        ctx.fill();
      }

      ctx.fillStyle = color;
      ctx.strokeStyle = isSel ? '#ffffff' : '#0a0a0a';
      ctx.lineWidth = isSel ? 3 : 2;
      ctx.beginPath();
      ctx.arc(x, y, isSel ? 9 : 7.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      const hpw = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - hpw / 2, y + 10, hpw, 3);
      ctx.fillStyle = st.health > 50 ? '#4ade80' : st.health > 20 ? '#facc15' : '#f87171';
      ctx.fillRect(x - hpw / 2, y + 10, (hpw * st.health) / 100, 3);

      if (showNames) {
        ctx.font = `${isSel ? 'bold ' : ''}11px Sora, sans-serif`;
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.strokeText(tr.name, x, y - 12);
        ctx.fillStyle = '#fff';
        ctx.fillText(tr.name, x, y - 12);
      }
    }
    statesRef.current = states;

    if (overlay) {
      ctx.setTransform(s, 0, 0, s, 0, 0);
      overlay(ctx, s);
    }
  }, [size, tick, tracks, grenades, bombs, deathTick, mapName, selected, markers, trails, showNames, tickRate, overlay]);

  const handleClick = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * RADAR;
    const ry = ((e.clientY - rect.top) / rect.height) * RADAR;
    onCanvasClick?.(rx, ry);
    if (!onSelect) return;
    let best: string | null = null;
    let bestD = 20;
    for (const st of statesRef.current) {
      const [x, y] = toRadar(mapName, st.x, st.y);
      const d = Math.hypot(x - rx, y - ry);
      if (d < bestD) {
        bestD = d;
        best = st.name;
      }
    }
    onSelect(best === selected ? null : best);
  };

  return (
    <div ref={wrap} className={cn('relative w-full', className)}>
      <canvas
        ref={canvas}
        onClick={handleClick}
        style={{ width: size, height: size }}
        className="block cursor-crosshair rounded-xl border border-white/[0.06]"
      />
    </div>
  );
}

function positionsScale(mapName: string): number {
  const [x0] = toRadar(mapName, 0, 0);
  const [x1] = toRadar(mapName, 100, 0);
  return 100 / (x1 - x0);
}

export function usePlayerStates(positions: TickData[], tick: number, kills: RoundKill[]) {
  const tracks = useMemo(() => buildTracks(positions), [positions]);
  return useMemo(() => {
    const dead = new Map<string, number>();
    for (const k of kills) if (!dead.has(k.victim)) dead.set(k.victim, k.tick);
    return tracks.map((tr) => {
      const d = dead.get(tr.name);
      const st = d != null && d <= tick ? null : stateAt(tr, tick);
      return { name: tr.name, team: tr.team, state: st };
    });
  }, [tracks, tick, kills]);
}

// ───────────────────────── timeline ─────────────────────────

export interface TimelineMarker {
  tick: number;
  color: string;
  label: string;
  shape?: 'dot' | 'diamond' | 'bar';
}

export function fmtClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function ReplayTimeline({
  start, end, freeze, tick, tickRate, markers, onSeek,
}: { start: number; end: number; freeze: number; tick: number; tickRate: number; markers: TimelineMarker[]; onSeek: (t: number) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const span = Math.max(1, end - start);
  const pct = ((tick - start) / span) * 100;
  const seekAt = (clientX: number) => {
    const r = bar.current?.getBoundingClientRect();
    if (!r) return;
    onSeek(start + ((clientX - r.left) / r.width) * span);
  };
  const drag = (e: ReactMouseEvent) => {
    seekAt(e.clientX);
    const move = (ev: MouseEvent) => seekAt(ev.clientX);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div className="select-none">
      <div ref={bar} onMouseDown={drag} className="relative h-9 cursor-pointer rounded-lg bg-white/[0.04]">
        {freeze > start && (
          <div className="absolute inset-y-0 left-0 rounded-l-lg bg-white/[0.03]" style={{ width: `${((freeze - start) / span) * 100}%` }} title="Фризтайм" />
        )}
        <div className="absolute inset-y-0 left-0 rounded-l-lg bg-[var(--color-signal)]/15" style={{ width: `${pct}%` }} />
        {markers.map((m, i) => {
          const left = ((m.tick - start) / span) * 100;
          if (left < 0 || left > 100) return null;
          return (
            <button
              key={i}
              type="button"
              title={m.label}
              onMouseDown={(e) => {
                e.stopPropagation();
                onSeek(m.tick - tickRate * 2);
              }}
              className="group absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${left}%` }}
            >
              <span
                className={cn('block transition-transform group-hover:scale-150', m.shape === 'diamond' ? 'h-2.5 w-2.5 rotate-45' : m.shape === 'bar' ? 'h-6 w-[3px] rounded' : 'h-2.5 w-2.5 rounded-full')}
                style={{ background: m.color, boxShadow: `0 0 8px ${m.color}` }}
              />
            </button>
          );
        })}
        <div className="pointer-events-none absolute inset-y-0 w-[2px] bg-white" style={{ left: `${pct}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-slate-500">
        <span>{fmtClock((start - freeze) / tickRate)}</span>
        <span className="text-slate-300">{tick >= freeze ? fmtClock((tick - freeze) / tickRate) : `фризтайм −${fmtClock((freeze - tick) / tickRate)}`}</span>
        <span>{fmtClock((end - freeze) / tickRate)}</span>
      </div>
    </div>
  );
}

export function ReplayControls({ clock, tickRate, extra }: { clock: ReturnType<typeof useReplayClock>; tickRate: number; extra?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => clock.setTick(clock.tick - tickRate * 5)} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10" title="−5 с (←)">
        <SkipBack className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => clock.setPlaying(!clock.playing)}
        className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--color-signal)] text-white shadow-[0_6px_18px_rgba(255,90,31,0.35)]"
        title="Пробел"
      >
        {clock.playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
      </button>
      <button type="button" onClick={() => clock.setTick(clock.tick + tickRate * 5)} className="rounded-lg border border-white/10 p-2 text-slate-300 hover:bg-white/10" title="+5 с (→)">
        <SkipForward className="h-4 w-4" />
      </button>
      <div className="ml-1 inline-flex rounded-lg border border-white/10 bg-black/30 p-0.5">
        {[0.25, 0.5, 1, 2, 4, 8].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => clock.setSpeed(s)}
            className={cn('rounded-md px-1.5 py-1 font-mono text-[11px]', clock.speed === s ? 'bg-white/[0.12] text-white' : 'text-slate-500 hover:text-white')}
          >
            {s}×
          </button>
        ))}
      </div>
      {extra}
      <span className="ml-auto hidden font-mono text-[10px] text-slate-600 md:inline">Пробел · ←/→ 5 с · ,/. кадр · [ ] скорость</span>
    </div>
  );
}
