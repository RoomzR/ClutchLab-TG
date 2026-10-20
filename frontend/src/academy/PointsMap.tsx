import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { RADAR, radarImage, toRadar } from './radar';
import { cn } from '../lib/cn';

export interface MapPoint {
  x: number;
  y: number;
  color: string;
  size?: number;
  fromX?: number;
  fromY?: number;
  label?: string;
  id?: string;
  ring?: number;
}

const cache = new Map<string, HTMLImageElement>();

export function PointsMap({ mapName, points, density = false, onPointClick, onMapClick, className, highlight, children }: {
  mapName: string;
  points: MapPoint[];
  density?: boolean;
  onPointClick?: (p: MapPoint) => void;
  onMapClick?: (worldRadar: [number, number]) => void;
  className?: string;
  highlight?: string | null;
  children?: ReactNode;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState(560);
  const [, force] = useState(0);
  const [hover, setHover] = useState<MapPoint | null>(null);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver((e) => setSize(Math.max(260, Math.floor(e[0].contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    const s = (size * dpr) / RADAR;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#08080a';
    ctx.fillRect(0, 0, c.width, c.height);
    let img = cache.get(mapName);
    if (!img) {
      img = new Image();
      img.src = radarImage(mapName);
      cache.set(mapName, img);
    }
    if (!img.complete) img.addEventListener('load', () => force((n) => n + 1), { once: true });
    ctx.setTransform(s, 0, 0, s, 0, 0);
    if (img.complete && img.naturalWidth) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, 0, 0, RADAR, RADAR);
      ctx.globalAlpha = 1;
    }
    if (density) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of points) {
        const [x, y] = toRadar(mapName, p.x, p.y);
        const r = (p.size ?? 1) * 26;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, p.color + '66');
        g.addColorStop(1, p.color + '00');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    for (const p of points) {
      const [x, y] = toRadar(mapName, p.x, p.y);
      if (p.fromX != null && p.fromY != null) {
        const [fx, fy] = toRadar(mapName, p.fromX, p.fromY);
        ctx.strokeStyle = p.color + (highlight && p.id === highlight ? 'ff' : '66');
        ctx.lineWidth = highlight && p.id === highlight ? 2.5 : 1.2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(fx, fy, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p.ring) {
        const unitsPerPx = toRadar(mapName, 100, 0)[0] - toRadar(mapName, 0, 0)[0];
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, (p.ring * unitsPerPx) / 100, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!density || p.fromX != null) {
        const r = (p.size ?? 1) * 4.5 * (highlight && p.id === highlight ? 1.6 : 1);
        ctx.fillStyle = p.color;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
  }, [size, points, mapName, density, highlight]);

  const nearest = (e: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const rx = ((e.clientX - rect.left) / rect.width) * RADAR;
    const ry = ((e.clientY - rect.top) / rect.height) * RADAR;
    let best: MapPoint | null = null;
    let bd = 14;
    for (const p of points) {
      const [x, y] = toRadar(mapName, p.x, p.y);
      const d = Math.hypot(x - rx, y - ry);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return { best, rx, ry };
  };

  return (
    <div ref={wrap} className={cn('relative w-full', className)}>
      <canvas
        ref={canvas}
        style={{ width: size, height: size }}
        className="block rounded-xl border border-white/[0.06]"
        onMouseMove={(e) => setHover(nearest(e).best)}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const { best, rx, ry } = nearest(e);
          if (best && onPointClick) onPointClick(best);
          else onMapClick?.([rx, ry]);
        }}
      />
      {hover?.label && (
        <div className="pointer-events-none absolute left-3 top-3 max-w-[70%] rounded-lg border border-white/10 bg-black/85 px-2.5 py-1.5 text-xs text-slate-200">{hover.label}</div>
      )}
      {children}
    </div>
  );
}
