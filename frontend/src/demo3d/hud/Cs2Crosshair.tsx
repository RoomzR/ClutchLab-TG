import { useEffect, useMemo, useRef, useState } from 'react';
import { decodeCrosshairShareCode, type Crosshair } from 'csgo-sharecode';

interface Cs2CrosshairProps {
  /** CSGO-xxxxx share code from demo (`m_szCrosshairCodes`). */
  code?: string | null;
}

/** cl_crosshaircolor 0–4 presets (5 = custom RGB). */
const PRESET_COLORS: Record<number, [number, number, number]> = {
  0: [255, 0, 0],
  1: [0, 255, 0],
  2: [255, 255, 0],
  3: [0, 0, 255],
  4: [0, 255, 255],
};

function crosshairRgb(c: Crosshair): [number, number, number] {
  if (c.color === 5) return [c.red, c.green, c.blue];
  return PRESET_COLORS[c.color] ?? PRESET_COLORS[1];
}

function normalizeCode(code: string): string {
  const t = code.trim();
  if (t.startsWith('CSGO-')) return t;
  if (/^(-?[A-Za-z0-9]{5}){5}/.test(t.replace(/^CSGO/, ''))) {
    return t.startsWith('-') ? `CSGO${t}` : `CSGO-${t}`;
  }
  return t;
}

/** Source HUD: YRES(x) = x * screenHeight / 480. */
function yres(units: number, viewHeight: number): number {
  return units * (viewHeight / 480);
}

function simpleRound(n: number): number {
  return n >= 0 ? Math.floor(n + 0.5) : Math.ceil(n - 0.5);
}

function roundBigFloats(n: number): number {
  const frac = Math.abs(n % 1);
  const modStr = frac.toFixed(3);
  if (modStr >= '0.500') {
    if (modStr === '0.500') return Math.floor(n - 0.1);
    return Math.ceil(n);
  }
  return Math.floor(n);
}

function fillRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: string,
) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = rgba;
  ctx.fillRect(x, y, w, h);
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  outline: number,
  outlineColor: string,
) {
  if (outline > 0) {
    const down = Math.floor(outline);
    const up = Math.ceil(outline);
    const sum = down + up;
    fillRect(ctx, x - down, y - down, w + sum, h + sum, outlineColor);
  }
  fillRect(ctx, x, y, w, h, color);
}

function paintCrosshair(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  c: Crosshair,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.imageSmoothingEnabled = false;

  const cx = width / 2;
  const cy = height / 2;
  const [r, g, b] = crosshairRgb(c);
  const alpha = c.alphaEnabled ? c.alpha / 255 : 1;
  const color = `rgba(${r},${g},${b},${alpha})`;
  const outlineColor = `rgba(0,0,0,${alpha})`;

  const gapRaw = c.style === 5 ? c.fixedCrosshairGap : c.gap;
  const gapUnits = c.style === 5 ? gapRaw : 4 + simpleRound(gapRaw);

  const size = Math.max(0, roundBigFloats(yres(c.length, height)));
  const thick = Math.max(1, roundBigFloats(yres(c.thickness, height)));
  const inner = roundBigFloats(yres(gapUnits, height));
  const outline = c.outlineEnabled ? Math.max(0, c.outline) : 0;

  const x0 = Math.round(cx - thick / 2);
  const y0 = Math.round(cy - thick / 2);

  if (size > 0) {
    if (!c.tStyleEnabled) {
      drawArm(ctx, x0, Math.round(cy - inner - size), thick, size, color, outline, outlineColor);
    }
    drawArm(ctx, x0, Math.round(cy + inner), thick, size, color, outline, outlineColor);
    drawArm(ctx, Math.round(cx - inner - size), y0, size, thick, color, outline, outlineColor);
    drawArm(ctx, Math.round(cx + inner), y0, size, thick, color, outline, outlineColor);
  }

  if (c.centerDotEnabled) {
    drawArm(ctx, x0, y0, thick, thick, color, outline, outlineColor);
  }
}

/**
 * CS2 crosshair from demo share code.
 * Keeps last good decode so null/decode blips don't flash a different default.
 */
export function Cs2Crosshair({ code }: Cs2CrosshairProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });

  const decoded = useMemo(() => {
    if (!code) return null;
    try {
      return decodeCrosshairShareCode(normalizeCode(code));
    } catch {
      return null;
    }
  }, [code]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      if (!cr) return;
      const w = Math.max(1, Math.floor(cr.width));
      const h = Math.max(1, Math.floor(cr.height));
      // Ignore sub-pixel layout jitter that re-YRES the arms every frame.
      setViewSize((prev) => {
        if (Math.abs(prev.w - w) < 4 && Math.abs(prev.h - h) < 4) return prev;
        return { w, h };
      });
    });
    ro.observe(el);
    setViewSize({
      w: Math.max(1, Math.floor(el.clientWidth)),
      h: Math.max(1, Math.floor(el.clientHeight)),
    });
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !decoded || viewSize.w < 2 || viewSize.h < 2) return;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewSize.w * dpr);
    canvas.height = Math.floor(viewSize.h * dpr);
    canvas.style.width = `${viewSize.w}px`;
    canvas.style.height = `${viewSize.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintCrosshair(ctx, viewSize.w, viewSize.h, decoded);
  }, [decoded, viewSize]);

  if (!decoded) {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
        <div className="relative h-8 w-8">
          <span className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-white/90" />
          <span className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-white/90" />
          <span className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-white/90" />
          <span className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-white/90" />
        </div>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0 z-20">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
