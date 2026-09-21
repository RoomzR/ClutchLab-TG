import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Copy,
  Download,
  Gift,
  Link2,
  Loader2,
  MessageSquare,
  Save,
  ShieldCheck,
  User,
} from 'lucide-react';
import {
  disable2FA,
  enable2FA,
  getSteamAuthorizeUrl,
  importFaceitMatch,
  linkSteam,
  setDiscordWebhook,
  setup2FA,
  testDiscordWebhook,
  updateMe,
} from '../api/auth';
import { generateReferral, getReferralStats } from '../api/billing';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../api/client';

function TwoFactorSection() {
  const { user, refreshUser } = useAuth();
  const [setupData, setSetupData] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const enabled = user?.totp_enabled ?? false;

  const handleSetup = async () => {
    setBusy(true);
    try {
      setSetupData(await setup2FA());
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEnable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await enable2FA(code);
      toast.success(res.detail);
      setSetupData(null);
      setCode('');
      await refreshUser();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDisable = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await disable2FA(code);
      toast.success(res.detail);
      setCode('');
      await refreshUser();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-white">
        <ShieldCheck className="h-5 w-5 text-cyan-400" />
        Two-Factor Authentication
        <span
          className={
            enabled
              ? 'ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300'
              : 'ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-bold text-slate-500'
          }
        >
          {enabled ? 'ENABLED' : 'OFF'}
        </span>
      </h2>
      <p className="mb-4 text-sm text-slate-400">
        Protect your account with a TOTP code from Google Authenticator, Authy or 1Password.
      </p>

      {enabled ? (
        <form onSubmit={handleDisable} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            placeholder="Enter code to disable"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
          />
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-5 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/20 disabled:opacity-60"
          >
            Disable 2FA
          </button>
        </form>
      ) : setupData ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-slate-950/60 p-4">
            <p className="mb-2 text-xs text-slate-400">
              1. Add this secret to your authenticator app (or scan the QR from the link):
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg bg-black/40 px-3 py-2 font-mono text-xs text-cyan-300">
                {setupData.secret}
              </code>
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(setupData.secret);
                  toast.success('Secret copied');
                }}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
            <img
              alt="2FA QR code"
              className="mx-auto mt-3 h-40 w-40 rounded-lg bg-white p-2"
              src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(setupData.otpauth_uri)}`}
            />
          </div>
          <form onSubmit={handleEnable} className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              placeholder="2. Enter the 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 font-mono text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
            >
              Confirm & Enable
            </button>
          </form>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleSetup}
          disabled={busy}
          className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
        >
          Set up 2FA
        </button>
      )}
    </section>
  );
}

function DiscordSection() {
  const { user, refreshUser } = useAuth();
  const [webhookUrl, setWebhookUrl] = useState(user?.discord_webhook_url ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setWebhookUrl(user?.discord_webhook_url ?? '');
  }, [user?.discord_webhook_url]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await setDiscordWebhook(webhookUrl.trim() || null);
      toast.success(res.detail);
      await refreshUser();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const res = await testDiscordWebhook();
      toast.success(res.detail);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-white">
        <MessageSquare className="h-5 w-5 text-cyan-400" />
        Discord Notifications
      </h2>
      <p className="mb-4 text-sm text-slate-400">
        Get a Discord message when your demo finishes parsing. Create a webhook in your server
        (Channel Settings → Integrations → Webhooks) and paste the URL below.
      </p>
      <form onSubmit={handleSave} className="space-y-3">
        <input
          type="url"
          placeholder="https://discord.com/api/webhooks/…"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
        />
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
          >
            Save webhook
          </button>
          {user?.discord_webhook_url && (
            <button
              type="button"
              onClick={handleTest}
              disabled={busy}
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-60"
            >
              Send test message
            </button>
          )}
        </div>
      </form>
    </section>
  );
}

function FaceitSection() {
  const navigate = useNavigate();
  const [matchUrl, setMatchUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const handleImport = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await importFaceitMatch(matchUrl.trim());
      toast.success(res.detail);
      navigate(`/match/${res.match_id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
      <h2 className="mb-1 flex items-center gap-2 font-display text-lg font-bold text-white">
        <Download className="h-5 w-5 text-orange-400" />
        FACEIT Import
      </h2>
      <p className="mb-4 text-sm text-slate-400">
        Paste a FACEIT match room link — we download the demo and analyze it automatically.
        Counts against your monthly demo quota.
      </p>
      <form onSubmit={handleImport} className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          required
          placeholder="https://www.faceit.com/en/cs2/room/1-xxxx…"
          value={matchUrl}
          onChange={(e) => setMatchUrl(e.target.value)}
          className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-orange-400/50"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-bold text-white hover:from-orange-400 hover:to-amber-400 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Import demo'}
        </button>
      </form>
    </section>
  );
}

