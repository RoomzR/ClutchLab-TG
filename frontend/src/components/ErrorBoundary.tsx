import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="premium-page flex min-h-screen items-center justify-center p-6">
          <div className="max-w-md rounded-3xl border border-red-300/25 bg-red-500/10 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur">
            <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-red-500" />
            <h1 className="mb-2 text-lg font-semibold text-white">Что-то пошло не так</h1>
            <p className="mb-6 text-sm text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-red-500 px-5 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
