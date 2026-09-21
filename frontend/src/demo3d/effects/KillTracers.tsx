import { useMemo } from 'react';
import * as THREE from 'three';
import type { KillData, TickData } from '../../types/match';
import { buildPlayerTracks, interpolateTrackAtTick } from '../../utils/positionInterpolation';
import { gameToThree } from '../core/coords';

interface KillTracersProps {
  kills: KillData[];
  positions: TickData[];
  currentTick: number;
  tickRate: number;
}

export function KillTracers({ kills, positions, currentTick, tickRate }: KillTracersProps) {
  const tracks = useMemo(() => buildPlayerTracks(positions), [positions]);

  const active = useMemo(() => {
    const windowTicks = tickRate * 1.2;
    return kills.filter(
      (k) => k.tick <= currentTick && currentTick - k.tick < windowTicks,
    );
  }, [kills, currentTick, tickRate]);

  return (
    <group>
      {active.map((k) => {
        const killer = interpolateTrackAtTick(tracks.get(k.killer) ?? [], k.tick);
        const victim = interpolateTrackAtTick(tracks.get(k.victim) ?? [], k.tick);
        if (!killer || !victim) return null;

        const a = new THREE.Vector3(...gameToThree(killer.x, killer.y, killer.z + 64));
        const b = new THREE.Vector3(...gameToThree(victim.x, victim.y, victim.z + 48));
        const mid = a.clone().lerp(b, 0.5);
        const dir = b.clone().sub(a);
        const len = dir.length();
        if (len < 1) return null;
        const quat = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          dir.clone().normalize(),
        );
        const age = (currentTick - k.tick) / (tickRate * 1.2);
        const opacity = Math.max(0.15, 1 - age);

        return (
          <group key={`${k.tick}-${k.killer}-${k.victim}`}>
            <mesh position={mid.toArray()} quaternion={quat}>
              <cylinderGeometry args={[2.2, 2.2, len, 6]} />
              <meshBasicMaterial
                color={k.headshot ? '#fbbf24' : '#f8fafc'}
                transparent
                opacity={opacity * 0.85}
              />
            </mesh>
            <mesh position={gameToThree(victim.x, victim.y, victim.z + 8)}>
              <sphereGeometry args={[18, 12, 12]} />
              <meshBasicMaterial color="#ef4444" transparent opacity={opacity * 0.45} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}