export function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [username, setUsername] = useState(user?.username ?? '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? '');
  const [saving, setSaving] = useState(false);
  const [linkingSteam, setLinkingSteam] = useState(false);

  useEffect(() => {
    setUsername(user?.username ?? '');
    setAvatarUrl(user?.avatar_url ?? '');
  }, [user?.username, user?.avatar_url]);

  // Steam OpenID callback: openid.* params are appended to /settings
  useEffect(() => {
    if (searchParams.get('steam_callback') !== '1') return;
    const params: Record<string, string> = {};
    searchParams.forEach((value, key) => {
      if (key.startsWith('openid.')) params[key] = value;
    });
    if (Object.keys(params).length === 0) return;

    setLinkingSteam(true);
    linkSteam(params)
      .then(async (res) => {
        toast.success(`Steam account ${res.steam_id} linked!`);
        await refreshUser();
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => {
        setLinkingSteam(false);
        setSearchParams({}, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: referralStats } = useQuery({
    queryKey: ['referral', 'stats'],
    queryFn: getReferralStats,
    enabled: !!user,
  });

  const generateReferralMutation = useMutation({
    mutationFn: generateReferral,
    onSuccess: async (data) => {
      await navigator.clipboard.writeText(data.url);
      toast.success('Referral link copied to clipboard!');
      await queryClient.invalidateQueries({ queryKey: ['referral'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMe({
        username: username !== user?.username ? username : undefined,
        avatar_url: avatarUrl !== (user?.avatar_url ?? '') ? avatarUrl : undefined,
      });
      await refreshUser();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleLinkSteam = async () => {
    try {
      const { url } = await getSteamAuthorizeUrl();
      window.location.href = url;
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-white md:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">Manage your profile and integrations.</p>
      </div>

      {/* Profile */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white">
          <User className="h-5 w-5 text-cyan-400" />
          Profile
        </h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-slate-950/40 px-4 py-2.5 text-sm text-slate-500"
            />
            {!user.is_verified && (
              <p className="mt-1 text-xs text-amber-400">
                Email not verified yet — check your inbox.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Username</label>
            <input
              type="text"
              value={username}
              minLength={3}
              maxLength={24}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-300">Avatar URL</label>
            <input
              type="url"
              value={avatarUrl}
              placeholder="https://…"
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-500 outline-none focus:border-cyan-400/50"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </button>
        </form>
      </section>

      {/* Steam */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white">
          <Link2 className="h-5 w-5 text-cyan-400" />
          Steam Account
        </h2>
        {linkingSteam ? (
          <div className="flex items-center gap-2 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
            Linking Steam account…
          </div>
        ) : user.steam_id ? (
          <p className="text-sm text-slate-300">
            Linked: <span className="font-mono text-cyan-300">{user.steam_id}</span>
          </p>
        ) : (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-slate-400">
              Link your Steam account to match your in-game identity with uploaded demos.
            </p>
            <button
              type="button"
              onClick={handleLinkSteam}
              className="rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10"
            >
              Sign in through Steam
            </button>
          </div>
        )}
      </section>

      {/* Security */}
      <TwoFactorSection />

      {/* Integrations */}
      <DiscordSection />
      <FaceitSection />

      {/* Referral */}
      <section className="rounded-2xl border border-cyan-400/20 bg-cyan-500/5 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white">
          <Gift className="h-5 w-5 text-cyan-400" />
          Referral Program
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          Earn <span className="text-cyan-300">+5 free demos</span> per signup and{' '}
          <span className="text-cyan-300">1 month free</span> when your referral subscribes.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => generateReferralMutation.mutate()}
            disabled={generateReferralMutation.isPending}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
          >
            <Copy className="h-4 w-4" />
            {referralStats?.code ? 'Copy my referral link' : 'Generate referral link'}
          </button>
          {referralStats && referralStats.code && (
            <p className="text-xs text-slate-400">
              Code <span className="font-mono font-bold text-cyan-300">{referralStats.code}</span> ·{' '}
              {referralStats.signups} signups · {referralStats.bonus_demos_total} bonus demos earned
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
