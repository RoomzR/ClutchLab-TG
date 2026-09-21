import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { MailCheck } from 'lucide-react';
import { AuthCard, AuthInput, AuthSubmitButton } from '../components/AuthCard';
import { forgotPassword } from '../api/auth';
import { getErrorMessage } from '../api/client';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a secure reset link"
      footer={
        <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
          Back to login
        </Link>
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <MailCheck className="h-10 w-10 text-cyan-400" />
          <p className="text-sm text-slate-300">
            If an account exists for <span className="font-medium text-white">{email}</span>,
            a reset link is on its way. Check your inbox (and spam folder).
          </p>
        </div>
      ) : (
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
          {error && (
            <p className="rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </p>
          )}
          <AuthSubmitButton loading={loading}>Send Reset Link</AuthSubmitButton>
        </form>
      )}
    </AuthCard>
  );
}
