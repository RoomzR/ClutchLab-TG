import { type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUpRight, Circle, Eraser, Flame, Hand, Minus, MousePointer2, PenLine, Radio, Sparkle, Type, Undo2, Users, Wind } from 'lucide-react';
import { academyApi } from '../../api/academy';
import { getAccessToken } from '../../api/tokenStorage';
import { ReplayCanvas, ReplayControls, ReplayTimeline, useReplayClock } from '../../academy/replay';
import { Badge, Button, ErrorBox, Loading, Select } from '../../academy/ui';
import { CT_COLOR, GRENADE_COLOR, RADAR, T_COLOR, mapTitle } from '../../academy/radar';
import type { BoardShape } from '../../types/academy';
import { cn } from '../../lib/cn';

type Tool = 'select' | 'pen' | 'arrow' | 'line' | 'circle' | 'text' | 'ct' | 't' | 'smoke' | 'flash' | 'molotov';
const COLORS = ['#ff5a1f', '#ffffff', '#5b8cff', '#f5a524', '#34d399', '#f472b6', '#facc15'];
const TOOL_KEYS: Record<string, Tool> = { v: 'select', p: 'pen', a: 'arrow', l: 'line', c: 'circle', t: 'text' };

interface Peer { id: string; name: string; color: string }
interface Cursor { id: string; name: string; color: string; x: number; y: number; at: number }

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function wsUrl(boardId: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');
  const abs = base.startsWith('http') ? base : `${window.location.origin}${base}`;
  return `${abs.replace(/^http/, 'ws')}/academy/ws/boards/${boardId}?token=${encodeURIComponent(getAccessToken() ?? '')}`;
}

