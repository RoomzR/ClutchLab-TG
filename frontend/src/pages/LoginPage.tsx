import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { AuthCard, AuthInput, AuthSubmitButton } from '../components/AuthCard';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';
import { useT } from '../i18n/LocaleContext';

export function LoginPage() {
  const { login, verify2FA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const from = (location.state as { from?: string } | null)?.from ?? '/dashboard';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.pending2fa) {
        setPendingToken(result.pending2fa);
        return;
      }
      toast.success(t('auth.welcomeBack'));
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: FormEvent) => {
    e.preventDefault();
    if (!pendingToken) return;
    setError(null);
    setLoading(true);
    try {
      await verify2FA(pendingToken, code);
      toast.success(t('auth.welcomeBack'));
      navigate(from, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  if (pendingToken) {
    return (
      <AuthCard title={t('auth.twoFactorTitle')} subtitle={t('auth.twoFactorSubtitle')}>
        <form onSubmit={handleVerify2FA} className="space-y-4">
          <div className="flex justify-center">
            <ShieldCheck className="h-10 w-10 text-[var(--color-accent)]" />
          </div>
          <AuthInput
            label={t('auth.authCode')}
            type="text"
            required
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />

          {error && (
            <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <AuthSubmitButton loading={loading}>{t('auth.verify')}</AuthSubmitButton>

          <button
            type="button"
            onClick={() => {
              setPendingToken(null);
              setCode('');
              setError(null);
            }}
            className="w-full text-center text-xs text-slate-400 hover:text-[var(--color-accent)]"
          >
            {t('auth.backToLogin')}
          </button>
        </form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t('auth.loginTitle')}
      subtitle={t('auth.loginSubtitle')}
      footer={
        <>
          {t('auth.noAccount')}{' '}
          <Link to="/register" className="font-medium text-[var(--color-accent)] hover:brightness-110">
            {t('auth.signUpFree')}
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput
          label={t('auth.email')}
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthInput
          label={t('auth.password')}
          type="password"
          required
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <AuthSubmitButton loading={loading}>{t('auth.logIn')}</AuthSubmitButton>

        <div className="text-center">
          <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-[var(--color-accent)]">
            {t('auth.forgotPassword')}
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
