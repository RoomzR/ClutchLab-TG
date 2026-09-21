import { useMemo, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EYE_HEIGHT, gameToThree, shortestYawDeltaDeg, sourceYawToThreeRotation } from '../core/coords';
import { GlbPlayer } from './GlbPlayer';
import { GlbWeapon } from '../weapons/GlbWeapon';
import { queryGroundY } from '../maps/mapCollision';
import { classifyWeapon, resolveActiveWeapon, weaponDisplayName } from '../weapons/weaponMesh';

const TEAM = {
  CT: {
    suit: '#1e3a5f',
    pants: '#0f172a',
    vest: '#1d4ed8',
    accent: '#38bdf8',
    glove: '#334155',
    helmet: '#1e293b',
    skin: '#d6b59a',
  },
  T: {
    suit: '#7c2d12',
    pants: '#431407',
    vest: '#9a3412',
    accent: '#fdba74',
    glove: '#44403c',
    helmet: '#292524',
    skin: '#c4a484',
  },
} as const;

interface CharacterOperatorProps {
  name: string;
  team: 'CT' | 'T';
  x: number;
  y: number;
  z: number;
  yaw?: number | null;
  pitch?: number | null;
  moveYaw?: number | null;
  health?: number | null;
  armor?: number | null;
  weapon?: string | null;
  speedPerTick?: number;
  dead?: boolean;
  selected?: boolean;
  showName?: boolean;
  hideForPov?: boolean;
  showAim?: boolean;
}

