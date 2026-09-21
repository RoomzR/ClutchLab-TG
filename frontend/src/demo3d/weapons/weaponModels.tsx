import type { ReactNode } from 'react';
import { classifyWeapon, normalizeWeaponName } from './weaponMesh';

interface WeaponModelProps {
  weapon?: string | null;
  /** World third-person vs FPS viewmodel scale/pose. */
  mode?: 'world' | 'viewmodel';
  opacity?: number;
}

function Mat({
  color,
  metalness = 0.65,
  roughness = 0.35,
  opacity = 1,
}: {
  color: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
}) {
  return (
    <meshStandardMaterial
      color={color}
      metalness={metalness}
      roughness={roughness}
      transparent={opacity < 1}
      opacity={opacity}
    />
  );
}

/** Procedural CS2-like weapon silhouettes (no Valve meshes). */
export function WeaponModel({ weapon, mode = 'world', opacity = 1 }: WeaponModelProps) {
  const w = normalizeWeaponName(weapon);
  const cls = classifyWeapon(w);
  const s = mode === 'viewmodel' ? 1.15 : 1;

  let body: ReactNode;
  switch (true) {
    case w === 'ak47':
      body = <Ak47 opacity={opacity} />;
      break;
    case w === 'm4a1' || w === 'm4a1_silencer':
      body = <M4 opacity={opacity} silenced={w.includes('silencer')} />;
      break;
    case w === 'awp':
      body = <Awp opacity={opacity} />;
      break;
    case w === 'ssg08':
      body = <Scout opacity={opacity} />;
      break;
    case w === 'deagle' || w === 'revolver':
      body = <Deagle opacity={opacity} />;
      break;
    case cls === 'pistol':
      body = <Pistol opacity={opacity} />;
      break;
    case cls === 'smg':
      body = <Smg opacity={opacity} />;
      break;
    case cls === 'shotgun':
      body = <Shotgun opacity={opacity} />;
      break;
    case cls === 'knife':
      body = <Knife opacity={opacity} />;
      break;
    case cls === 'nade':
      body = <Nade opacity={opacity} />;
      break;
    case w === 'aug' || w === 'sg556':
      body = <AugLike opacity={opacity} />;
      break;
    default:
      body = <GenericRifle opacity={opacity} />;
  }

  return <group scale={[s, s, s]}>{body}</group>;
}

function Ak47({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0, 18]} castShadow>
        <boxGeometry args={[3.2, 4.2, 36]} />
        <Mat color="#1a1a1a" opacity={opacity} />
      </mesh>
      <mesh position={[0, 1.2, 38]} castShadow>
        <boxGeometry args={[2.2, 2.2, 14]} />
        <Mat color="#111" opacity={opacity} metalness={0.8} />
      </mesh>
      <mesh position={[0, -2.5, 8]} castShadow>
        <boxGeometry args={[2.4, 5, 10]} />
        <Mat color="#3f2a14" opacity={opacity} metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, 4.2, 10]} castShadow>
        <boxGeometry args={[1.6, 4, 8]} />
        <Mat color="#2a2a2a" opacity={opacity} />
      </mesh>
      <mesh position={[0, -1, 28]} castShadow>
        <boxGeometry args={[2.8, 2, 6]} />
        <Mat color="#222" opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.5, 48]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 8, 8]} />
        <Mat color="#0a0a0a" opacity={opacity} metalness={0.85} />
      </mesh>
    </group>
  );
}

function M4({ opacity, silenced }: { opacity: number; silenced: boolean }) {
  return (
    <group>
      <mesh position={[0, 0.5, 16]} castShadow>
        <boxGeometry args={[3, 3.6, 34]} />
        <Mat color="#2c2f33" opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.8, 36]} castShadow>
        <boxGeometry args={[2.4, 2.4, silenced ? 22 : 12]} />
        <Mat color="#1a1d20" opacity={opacity} metalness={0.75} />
      </mesh>
      <mesh position={[0, -2.2, 6]} castShadow>
        <boxGeometry args={[2.2, 4.5, 8]} />
        <Mat color="#1f2937" opacity={opacity} roughness={0.55} />
      </mesh>
      <mesh position={[0, 3.6, 12]} castShadow>
        <boxGeometry args={[1.4, 3.2, 10]} />
        <Mat color="#374151" opacity={opacity} />
      </mesh>
      <mesh position={[0, -0.5, 24]} castShadow>
        <boxGeometry args={[2.6, 2.2, 8]} />
        <Mat color="#111827" opacity={opacity} />
      </mesh>
    </group>
  );
}

function Awp({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0.5, 22]} castShadow>
        <boxGeometry args={[3.4, 3.8, 48]} />
        <Mat color="#1e293b" opacity={opacity} />
      </mesh>
      <mesh position={[0, 1, 48]} castShadow>
        <cylinderGeometry args={[1.3, 1.3, 22, 10]} />
        <Mat color="#0f172a" opacity={opacity} metalness={0.85} />
      </mesh>
      <mesh position={[0, 4.5, 18]} castShadow>
        <boxGeometry args={[2.8, 3.2, 10]} />
        <Mat color="#334155" opacity={opacity} />
      </mesh>
      <mesh position={[0, 6.2, 18]} castShadow>
        <cylinderGeometry args={[1.4, 1.4, 8, 10]} />
        <Mat color="#111827" opacity={opacity} metalness={0.7} />
      </mesh>
      <mesh position={[0, -2.8, 8]} castShadow>
        <boxGeometry args={[2.4, 5, 10]} />
        <Mat color="#0f172a" opacity={opacity} />
      </mesh>
    </group>
  );
}

