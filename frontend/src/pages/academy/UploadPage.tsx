import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, Loader2, RotateCcw, Trash2, UploadCloud, XCircle } from 'lucide-react';
import { academyApi, uploadAcademyDemo } from '../../api/academy';
import { getErrorMessage } from '../../api/client';
import { Badge, Button, Field, PageHeader, Panel, PanelHeader, Select, inputCls } from '../../academy/ui';
import { MATCH_TYPE_RU } from '../../academy/radar';
import { cn } from '../../lib/cn';

const MAX_MB = 600;
const STAGE_RU: Record<string, string> = {
  queued: 'В очереди на загрузку', uploading: 'Загрузка', pending: 'В очереди на разбор', parsing: 'Парсинг демки',
  saving: 'Сохранение событий', analyzing: 'Статистика и ИИ-разбор', ready: 'Готово', error: 'Ошибка',
};

interface Item {
  id: string;
  file: File;
  matchType: string;
  opponent: string;
  playedAt: string;
  stage: string;
  uploadPct: number;
  parsePct: number;
  matchId?: string;
  error?: string;
  abort?: AbortController;
}

export function UploadPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [drag, setDrag] = useState(false);
  const [defaults, setDefaults] = useState({ matchType: 'scrim', opponent: '', playedAt: '' });
  const [autoOpen, setAutoOpen] = useState(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const patch = useCallback((id: string, p: Partial<Item>) => setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...p } : it))), []);

  const addFiles = (files: FileList | File[]) => {
    const next: Item[] = [];
    for (const f of Array.from(files)) {
      if (!f.name.toLowerCase().endsWith('.dem')) continue;
      next.push({
        id: `${f.name}-${f.size}-${Math.random().toString(36).slice(2, 7)}`, file: f, matchType: defaults.matchType,
        opponent: defaults.opponent, playedAt: defaults.playedAt, stage: f.size > MAX_MB * 1024 * 1024 ? 'error' : 'queued',
        uploadPct: 0, parsePct: 0, error: f.size > MAX_MB * 1024 * 1024 ? `Файл больше ${MAX_MB} МБ` : undefined,
      });
    }
    setItems((prev) => [...prev, ...next]);
  };

  const start = async (it: Item) => {
    const abort = new AbortController();
    patch(it.id, { stage: 'uploading', abort, error: undefined, uploadPct: 0 });
    try {
      const res = await uploadAcademyDemo(
        it.file,
        { match_type: it.matchType, opponent_name: it.opponent || undefined, played_at: it.playedAt ? new Date(it.playedAt).toISOString() : undefined },
        (pct) => patch(it.id, { uploadPct: pct }),
        abort.signal,
      );
      patch(it.id, { stage: 'pending', matchId: res.match_id, uploadPct: 100 });
    } catch (e) {
      patch(it.id, { stage: 'error', error: getErrorMessage(e) });
    }
  };

  const startAll = () => items.filter((i) => i.stage === 'queued').forEach((i) => void start(i));

  // poll parse status for uploaded items
  useEffect(() => {
    const active = items.filter((i) => i.matchId && !['ready', 'error'].includes(i.stage));
    if (!active.length) return;
    const t = setInterval(async () => {
      for (const it of active) {
        try {
          const s = await academyApi.matchStatus(it.matchId!);
          patch(it.id, { stage: s.status, parsePct: s.progress, error: s.status === 'error' ? (s.message ?? 'Ошибка парсинга') : undefined });
          if (s.status === 'ready') qc.invalidateQueries({ queryKey: ['academy'] });
        } catch {
          /* transient */
        }
      }
    }, 1500);
    return () => clearInterval(t);
  }, [items, patch, qc]);

  useEffect(() => {
    if (!autoOpen || items.length !== 1) return;
    const only = items[0];
    if (only.stage === 'ready' && only.matchId) navigate(`/match/${only.matchId}`);
  }, [items, autoOpen, navigate]);

  return (
    <div className="animate-fade-in">
      <PageHeader eyebrow="Шаг 1 из 3" title="Загрузка демок" subtitle="Перетащите .dem одного или нескольких матчей. Парсинг идёт в фоне: ~1 минута на матч, страницу можно закрыть." />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()}
            className={cn(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all',
              drag ? 'border-[var(--color-signal)] bg-[var(--color-signal)]/[0.07]' : 'border-white/12 bg-white/[0.02] hover:border-white/25',
            )}
          >
            <UploadCloud className={cn('mb-3 h-12 w-12', drag ? 'text-[var(--color-signal)]' : 'text-slate-500')} />
            <p className="font-display text-lg font-bold">Перетащите демки сюда</p>
            <p className="mt-1 text-sm text-slate-500">или нажмите, чтобы выбрать файлы · только .dem · до {MAX_MB} МБ</p>
            <input ref={fileInput} type="file" accept=".dem" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          </div>

          {items.length > 0 && (
            <Panel>
              <PanelHeader
                title={`Файлы · ${items.length}`}
                actions={<>
                  <label className="flex items-center gap-1.5 text-xs text-slate-400"><input type="checkbox" checked={autoOpen} onChange={(e) => setAutoOpen(e.target.checked)} />Открыть разбор после парсинга</label>
                  <Button variant="primary" onClick={startAll} disabled={!items.some((i) => i.stage === 'queued')}><FileUp className="h-4 w-4" />Загрузить все</Button>
                </>}
              />
              <ul className="space-y-3">
                {items.map((it) => (
                  <li key={it.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <StageIcon stage={it.stage} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{it.file.name}</p>
                        <p className="text-[11px] text-slate-500">{(it.file.size / 1024 / 1024).toFixed(1)} МБ · {STAGE_RU[it.stage] ?? it.stage}</p>
                      </div>
                      {it.stage === 'queued' && (
                        <>
                          <Select value={it.matchType} onChange={(v) => patch(it.id, { matchType: v })} options={Object.entries(MATCH_TYPE_RU).map(([value, label]) => ({ value, label }))} className="w-36" />
                          <input value={it.opponent} onChange={(e) => patch(it.id, { opponent: e.target.value })} placeholder="Соперник" className={cn(inputCls, 'w-36 py-1.5')} />
                          <input type="datetime-local" value={it.playedAt} onChange={(e) => patch(it.id, { playedAt: e.target.value })} className={cn(inputCls, 'w-48 py-1.5')} title="Когда сыгран (по умолчанию — время загрузки)" />
                          <Button size="sm" variant="primary" onClick={() => void start(it)}>Загрузить</Button>
                          <button type="button" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))} className="p-1 text-slate-500 hover:text-rose-300"><Trash2 className="h-4 w-4" /></button>
                        </>
                      )}
                      {it.stage === 'uploading' && <Button size="sm" variant="ghost" onClick={() => it.abort?.abort()}>Отменить</Button>}
                      {it.stage === 'error' && !it.matchId && it.file.size <= MAX_MB * 1024 * 1024 && <Button size="sm" onClick={() => void start(it)}><RotateCcw className="h-3.5 w-3.5" />Ещё раз</Button>}
                      {it.stage === 'error' && it.matchId && <Button size="sm" onClick={async () => { await academyApi.reparse(it.matchId!); patch(it.id, { stage: 'pending', error: undefined }); }}><RotateCcw className="h-3.5 w-3.5" />Перепарсить</Button>}
                      {it.stage === 'ready' && it.matchId && <Link to={`/match/${it.matchId}`}><Button size="sm" variant="primary">Открыть разбор</Button></Link>}
                    </div>
                    {(it.stage === 'uploading' || (it.matchId && it.stage !== 'ready' && it.stage !== 'error')) && (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <Progress label="Загрузка" pct={it.uploadPct} />
                        <Progress label="Разбор" pct={it.parsePct} active={!!it.matchId} />
                      </div>
                    )}
                    {it.error && <p className="mt-2 text-xs text-rose-300">{it.error}</p>}
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </div>

        <div className="space-y-4">
          <Panel>
            <PanelHeader title="Значения по умолчанию" subtitle="Применяются к новым файлам" />
            <div className="space-y-3">
              <Field label="Тип матча">
                <Select value={defaults.matchType} onChange={(v) => setDefaults({ ...defaults, matchType: v })} options={Object.entries(MATCH_TYPE_RU).map(([value, label]) => ({ value, label }))} />
              </Field>
              <Field label="Соперник" hint="Название команды соперника — для разведки и фильтров">
                <input value={defaults.opponent} onChange={(e) => setDefaults({ ...defaults, opponent: e.target.value })} className={inputCls} placeholder="Например, SKYNET" />
              </Field>
              <Field label="Дата матча">
                <input type="datetime-local" value={defaults.playedAt} onChange={(e) => setDefaults({ ...defaults, playedAt: e.target.value })} className={inputCls} />
              </Field>
            </div>
          </Panel>
          <Panel>
            <PanelHeader title="Что произойдёт" />
            <ol className="space-y-2 text-sm text-slate-400">
              <li><Badge tone="signal">1</Badge> Парсер достаёт из демки убийства, урон, выстрелы, гранаты, экономику, позиции, пинги и чат.</li>
              <li><Badge tone="signal">2</Badge> Считается полный каталог статистики по игрокам, сторонам и раундам.</li>
              <li><Badge tone="signal">3</Badge> Детекторы находят ошибки с доказательствами и ссылками на момент в реплее.</li>
              <li><Badge tone="signal">4</Badge> Готов хаб матча: разбор, ИИ-тренер, ДЗ в один клик.</li>
            </ol>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function StageIcon({ stage }: { stage: string }) {
  if (stage === 'ready') return <CheckCircle2 className="h-5 w-5 text-emerald-400" />;
  if (stage === 'error') return <XCircle className="h-5 w-5 text-rose-400" />;
  if (stage === 'queued') return <FileUp className="h-5 w-5 text-slate-500" />;
  return <Loader2 className="h-5 w-5 animate-spin text-[var(--color-signal)]" />;
}

function Progress({ label, pct, active = true }: { label: string; pct: number; active?: boolean }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>{label}</span><span>{active ? `${pct}%` : '—'}</span></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-[var(--color-signal)] transition-all" style={{ width: `${active ? pct : 0}%` }} /></div>
    </div>
  );
}
