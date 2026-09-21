import { useEffect, useRef } from 'react';

interface UseReplayPlaybackOptions {
  isPlaying: boolean;
  playbackSpeed: number;
  currentTick: number;
  tickEnd: number;
  tickRate?: number;
  onTickChange: (tick: number) => void;
  onPlaybackEnd?: () => void;
}

/** Smooth replay clock — 1x = real match time using demo tick rate (64 or 128). */
export function useReplayPlayback({
  isPlaying,
  playbackSpeed,
  currentTick,
  tickEnd,
  tickRate = 64,
  onTickChange,
  onPlaybackEnd,
}: UseReplayPlaybackOptions) {
  const tickRef = useRef(currentTick);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const onTickChangeRef = useRef(onTickChange);
  const onPlaybackEndRef = useRef(onPlaybackEnd);

  useEffect(() => {
    onTickChangeRef.current = onTickChange;
  }, [onTickChange]);

  useEffect(() => {
    onPlaybackEndRef.current = onPlaybackEnd;
  }, [onPlaybackEnd]);

  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      tickRef.current = currentTick;
      lastFrameRef.current = null;
    } else if (!isPlaying) {
      tickRef.current = currentTick;
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, currentTick]);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastFrameRef.current = null;
      return;
    }

    const step = (timestamp: number) => {
      if (lastFrameRef.current === null) {
        lastFrameRef.current = timestamp;
      }

      const deltaMs = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;
      const tickDelta = (deltaMs / 1000) * tickRate * playbackSpeed;
      const next = Math.min(tickEnd, tickRef.current + tickDelta);
      tickRef.current = next;
      onTickChangeRef.current(next);

      if (next >= tickEnd) {
        onPlaybackEndRef.current?.();
        return;
      }

      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastFrameRef.current = null;
    };
  }, [isPlaying, playbackSpeed, tickEnd, tickRate]);
}
