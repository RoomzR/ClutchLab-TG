import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { AuthCard, AuthInput, AuthSubmitButton } from '../components/AuthCard';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';

const TRIAL_PERKS = [
  '7-day free Pro trial — no card required',
  '50 demos / month during trial',
  'Full heatmaps, habits & anti-strat reports',
];

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const referral = searchParams.get('ref') ?? undefined;

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await register({ email, username, password, referral_code: referral });
      toast.success('Account created! Check your inbox to verify your email.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Create your account"
      subtitle="Start analyzing your demos in minutes"
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
            Log in
          </Link>
        </>
      }
    >
      <ul className="mb-5 space-y-1.5">
        {TRIAL_PERKS.map((perk) => (
          <li key={perk} className="flex items-center gap-2 text-xs text-slate-300">
            <Check className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
            {perk}
          </li>
        ))}
      </ul>

      {referral && (
        <p className="mb-4 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-300">
          Referral code <span className="font-mono font-bold">{referral}</span> applied
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <AuthInput
          label="Email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthInput
          label="Username"
          type="text"
          required
          autoComplete="username"
          placeholder="3–24 characters, letters / digits / _ / -"
          minLength={3}
          maxLength={24}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <AuthInput
          label="Password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="At least 8 characters"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthInput
          label="Confirm password"
          type="password"
          required
          autoComplete="new-password"
          placeholder="Repeat your password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        {error && (
          <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <AuthSubmitButton loading={loading}>Create Account</AuthSubmitButton>

        <p className="text-center text-[11px] leading-relaxed text-slate-500">
          By signing up you agree to our Terms of Service and Privacy Policy.
        </p>
      </form>
    </AuthCard>
  );
}