/** Player: `/models/players/{ct|t}.glb` when present, else procedural mesh. */
export function CharacterOperator({
  name,
  team,
  x,
  y,
  z,
  yaw,
  pitch,
  moveYaw,
  health,
  armor,
  weapon,
  speedPerTick = 0,
  dead = false,
  selected = false,
  showName = true,
  hideForPov = false,
  showAim = true,
}: CharacterOperatorProps) {
  const rootRef = useRef<THREE.Group>(null);
  const aimRef = useRef<THREE.Mesh>(null);
  const leftLeg = useRef<THREE.Group>(null);
  const rightLeg = useRef<THREE.Group>(null);
  const upper = useRef<THREE.Group>(null);
  const phase = useRef(Math.random() * Math.PI * 2);
  const aimFrom = useRef(new THREE.Vector3());
  const aimTo = useRef(new THREE.Vector3());
  const aimMid = useRef(new THREE.Vector3());
  const aimDir = useRef(new THREE.Vector3());
  const aimUp = useRef(new THREE.Vector3(0, 1, 0));

  const smoothPos = useRef<THREE.Vector3 | null>(null);
  const smoothYawDeg = useRef<number | null>(null);
  const smoothPitchRad = useRef(0);
  const smoothSpeed = useRef(0);

  const lookYaw = yaw ?? 0;
  const pitchTarget = useMemo(() => {
    const deg = pitch ?? 0;
    return THREE.MathUtils.clamp((deg * Math.PI) / 180, -1.15, 1.15);
  }, [pitch]);

  const wName = resolveActiveWeapon(weapon, team);
  const wClass = classifyWeapon(wName);
  const isKnife = wClass === 'knife';

  useFrame((_, delta) => {
    const [tx, ty, tz] = gameToThree(x, y, z);
    if (!smoothPos.current) smoothPos.current = new THREE.Vector3(tx, ty, tz);
    const posLambda = dead ? 20 : 14;
    smoothPos.current.x = THREE.MathUtils.damp(smoothPos.current.x, tx, posLambda, delta);
    smoothPos.current.z = THREE.MathUtils.damp(smoothPos.current.z, tz, posLambda, delta);

    // Prefer demo Z, but plant feet on map mesh when the pawn is clearly floating / sinking.
    let targetY = ty;
    if (!dead) {
      const groundY = queryGroundY(smoothPos.current.x, smoothPos.current.z, ty, 420, name);
      if (groundY != null) {
        const err = ty - groundY;
        if (err > 10 || err < -6) {
          // Soft blend so stairs / jumps still follow demo data when close.
          targetY = THREE.MathUtils.lerp(ty, groundY, err > 10 ? 0.85 : 0.65);
        }
      }
    }
    smoothPos.current.y = THREE.MathUtils.damp(smoothPos.current.y, targetY, posLambda, delta);

    if (smoothYawDeg.current == null) smoothYawDeg.current = lookYaw;
    const turn = shortestYawDeltaDeg(smoothYawDeg.current, lookYaw);
    const turnLambda = 10;
    smoothYawDeg.current += turn * (1 - Math.exp(-turnLambda * delta));

    smoothPitchRad.current = THREE.MathUtils.damp(smoothPitchRad.current, pitchTarget, 10, delta);
    smoothSpeed.current = THREE.MathUtils.damp(smoothSpeed.current, speedPerTick ?? 0, 8, delta);

    if (rootRef.current) {
      rootRef.current.position.copy(smoothPos.current);
      rootRef.current.rotation.y = sourceYawToThreeRotation(smoothYawDeg.current);
    }

    if (aimRef.current) {
      const aimLen = selected ? 280 : 160;
      const cp = Math.cos(smoothPitchRad.current);
      const sp = Math.sin(smoothPitchRad.current);
      aimFrom.current.set(0, EYE_HEIGHT, 0);
      aimTo.current.set(cp * aimLen, EYE_HEIGHT - sp * aimLen, 0);
      aimMid.current.copy(aimFrom.current).add(aimTo.current).multiplyScalar(0.5);
      aimDir.current.copy(aimTo.current).sub(aimFrom.current);
      const len = aimDir.current.length() || 1;
      aimDir.current.multiplyScalar(1 / len);
      aimRef.current.position.copy(aimMid.current);
      aimRef.current.quaternion.setFromUnitVectors(aimUp.current, aimDir.current);
      aimRef.current.scale.set(1, len, 1);
    }

    if (dead) return;
    const moving = smoothSpeed.current > 0.35;
    if (moving) phase.current += delta * Math.min(12, 5 + smoothSpeed.current * 1.6);
    const swing = moving ? Math.sin(phase.current) * 0.45 : 0;
    if (leftLeg.current) leftLeg.current.rotation.x = swing;
    if (rightLeg.current) rightLeg.current.rotation.x = -swing;
    if (upper.current) {
      upper.current.rotation.x = smoothPitchRad.current;
      upper.current.rotation.y = 0;
    }
  });

  if (hideForPov) return null;

  const [tx, ty, tz] = gameToThree(x, y, z);
  const colors = TEAM[team];
  const opacity = dead ? 0.22 : 1;
  const hp = dead ? 0 : Math.max(0, Math.min(100, health ?? 100));
  const hpColor = hp > 60 ? '#22c55e' : hp > 30 ? '#eab308' : '#ef4444';

  const procedural = (
    <group visible={!dead || opacity > 0}>
      <group ref={leftLeg} position={[-6.5, 0, 0]}>
        <mesh position={[0, 18, 0]} castShadow>
          <capsuleGeometry args={[4.2, 22, 4, 8]} />
          <meshStandardMaterial color={colors.pants} transparent={dead} opacity={opacity} />
        </mesh>
        <mesh position={[0, 4, 2]} castShadow>
          <boxGeometry args={[7, 5, 10]} />
          <meshStandardMaterial color="#111827" transparent={dead} opacity={opacity} />
        </mesh>
      </group>
      <group ref={rightLeg} position={[6.5, 0, 0]}>
        <mesh position={[0, 18, 0]} castShadow>
          <capsuleGeometry args={[4.2, 22, 4, 8]} />
          <meshStandardMaterial color={colors.pants} transparent={dead} opacity={opacity} />
        </mesh>
        <mesh position={[0, 4, 2]} castShadow>
          <boxGeometry args={[7, 5, 10]} />
          <meshStandardMaterial color="#111827" transparent={dead} opacity={opacity} />
        </mesh>
      </group>
      <mesh position={[0, 34, 0]} castShadow>
        <boxGeometry args={[20, 8, 12]} />
        <meshStandardMaterial color={colors.pants} transparent={dead} opacity={opacity} />
      </mesh>
      <group ref={upper} position={[0, 38, 0]}>
        <mesh position={[0, 12, 0]} castShadow>
          <boxGeometry args={[24, 26, 13]} />
          <meshStandardMaterial
            color={colors.suit}
            transparent={dead}
            opacity={opacity}
            emissive={selected ? colors.accent : '#000'}
            emissiveIntensity={selected ? 0.2 : 0}
          />
        </mesh>
        <mesh position={[0, 13, 4]} castShadow>
          <boxGeometry args={[22, 18, 6]} />
          <meshStandardMaterial color={colors.vest} transparent={dead} opacity={opacity} roughness={0.65} />
        </mesh>
        <mesh position={[-15, 18, 0]} castShadow>
          <sphereGeometry args={[6.5, 10, 10]} />
          <meshStandardMaterial color={colors.suit} transparent={dead} opacity={opacity} />
        </mesh>
        <mesh position={[15, 18, 0]} castShadow>
          <sphereGeometry args={[6.5, 10, 10]} />
          <meshStandardMaterial color={colors.suit} transparent={dead} opacity={opacity} />
        </mesh>
        <mesh position={[-17, 6, 4]} rotation={[0.55, 0, 0.25]} castShadow>
          <capsuleGeometry args={[3.4, 16, 4, 8]} />
          <meshStandardMaterial color={colors.suit} transparent={dead} opacity={opacity} />
        </mesh>
        <mesh position={[14, 5, 8]} rotation={[1.05, 0.1, -0.35]} castShadow>
          <capsuleGeometry args={[3.4, 15, 4, 8]} />
          <meshStandardMaterial color={colors.suit} transparent={dead} opacity={opacity} />
        </mesh>
        <mesh position={[-16, -2, 10]} castShadow>
          <sphereGeometry args={[3.2, 8, 8]} />
          <meshStandardMaterial color={colors.glove} transparent={dead} opacity={opacity} />
        </mesh>
        <mesh position={[12, -1, 16]} castShadow>
          <sphereGeometry args={[3.2, 8, 8]} />
          <meshStandardMaterial color={colors.glove} transparent={dead} opacity={opacity} />
        </mesh>
        {!dead && wName && (
          <group
            position={isKnife ? [14, -2, 18] : [16, 0, 14]}
            rotation={isKnife ? [0.3, 0.5, -1.0] : [0.2, 0.05, 0.1]}
          >
            <GlbWeapon weapon={wName} mode="world" opacity={opacity} />
          </group>
        )}
        <mesh position={[0, 30, 1]} castShadow>
          <sphereGeometry args={[8.5, 14, 14]} />
          <meshStandardMaterial color={colors.skin} transparent={dead} opacity={opacity} />
        </mesh>
        {team === 'T' ? (
          <mesh position={[0, 30, 2]} castShadow>
            <sphereGeometry args={[8.8, 14, 14]} />
            <meshStandardMaterial color="#1c1917" transparent={dead} opacity={opacity * 0.95} />
          </mesh>
        ) : (
          <mesh position={[0, 33, 1]} castShadow>
            <boxGeometry args={[15, 8, 13]} />
            <meshStandardMaterial
              color={colors.helmet}
              metalness={0.4}
              roughness={0.4}
              transparent={dead}
              opacity={opacity}
            />
          </mesh>
        )}
      </group>
    </group>
  );

  return (
    <group
      ref={rootRef}
      position={[tx, ty, tz]}
      rotation={[0, sourceYawToThreeRotation(lookYaw), 0]}
    >
      <GlbPlayer
        team={team}
        opacity={opacity}
        selected={selected}
        fallback={procedural}
        speedPerTick={speedPerTick}
        dead={dead}
        pitchDeg={pitch ?? 0}
        lookYawDeg={lookYaw}
        moveYawDeg={moveYaw ?? null}
        weapon={wName}
        teamForWeapon={team}
        pitchRadRef={smoothPitchRad}
      />

      {!dead && showAim && (
        <mesh ref={aimRef} scale={[1, 160, 1]}>
          <cylinderGeometry args={[selected ? 0.42 : 0.22, selected ? 0.7 : 0.35, 1, 6]} />
          <meshBasicMaterial
            color={selected ? '#fbbf24' : team === 'CT' ? '#38bdf8' : '#fb923c'}
            transparent
            opacity={selected ? 0.65 : 0.28}
            depthWrite={false}
          />
        </mesh>
      )}

      {showName && (
        <Html position={[0, 108, 0]} center distanceFactor={380} style={{ pointerEvents: 'none' }}>
          <div
            style={{
              minWidth: 84,
              padding: '3px 7px',
              background: 'rgba(0,0,0,0.85)',
              border: selected ? `1px solid ${colors.accent}` : '1px solid rgba(255,255,255,0.12)',
              color: dead ? '#94a3b8' : '#f8fafc',
              fontSize: 10,
              fontWeight: 700,
              fontFamily: 'Manrope, system-ui, sans-serif',
            }}
          >
            <div style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>{name}</div>
            {!dead && (
              <>
                <div style={{ marginTop: 3, height: 3, background: 'rgba(255,255,255,0.12)' }}>
                  <div style={{ width: `${hp}%`, height: '100%', background: hpColor }} />
                </div>
                <div
                  style={{
                    marginTop: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono, monospace',
                    color: '#cbd5e1',
                  }}
                >
                  <span>
                    {hp}
                    {armor != null && armor > 0 ? `/${armor}` : ''}
                  </span>
                  <span style={{ color: '#94a3b8' }}>{weaponDisplayName(weapon)}</span>
                </div>
              </>
            )}
          </div>
        </Html>
      )}
    </group>
  );
}
