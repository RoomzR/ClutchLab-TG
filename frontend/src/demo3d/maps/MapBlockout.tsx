import { useEffect, useMemo, useRef } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { MapConfig } from '../../utils/mapConfig';
import { getMapZones } from '../../utils/mapZones';
import { gameToThree, mapWorldBounds } from '../core/coords';
import { registerMapCollider } from './mapCollision';

interface MapBlockoutProps {
  mapConfig: MapConfig;
}

function zoneBox(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  height: number,
  yBase: number,
): { position: [number, number, number]; size: [number, number, number] } {
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const [tx, , tz] = gameToThree(cx, cy, 0);
  const w = Math.max(40, maxX - minX);
  const d = Math.max(40, maxY - minY);
  return {
    position: [tx, yBase + height / 2, tz],
    size: [w, height, d],
  };
}

/**
 * Volumetric CS-style blockout from callout zones + radar floor.
 * Not Valve meshes — but real 3D playspace instead of a flat 2D image.
 */
export function MapBlockout({ mapConfig }: MapBlockoutProps) {
  const texture = useTexture(mapConfig.imageUrl);
  const rootRef = useRef<THREE.Group>(null);
  const bounds = useMemo(() => mapWorldBounds(mapConfig), [mapConfig]);
  const zones = useMemo(() => getMapZones(mapConfig.id), [mapConfig.id]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    texture.needsUpdate = true;
  }, [texture]);

  const structures = useMemo(() => {
    return zones.map((z) => {
      const isSite = z.id.includes('site');
      const isSpawn = z.id.includes('spawn');
      const wallH = isSite ? 160 : isSpawn ? 90 : 120;
      const floorH = isSite ? 8 : 4;
      const pad = zoneBox(z.minX, z.maxX, z.minY, z.maxY, floorH, 0);
      // Hollow shell: outer walls as 4 thin boxes
      const walls: Array<{ position: [number, number, number]; size: [number, number, number] }> = [];
      const thick = 28;
      const [cx, , cz] = gameToThree((z.minX + z.maxX) / 2, (z.minY + z.maxY) / 2, 0);
      const w = Math.max(80, z.maxX - z.minX);
      const d = Math.max(80, z.maxY - z.minY);
      const y = floorH + wallH / 2;
      walls.push({ position: [cx, y, cz - d / 2], size: [w, wallH, thick] });
      walls.push({ position: [cx, y, cz + d / 2], size: [w, wallH, thick] });
      walls.push({ position: [cx - w / 2, y, cz], size: [thick, wallH, d] });
      walls.push({ position: [cx + w / 2, y, cz], size: [thick, wallH, d] });

      // Cover props inside zone
      const covers: Array<{ position: [number, number, number]; size: [number, number, number] }> = [];
      for (let i = 0; i < (isSite ? 3 : 2); i++) {
        const fx = z.minX + ((i + 1) / 4) * (z.maxX - z.minX);
        const fy = z.minY + ((i + 1.2) / 4) * (z.maxY - z.minY);
        const [px, , pz] = gameToThree(fx, fy, 0);
        covers.push({
          position: [px, 28, pz],
          size: [55 + i * 10, 56, 40],
        });
      }

      return {
        id: z.id,
        label: z.label,
        pad,
        walls,
        covers,
        isSite,
        color: isSite ? '#3f4f63' : isSpawn ? '#2a3544' : '#334155',
      };
    });
  }, [zones]);

  useEffect(() => {
    const g = rootRef.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    return registerMapCollider(g);
  }, [mapConfig.id, structures]);

  return (
    <group ref={rootRef}>
      {/* Radar as ground plane — reference layer under 3D blockout */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[bounds.centerThree[0], 0.5, bounds.centerThree[2]]}
        receiveShadow
      >
        <planeGeometry args={[bounds.width, bounds.depth]} />
        <meshStandardMaterial map={texture} roughness={0.95} metalness={0.05} />
      </mesh>

      {/* Solid underfloor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[bounds.centerThree[0], -2, bounds.centerThree[2]]}
        receiveShadow
      >
        <planeGeometry args={[bounds.width * 1.05, bounds.depth * 1.05]} />
        <meshStandardMaterial color="#0f172a" />
      </mesh>

      {structures.map((s) => (
        <group key={s.id}>
          <mesh position={s.pad.position} receiveShadow castShadow>
            <boxGeometry args={s.pad.size} />
            <meshStandardMaterial color={s.isSite ? '#475569' : '#1e293b'} roughness={0.9} />
          </mesh>
          {s.walls.map((wall, i) => (
            <mesh key={i} position={wall.position} castShadow receiveShadow>
              <boxGeometry args={wall.size} />
              <meshStandardMaterial color={s.color} roughness={0.85} metalness={0.08} />
            </mesh>
          ))}
          {s.covers.map((c, i) => (
            <mesh key={`c-${i}`} position={c.position} castShadow receiveShadow>
              <boxGeometry args={c.size} />
              <meshStandardMaterial color="#64748b" roughness={0.7} />
            </mesh>
          ))}
        </group>
      ))}

      {/* Arena outer walls */}
      {[
        {
          p: [bounds.centerThree[0], 140, bounds.centerThree[2] - bounds.depth / 2] as [number, number, number],
          s: [bounds.width + 80, 280, 50] as [number, number, number],
        },
        {
          p: [bounds.centerThree[0], 140, bounds.centerThree[2] + bounds.depth / 2] as [number, number, number],
          s: [bounds.width + 80, 280, 50] as [number, number, number],
        },
        {
          p: [bounds.centerThree[0] - bounds.width / 2, 140, bounds.centerThree[2]] as [number, number, number],
          s: [50, 280, bounds.depth] as [number, number, number],
        },
        {
          p: [bounds.centerThree[0] + bounds.width / 2, 140, bounds.centerThree[2]] as [number, number, number],
          s: [50, 280, bounds.depth] as [number, number, number],
        },
      ].map((w, i) => (
        <mesh key={`ow-${i}`} position={w.p} castShadow receiveShadow>
          <boxGeometry args={w.s} />
          <meshStandardMaterial color="#111827" roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}
