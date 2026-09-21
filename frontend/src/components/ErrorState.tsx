import { AlertTriangle } from 'lucide-react';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = 'Произошла ошибка при загрузке данных',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-500/30 bg-red-500/10 p-8 text-center animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
        <AlertTriangle className="h-7 w-7 text-red-400" />
      </div>
      <div>
        <h3 className="text-lg font-semibold text-white">Ошибка</h3>
        <p className="mt-1 max-w-md text-sm text-slate-400">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-red-500 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
        >
          Попробовать снова
        </button>
      )}
    </div>
  );
}
