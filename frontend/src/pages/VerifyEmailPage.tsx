import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { AuthCard } from '../components/AuthCard';
import { verifyEmail } from '../api/auth';
import { getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';

export function VerifyEmailPage() {
  const { token } = useParams<{ token: string }>();
  const { refreshUser, isAuthenticated } = useAuth();
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setState('error');
        setMessage('Invalid verification link');
        return;
      }
      try {
        const res = await verifyEmail(token);
        if (cancelled) return;
        setState('success');
        setMessage(res.detail);
        if (isAuthenticated) await refreshUser();
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setMessage(getErrorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refreshUser, isAuthenticated]);

  return (
    <AuthCard title="Email verification">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        {state === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-cyan-400" />
            <p className="text-sm text-slate-300">Verifying your email…</p>
          </>
        )}
        {state === 'success' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <p className="text-sm text-slate-300">{message}</p>
            <Link
              to="/dashboard"
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-2.5 text-sm font-bold text-white"
            >
              Go to Dashboard
            </Link>
          </>
        )}
        {state === 'error' && (
          <>
            <XCircle className="h-10 w-10 text-red-400" />
            <p className="text-sm text-slate-300">{message}</p>
            <Link to="/login" className="text-sm font-medium text-cyan-400 hover:text-cyan-300">
              Back to login
            </Link>
          </>
        )}
      </div>
    </AuthCard>
  );
}
