import { Html } from '@react-three/drei';
import { gameToThree, sourceYawToThreeRotation } from '../core/coords';
import { classifyWeapon, weaponStubSize } from '../weapons/weaponMesh';

const TEAM = {
  CT: { body: '#3b82f6', accent: '#93c5fd', vest: '#1e3a5f' },
  T: { body: '#ea580c', accent: '#fdba74', vest: '#7c2d12' },
} as const;

interface PlayerMeshProps {
  name: string;
  team: 'CT' | 'T';
  x: number;
  y: number;
  z: number;
  yaw?: number | null;
  health?: number | null;
  armor?: number | null;
  weapon?: string | null;
  dead?: boolean;
  selected?: boolean;
  showName?: boolean;
  hideForPov?: boolean;
}

export function PlayerMesh({
  name,
  team,
  x,
  y,
  z,
  yaw,
  health,
  armor,
  weapon,
  dead = false,
  selected = false,
  showName = true,
  hideForPov = false,
}: PlayerMeshProps) {
  if (hideForPov) return null;

  const [tx, ty, tz] = gameToThree(x, y, z);
  const colors = TEAM[team];
  const rotY = sourceYawToThreeRotation(yaw ?? 0);
  const opacity = dead ? 0.2 : 1;
  const hp = dead ? 0 : Math.max(0, Math.min(100, health ?? 100));
  const wpnClass = classifyWeapon(weapon);
  const stub = weaponStubSize(wpnClass);
  const hpColor = hp > 60 ? '#22c55e' : hp > 30 ? '#eab308' : '#ef4444';

  return (
    <group position={[tx, ty, tz]} rotation={[0, rotY, 0]}>
      <mesh position={[-8, 18, 0]} castShadow>
        <capsuleGeometry args={[5, 22, 4, 8]} />
        <meshStandardMaterial color={colors.vest} transparent={dead} opacity={opacity} />
      </mesh>
      <mesh position={[8, 18, 0]} castShadow>
        <capsuleGeometry args={[5, 22, 4, 8]} />
        <meshStandardMaterial color={colors.vest} transparent={dead} opacity={opacity} />
      </mesh>
      <mesh position={[0, 48, 0]} castShadow>
        <boxGeometry args={[28, 36, 16]} />
        <meshStandardMaterial
          color={colors.body}
          transparent={dead}
          opacity={opacity}
          emissive={selected ? colors.accent : '#000000'}
          emissiveIntensity={selected ? 0.35 : 0}
          roughness={0.5}
        />
      </mesh>
      <mesh position={[0, 76, 0]} castShadow>
        <sphereGeometry args={[11, 16, 16]} />
        <meshStandardMaterial
          color={dead ? '#64748b' : '#e7e5e4'}
          transparent={dead}
          opacity={opacity}
        />
      </mesh>
      {!dead && (
        <>
          <mesh position={[-18, 50, 4]} rotation={[0.2, 0, 0.4]} castShadow>
            <capsuleGeometry args={[4, 20, 4, 8]} />
            <meshStandardMaterial color={colors.accent} />
          </mesh>
          <mesh position={[18, 50, 4]} rotation={[0.35, 0, -0.55]} castShadow>
            <capsuleGeometry args={[4, 20, 4, 8]} />
            <meshStandardMaterial color={colors.accent} />
          </mesh>
          <mesh position={[20, 48, 10 + stub.length / 2]} rotation={[1.15, 0, 0]}>
            <boxGeometry args={[stub.width, stub.height, stub.length]} />
            <meshStandardMaterial color="#111827" metalness={0.65} roughness={0.28} />
          </mesh>
        </>
      )}
      {showName && (
        <Html position={[0, 108, 0]} center distanceFactor={400} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              minWidth: 72,
              padding: '3px 6px',
              borderRadius: 2,
              background: 'rgba(0,0,0,0.82)',
              border: selected ? `1px solid ${colors.accent}` : '1px solid rgba(255,255,255,0.1)',
              color: dead ? '#94a3b8' : '#f8fafc',
              fontSize: 10,
              fontWeight: 600,
              fontFamily: 'Manrope, system-ui, sans-serif',
              opacity: dead ? 0.5 : 0.95,
            }}
          >
            <div style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>{name}</div>
            {!dead && (
              <>
                <div
                  style={{
                    marginTop: 3,
                    height: 3,
                    background: 'rgba(255,255,255,0.12)',
                    borderRadius: 1,
                    overflow: 'hidden',
                  }}
                >
                  <div style={{ width: `${hp}%`, height: '100%', background: hpColor }} />
                </div>
                <div
                  style={{
                    marginTop: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#cbd5e1',
                  }}
                >
                  <span>{hp}{armor != null && armor > 0 ? ` · ${armor} AR` : ''}</span>
                  <span style={{ color: '#94a3b8' }}>{weapon?.replace(/^weapon_/, '') ?? ''}</span>
                </div>
              </>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
