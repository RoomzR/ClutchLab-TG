import { Link } from 'react-router-dom';
import { AlertTriangle, BadgeCheck, Loader2, Mic } from 'lucide-react';
import type { AcademyMatch } from '../types/academy';
import { cn } from '../lib/cn';
import { Badge, timeAgo } from './ui';
import { MATCH_TYPE_RU, mapTitle, radarImage } from './radar';

const STATUS_RU: Record<string, string> = {
  pending: 'В очереди', parsing: 'Парсинг', saving: 'Сохранение', analyzing: 'Анализ', ready: 'Готов', error: 'Ошибка',
};

export function MatchCard({ m, compact }: { m: AcademyMatch; compact?: boolean }) {
  const processing = m.status !== 'ready' && m.status !== 'error';
  const resultTone = m.result === 'W' ? 'good' : m.result === 'L' ? 'bad' : 'neutral';
  return (
    <Link
      to={`/match/${m.match_id}`}
      className="group relative block overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0d0d10] transition-all hover:-translate-y-0.5 hover:border-[var(--color-signal)]/40"
    >
      {m.map_name && (
        <img src={radarImage(m.map_name)} alt="" className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 opacity-[0.12] transition-opacity group-hover:opacity-25" />
      )}
      <div className={cn('relative', compact ? 'p-3.5' : 'p-4')}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="font-display text-sm font-bold text-white">{mapTitle(m.map_name)}</span>
            <Badge>{MATCH_TYPE_RU[m.match_type] ?? m.match_type}</Badge>
            {m.result && <Badge tone={resultTone}>{m.result === 'W' ? 'Победа' : m.result === 'L' ? 'Поражение' : 'Ничья'}</Badge>}
          </div>
          <span className="text-[11px] text-slate-500">{timeAgo(m.played_at ?? m.created_at)}</span>
        </div>
        {processing ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin text-[var(--color-signal)]" />{STATUS_RU[m.status]} · {m.progress}%</div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full bg-[var(--color-signal)] transition-all" style={{ width: `${m.progress}%` }} /></div>
            <p className="truncate text-xs text-slate-500">{m.original_filename}</p>
          </div>
        ) : m.status === 'error' ? (
          <div className="flex items-start gap-2 text-sm text-rose-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span className="line-clamp-2">{m.message ?? 'Ошибка парсинга'}</span></div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <TeamScore name={m.team_t_name} score={m.score_t} win={m.score_t > m.score_ct} ours={m.academy_team === m.team_t_name} />
            <span className="text-slate-600">:</span>
            <TeamScore name={m.team_ct_name} score={m.score_ct} win={m.score_ct > m.score_t} ours={m.academy_team === m.team_ct_name} right />
          </div>
        )}
        {!compact && m.status === 'ready' && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.05] pt-3">
            <Badge tone="info" title="ИИ-разбор готов">ИИ-разбор</Badge>
            {m.reviewed_by_analyst && <Badge tone="good"><BadgeCheck className="h-3 w-3" />Аналитик</Badge>}
            {m.open_mistakes > 0 && <Badge tone="warn">{m.open_mistakes} открытых ошибок</Badge>}
            {m.has_voice && <Badge tone="signal"><Mic className="h-3 w-3" />Войс</Badge>}
            <span className="ml-auto text-[11px] text-slate-500">{m.rounds} раундов</span>
          </div>
        )}
      </div>
    </Link>
  );
}

function TeamScore({ name, score, win, ours, right }: { name: string; score: number; win: boolean; ours: boolean; right?: boolean }) {
  return (
    <div className={cn('min-w-0 flex-1', right && 'text-right')}>
      <p className={cn('truncate text-xs', ours ? 'font-semibold text-[var(--color-signal)]' : 'text-slate-400')}>{name}</p>
      <p className={cn('font-display text-3xl font-extrabold tabular-nums', win ? 'text-white' : 'text-slate-500')}>{score}</p>
    </div>
  );
}
