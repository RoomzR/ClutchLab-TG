import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Flame, Play, Skull, Trophy } from 'lucide-react';
import { useHub } from './hub';
import { MetricLabel, fmtValue, useFmt, useMetrics } from '../../../academy/metrics';
import { Badge, Panel, PanelHeader, Segmented, SEVERITY_TONE } from '../../../academy/ui';
import { BUY_RU, REASON_RU } from '../../../academy/radar';
import type { PlayerBlock, Side } from '../../../types/academy';
import { cn } from '../../../lib/cn';

const SCORE_COLS = ['kills', 'deaths', 'assists', 'kd_diff', 'adr', 'kast_pct', 'hs_pct', 'rating', 'opening_kills', 'opening_deaths', 'trade_kills', 'clutch_wins', 'multikill_rounds', 'utility_damage_per_round', 'enemies_flashed_per_round', 'flash_assists'];

export function OverviewTab() {
  const { summary } = useHub();
  const [side, setSide] = useState<Side>('all');
  const m = summary.match;
  const teams = [m.team_t_name, m.team_ct_name];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">Наведи на заголовок метрики — увидишь формулу и источник в демке.</p>
        <Segmented value={side} onChange={setSide} options={[{ value: 'all', label: 'Весь матч' }, { value: 'CT', label: 'CT' }, { value: 'T', label: 'T' }]} />
      </div>
      {teams.map((t) => <Scoreboard key={t} team={t} side={side} />)}
      <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <TeamCompare />
        <KeyMoments />
      </div>
    </div>
  );
}

