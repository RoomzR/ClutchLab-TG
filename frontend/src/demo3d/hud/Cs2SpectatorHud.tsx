import { useMemo } from 'react';
import type { KillData, RoundData, RoundPause, TickData } from '../../types/match';
import { computeRoundClock } from '../../utils/roundClock';
import { getDeadPlayersAtTick, getScoreAtTick, type RoundTickRange } from '../../utils/roundStats';
import { cn } from '../../lib/cn';

interface Cs2SpectatorHudProps {
  mapDisplayName: string;
  currentTick: number;
  tickRate: number;
  teamTName: string;
  teamCtName: string;
  selectedRound: number | null;
  rounds: RoundData[];
  roundTickRanges: RoundTickRange[];
  roundPauses: RoundPause[];
  kills: KillData[];
  positions: TickData[];
  players: { name: string; team: 'CT' | 'T' }[];
  followPlayer: string | null;
  onSelectPlayer: (name: string) => void;
  cameraMode: string;
  onCameraMode: (mode: 'orbit' | 'free' | 'follow' | 'pov') => void;
}

export function Cs2SpectatorHud({
  mapDisplayName,
  currentTick,
  tickRate,
  teamTName,
  teamCtName,
  selectedRound,
  rounds,
  roundTickRanges,
  roundPauses,
  kills,
  positions,
  players,
  followPlayer,
  onSelectPlayer,
  cameraMode,
  onCameraMode,
}: Cs2SpectatorHudProps) {
  const score = getScoreAtTick(currentTick, rounds, { teamT: teamTName, teamCt: teamCtName });
  const clock = computeRoundClock(currentTick, roundTickRanges, rounds, roundPauses, tickRate);

  const displayRound =
    selectedRound && selectedRound > 0
      ? selectedRound
      : (() => {
          for (const range of roundTickRanges) {
            if (currentTick >= range.start && currentTick <= range.end) return range.round_number;
          }
          return 0;
        })();

  const dead = useMemo(
    () => getDeadPlayersAtTick(currentTick, kills, roundTickRanges, selectedRound),
    [currentTick, kills, roundTickRanges, selectedRound],
  );

  const recentKills = useMemo(
    () =>
      kills
        .filter((k) => k.tick <= currentTick && currentTick - k.tick < tickRate * 5)
        .slice(-7)
        .reverse(),
    [kills, currentTick, tickRate],
  );

  const ctPlayers = players.filter((p) => p.team === 'CT');
  const tPlayers = players.filter((p) => p.team === 'T');

  const aliveCounts = useMemo(() => {
    const latest = new Map<string, TickData>();
    for (const pos of positions) {
      if (pos.tick > currentTick) continue;
      const prev = latest.get(pos.player_name);
      if (!prev || pos.tick > prev.tick) latest.set(pos.player_name, pos);
    }
    let ct = 0;
    let t = 0;
    for (const pos of latest.values()) {
      if (dead.has(pos.player_name)) continue;
      if (pos.team === 'CT') ct += 1;
      else t += 1;
    }
    return { ct, t };
  }, [positions, currentTick, dead]);

  return (
    <>
      {/* Top CS2-style scoreboard */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center pt-2">
        <div className="flex items-stretch overflow-hidden rounded-sm border border-white/15 bg-black/80 shadow-2xl backdrop-blur-md">
          <div className="flex min-w-[120px] flex-col items-center justify-center bg-orange-500/20 px-4 py-1.5">
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-orange-200">
              {teamTName}
            </span>
            <span className="font-mono text-3xl font-black leading-none text-orange-400">
              {score.score_t}
            </span>
          </div>
          <div className="flex flex-col items-center justify-center px-5 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              {mapDisplayName}
            </span>
            <span
              className={cn(
                'font-mono text-2xl font-bold tabular-nums',
                clock.phase === 'timeout' ? 'text-amber-300' : 'text-white',
              )}
            >
              {clock.display}
            </span>
            <span className="text-[10px] text-slate-500">
              {displayRound > 0 ? `ROUND ${displayRound}` : 'WARMUP'} · {aliveCounts.t} vs{' '}
              {aliveCounts.ct}
            </span>
          </div>
          <div className="flex min-w-[120px] flex-col items-center justify-center bg-sky-500/20 px-4 py-1.5">
            <span className="truncate text-[10px] font-bold uppercase tracking-wider text-sky-200">
              {teamCtName}
            </span>
            <span className="font-mono text-3xl font-black leading-none text-sky-400">
              {score.score_ct}
            </span>
          </div>
        </div>
      </div>

      {/* Killfeed — CS2 style, top-right */}
      <div className="pointer-events-none absolute right-4 top-20 z-30 flex w-[280px] flex-col items-end gap-1">
        {recentKills.map((k) => (
          <div
            key={`${k.tick}-${k.killer}-${k.victim}`}
            className="flex items-center gap-1.5 rounded-sm bg-black/70 px-2.5 py-1 text-[12px] shadow-lg backdrop-blur"
          >
            <span className="font-semibold text-orange-300">{k.killer}</span>
            <span className="rounded bg-white/10 px-1.5 font-mono text-[10px] uppercase text-slate-300">
              {k.weapon.replace('weapon_', '')}
              {k.headshot ? ' ★' : ''}
            </span>
            <span className="font-semibold text-sky-300">{k.victim}</span>
          </div>
        ))}
      </div>

      {/* Camera modes */}
      <div className="absolute left-3 top-20 z-30 flex flex-col gap-1.5">
        <div className="rounded-sm border border-white/10 bg-black/75 p-2 backdrop-blur">
          <p className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.2em] text-slate-500">
            Camera
          </p>
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['free', 'Free'],
                ['pov', 'POV'],
                ['follow', '3rd'],
                ['orbit', 'Top'],
              ] as const
            ).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onCameraMode(mode)}
                className={cn(
                  'rounded-sm px-2 py-1 text-[11px] font-semibold transition-colors',
                  cameraMode === mode
                    ? 'bg-amber-400 text-black'
                    : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 max-w-[170px] text-[10px] leading-snug text-slate-500">
            {cameraMode === 'free' && 'Click canvas for mouse look · WASD · Space/Ctrl up/down'}
            {cameraMode === 'pov' && 'First person · keys 1–0 switch player'}
            {cameraMode === 'follow' && 'Third person · keys 1–0 switch player'}
            {cameraMode === 'orbit' && 'Drag to orbit · scroll zoom'}
          </p>
        </div>
      </div>

      {/* Selected player vitals */}
      {followPlayer && (() => {
        const latest = [...positions]
          .filter((p) => p.player_name === followPlayer && p.tick <= currentTick)
          .sort((a, b) => b.tick - a.tick)[0];
        if (!latest || dead.has(followPlayer)) return null;
        const hp = latest.health ?? 100;
        const ar = latest.armor ?? 0;
        return (
          <div className="pointer-events-none absolute bottom-[118px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-sm border border-white/15 bg-black/75 px-4 py-2 backdrop-blur">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {followPlayer}
              </p>
              <p className="font-mono text-xs text-slate-300">
                {latest.weapon?.replace(/^weapon_/, '') || '—'}
              </p>
            </div>
            <div className="w-28">
              <div className="mb-1 flex justify-between font-mono text-[10px]">
                <span className="text-emerald-300">{hp} HP</span>
                <span className="text-sky-300">{ar} AR</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-sm bg-white/10">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${Math.max(0, Math.min(100, hp))}%` }}
                />
              </div>
            </div>
          </div>
        );
      })()}

      {/* Spectator player strip */}
      <div className="pointer-events-auto absolute inset-x-0 bottom-[86px] z-30 flex justify-center gap-4 px-3">
        <PlayerStrip
          side="T"
          players={tPlayers}
          dead={dead}
          selected={followPlayer}
          onSelect={onSelectPlayer}
        />
        <PlayerStrip
          side="CT"
          players={ctPlayers}
          dead={dead}
          selected={followPlayer}
          onSelect={onSelectPlayer}
        />
      </div>
    </>
  );
}

