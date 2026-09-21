import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Activity,
  CreditCard,
  Heart,
  Loader2,
  Map as MapIcon,
  MessageCircle,
  Send,
  Shield,
  Trash2,
  Trophy,
  UserMinus,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  addComment,
  deleteComment,
  followUser,
  getComments,
  getFeed,
  likeActivity,
  unfollowUser,
  unlikeActivity,
  type FeedEvent,
  type FeedScope,
} from '../api/social';
import { getErrorMessage } from '../api/client';
import { getMapConfig } from '../utils/mapConfig';
import { cn } from '../lib/cn';

const SCOPES: { id: FeedScope; label: string }[] = [
  { id: 'global', label: 'Global' },
  { id: 'following', label: 'Following' },
  { id: 'clan', label: 'Clan' },
];

function eventContent(event: FeedEvent): { icon: typeof Zap; text: React.ReactNode } {
  const p = event.payload;
  switch (event.event_type) {
    case 'demo_ready': {
      const mapName = typeof p.map_name === 'string' ? p.map_name : null;
      const matchId = typeof p.match_id === 'string' ? p.match_id : null;
      return {
        icon: MapIcon,
        text: (
          <>
            analyzed a demo on{' '}
            {matchId ? (
              <Link to={`/match/${matchId}`} className="font-medium text-cyan-300 hover:text-cyan-200">
                {mapName ? getMapConfig(mapName).displayName : 'a map'}
              </Link>
            ) : (
              <span className="font-medium text-cyan-300">
                {mapName ? getMapConfig(mapName).displayName : 'a map'}
              </span>
            )}
          </>
        ),
      };
    }
    case 'achievement':
      return {
        icon: Trophy,
        text: (
          <>
            unlocked <span className="font-medium text-amber-300">{String(p.name ?? 'an achievement')}</span>
          </>
        ),
      };
    case 'level_up':
      return {
        icon: Zap,
        text: (
          <>
            reached <span className="font-medium text-cyan-300">Level {String(p.level ?? '?')}</span>
          </>
        ),
      };
    case 'clan_created':
      return {
        icon: Shield,
        text: (
          <>
            founded clan{' '}
            <span className="font-medium text-orange-300">
              [{String(p.tag ?? '')}] {String(p.name ?? '')}
            </span>
          </>
        ),
      };
    case 'clan_joined':
      return {
        icon: Shield,
        text: (
          <>
            joined clan{' '}
            <span className="font-medium text-orange-300">
              [{String(p.tag ?? '')}] {String(p.name ?? '')}
            </span>
          </>
        ),
      };
    case 'subscribed':
      return {
        icon: CreditCard,
        text: (
          <>
            upgraded to <span className="font-medium text-cyan-300">{String(p.plan ?? 'a paid plan')}</span>
          </>
        ),
      };
    default:
      return { icon: Activity, text: event.event_type };
  }
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function CommentsThread({ activityId }: { activityId: string }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['social', 'comments', activityId],
    queryFn: () => getComments(activityId),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['social', 'comments', activityId] });
    queryClient.invalidateQueries({ queryKey: ['social', 'feed'] });
  };

  const addMutation = useMutation({
    mutationFn: (value: string) => addComment(activityId, value),
    onSuccess: () => {
      setText('');
      invalidate();
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteComment,
    onSuccess: invalidate,
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const value = text.trim();
    if (value) addMutation.mutate(value);
  };

  return (
    <div className="ml-11 mt-1 space-y-2 border-l border-white/5 pl-4">
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-600" />
      ) : (
        comments.map((comment) => (
          <div key={comment.id} className="group/comment flex items-start gap-2">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/5 text-[9px] font-bold text-slate-400">
              {comment.username.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs">
                <span className="font-semibold text-slate-300">{comment.username}</span>{' '}
                <span className="text-slate-600">· {timeAgo(comment.created_at)}</span>
              </p>
              <p className="text-xs leading-relaxed text-slate-400">{comment.text}</p>
            </div>
            {comment.is_me && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate(comment.id)}
                className="rounded p-1 text-slate-600 opacity-0 transition-all hover:text-red-300 group-hover/comment:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        ))
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
          placeholder="Write a comment…"
          className="flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-xs text-white placeholder-slate-600 outline-none focus:border-cyan-400/40"
        />
        <button
          type="submit"
          disabled={addMutation.isPending || !text.trim()}
          className="rounded-lg p-1.5 text-cyan-400 transition-colors hover:bg-cyan-500/10 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </form>
    </div>
  );
}

export function ActivityFeed() {
  const [scope, setScope] = useState<FeedScope>('global');
  const [openComments, setOpenComments] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['social', 'feed', scope],
    queryFn: () => getFeed(scope),
    staleTime: 30_000,
  });

  const followMutation = useMutation({
    mutationFn: ({ username, follow }: { username: string; follow: boolean }) =>
      follow ? followUser(username) : unfollowUser(username),
    onSuccess: (res) => {
      toast.success(res.detail);
      queryClient.invalidateQueries({ queryKey: ['social'] });
    },
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const likeMutation = useMutation({
    mutationFn: ({ id, liked }: { id: string; liked: boolean }) =>
      liked ? unlikeActivity(id) : likeActivity(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['social', 'feed'] }),
    onError: (err) => toast.error(getErrorMessage(err)),
  });

  const toggleComments = (id: string) => {
    setOpenComments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <section className="card-premium p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <Activity className="h-5 w-5 text-cyan-400" />
          Activity
        </h2>
        <div className="flex gap-1 rounded-xl bg-slate-950/60 p-1">
          {SCOPES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setScope(id)}
              className={cn(
                'rounded-lg px-3 py-1 text-xs font-semibold transition-all',
                scope === id
                  ? 'bg-cyan-500/20 text-cyan-300'
                  : 'text-slate-500 hover:text-white',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
        </div>
      ) : events.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">
          {scope === 'following'
            ? 'Follow players to see their activity here.'
            : scope === 'clan'
              ? 'Join a clan to see clan activity.'
              : 'No activity yet — upload a demo to get things started!'}
        </p>
      ) : (
        <div className="space-y-1">
          {events.map((event) => {
            const { icon: Icon, text } = eventContent(event);
            const commentsOpen = openComments.has(event.id);
            return (
              <div key={event.id} className="rounded-xl transition-colors hover:bg-white/[0.03]">
                <div className="group flex items-center gap-3 px-2 py-2.5">
                  {event.avatar_url ? (
                    <img src={event.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500/30 to-blue-600/30 text-[10px] font-bold text-cyan-300">
                      {event.username.slice(0, 2).toUpperCase()}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-300">
                      <span className="font-semibold text-white">{event.username}</span>{' '}
                      <span className="text-[10px] text-slate-600">Lv{event.level}</span> {text}
                    </p>
                    <p className="text-[11px] text-slate-600">{timeAgo(event.created_at)}</p>
                  </div>

                  <Icon className="h-4 w-4 shrink-0 text-slate-600" />

                  <button
                    type="button"
                    onClick={() => likeMutation.mutate({ id: event.id, liked: event.liked_by_me })}
                    className={cn(
                      'flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs transition-all',
                      event.liked_by_me
                        ? 'text-rose-400 hover:bg-rose-500/10'
                        : 'text-slate-500 hover:bg-white/5 hover:text-rose-300',
                    )}
                  >
                    <Heart className={cn('h-3.5 w-3.5', event.liked_by_me && 'fill-current')} />
                    {event.like_count > 0 && <span className="font-mono">{event.like_count}</span>}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleComments(event.id)}
                    className={cn(
                      'flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs transition-all',
                      commentsOpen
                        ? 'text-cyan-300'
                        : 'text-slate-500 hover:bg-white/5 hover:text-cyan-300',
                    )}
                  >
                    <MessageCircle className="h-3.5 w-3.5" />
                    {event.comment_count > 0 && (
                      <span className="font-mono">{event.comment_count}</span>
                    )}
                  </button>

                  {!event.is_me && (
                    <button
                      type="button"
                      title={event.is_following ? 'Unfollow' : 'Follow'}
                      onClick={() =>
                        followMutation.mutate({
                          username: event.username,
                          follow: !event.is_following,
                        })
                      }
                      className={cn(
                        'shrink-0 rounded-lg p-1.5 opacity-0 transition-all group-hover:opacity-100',
                        event.is_following
                          ? 'text-slate-400 hover:bg-red-500/10 hover:text-red-300'
                          : 'text-cyan-400 hover:bg-cyan-500/10',
                      )}
                    >
                      {event.is_following ? (
                        <UserMinus className="h-4 w-4" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>

                {commentsOpen && (
                  <div className="pb-3">
                    <CommentsThread activityId={event.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
