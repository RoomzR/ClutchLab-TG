import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, FileArchive, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { uploadDemo } from '../api/matches';
import { getErrorMessage } from '../api/client';
import {
  formatFileSize,
  LARGE_DEMO_WARNING_BYTES,
  MAX_DEMO_SIZE_BYTES,
} from '../utils/formatFileSize';
import { ProgressBar } from './ProgressBar';
import { cn } from '../lib/cn';

interface FileUploadProps {
  onUploadComplete: (matchId: string) => void;
  /** Silent attach — no UI selectors (used inside a folder / tournament). */
  folderId?: string | null;
  tournamentId?: string | null;
  stage?: string;
  /** Allow picking / dropping many .dem files at once. */
  multiple?: boolean;
}

export function FileUpload({
  onUploadComplete,
  folderId = null,
  tournamentId = null,
  stage = 'group',
  multiple = false,
}: FileUploadProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('Загружается...');
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addFiles = useCallback(
    (list: FileList | File[] | null) => {
      if (!list) return;
      const incoming = Array.from(list).filter((f) => f.name.endsWith('.dem'));
      if (incoming.length === 0) {
        toast.error('Выберите файл(ы) с расширением .dem');
        return;
      }
      setFiles((prev) => {
        const next = multiple ? [...prev, ...incoming] : [incoming[0]];
        // de-dupe by name+size
        const seen = new Set<string>();
        return next.filter((f) => {
          const k = `${f.name}:${f.size}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
      });
      setUploadProgress(0);
    },
    [multiple],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleUpload = async () => {
    if (files.length === 0) return;
    const tooBig = files.filter((f) => f.size > MAX_DEMO_SIZE_BYTES);
    if (tooBig.length) {
      toast.error(`${tooBig.length} файл(ов) больше 600 МБ — убери их из списка`);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setIsUploading(true);

    let done = 0;
    try {
      for (const file of files) {
        if (controller.signal.aborted) break;
        setUploadLabel(`${file.name} (${done + 1}/${files.length})`);
        setUploadProgress(0);
        const result = await uploadDemo(
          file,
          (pct) => setUploadProgress(pct),
          controller.signal,
          { folderId, tournamentId, stage },
        );
        done += 1;
        onUploadComplete(result.match_id);
      }
      if (!controller.signal.aborted) {
        toast.success(
          done === 1 ? 'Демка загружена' : `Загружено демок: ${done}`,
        );
        setFiles([]);
        if (inputRef.current) inputRef.current.value = '';
      }
    } catch (error) {
      if (controller.signal.aborted) {
        toast.info('Загрузка отменена');
      } else {
        toast.error(getErrorMessage(error));
      }
    } finally {
      setIsUploading(false);
      abortRef.current = null;
      setUploadLabel('Загружается...');
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setIsUploading(false);
    setUploadProgress(0);
  };

  const clearFiles = () => {
    setFiles([]);
    setUploadProgress(0);
    if (inputRef.current) inputRef.current.value = '';
  };

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const isTooLarge = files.some((f) => f.size > MAX_DEMO_SIZE_BYTES);
  const isLargeWarning = files.some(
    (f) => f.size > LARGE_DEMO_WARNING_BYTES && f.size <= MAX_DEMO_SIZE_BYTES,
  );

  return (
    <div className="mx-auto w-full max-w-xl animate-fade-in">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={cn(
          'glass-panel relative p-10 text-center transition-all',
          isDragging
            ? 'scale-[1.01] border-cyan-400/50 glow-cyan'
            : 'glass-panel-hover border-dashed border-white/15',
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".dem"
          multiple={multiple}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />

        {files.length === 0 ? (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 ring-1 ring-cyan-400/30">
              <Upload className="h-8 w-8 text-cyan-400" />
            </div>
            <p className="mb-1 font-display text-xl font-bold text-white">
              {multiple ? 'Перетащите демки сюда' : 'Перетащите демку сюда'}
            </p>
            <p className="mb-6 text-sm text-slate-400">
              {multiple
                ? 'можно сразу много файлов .dem (до 600 МБ каждый)'
                : 'или выберите файл .dem (до 600 МБ)'}
            </p>
            <button type="button" onClick={() => inputRef.current?.click()} className="btn-primary">
              {multiple ? 'Выбрать файлы' : 'Выбрать файл'}
            </button>
          </>
        ) : (
          <div className="space-y-4">
            <div className="max-h-40 space-y-2 overflow-y-auto text-left">
              {files.map((file) => (
                <div
                  key={`${file.name}:${file.size}`}
                  className="flex items-center gap-3 rounded-lg bg-slate-950/50 px-3 py-2"
                >
                  <FileArchive className="h-5 w-5 shrink-0 text-violet-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{file.name}</p>
                    <p className="font-mono text-xs text-slate-400">{formatFileSize(file.size)}</p>
                  </div>
                  {!isUploading && (
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((f) => f !== file))}
                      className="rounded-lg p-1 text-slate-500 hover:bg-white/5 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {files.length} файл(ов) · {formatFileSize(totalSize)}
            </p>

            {isLargeWarning && (
              <div className="flex items-start gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3 text-left">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" />
                <p className="text-sm text-yellow-300">
                  Есть большие файлы — парсинг может занять несколько минут
                </p>
              </div>
            )}

            {isTooLarge && (
              <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-left">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-sm text-red-300">Есть файлы &gt; 600 МБ — убери их перед загрузкой.</p>
              </div>
            )}

            {isUploading ? (
              <div className="space-y-3">
                <ProgressBar progress={uploadProgress} label={uploadLabel} />
                <button
                  type="button"
                  onClick={handleCancel}
                  className="text-sm text-slate-400 transition-colors hover:text-white"
                >
                  Отменить
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={clearFiles}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm text-slate-400 hover:bg-white/5"
                >
                  Очистить
                </button>
                {multiple && (
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-xl border border-white/10 px-4 py-3 text-sm text-cyan-300 hover:bg-cyan-500/10"
                  >
                    + ещё
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={isTooLarge}
                  className={cn(
                    'flex-1 rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all',
                    isTooLarge
                      ? 'cursor-not-allowed bg-slate-700 text-slate-500'
                      : 'btn-primary',
                  )}
                >
                  Загрузить {files.length > 1 ? `(${files.length})` : 'демку'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
