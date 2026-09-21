import { useMemo } from 'react';
import type { BombEvent } from '../../types/match';
import { gameToThree } from '../core/coords';

interface BombMarkerProps {
  bombEvents: BombEvent[];
  currentTick: number;
}

export function BombMarker({ bombEvents, currentTick }: BombMarkerProps) {
  const plant = useMemo(() => {
    let last: BombEvent | null = null;
    for (const e of bombEvents) {
      if (e.tick > currentTick) break;
      if (e.event_type === 'bomb_planted') last = e;
      if (e.event_type === 'bomb_defused') last = null;
    }
    return last;
  }, [bombEvents, currentTick]);

  if (!plant) return null;
  const [x, y, z] = gameToThree(plant.x, plant.y, 0);

  return (
    <group position={[x, y + 12, z]}>
      <mesh>
        <boxGeometry args={[28, 18, 36]} />
        <meshStandardMaterial color="#fbbf24" emissive="#f59e0b" emissiveIntensity={0.65} />
      </mesh>
      <mesh position={[0, 28, 0]}>
        <sphereGeometry args={[8, 12, 12]} />
        <meshBasicMaterial color="#ef4444" />
      </mesh>
      <pointLight color="#f59e0b" intensity={2.2} distance={280} />
    </group>
  );
}