function Scout({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0.3, 20]} castShadow>
        <boxGeometry args={[2.8, 3.2, 42]} />
        <Mat color="#3f2a14" opacity={opacity} metalness={0.25} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.8, 44]} castShadow>
        <cylinderGeometry args={[0.9, 0.9, 14, 8]} />
        <Mat color="#1a1a1a" opacity={opacity} metalness={0.8} />
      </mesh>
      <mesh position={[0, 3.8, 16]} castShadow>
        <boxGeometry args={[2.2, 2.4, 8]} />
        <Mat color="#222" opacity={opacity} />
      </mesh>
    </group>
  );
}

function Deagle({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 1, 8]} castShadow>
        <boxGeometry args={[3.2, 4.5, 16]} />
        <Mat color="#1f2937" opacity={opacity} metalness={0.75} />
      </mesh>
      <mesh position={[0, -2, 2]} castShadow>
        <boxGeometry args={[2.6, 5.5, 6]} />
        <Mat color="#111827" opacity={opacity} />
      </mesh>
      <mesh position={[0, 2.2, 16]} castShadow>
        <boxGeometry args={[2.4, 2.2, 6]} />
        <Mat color="#0a0a0a" opacity={opacity} metalness={0.85} />
      </mesh>
    </group>
  );
}

function Pistol({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0.8, 7]} castShadow>
        <boxGeometry args={[2.4, 3.6, 14]} />
        <Mat color="#374151" opacity={opacity} />
      </mesh>
      <mesh position={[0, -2.2, 1.5]} castShadow>
        <boxGeometry args={[2.1, 5, 5]} />
        <Mat color="#1f2937" opacity={opacity} />
      </mesh>
    </group>
  );
}

function Smg({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0.4, 12]} castShadow>
        <boxGeometry args={[3, 3.4, 26]} />
        <Mat color="#27272a" opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.6, 28]} castShadow>
        <boxGeometry args={[2.2, 2.2, 10]} />
        <Mat color="#18181b" opacity={opacity} metalness={0.7} />
      </mesh>
      <mesh position={[0, -2.4, 6]} castShadow>
        <boxGeometry args={[2.2, 4.2, 7]} />
        <Mat color="#3f3f46" opacity={opacity} />
      </mesh>
    </group>
  );
}

function Shotgun({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0.2, 16]} castShadow>
        <boxGeometry args={[3.2, 3.4, 34]} />
        <Mat color="#44403c" opacity={opacity} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.6, 36]} castShadow>
        <cylinderGeometry args={[1.5, 1.5, 12, 8]} />
        <Mat color="#1c1917" opacity={opacity} metalness={0.8} />
      </mesh>
      <mesh position={[0, -2.6, 6]} castShadow>
        <boxGeometry args={[2.4, 4.5, 8]} />
        <Mat color="#292524" opacity={opacity} />
      </mesh>
    </group>
  );
}

function Knife({ opacity }: { opacity: number }) {
  return (
    <group rotation={[0, 0, 0.15]}>
      <mesh position={[0, 0, 8]} castShadow>
        <boxGeometry args={[1.2, 0.6, 16]} />
        <Mat color="#e5e7eb" opacity={opacity} metalness={0.9} roughness={0.2} />
      </mesh>
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[1.8, 1.4, 5]} />
        <Mat color="#1c1917" opacity={opacity} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, 16]} castShadow>
        <coneGeometry args={[0.7, 4, 4]} />
        <Mat color="#f8fafc" opacity={opacity} metalness={0.95} roughness={0.15} />
      </mesh>
    </group>
  );
}

function Nade({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh castShadow>
        <sphereGeometry args={[4.5, 12, 12]} />
        <Mat color="#365314" opacity={opacity} metalness={0.4} roughness={0.55} />
      </mesh>
      <mesh position={[0, 4.5, 0]} castShadow>
        <cylinderGeometry args={[1.2, 1.2, 3, 8]} />
        <Mat color="#a3a3a3" opacity={opacity} metalness={0.8} />
      </mesh>
    </group>
  );
}

function AugLike({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0.5, 14]} castShadow>
        <boxGeometry args={[3.2, 4, 30]} />
        <Mat color="#14532d" opacity={opacity} />
      </mesh>
      <mesh position={[0, 1, 34]} castShadow>
        <boxGeometry args={[2.4, 2.4, 14]} />
        <Mat color="#052e16" opacity={opacity} metalness={0.7} />
      </mesh>
      <mesh position={[0, 4.5, 10]} castShadow>
        <boxGeometry args={[2.6, 3.5, 12]} />
        <Mat color="#166534" opacity={opacity} />
      </mesh>
    </group>
  );
}

function GenericRifle({ opacity }: { opacity: number }) {
  return (
    <group>
      <mesh position={[0, 0.3, 16]} castShadow>
        <boxGeometry args={[3, 3.5, 34]} />
        <Mat color="#171717" opacity={opacity} />
      </mesh>
      <mesh position={[0, 0.6, 36]} castShadow>
        <boxGeometry args={[2.2, 2.2, 12]} />
        <Mat color="#0a0a0a" opacity={opacity} metalness={0.8} />
      </mesh>
      <mesh position={[0, -2.4, 6]} castShadow>
        <boxGeometry args={[2.2, 4.5, 8]} />
        <Mat color="#262626" opacity={opacity} />
      </mesh>
    </group>
  );
}
