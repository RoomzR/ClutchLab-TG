import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, Loader2, Plus, Send, User } from 'lucide-react';
import { academyApi } from '../../../api/academy';
import type { ChatMessage } from '../../../types/academy';
import { useHub } from './hub';
import { Badge, Button, Panel, PanelHeader, inputCls } from '../../../academy/ui';
import { cn } from '../../../lib/cn';

const SUGGESTIONS = [
  'Почему мы проиграли пистолетку?',
  'Какие главные ошибки у команды в этом матче?',
  'Кто лучше всех сыграл и почему?',
  'Как прошла экономика во второй половине?',
  'Что тренировать первым делом?',
];

export function CoachChat({ compact, onCitation }: { compact?: boolean; onCitation?: (round: number, tick?: number | null) => void }) {
  const { matchId, openMoment, summary } = useHub();
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const bottom = useRef<HTMLDivElement>(null);
  const sessions = useQuery({ queryKey: ['academy', 'match', matchId, 'chat'], queryFn: () => academyApi.chatSessions(matchId) });
  const messages = useQuery({ queryKey: ['academy', 'chat', sessionId], queryFn: () => academyApi.chatMessages(sessionId!), enabled: !!sessionId });
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId && sessions.data?.length) setSessionId(sessions.data[0].id);
  }, [sessions.data, sessionId]);
  useEffect(() => bottom.current?.scrollIntoView({ behavior: 'smooth' }), [messages.data, pending]);

  const newSession = useMutation({
    mutationFn: () => academyApi.createChatSession(matchId),
    onSuccess: (s) => { setSessionId(s.id); qc.invalidateQueries({ queryKey: ['academy', 'match', matchId, 'chat'] }); },
  });
  const send = useMutation({
    mutationFn: async (content: string) => {
      let sid = sessionId;
      if (!sid) {
        const s = await academyApi.createChatSession(matchId);
        sid = s.id;
        setSessionId(sid);
      }
      return academyApi.sendChat(sid, content);
    },
    onMutate: (content) => setPending(content),
    onSettled: () => {
      setPending(null);
      qc.invalidateQueries({ queryKey: ['academy', 'chat'] });
      qc.invalidateQueries({ queryKey: ['academy', 'match', matchId, 'chat'] });
    },
  });

  const submit = (content: string) => {
    if (!content.trim() || send.isPending) return;
    setText('');
    send.mutate(content.trim());
  };
  const cite = onCitation ?? ((r: number, t?: number | null) => openMoment(r, t));
  const list = messages.data ?? [];

  return (
    <Panel className={cn('flex flex-col', compact ? '!p-3 h-[620px]' : 'h-[calc(100vh-260px)] min-h-[520px]')}>
      {!compact && (
        <PanelHeader
          title="ИИ-тренер"
          subtitle={`Отвечает только по фактам демки ${summary.match.team_t_name} vs ${summary.match.team_ct_name}; каждое утверждение со ссылкой на момент`}
          icon={<Bot className="h-4 w-4" />}
          actions={<>
            {(sessions.data ?? []).length > 0 && (
              <select value={sessionId ?? ''} onChange={(e) => setSessionId(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-xs">
                {(sessions.data ?? []).map((s) => <option key={s.id} value={s.id}>{s.title} ({s.messages})</option>)}
              </select>
            )}
            <Button size="sm" onClick={() => newSession.mutate()}><Plus className="h-3.5 w-3.5" />Новая сессия</Button>
          </>}
        />
      )}
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">
        {list.length === 0 && !pending && (
          <div className="py-6 text-center">
            <Bot className="mx-auto mb-2 h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">Спроси про раунд, игрока, экономику или ошибки.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => submit(s)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300 hover:border-[var(--color-signal)]/50 hover:text-white">{s}</button>
              ))}
            </div>
          </div>
        )}
        {list.map((m) => <Bubble key={m.id} m={m} onCite={cite} />)}
        {pending && (
          <>
            <Bubble m={{ id: 'p', role: 'user', content: pending, citations: [], source: null, created_at: '' }} onCite={cite} />
            <div className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Ищу факты в демке…</div>
          </>
        )}
        <div ref={bottom} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); submit(text); }} className="mt-3 flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Например: почему проиграли 7 раунд?" className={inputCls} maxLength={2000} />
        <Button type="submit" variant="primary" disabled={!text.trim()} loading={send.isPending}><Send className="h-4 w-4" /></Button>
      </form>
    </Panel>
  );
}

function Bubble({ m, onCite }: { m: ChatMessage; onCite: (round: number, tick?: number | null) => void }) {
  const user = m.role === 'user';
  return (
    <div className={cn('flex gap-2', user && 'flex-row-reverse')}>
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', user ? 'bg-white/10' : 'bg-[var(--color-signal)]/15 text-[var(--color-signal)]')}>
        {user ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
      </span>
      <div className={cn('max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm', user ? 'bg-white/[0.07]' : 'border border-white/[0.06] bg-black/30')}>
        <p className="whitespace-pre-wrap leading-relaxed text-slate-200">{m.content}</p>
        {!user && m.citations.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-white/[0.05] pt-2">
            {m.citations.filter((c) => c.round).slice(0, 10).map((c, i) => (
              <button key={i} type="button" onClick={() => onCite(c.round!, c.tick)} title={c.text} className="rounded-md border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 font-mono text-[10px] text-cyan-200 hover:bg-cyan-400/20">
                {c.label}
              </button>
            ))}
          </div>
        )}
        {!user && m.source && <div className="mt-1.5"><Badge tone={m.source.startsWith('llm') ? 'good' : 'neutral'}>{m.source.startsWith('llm') ? m.source.replace('llm:', 'LLM · ') : 'факты демки, без LLM'}</Badge></div>}
      </div>
    </div>
  );
}
