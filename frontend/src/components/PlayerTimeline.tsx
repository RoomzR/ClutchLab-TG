import { useMemo } from 'react';
import * as Slider from '@radix-ui/react-slider';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { RoundData } from '../types/match';
import type { RoundTickRange } from '../utils/roundStats';
import { formatTick } from '../utils/formatTime';
import { cn } from '../lib/cn';

interface PlayerTimelineProps {
  tickStart: number;
  tickEnd: number;
  currentTick: number;
  onTickChange: (tick: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
  rounds?: RoundData[];
  roundTickRanges?: RoundTickRange[];
  selectedRound?: number | null;
  onRoundSelect?: (round: number | null) => void;
  teamTName?: string;
  className?: string;
  /** Slim bar for 3D spectator — hides duplicate transport + tall round grid. */
  compact?: boolean;
}

const SPEEDS = [1, 2, 4, 8];

export function PlayerTimeline({
  tickStart,
  tickEnd,
  currentTick,
  onTickChange,
  isPlaying,
  onPlayPause,
  playbackSpeed,
  onSpeedChange,
  rounds = [],
  roundTickRanges = [],
  selectedRound,
  onRoundSelect,
  teamTName,
  className,
  compact = false,
}: PlayerTimelineProps) {
  const range = tickEnd - tickStart || 1;

  const roundMarkers = useMemo(() => {
    return rounds.map((round) => {
      const tickRange = roundTickRanges.find((r) => r.round_number === round.round_number);
      const start = tickRange?.start ?? round.start_tick ?? tickStart;
      const end = tickRange?.end ?? round.end_tick ?? start;
      return {
        round_number: round.round_number,
        start,
        end,
        winner: round.winner,
        position: Math.min(100, Math.max(0, ((start - tickStart) / range) * 100)),
      };
    });
  }, [rounds, roundTickRanges, tickStart, range]);

  const jumpRound = (direction: -1 | 1) => {
    if (!roundMarkers.length) return;
    if (direction === -1 && (selectedRound === 0 || selectedRound === null)) {
      onRoundSelect?.(0);
      return;
    }
    const currentIndex =
      selectedRound != null && selectedRound > 0
        ? roundMarkers.findIndex((r) => r.round_number === selectedRound)
        : 0;
    const nextIndex = Math.min(
      roundMarkers.length - 1,
      Math.max(0, (currentIndex === -1 ? 0 : currentIndex) + direction),
    );
    const nextRound = roundMarkers[nextIndex];
    onRoundSelect?.(nextRound.round_number);
    onTickChange(nextRound.start);
  };

  if (compact) {
    return (
      <div className={cn('space-y-1.5', className)}>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => onRoundSelect?.(0)}
              className={cn(
                'shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px]',
                selectedRound === 0
                  ? 'bg-amber-400 text-black'
                  : 'bg-white/10 text-slate-300 hover:bg-white/15',
              )}
            >
              0:0
            </button>
            {roundMarkers.map((marker) => {
              const active = selectedRound === marker.round_number;
              const roundMeta = rounds.find((r) => r.round_number === marker.round_number);
              const tWin =
                roundMeta?.winner_team != null && teamTName
                  ? roundMeta.winner_team === teamTName
                  : marker.winner === 'T';
              return (
                <button
                  key={marker.round_number}
                  type="button"
                  onClick={() => {
                    onRoundSelect?.(active ? null : marker.round_number);
                    onTickChange(marker.start);
                  }}
                  className={cn(
                    'shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[10px]',
                    active
                      ? 'bg-amber-400 text-black'
                      : tWin
                        ? 'bg-orange-500/20 text-orange-200 hover:bg-orange-500/30'
                        : 'bg-sky-500/20 text-sky-200 hover:bg-sky-500/30',
                  )}
                >
                  R{marker.round_number}
                </button>
              );
            })}
          </div>
          <div className="flex shrink-0 gap-0.5">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onSpeedChange(speed)}
                className={cn(
                  'rounded-sm px-1.5 py-0.5 font-mono text-[10px]',
                  playbackSpeed === speed
                    ? 'bg-amber-400 text-black'
                    : 'bg-white/10 text-slate-400 hover:text-white',
                )}
              >
                {speed}x
              </button>
            ))}
          </div>
          <span className="shrink-0 font-mono text-[10px] text-slate-400">
            {formatTick(Math.round(currentTick))}
          </span>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-x-0 -top-1.5 h-2">
            {roundMarkers.map((marker) => (
              <div
                key={`m-${marker.round_number}`}
                className={cn(
                  'absolute top-0 h-2 w-0.5',
                  marker.winner === 'CT' ? 'bg-sky-400/80' : 'bg-orange-400/80',
                )}
                style={{ left: `${marker.position}%` }}
              />
            ))}
          </div>
          <Slider.Root
            className="relative flex h-4 w-full touch-none select-none items-center"
            value={[Math.round(currentTick)]}
            min={tickStart}
            max={tickEnd}
            step={1}
            onValueChange={([value]) => onTickChange(value)}
          >
            <Slider.Track className="relative h-1.5 grow rounded-sm bg-white/15">
              <Slider.Range className="absolute h-full rounded-sm bg-amber-400" />
            </Slider.Track>
            <Slider.Thumb
              className="block h-3.5 w-3.5 rounded-sm border border-amber-200 bg-white shadow focus:outline-none"
              aria-label="Текущий тик"
            />
          </Slider.Root>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-md',
        className,
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => jumpRound(-1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onPlayPause}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-white shadow-lg shadow-cyan-500/20 hover:bg-cyan-400"
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
          </button>
          <button
            type="button"
            onClick={() => jumpRound(1)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
          >
            <SkipForward className="h-4 w-4" />
          </button>

          <div className="ml-2 flex gap-1">
            {SPEEDS.map((speed) => (
              <button
                key={speed}
                type="button"
                onClick={() => onSpeedChange(speed)}
                className={cn(
                  'rounded-md px-2.5 py-1 font-mono text-xs transition-colors',
                  playbackSpeed === speed
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/30'
                    : 'text-slate-400 hover:bg-white/5 hover:text-white',
                )}
              >
                {speed}x
              </button>
            ))}
          </div>
        </div>

        <span className="font-mono text-sm text-slate-200">
          {formatTick(Math.round(currentTick))} / {formatTick(tickEnd)}
          {rounds.length > 0 && (
            <span className="ml-2 text-xs text-slate-500">· {rounds.length} rnd</span>
          )}
        </span>
      </div>

      <div className="mb-3 max-h-24 overflow-y-auto scrollbar-thin">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onRoundSelect?.(0)}
            className={cn(
              'rounded-md px-2 py-1 font-mono text-[11px] transition-all',
              selectedRound === 0
                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
                : 'bg-slate-500/10 text-slate-300 hover:bg-slate-500/20',
            )}
          >
            0:0
          </button>
          {roundMarkers.map((marker) => {
            const active = selectedRound === marker.round_number;
            const roundMeta = rounds.find((r) => r.round_number === marker.round_number);
            const tWin =
              roundMeta?.winner_team != null && teamTName
                ? roundMeta.winner_team === teamTName
                : marker.winner === 'T';
            return (
              <button
                key={marker.round_number}
                type="button"
                onClick={() => {
                  onRoundSelect?.(active ? null : marker.round_number);
                  onTickChange(marker.start);
                }}
                className={cn(
                  'rounded-md px-2 py-1 font-mono text-[11px] transition-all',
                  active
                    ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-400/40'
                    : tWin
                      ? 'bg-orange-500/10 text-orange-300 hover:bg-orange-500/20'
                      : 'bg-blue-500/10 text-blue-300 hover:bg-blue-500/20',
                )}
              >
                R{marker.round_number}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mb-2 h-6">
        {roundMarkers.map((marker) => (
          <button
            key={`marker-${marker.round_number}`}
            type="button"
            onClick={() => {
              onRoundSelect?.(marker.round_number);
              onTickChange(marker.start);
            }}
            className="absolute top-0 flex flex-col items-center"
            style={{ left: `${marker.position}%`, transform: 'translateX(-50%)' }}
            title={`R${marker.round_number} · ${marker.winner}`}
          >
            <div
              className={cn(
                'h-3 w-0.5',
                marker.winner === 'CT' ? 'bg-blue-500' : 'bg-orange-500',
              )}
            />
          </button>
        ))}
      </div>

      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        value={[Math.round(currentTick)]}
        min={tickStart}
        max={tickEnd}
        step={1}
        onValueChange={([value]) => onTickChange(value)}
      >
        <Slider.Track className="relative h-2 grow rounded-full bg-white/10">
          <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-500" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-5 w-5 rounded-full border-2 border-cyan-300 bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-cyan-400/50"
          aria-label="Текущий тик"
        />
      </Slider.Root>
    </div>
  );
}
