import { useEffect, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';

import { WEAPON_PRELOAD_LIST } from '../weapons/GlbWeapon';

const CORE_WEAPONS = WEAPON_PRELOAD_LIST;

export type LoadPhase =
  | 'map'
  | 'players'
  | 'weapons'
  | 'viewmodels'
  | 'ready';

export interface AssetLoadState {
  progress: number;
  phase: LoadPhase;
  label: string;
  ready: boolean;
  error: string | null;
}

const PHASE_LABEL: Record<LoadPhase, string> = {
  map: 'Loading map geometry…',
  players: 'Loading operators…',
  weapons: 'Loading weapons…',
  viewmodels: 'Loading viewmodels…',
  ready: 'Ready',
};

function loadGlb(url: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      useGLTF.preload(url);
    } catch {
      /* continue with explicit loader */
    }
    const loader = new GLTFLoader();
    loader.load(
      url,
      () => resolve(),
      undefined,
      () => {
        // Soft-fail individual assets — don't block the whole match.
        resolve();
      },
    );
  });
}

async function headOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * CS2-style warm-up: fetch map + pawns + guns into THREE/drei cache
 * before the spectator Canvas is revealed.
 */
export function useDemoAssetLoader(mapId: string): AssetLoadState {
  const [state, setState] = useState<AssetLoadState>({
    progress: 0,
    phase: 'map',
    label: PHASE_LABEL.map,
    ready: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({
      progress: 0,
      phase: 'map',
      label: PHASE_LABEL.map,
      ready: false,
      error: null,
    });

    (async () => {
      const mapUrl = `/maps/3d/${mapId}.glb`;
      const queue: { url: string; phase: LoadPhase }[] = [];

      if (await headOk(mapUrl)) {
        queue.push({ url: mapUrl, phase: 'map' });
      }

      for (const p of ['/models/players/ct.glb', '/models/players/t.glb']) {
        if (await headOk(p)) queue.push({ url: p, phase: 'players' });
      }

      for (const w of CORE_WEAPONS) {
        const u = `/models/weapons/${w}.glb`;
        if (await headOk(u)) queue.push({ url: u, phase: 'weapons' });
      }

      for (const v of [
        '/models/viewmodels/glove_ct.glb',
        '/models/viewmodels/glove_t.glb',
        '/models/viewmodels/glove_sporty.glb',
        '/models/viewmodels/arms.glb',
      ]) {
        if (await headOk(v)) queue.push({ url: v, phase: 'viewmodels' });
      }

      if (queue.length === 0) {
        if (!cancelled) {
          setState({
            progress: 1,
            phase: 'ready',
            label: 'Ready',
            ready: true,
            error: null,
          });
        }
        return;
      }

      let done = 0;
      const CONCURRENCY = 3;
      let i = 0;

      const worker = async () => {
        while (i < queue.length) {
          const idx = i++;
          const item = queue[idx]!;
          if (cancelled) return;
          setState({
            progress: done / queue.length,
            phase: item.phase,
            label: PHASE_LABEL[item.phase],
            ready: false,
            error: null,
          });
          await loadGlb(item.url);
          done += 1;
          if (cancelled) return;
          setState({
            progress: done / queue.length,
            phase: item.phase,
            label: PHASE_LABEL[item.phase],
            ready: false,
            error: null,
          });
          await new Promise((r) => setTimeout(r, 0));
        }
      };

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      THREE.Cache.enabled = true;

      if (!cancelled) {
        setState({
          progress: 1,
          phase: 'ready',
          label: 'Entering match…',
          ready: true,
          error: null,
        });
      }
    })().catch((err) => {
      if (!cancelled) {
        setState((s) => ({
          ...s,
          ready: true,
          error: err instanceof Error ? err.message : 'Load failed',
          label: 'Loaded with warnings',
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [mapId]);

  return state;
}
