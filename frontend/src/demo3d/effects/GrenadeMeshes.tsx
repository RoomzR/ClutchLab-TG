import { useMemo } from 'react';
import * as THREE from 'three';
import type { GrenadeData } from '../../types/match';
import {
  getActiveGrenadesAtTick,
  getGrenadeOpacity,
  getInFlightGrenadesAtTick,
  grenadePositionAtTick,
} from '../../utils/grenadeReplay';
import { getGrenadeIconConfig } from '../../utils/grenadeIcons';
import { gameToThree } from '../core/coords';

interface GrenadeMeshesProps {
  grenades: GrenadeData[];
  currentTick: number;
  tickRate: number;
}

export function GrenadeMeshes({ grenades, currentTick, tickRate }: GrenadeMeshesProps) {
  const inFlight = useMemo(
    () => getInFlightGrenadesAtTick(grenades, currentTick, tickRate),
    [grenades, currentTick, tickRate],
  );
  const active = useMemo(
    () => getActiveGrenadesAtTick(grenades, currentTick),
    [grenades, currentTick],
  );

  return (
    <group>
      {inFlight.map((g) => {
        const pos = grenadePositionAtTick(g, currentTick, tickRate);
        if (!pos) return null;
        const [x, y, z] = gameToThree(pos.x, pos.y, pos.z);
        const cfg = getGrenadeIconConfig(g.grenade_type);
        const key = `${g.tick}-${g.player_name}-${g.grenade_type}-fly`;
        return (
          <mesh key={key} position={[x, y, z]}>
            <sphereGeometry args={[9, 12, 12]} />
            <meshStandardMaterial
              color={cfg.radarFill}
              emissive={cfg.radarFill}
              emissiveIntensity={0.7}
            />
          </mesh>
        );
      })}

      {active.map((g) => {
        const [x, y, z] = gameToThree(g.to_x, g.to_y, g.to_z ?? 0);
        const cfg = getGrenadeIconConfig(g.grenade_type);
        const key = `${g.tick}-${g.player_name}-${g.grenade_type}-land`;
        const opacity = getGrenadeOpacity(g, currentTick);

        if (g.grenade_type === 'smoke') {
          return (
            <group key={key} position={[x, y + 40, z]}>
              {[0, 28, 52].map((lift, i) => (
                <mesh key={i} position={[Math.sin(i * 1.7) * 12, lift, Math.cos(i * 1.3) * 12]}>
                  <sphereGeometry args={[70 - i * 8, 18, 18]} />
                  <meshStandardMaterial
                    color="#94a3b8"
                    transparent
                    opacity={0.22 * opacity}
                    depthWrite={false}
                    roughness={1}
                  />
                </mesh>
              ))}
            </group>
          );
        }

        if (g.grenade_type === 'molotov' || g.grenade_type === 'incendiary') {
          return (
            <group key={key} position={[x, y + 6, z]}>
              <mesh>
                <cylinderGeometry args={[55, 70, 14, 16]} />
                <meshStandardMaterial
                  color="#ef4444"
                  emissive="#f97316"
                  emissiveIntensity={1.4}
                  transparent
                  opacity={0.55 * opacity}
                  depthWrite={false}
                />
              </mesh>
              <pointLight color="#f97316" intensity={3.5 * opacity} distance={220} />
            </group>
          );
        }

        if (g.grenade_type === 'flash') {
          return (
            <mesh key={key} position={[x, y + 20, z]}>
              <sphereGeometry args={[22, 12, 12]} />
              <meshBasicMaterial color="#ffffff" transparent opacity={0.75 * opacity} />
            </mesh>
          );
        }

        if (g.grenade_type === 'he') {
          return (
            <mesh key={key} position={[x, y + 16, z]}>
              <sphereGeometry args={[36, 12, 12]} />
              <meshBasicMaterial color="#fbbf24" transparent opacity={0.4 * opacity} />
            </mesh>
          );
        }

        return (
          <mesh key={key} position={[x, y + 10, z]}>
            <sphereGeometry args={[14, 12, 12]} />
            <meshStandardMaterial
              color={cfg.radarFill}
              transparent
              opacity={0.5 * opacity}
              emissive={cfg.radarFill}
              emissiveIntensity={0.3}
              depthWrite={false}
            />
          </mesh>
        );
      })}

      {inFlight.slice(0, 14).map((g) => {
        const a = new THREE.Vector3(...gameToThree(g.from_x, g.from_y, g.from_z ?? 0));
        const b = new THREE.Vector3(...gameToThree(g.to_x, g.to_y, g.to_z ?? 0));
        const curve = new THREE.QuadraticBezierCurve3(
          a,
          new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, b.y) + 140, (a.z + b.z) / 2),
          b,
        );
        const cfg = getGrenadeIconConfig(g.grenade_type);
        return (
          <mesh key={`${g.tick}-${g.player_name}-arc`}>
            <tubeGeometry args={[curve, 24, 2.5, 6, false]} />
            <meshBasicMaterial color={cfg.radarStroke} transparent opacity={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}