function Scoreboard({ team, side }: { team: string; side: Side }) {
  const { summary, teamPlayers } = useHub();
  const fmt = useFmt();
  const players = teamPlayers(team);
  const ts = summary.teams.find((x) => x.name === team);
  const won = ts?.won;
  const academy = summary.academy_teams.includes(team);
  const best: Record<string, number> = {};
  const { byId } = useMetrics();
  for (const col of SCORE_COLS) {
    const vals = summary.players.map((p) => p.sides[side]?.metrics[col]).filter((v): v is number => v != null);
    if (!vals.length) continue;
    best[col] = byId[col]?.better === 'lower' ? Math.min(...vals) : Math.max(...vals);
  }
  return (
    <Panel padded={false} className="overflow-hidden">
      <div className={cn('flex items-center justify-between border-b border-white/[0.06] px-5 py-3', won ? 'bg-emerald-500/[0.06]' : 'bg-white/[0.015]')}>
        <div className="flex items-center gap-2">
          {won && <Trophy className="h-4 w-4 text-emerald-300" />}
          <Link to={`/teams/${encodeURIComponent(team)}`} className={cn('font-display text-lg font-bold hover:underline', academy && 'text-[var(--color-signal)]')}>{team}</Link>
          <span className="font-display text-lg font-bold text-slate-400">{ts?.score}</span>
          {academy && <Badge tone="signal">Академия</Badge>}
        </div>
        <span className="text-xs text-slate-500">CT {ts?.metrics.ct_win_pct ?? '—'}% · T {ts?.metrics.t_win_pct ?? '—'}% · размены {ts?.metrics.traded_death_pct ?? '—'}%</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wide text-slate-500">
              <th className="sticky left-0 bg-[#0d0d10] px-4 py-2 text-left font-semibold">Игрок</th>
              {SCORE_COLS.map((c) => <th key={c} className="whitespace-nowrap px-2 py-2 text-right font-semibold"><MetricLabel id={c} /></th>)}
              <th className="px-3 py-2 text-right font-semibold">Ошибки</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p: PlayerBlock) => {
              const mm = p.sides[side]?.metrics ?? {};
              const mk = summary.mistakes_by_player[p.name] ?? {};
              return (
                <tr key={p.name} className="border-t border-white/[0.04] hover:bg-white/[0.025]">
                  <td className="sticky left-0 bg-[#0d0d10] px-4 py-2.5">
                    <Link to={`/players/${encodeURIComponent(p.name)}`} className="font-semibold hover:text-[var(--color-signal)]">{p.name}</Link>
                    {summary.roster.includes(p.name) && <span className="ml-1.5 text-[10px] text-[var(--color-signal)]">●</span>}
                    <span className="ml-2 text-[10px] text-slate-600">{p.sides[side]?.rounds ?? 0} р.</span>
                  </td>
                  {SCORE_COLS.map((c) => {
                    const v = mm[c];
                    const isBest = v != null && best[c] === v;
                    return (
                      <td key={c} className={cn('px-2 py-2.5 text-right tabular-nums', isBest ? 'font-bold text-white' : 'text-slate-300', c === 'rating' && 'font-display text-[15px]', c === 'kd_diff' && v != null && (v > 0 ? 'text-emerald-300' : v < 0 ? 'text-rose-300' : ''))}>
                        {c === 'kd_diff' && v != null && v > 0 ? '+' : ''}{fmt(c, v, c === 'rating' ? 2 : undefined)}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 text-right">
                    {mk.total ? <span className="inline-flex gap-1">{mk.high ? <Badge tone={SEVERITY_TONE.high}>{mk.high}</Badge> : null}<Badge>{mk.total}</Badge></span> : <span className="text-slate-600">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

const TEAM_ROWS: [string, string][] = [
  ['pistol_win_pct', 'Пистолетки'], ['full_buy_win_pct', 'Фулл-бай'], ['force_win_pct', 'Форс'], ['eco_win_pct', 'Эко'],
  ['anti_eco_win_pct', 'Анти-эко'], ['opening_win_pct', '5v4 конверсия'], ['opening_loss_win_pct', '4v5 камбэки'],
  ['post_plant_win_pct', 'Пост-плант'], ['retake_win_pct', 'Ретейки'], ['traded_death_pct', 'Размены'],
];

function TeamCompare() {
  const { summary } = useHub();
  const [a, b] = [summary.teams.find((t) => t.name === summary.match.team_t_name), summary.teams.find((t) => t.name === summary.match.team_ct_name)];
  if (!a || !b) return null;
  return (
    <Panel>
      <PanelHeader title="Команды: где выиграли и проиграли" subtitle="% побед в раундах каждого типа" />
      <div className="mb-3 flex justify-between text-xs font-semibold"><span className="text-[var(--color-signal)]">{a.name}</span><span className="text-slate-300">{b.name}</span></div>
      <ul className="space-y-2.5">
        {TEAM_ROWS.map(([key, label]) => {
          const va = a.metrics[key];
          const vb = b.metrics[key];
          return (
            <li key={key} className="grid grid-cols-[52px_1fr_120px_1fr_52px] items-center gap-2 text-xs">
              <span className="text-right font-semibold tabular-nums">{va == null ? '—' : `${Math.round(va)}%`}</span>
              <div className="flex h-2 justify-end overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-[var(--color-signal)]" style={{ width: `${va ?? 0}%` }} /></div>
              <span className="text-center text-slate-400">{label}</span>
              <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-slate-300" style={{ width: `${vb ?? 0}%` }} /></div>
              <span className="font-semibold tabular-nums">{vb == null ? '—' : `${Math.round(vb)}%`}</span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-400">
        {[a, b].map((t) => (
          <div key={t.name} className="rounded-lg bg-white/[0.025] p-3">
            <p className="mb-1 font-semibold text-slate-200">{t.name}</p>
            <p>Первый контакт: {fmtValue(t.metrics.avg_first_contact, 'sec')}</p>
            <p>Время планта: {fmtValue(t.metrics.avg_plant_time, 'sec')}</p>
            <p>Планты: {Object.entries(t.sites).map(([s, n]) => `${s} ×${n}`).join(', ') || '—'}</p>
            <p>Утилити за раунд: {fmtValue(t.metrics.utility_per_round, 'ratio', 1)}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function KeyMoments() {
  const { summary, openMoment } = useHub();
  const moments = useMemo(() => {
    const out: { round: number; tick: number; icon: 'ace' | 'clutch' | 'mk' | 'eco'; text: string; tone: 'signal' | 'good' | 'warn' | 'info' }[] = [];
    for (const r of summary.rounds) {
      const counts: Record<string, { n: number; tick: number }> = {};
      for (const k of r.kills) if (k.killer_side && k.killer_side !== k.victim_side) {
        const c = (counts[k.killer] ??= { n: 0, tick: k.tick });
        c.n += 1;
      }
      for (const [name, c] of Object.entries(counts)) {
        if (c.n >= 4) out.push({ round: r.round, tick: c.tick, icon: c.n === 5 ? 'ace' : 'mk', text: `${c.n === 5 ? 'Эйс' : '4K'} — ${name}`, tone: 'signal' });
      }
      for (const cl of Object.values(r.clutch ?? {})) {
        if (cl.won) out.push({ round: r.round, tick: cl.tick, icon: 'clutch', text: `Клатч 1v${cl.vs} — ${cl.player}`, tone: 'good' });
      }
      for (const side of ['T', 'CT'] as const) {
        const own = r.buy[side]?.type;
        const enemy = r.buy[side === 'T' ? 'CT' : 'T']?.type;
        if ((own === 'eco' || own === 'force') && enemy === 'full' && r.winner_side === side) {
          out.push({ round: r.round, tick: r.freeze_tick, icon: 'eco', text: `${BUY_RU[own]} выигран: ${r.teams[side]}`, tone: 'info' });
        }
      }
    }
    return out;
  }, [summary.rounds]);
  return (
    <Panel>
      <PanelHeader title="Ключевые моменты" subtitle="Клик — открыть в разборе" icon={<Flame className="h-4 w-4" />} />
      {moments.length === 0 ? <p className="text-sm text-slate-500">Мультикиллов 4+ и выигранных клатчей не было.</p> : (
        <ul className="space-y-1.5">
          {moments.map((mo, i) => (
            <li key={i}>
              <button type="button" onClick={() => openMoment(mo.round, mo.tick - 64 * 2)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.04]">
                <span className="w-9 font-mono text-xs text-slate-500">R{mo.round}</span>
                {mo.icon === 'ace' || mo.icon === 'mk' ? <Crown className="h-4 w-4 text-[var(--color-signal)]" /> : mo.icon === 'clutch' ? <Skull className="h-4 w-4 text-emerald-300" /> : <Trophy className="h-4 w-4 text-cyan-300" />}
                <span className="flex-1 text-sm">{mo.text}</span>
                <Play className="h-3.5 w-3.5 text-slate-500" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 border-t border-white/[0.05] pt-3">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Как заканчивались раунды</p>
        <div className="flex flex-wrap gap-1.5">
          {summary.teams.flatMap((t) => Object.entries(t.win_reasons).map(([reason, n]) => (
            <Badge key={`${t.name}${reason}`} tone={t.name === summary.match.team_t_name ? 'signal' : 'neutral'}>{t.name}: {REASON_RU[reason] ?? reason} ×{n}</Badge>
          )))}
        </div>
      </div>
    </Panel>
  );
}
