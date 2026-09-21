import { useEffect, useMemo, useState } from 'react';
import { useTexture } from '@react-three/drei';
import * as THREE from 'three';
import type { MapConfig } from '../../utils/mapConfig';
import { mapWorldBounds } from '../core/coords';

const GRID = 96;

interface HeightTerrainProps {
  mapConfig: MapConfig;
}

/** Extrudes darker radar pixels into low walls — fake Source-like volume without Valve meshes. */
export function HeightTerrain({ mapConfig }: HeightTerrainProps) {
  const texture = useTexture(mapConfig.imageUrl);
  const bounds = useMemo(() => mapWorldBounds(mapConfig), [mapConfig]);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 16;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.needsUpdate = true;
  }, [texture]);

  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      canvas.width = GRID;
      canvas.height = GRID;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, GRID, GRID);
      const { data } = ctx.getImageData(0, 0, GRID, GRID);

      const geo = new THREE.PlaneGeometry(bounds.width, bounds.depth, GRID - 1, GRID - 1);
      geo.rotateX(-Math.PI / 2);
      const pos = geo.attributes.position as THREE.BufferAttribute;

      for (let i = 0; i < pos.count; i++) {
        const col = i % GRID;
        const row = Math.floor(i / GRID);
        const px = (col + row * GRID) * 4;
        const r = data[px];
        const g = data[px + 1];
        const b = data[px + 2];
        const brightness = (r + g + b) / 3;
        // Dark structure / walls on radar → height; bright floor → flat
        let h = 0;
        if (brightness < 55) h = 95;
        else if (brightness < 90) h = 55;
        else if (brightness < 120) h = 22;
        else if (brightness > 210) h = 4;
        pos.setY(i, h);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      setGeometry(geo);
    };
    img.src = mapConfig.imageUrl;
    return () => {
      cancelled = true;
    };
  }, [mapConfig.imageUrl, bounds.width, bounds.depth]);

  return (
    <group position={[bounds.centerThree[0], 0, bounds.centerThree[2]]}>
      {geometry ? (
        <mesh geometry={geometry} receiveShadow castShadow>
          <meshStandardMaterial
            map={texture}
            roughness={0.9}
            metalness={0.05}
            displacementScale={0}
            side={THREE.FrontSide}
          />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[bounds.width, bounds.depth]} />
          <meshStandardMaterial map={texture} roughness={0.9} />
        </mesh>
      )}
    </group>
  );
}