function drawShape(ctx: CanvasRenderingContext2D, s: BoardShape, selected: boolean) {
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const [a, b] = [s.points[0], s.points[s.points.length - 1]];
  if (s.kind === 'pen' && s.points.length > 1) {
    ctx.beginPath();
    s.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  } else if ((s.kind === 'line' || s.kind === 'arrow') && a && b) {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(b[0], b[1]);
    ctx.stroke();
    if (s.kind === 'arrow') {
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const h = 10 + s.width * 2.5;
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[0] - h * Math.cos(ang - 0.45), b[1] - h * Math.sin(ang - 0.45));
      ctx.lineTo(b[0] - h * Math.cos(ang + 0.45), b[1] - h * Math.sin(ang + 0.45));
      ctx.closePath();
      ctx.fill();
    }
  } else if (s.kind === 'circle' && a && b) {
    ctx.beginPath();
    ctx.arc(a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]), 0, Math.PI * 2);
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  } else if (s.kind === 'text' && a) {
    ctx.font = `bold ${12 + s.width * 3}px Sora, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.strokeText(s.text ?? '', a[0], a[1]);
    ctx.fillText(s.text ?? '', a[0], a[1]);
  } else if (a) {
    const colors: Record<string, string> = { ct: CT_COLOR, t: T_COLOR, smoke: GRENADE_COLOR.smoke, flash: GRENADE_COLOR.flash, molotov: GRENADE_COLOR.molotov, he: GRENADE_COLOR.he };
    const r = s.kind === 'smoke' ? 26 : s.kind === 'molotov' ? 22 : 11;
    ctx.fillStyle = colors[s.kind] ?? s.color;
    ctx.globalAlpha = s.kind === 'smoke' || s.kind === 'molotov' ? 0.55 : 1;
    ctx.beginPath();
    ctx.arc(a[0], a[1], r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 10px Sora, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(s.kind === 'ct' ? 'CT' : s.kind === 't' ? 'T' : s.text ?? '', a[0], a[1] + 3.5);
  }
  if (selected) {
    const xs = s.points.map((p) => p[0]);
    const ys = s.points.map((p) => p[1]);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(Math.min(...xs) - 10, Math.min(...ys) - 10, Math.max(...xs) - Math.min(...xs) + 20, Math.max(...ys) - Math.min(...ys) + 20);
  }
  ctx.restore();
}

function hit(s: BoardShape, x: number, y: number): boolean {
  if (s.kind === 'circle' && s.points.length > 1) {
    const r = Math.hypot(s.points[1][0] - s.points[0][0], s.points[1][1] - s.points[0][1]);
    return Math.abs(Math.hypot(x - s.points[0][0], y - s.points[0][1]) - r) < 12 || Math.hypot(x - s.points[0][0], y - s.points[0][1]) < 14;
  }
  return s.points.some(([px, py]) => Math.hypot(px - x, py - y) < 16);
}

export function BoardPage() {
  const { boardId = '' } = useParams();
  const board = useQuery({ queryKey: ['academy', 'board', boardId], queryFn: () => academyApi.board(boardId), staleTime: Infinity });
  if (board.isLoading) return <Loading />;
  if (board.isError || !board.data) return <ErrorBox message="Доска не найдена" />;
  return <BoardEditor key={boardId} boardId={boardId} initial={board.data} />;
}

function BoardEditor({ boardId, initial }: { boardId: string; initial: import('../../types/academy').Board }) {
  const [shapes, setShapes] = useState<BoardShape[]>(initial.shapes ?? []);
  const [tool, setTool] = useState<Tool>('arrow');
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(3);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<BoardShape | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [connected, setConnected] = useState(false);
  const [follow, setFollow] = useState(true);
  const [title, setTitle] = useState(initial.title);
  const [round, setRound] = useState<number | null>(initial.round_number);
  const ws = useRef<WebSocket | null>(null);
  const me = useRef<Peer | null>(null);
  const layer = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; start: [number, number]; orig: [number, number][] } | null>(null);
  const lastCursor = useRef(0);
  const remoteReplay = useRef(false);

  const summary = useQuery({ queryKey: ['academy', 'match', initial.match_id, 'summary'], queryFn: () => academyApi.matchSummary(initial.match_id!), enabled: !!initial.match_id, staleTime: 60_000 });
  const rs = summary.data?.rounds.find((r) => r.round === round);
  const tickRate = Number(summary.data?.match.tick_rate) || 64;
  const positions = useQuery({ queryKey: ['academy', 'match', initial.match_id, 'pos', round], queryFn: () => academyApi.roundPositions(initial.match_id!, round!), enabled: !!initial.match_id && !!round, staleTime: Infinity });
  const grenades = useQuery({ queryKey: ['academy', 'match', initial.match_id, 'gren', round], queryFn: () => academyApi.roundGrenades(initial.match_id!, round!), enabled: !!initial.match_id && !!round, staleTime: Infinity });
  const start = rs ? Math.max(rs.start_tick ?? rs.freeze_tick, rs.freeze_tick - tickRate * 4) : 0;
  const end = rs ? rs.end_tick + tickRate * 3 : 1;
  const clock = useReplayClock(start, end, tickRate);

  const send = useCallback((msg: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (initial.tick && rs) clock.setTick(initial.tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rs?.round]);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const connect = () => {
      const sock = new WebSocket(wsUrl(boardId));
      ws.current = sock;
      sock.onopen = () => setConnected(true);
      sock.onclose = (e) => {
        setConnected(false);
        if (!closed && e.code !== 4401 && e.code !== 4403) retry = setTimeout(connect, 1500);
        if (e.code === 4401) toast.error('Сессия истекла — войдите снова');
      };
      sock.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'init') {
          me.current = msg.me;
          setShapes(msg.shapes ?? []);
          setPeers(msg.peers ?? []);
        } else if (msg.type === 'peers') setPeers(msg.peers);
        else if (msg.type === 'op') {
          const op = msg.op;
          setShapes((prev) => {
            if (op.action === 'add') return [...prev.filter((s) => s.id !== op.shape.id), op.shape];
            if (op.action === 'update') return prev.map((s) => (s.id === op.shape.id ? op.shape : s));
            if (op.action === 'delete') return prev.filter((s) => s.id !== op.id);
            if (op.action === 'clear') return [];
            return prev;
          });
        } else if (msg.type === 'cursor') {
          setCursors((c) => ({ ...c, [msg.id]: { ...msg, at: Date.now() } }));
        } else if (msg.type === 'replay' && msg.replay) {
          remoteReplay.current = true;
          if (msg.replay.round && msg.replay.round !== round) setRound(msg.replay.round);
          if (msg.replay.tick != null) clock.setTick(msg.replay.tick);
          clock.setPlaying(Boolean(msg.replay.playing));
          if (msg.replay.speed) clock.setSpeed(msg.replay.speed);
          setTimeout(() => (remoteReplay.current = false), 50);
        }
      };
    };
    connect();
    const ping = setInterval(() => send({ type: 'ping' }), 25_000);
    return () => {
      closed = true;
      clearInterval(ping);
      if (retry) clearTimeout(retry);
      ws.current?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // broadcast local replay changes (play/pause/seek/speed) when following
  const lastSent = useRef({ playing: false, speed: 1, tick: 0, round: 0 });
  useEffect(() => {
    if (remoteReplay.current || !follow || !rs) return;
    const l = lastSent.current;
    const seekedWhilePaused = !clock.playing && Math.abs(clock.tick - l.tick) > tickRate * 0.5;
    if (clock.playing !== l.playing || clock.speed !== l.speed || round !== l.round || seekedWhilePaused) {
      lastSent.current = { playing: clock.playing, speed: clock.speed, tick: clock.tick, round: round ?? 0 };
      send({ type: 'replay', round, tick: Math.round(clock.tick), playing: clock.playing, speed: clock.speed });
    }
  }, [clock.playing, clock.speed, clock.tick, round, follow, rs, send, tickRate]);

  const op = useCallback((o: { action: string; shape?: BoardShape; id?: string }) => send({ type: 'op', op: o }), [send]);

  const toRadar = (e: ReactPointerEvent): [number, number] => {
    const r = layer.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * RADAR, ((e.clientY - r.top) / r.height) * RADAR];
  };

  const down = (e: ReactPointerEvent) => {
    const [x, y] = toRadar(e);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === 'select') {
      const s = [...shapes].reverse().find((sh) => hit(sh, x, y));
      setSelected(s?.id ?? null);
      if (s) drag.current = { id: s.id, start: [x, y], orig: s.points };
      return;
    }
    if (tool === 'text') {
      const text = prompt('Текст на доске');
      if (!text) return;
      const s: BoardShape = { id: uid(), kind: 'text', points: [[x, y]], color, width, text, author: me.current?.name };
      setShapes((p) => [...p, s]);
      op({ action: 'add', shape: s });
      return;
    }
    if (['ct', 't', 'smoke', 'flash', 'molotov'].includes(tool)) {
      const s: BoardShape = { id: uid(), kind: tool as BoardShape['kind'], points: [[x, y]], color, width, author: me.current?.name };
      setShapes((p) => [...p, s]);
      op({ action: 'add', shape: s });
      return;
    }
    setDraft({ id: uid(), kind: tool as BoardShape['kind'], points: [[x, y], [x, y]], color, width, author: me.current?.name });
  };

  const move = (e: ReactPointerEvent) => {
    const [x, y] = toRadar(e);
    const now = Date.now();
    if (now - lastCursor.current > 60) {
      lastCursor.current = now;
      send({ type: 'cursor', x, y });
    }
    if (drag.current) {
      const d = drag.current;
      const dx = x - d.start[0];
      const dy = y - d.start[1];
      setShapes((prev) => prev.map((s) => (s.id === d.id ? { ...s, points: d.orig.map(([px, py]) => [px + dx, py + dy] as [number, number]) } : s)));
      return;
    }
    if (!draft) return;
    setDraft(draft.kind === 'pen' ? { ...draft, points: [...draft.points, [x, y]] } : { ...draft, points: [draft.points[0], [x, y]] });
  };

  const up = () => {
    if (drag.current) {
      const s = shapes.find((sh) => sh.id === drag.current!.id);
      if (s) op({ action: 'update', shape: s });
      drag.current = null;
      return;
    }
    if (!draft) return;
    const [a, b] = [draft.points[0], draft.points[draft.points.length - 1]];
    if (draft.kind !== 'pen' && Math.hypot(b[0] - a[0], b[1] - a[1]) < 4) {
      setDraft(null);
      return;
    }
    const s = draft.kind === 'pen' ? { ...draft, points: draft.points.filter((_, i) => i % 2 === 0 || i === draft.points.length - 1) } : draft;
    setShapes((p) => [...p, s]);
    op({ action: 'add', shape: s });
    setDraft(null);
  };

  const undo = useCallback(() => {
    const mine = [...shapes].reverse().find((s) => s.author === me.current?.name);
    if (!mine) return;
    setShapes((p) => p.filter((s) => s.id !== mine.id));
    op({ action: 'delete', id: mine.id });
  }, [shapes, op]);

  const removeSelected = useCallback(() => {
    if (!selected) return;
    setShapes((p) => p.filter((s) => s.id !== selected));
    op({ action: 'delete', id: selected });
    setSelected(null);
  }, [selected, op]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); undo(); return; }
      if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
      const k = TOOL_KEYS[e.key.toLowerCase()];
      if (k && !e.metaKey && !e.ctrlKey) setTool(k);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [undo, removeSelected]);

  useEffect(() => {
    const t = setInterval(() => setCursors((c) => Object.fromEntries(Object.entries(c).filter(([, v]) => Date.now() - v.at < 4000))), 2000);
    return () => clearInterval(t);
  }, []);

  const overlay = useCallback((ctx: CanvasRenderingContext2D) => {
    for (const s of shapes) drawShape(ctx, s, s.id === selected);
    if (draft) drawShape(ctx, draft, false);
  }, [shapes, draft, selected]);

  const saveTitle = async () => {
    if (title !== initial.title) await academyApi.updateBoard(boardId, { title });
  };

  const tools: { id: Tool; icon: ReactNode; title: string }[] = useMemo(() => [
    { id: 'select', icon: <MousePointer2 className="h-4 w-4" />, title: 'Выбор и перемещение (V)' },
    { id: 'pen', icon: <PenLine className="h-4 w-4" />, title: 'Перо (P)' },
    { id: 'arrow', icon: <ArrowUpRight className="h-4 w-4" />, title: 'Стрелка (A)' },
    { id: 'line', icon: <Minus className="h-4 w-4" />, title: 'Линия (L)' },
    { id: 'circle', icon: <Circle className="h-4 w-4" />, title: 'Зона (C)' },
    { id: 'text', icon: <Type className="h-4 w-4" />, title: 'Текст (T)' },
    { id: 'ct', icon: <span className="text-[10px] font-black text-[#a9c2ff]">CT</span>, title: 'Игрок CT' },
    { id: 't', icon: <span className="text-[10px] font-black text-[#ffd590]">T</span>, title: 'Игрок T' },
    { id: 'smoke', icon: <Wind className="h-4 w-4" />, title: 'Смок' },
    { id: 'flash', icon: <Sparkle className="h-4 w-4" />, title: 'Флешка' },
    { id: 'molotov', icon: <Flame className="h-4 w-4" />, title: 'Молотов' },
  ], []);

  return (
    <div className="grid gap-4 xl:grid-cols-[64px_minmax(0,1fr)_300px]">
      <div className="flex flex-row gap-1 xl:flex-col">
        {tools.map((t) => (
          <button key={t.id} type="button" title={t.title} onClick={() => setTool(t.id)}
            className={cn('flex h-11 w-11 items-center justify-center rounded-xl border transition', tool === t.id ? 'border-[var(--color-signal)] bg-[var(--color-signal)]/15 text-white' : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-white')}>
            {t.icon}
          </button>
        ))}
        <button type="button" title="Отменить своё (Ctrl+Z)" onClick={undo} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-white"><Undo2 className="h-4 w-4" /></button>
        <button type="button" title="Очистить доску" onClick={() => { if (confirm('Очистить доску для всех?')) { setShapes([]); op({ action: 'clear' }); } }} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-slate-400 hover:text-rose-300"><Eraser className="h-4 w-4" /></button>
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} className="min-w-0 flex-1 rounded-lg bg-transparent font-display text-xl font-bold outline-none focus:bg-white/[0.04]" />
          <Badge tone={connected ? 'good' : 'bad'}><Radio className="h-3 w-3" />{connected ? 'онлайн' : 'переподключение…'}</Badge>
          <Badge>{mapTitle(initial.map_name)}</Badge>
          {initial.match_id && <Link to={`/match/${initial.match_id}?tab=review&round=${round ?? 1}&tick=${Math.round(clock.tick)}`}><Button size="sm">К разбору матча</Button></Link>}
        </div>
        <div className="relative mx-auto max-w-[820px]">
          <ReplayCanvas
            mapName={initial.map_name}
            positions={positions.data ?? []}
            kills={rs?.kills ?? []}
            grenades={grenades.data ?? []}
            tick={clock.tick}
            tickRate={tickRate}
            overlay={overlay}
            trails={false}
          />
          <div
            ref={layer}
            className={cn('absolute inset-0 rounded-xl', tool === 'select' ? 'cursor-default' : 'cursor-crosshair')}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            style={{ touchAction: 'none' }}
          />
          {Object.values(cursors).map((c) => (
            <div key={c.id} className="pointer-events-none absolute flex items-center gap-1 text-[10px] font-bold" style={{ left: `${(c.x / RADAR) * 100}%`, top: `${(c.y / RADAR) * 100}%`, color: c.color }}>
              <Hand className="h-3.5 w-3.5" />{c.name}
            </div>
          ))}
        </div>
        {rs && (
          <div className="mx-auto max-w-[820px] space-y-2">
            <ReplayTimeline start={start} end={end} freeze={rs.freeze_tick} tick={clock.tick} tickRate={tickRate} markers={rs.kills.map((k) => ({ tick: k.tick, color: k.killer_side === 'CT' ? CT_COLOR : T_COLOR, label: `${k.killer} → ${k.victim}` }))} onSeek={clock.setTick} />
            <ReplayControls clock={clock} tickRate={tickRate} extra={
              <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} />Синхронизировать реплей со всеми</label>
            } />
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d10] p-4">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Цвет и толщина</p>
          <div className="flex flex-wrap gap-1.5">{COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-full border-2', color === c ? 'border-white' : 'border-transparent')} style={{ background: c }} />)}</div>
          <input type="range" min={1} max={8} value={width} onChange={(e) => setWidth(Number(e.target.value))} className="mt-3 w-full" />
          {selected && <Button size="sm" variant="danger" className="mt-2 w-full" onClick={removeSelected}>Удалить фигуру (Delete)</Button>}
        </div>
        {initial.match_id && summary.data && (
          <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d10] p-4">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Раунд реплея</p>
            <Select value={String(round ?? '')} onChange={(v) => setRound(Number(v))} options={summary.data.rounds.map((r) => ({ value: String(r.round), label: `R${r.round} · ${r.winner_team}` }))} />
          </div>
        )}
        <div className="rounded-2xl border border-white/[0.07] bg-[#0d0d10] p-4">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500"><Users className="h-3 w-3" />На доске · {peers.length}</p>
          <ul className="space-y-1">{peers.map((p) => <li key={p.id} className="flex items-center gap-2 text-sm"><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />{p.name}{p.id === me.current?.id && <span className="text-[10px] text-slate-500">(вы)</span>}</li>)}</ul>
          <Button size="sm" className="mt-3 w-full" onClick={async () => { await navigator.clipboard.writeText(window.location.href); toast.success('Ссылка на доску скопирована'); }}>Пригласить по ссылке</Button>
        </div>
        <p className="text-[11px] text-slate-600">Горячие клавиши: V P A L C T, Ctrl+Z — отменить своё, Delete — удалить выбранное.</p>
      </div>
    </div>
  );
}
