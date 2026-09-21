import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  Eraser,
  Loader2,
  Mic,
  Pause,
  Pencil,
  Play,
  Save,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  deleteDrawing,
  deleteVoiceNote,
  getDrawings,
  getVoiceNotes,
  saveDrawing,
  uploadVoiceNote,
  type CoachDrawing,
  type DrawingStroke,
} from '../api/coach';
import { apiClient, getErrorMessage } from '../api/client';
import { getMapConfig } from '../utils/mapConfig';
import { cn } from '../lib/cn';

// ---------- Voice notes ----------

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function VoiceNotes({ matchId }: { matchId: string }) {
  const queryClient = useQueryClient();
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [title, setTitle] = useState('');
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);
  const [pendingDuration, setPendingDuration] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['coach', 'notes', matchId],
    queryFn: () => getVoiceNotes(matchId),
  });

  const uploadMutation = useMutation({
    mutationFn: () =>
      uploadVoiceNote(matchId, pendingBlob!, {
        title: title || 'Voice note',
        durationSeconds: pendingDuration,
      }),
    onSuccess: () => {
      toast.success('Voice note saved');
      setPendingBlob(null);
      setTitle('');
      queryClient.invalidateQueries({ queryKey: ['coach', 'notes', matchId] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteVoiceNote,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach', 'notes', matchId] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setPendingBlob(new Blob(chunksRef.current, { type: mimeType }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((v) => v + 1), 1000);
    } catch {
      toast.error('Microphone access denied — allow it in browser settings');
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    setPendingDuration(elapsed);
    if (timerRef.current) clearInterval(timerRef.current);
  };

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stop();
      audioRef.current?.pause();
    },
    [],
  );

  const playNote = async (noteId: string) => {
    if (playingId === noteId) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    try {
      const { data } = await apiClient.get(`/coach/notes/${noteId}/audio`, {
        responseType: 'blob',
      });
      audioRef.current?.pause();
      const audio = new Audio(URL.createObjectURL(data));
      audio.onended = () => setPlayingId(null);
      audioRef.current = audio;
      setPlayingId(noteId);
      await audio.play();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div className="card-premium p-5">
      <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-white">
        <Mic className="h-4 w-4 text-orange-400" />
        Voice Notes
      </h3>

      {/* Recorder */}
      {pendingBlob ? (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            uploadMutation.mutate();
          }}
          className="mb-4 space-y-3 rounded-xl border border-orange-400/20 bg-orange-500/5 p-4"
        >
          <p className="text-xs text-slate-400">
            Recording ready · {formatDuration(pendingDuration)}
          </p>
          <input
            type="text"
            maxLength={120}
            placeholder="Note title (e.g. 'B retake round 7')"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-orange-400/50"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={uploadMutation.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2 text-xs font-bold text-white hover:from-orange-400 hover:to-amber-400 disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              Save note
            </button>
            <button
              type="button"
              onClick={() => setPendingBlob(null)}
              className="rounded-lg border border-white/10 px-4 py-2 text-xs text-slate-400 hover:text-white"
            >
              Discard
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={recording ? stopRecording : startRecording}
          className={cn(
            'mb-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold transition-all',
            recording
              ? 'animate-pulse bg-red-500/20 text-red-300 ring-1 ring-red-400/40'
              : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white hover:from-orange-400 hover:to-amber-400',
          )}
        >
          {recording ? (
            <>
              <Square className="h-4 w-4" />
              Stop recording · {formatDuration(elapsed)}
            </>
          ) : (
            <>
              <Mic className="h-4 w-4" />
              Record voice note
            </>
          )}
        </button>
      )}

      {/* Notes list */}
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-slate-600" />
      ) : notes.length === 0 ? (
        <p className="text-xs text-slate-500">
          No voice notes yet — record tactical observations for your team.
        </p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className="group flex items-center gap-3 rounded-xl border border-white/5 bg-slate-950/40 px-3 py-2.5"
            >
              <button
                type="button"
                onClick={() => playNote(note.id)}
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all',
                  playingId === note.id
                    ? 'bg-orange-500/30 text-orange-300'
                    : 'bg-white/5 text-slate-300 hover:bg-orange-500/20 hover:text-orange-300',
                )}
              >
                {playingId === note.id ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{note.title || 'Voice note'}</p>
                <p className="text-[11px] text-slate-500">
                  {note.author} · {formatDuration(note.duration_seconds)} ·{' '}
                  {new Date(note.created_at).toLocaleString('en-US', {
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(note.id)}
                className="rounded-lg p-1.5 text-slate-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Tactical drawing board ----------

const COLORS = ['#22d3ee', '#f97316', '#ef4444', '#22c55e', '#eab308', '#ffffff'];

function drawStroke(ctx: CanvasRenderingContext2D, stroke: DrawingStroke, w: number, h: number) {
  if (stroke.points.length < 2) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(stroke.points[0][0] * w, stroke.points[0][1] * h);
  for (const [x, y] of stroke.points.slice(1)) {
    ctx.lineTo(x * w, y * h);
  }
  ctx.stroke();

  if (stroke.tool === 'arrow') {
    const [x1, y1] = stroke.points[stroke.points.length - 2];
    const [x2, y2] = stroke.points[stroke.points.length - 1];
    const angle = Math.atan2((y2 - y1) * h, (x2 - x1) * w);
    const headLength = 14;
    ctx.beginPath();
    ctx.moveTo(x2 * w, y2 * h);
    ctx.lineTo(
      x2 * w - headLength * Math.cos(angle - Math.PI / 6),
      y2 * h - headLength * Math.sin(angle - Math.PI / 6),
    );
    ctx.moveTo(x2 * w, y2 * h);
    ctx.lineTo(
      x2 * w - headLength * Math.cos(angle + Math.PI / 6),
      y2 * h - headLength * Math.sin(angle + Math.PI / 6),
    );
    ctx.stroke();
  }
}

function DrawingBoard({ matchId, mapName }: { matchId: string; mapName: string }) {
  const queryClient = useQueryClient();
  const mapConfig = getMapConfig(mapName);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [tool, setTool] = useState<'pen' | 'arrow'>('pen');
  const [color, setColor] = useState(COLORS[0]);
  const [drawingName, setDrawingName] = useState('');
  const currentStroke = useRef<DrawingStroke | null>(null);

  const { data: savedDrawings = [] } = useQuery({
    queryKey: ['coach', 'drawings', matchId],
    queryFn: () => getDrawings(matchId),
  });

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) drawStroke(ctx, stroke, canvas.width, canvas.height);
    if (currentStroke.current) {
      drawStroke(ctx, currentStroke.current, canvas.width, canvas.height);
    }
  }, [strokes]);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      redraw();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [redraw]);

  useEffect(redraw, [redraw]);

  const relPoint = (e: React.PointerEvent): [number, number] => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ];
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    currentStroke.current = { tool, color, width: tool === 'arrow' ? 3 : 2.5, points: [relPoint(e)] };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const stroke = currentStroke.current;
    if (!stroke) return;
    if (stroke.tool === 'arrow') {
      // Arrow keeps only start + current end point
      stroke.points = [stroke.points[0], relPoint(e)];
    } else {
      stroke.points.push(relPoint(e));
    }
    redraw();
  };

  const handlePointerUp = () => {
    const stroke = currentStroke.current;
    currentStroke.current = null;
    if (stroke && stroke.points.length >= 2) {
      setStrokes((prev) => [...prev, stroke]);
    }
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      saveDrawing(matchId, {
        name: drawingName || 'Tactic',
        map_name: mapName,
        data: strokes,
      }),
    onSuccess: () => {
      toast.success('Drawing saved');
      setDrawingName('');
      queryClient.invalidateQueries({ queryKey: ['coach', 'drawings', matchId] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDrawing,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coach', 'drawings', matchId] }),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const loadDrawing = (drawing: CoachDrawing) => {
    setStrokes(drawing.data);
    toast.info(`Loaded "${drawing.name}"`);
  };

  return (
    <div className="card-premium p-5">
      <h3 className="mb-4 flex items-center gap-2 font-display text-base font-bold text-white">
        <Pencil className="h-4 w-4 text-cyan-400" />
        Tactical Board
      </h3>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl bg-slate-950/60 p-1">
          <button
            type="button"
            onClick={() => setTool('pen')}
            title="Freehand pen"
            className={cn(
              'rounded-lg p-2 transition-all',
              tool === 'pen' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white',
            )}
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setTool('arrow')}
            title="Arrow"
            className={cn(
              'rounded-lg p-2 transition-all',
              tool === 'arrow' ? 'bg-cyan-500/20 text-cyan-300' : 'text-slate-500 hover:text-white',
            )}
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1.5">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={cn(
                'h-6 w-6 rounded-full transition-transform',
                color === c && 'scale-110 ring-2 ring-white/60',
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={() => setStrokes((prev) => prev.slice(0, -1))}
            disabled={strokes.length === 0}
            title="Undo"
            className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-white disabled:opacity-40"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setStrokes([])}
            disabled={strokes.length === 0}
            title="Clear all"
            className="rounded-lg border border-white/10 p-2 text-slate-400 hover:text-red-300 disabled:opacity-40"
          >
            <Eraser className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Canvas over radar */}
      <div
        ref={containerRef}
        className="relative mx-auto aspect-square w-full max-w-[560px] overflow-hidden rounded-xl border border-white/10"
      >
        <img
          src={mapConfig.imageUrl}
          alt={mapConfig.displayName}
          className="absolute inset-0 h-full w-full object-contain opacity-80"
          draggable={false}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full cursor-crosshair touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      {/* Save */}
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (strokes.length > 0) saveMutation.mutate();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          maxLength={80}
          placeholder="Tactic name (e.g. 'A split from mid')"
          value={drawingName}
          onChange={(e) => setDrawingName(e.target.value)}
          className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
        />
        <button
          type="submit"
          disabled={strokes.length === 0 || saveMutation.isPending}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          Save
        </button>
      </form>

      {/* Saved drawings */}
      {savedDrawings.length > 0 && (
        <div className="mt-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Saved tactics
          </p>
          {savedDrawings.map((drawing) => (
            <div
              key={drawing.id}
              className="group flex items-center gap-3 rounded-lg border border-white/5 bg-slate-950/40 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => loadDrawing(drawing)}
                className="min-w-0 flex-1 text-left"
              >
                <p className="truncate text-sm text-white group-hover:text-cyan-300">
                  {drawing.name}
                </p>
                <p className="text-[11px] text-slate-500">
                  {drawing.author} · {drawing.data.length} strokes ·{' '}
                  {new Date(drawing.updated_at).toLocaleDateString('en-US')}
                </p>
              </button>
              <button
                type="button"
                onClick={() => deleteMutation.mutate(drawing.id)}
                className="rounded-lg p-1.5 text-slate-600 opacity-0 transition-all hover:bg-red-500/10 hover:text-red-300 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Panel ----------

export function CoachPanel({ matchId, mapName }: { matchId: string; mapName: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <DrawingBoard matchId={matchId} mapName={mapName} />
      <VoiceNotes matchId={matchId} />
    </div>
  );
}
