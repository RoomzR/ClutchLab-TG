import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import type { MapConfig } from '../../utils/mapConfig';
import { detectGlbAlign } from './mapGlbAlign';
import { registerMapCollider } from './mapCollision';
import { MapBlockout } from './MapBlockout';
import { sanitizeMapMaterials, stripMapHelpers } from './stripMapHelpers';

interface MapModelProps {
  mapConfig: MapConfig;
}

function GlbMap({ url }: { url: string }) {
  const gltf = useGLTF(url);

  const { scene, align } = useMemo(() => {
    const root = gltf.scene.clone(true);

    const drop: THREE.Object3D[] = [];
    root.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh && /^cube$/i.test(obj.name)) {
        const geom = (obj as THREE.Mesh).geometry;
        geom.computeBoundingBox();
        const bb = geom.boundingBox;
        if (bb) {
          const size = new THREE.Vector3();
          bb.getSize(size);
          if (size.length() < 8) drop.push(obj);
        }
      }
    });
    for (const obj of drop) obj.parent?.remove(obj);

    stripMapHelpers(root);
    sanitizeMapMaterials(root);

    // Perf: skip shadows on huge detail meshes.
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geom = mesh.geometry;
      if (!geom) return;
      const count = geom.getAttribute('position')?.count ?? 0;
      if (count > 50_000) {
        mesh.castShadow = false;
        mesh.receiveShadow = true;
      }
    });

    const align = detectGlbAlign(root);
    return { scene: root, align };
  }, [gltf.scene]);

  const wrapRef = useRef<THREE.Group>(null);

  useEffect(() => {
    const g = wrapRef.current;
    if (!g) return;
    g.updateMatrixWorld(true);
    return registerMapCollider(g);
  }, [scene, align]);

  return (
    <group
      ref={wrapRef}
      position={[0, 0, 0]}
      scale={[align.scale, align.scale, align.scale]}
      rotation={align.rotation}
    >
      <primitive object={scene} />
    </group>
  );
}

class GlbErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * Real GLB when present (warmed by MapLoadingScreen). No HEAD probe gate.
 */
export function MapModel({ mapConfig }: MapModelProps) {
  const url = `/maps/3d/${mapConfig.id}.glb`;
  const fallback = <MapBlockout mapConfig={mapConfig} />;

  return (
    <GlbErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>
        <GlbMap url={url} />
      </Suspense>
    </GlbErrorBoundary>
  );
}