function PlayerStrip({
  side,
  players,
  dead,
  selected,
  onSelect,
}: {
  side: 'CT' | 'T';
  players: { name: string; team: 'CT' | 'T' }[];
  dead: Set<string>;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const accent = side === 'T' ? 'border-orange-400/40' : 'border-sky-400/40';
  const active =
    side === 'T'
      ? 'bg-orange-500 text-black'
      : 'bg-sky-500 text-black';

  return (
    <div className={cn('flex max-w-[46vw] flex-wrap justify-center gap-1 rounded-sm border bg-black/60 p-1.5 backdrop-blur', accent)}>
      {players.map((p, i) => {
        const isDead = dead.has(p.name);
        const isSel = selected === p.name;
        return (
          <button
            key={p.name}
            type="button"
            onClick={() => onSelect(p.name)}
            className={cn(
              'flex min-w-[72px] max-w-[110px] flex-col items-center rounded-sm px-2 py-1 transition',
              isSel ? active : 'bg-white/5 text-slate-200 hover:bg-white/10',
              isDead && !isSel && 'opacity-35',
            )}
            title={`${i + 1}: ${p.name}`}
          >
            <span className="font-mono text-[9px] opacity-70">{i + 1}</span>
            <span className="w-full truncate text-center text-[11px] font-semibold">{p.name}</span>
          </button>
        );
      })}
    </div>
  );
}
