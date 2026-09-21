import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Code2, Copy, KeyRound, Loader2, Plus, Trash2 } from 'lucide-react';
import { apiClient, getErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { cn } from '../lib/cn';

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  revoked: boolean;
  last_used_at: string | null;
  created_at: string;
}

const ENDPOINTS: { method: string; path: string; description: string }[] = [
  { method: 'GET', path: '/api/matches', description: 'List parsed matches' },
  { method: 'GET', path: '/api/matches/{id}', description: 'Match details: score, map, players' },
  { method: 'GET', path: '/api/matches/{id}/players', description: 'Player stats for a match' },
  { method: 'GET', path: '/api/matches/{id}/kills', description: 'Kill feed with ticks and weapons' },
  { method: 'GET', path: '/api/matches/{id}/grenades', description: 'Grenade throws with trajectories' },
  { method: 'GET', path: '/api/matches/{id}/rounds', description: 'Round results and win types' },
  { method: 'GET', path: '/api/matches/{id}/heatmap/{player}', description: 'Position heatmap for a player' },
  { method: 'POST', path: '/api/matches/upload', description: 'Upload a .dem file (multipart/form-data)' },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-emerald-500/15 text-emerald-300',
  POST: 'bg-cyan-500/15 text-cyan-300',
  DELETE: 'bg-red-500/15 text-red-300',
};

export function ApiDocsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [keyName, setKeyName] = useState('');
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const hasApiAccess = user?.permissions.includes('api.access') ?? false;

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ['api-keys'],
    queryFn: async () => {
      const { data } = await apiClient.get<ApiKey[]>('/keys');
      return data;
    },
    enabled: hasApiAccess,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.post<{ key: string }>('/keys', { name: keyName });
      return data;
    },
    onSuccess: (data) => {
      setFreshKey(data.key);
      setKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const revokeMutation = useMutation({
    mutationFn: async (keyId: string) => {
      const { data } = await apiClient.delete(`/keys/${keyId}`);
      return data;
    },
    onSuccess: () => {
      toast.success('Key revoked');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="flex items-center gap-3 font-display text-2xl font-bold text-white md:text-3xl">
          <Code2 className="h-7 w-7 text-cyan-400" />
          API Documentation
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Programmatic access to your demo analytics. Available on the Organization plan.
        </p>
      </div>

      {/* Auth section */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <h2 className="mb-3 font-display text-lg font-bold text-white">Authentication</h2>
        <p className="mb-4 text-sm text-slate-400">
          Pass your API key in the <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-xs text-cyan-300">X-API-Key</code> header
          with every request:
        </p>
        <pre className="overflow-x-auto rounded-xl border border-white/5 bg-slate-950/80 p-4 font-mono text-xs leading-relaxed text-slate-300">
{`curl https://your-domain.com/api/matches \\
  -H "X-API-Key: cs2a_your_key_here"`}
        </pre>
      </section>

      {/* API keys management */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white">
          <KeyRound className="h-5 w-5 text-cyan-400" />
          Your API Keys
        </h2>

        {!hasApiAccess ? (
          <div className="rounded-xl border border-orange-400/20 bg-orange-500/5 p-5 text-center">
            <p className="text-sm text-slate-300">
              API access is included in the <span className="font-bold text-orange-300">Organization</span> plan.
            </p>
            <Link
              to="/billing"
              className="mt-3 inline-block rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-6 py-2.5 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400"
            >
              Upgrade to Organization
            </Link>
          </div>
        ) : (
          <>
            {freshKey && (
              <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-4">
                <p className="mb-2 text-xs font-semibold text-emerald-300">
                  Your new key — copy it now, it won't be shown again:
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 overflow-x-auto rounded-lg bg-slate-950/80 px-3 py-2 font-mono text-xs text-white">
                    {freshKey}
                  </code>
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(freshKey);
                      toast.success('Copied!');
                    }}
                    className="rounded-lg p-2 text-emerald-300 hover:bg-emerald-500/20"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="mb-5 flex gap-2"
            >
              <input
                type="text"
                required
                maxLength={64}
                placeholder="Key name (e.g. production)"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                className="flex-1 rounded-xl border border-white/10 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-cyan-400/50"
              />
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-5 py-2.5 text-sm font-bold text-white hover:from-cyan-400 hover:to-blue-400 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                Create
              </button>
            </form>

            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
            ) : keys.length === 0 ? (
              <p className="text-sm text-slate-500">No API keys yet.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {keys.map((key) => (
                  <div key={key.id} className="flex items-center gap-3 py-3 text-sm">
                    <code className="font-mono text-xs text-cyan-300">{key.key_prefix}…</code>
                    <span className="flex-1 truncate text-slate-300">{key.name}</span>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold',
                        key.revoked
                          ? 'bg-red-500/15 text-red-300'
                          : 'bg-emerald-500/15 text-emerald-300',
                      )}
                    >
                      {key.revoked ? 'REVOKED' : 'ACTIVE'}
                    </span>
                    <span className="hidden text-xs text-slate-600 sm:inline">
                      {key.last_used_at
                        ? `Used ${new Date(key.last_used_at).toLocaleDateString('en-US')}`
                        : 'Never used'}
                    </span>
                    {!key.revoked && (
                      <button
                        type="button"
                        onClick={() => revokeMutation.mutate(key.id)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {/* Endpoints */}
      <section className="rounded-2xl border border-white/10 bg-slate-900/50 p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">Endpoints</h2>
        <div className="divide-y divide-white/5">
          {ENDPOINTS.map((endpoint) => (
            <div key={`${endpoint.method}-${endpoint.path}`} className="flex items-center gap-3 py-3">
              <span
                className={cn(
                  'w-14 shrink-0 rounded-lg py-1 text-center text-[10px] font-bold',
                  METHOD_COLORS[endpoint.method] ?? 'bg-white/5 text-slate-400',
                )}
              >
                {endpoint.method}
              </span>
              <code className="font-mono text-xs text-white">{endpoint.path}</code>
              <span className="ml-auto hidden text-xs text-slate-500 md:inline">
                {endpoint.description}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">
          Interactive OpenAPI docs are available at{' '}
          <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-cyan-300">/docs</code>{' '}
          (Swagger UI) and{' '}
          <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-cyan-300">/redoc</code>.
        </p>
      </section>
    </div>
  );
}
