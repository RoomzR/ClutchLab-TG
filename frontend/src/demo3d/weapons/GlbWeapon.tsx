import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { fixValveMaterials } from '../core/fixValveMaterials';
import { ALL_WEAPON_GLBS } from './weaponCatalog';
import { classifyWeapon, normalizeWeaponName, type WeaponClass } from './weaponMesh';

export type WeaponRenderMode = 'world' | 'viewmodel' | 'hand';

/**
 * Target longest-edge length after load.
 * - viewmodel: meters (weapon_arms / wpn bone)
 * - hand/world: Source units (player fit-height ~72; hand.matrixWorld already scaled)
 */
function fitLength(cls: WeaponClass, mode: WeaponRenderMode): number {
  if (mode === 'viewmodel') {
    switch (cls) {
      case 'knife':
        return 0.32;
      case 'pistol':
        return 0.26;
      case 'nade':
        return 0.16;
      case 'sniper':
        return 0.88;
      case 'smg':
        return 0.5;
      case 'shotgun':
        return 0.65;
      default:
        return 0.68;
    }
  }
  switch (cls) {
    case 'knife':
      return 16;
    case 'pistol':
      return 16;
    case 'nade':
      return 9;
    case 'smg':
      return 20;
    case 'shotgun':
      return 22;
    case 'sniper':
      return 28;
    case 'rifle':
      return 24;
    default:
      return 22;
  }
}

/** Prefer HD body; drop legacy twin. Prefer viewmodel over worldmodel. */
function pruneWeaponMeshes(root: THREE.Object3D): void {
  const names: string[] = [];
  root.traverse((o) => {
    if (o.name) names.push(o.name);
  });
  const hasHd = names.some((n) => /body_hd/i.test(n));
  const hasVm = names.some((n) => /viewmodel/i.test(n));

  root.traverse((o) => {
    if (!o.name) return;
    if (hasHd && /body_legacy/i.test(o.name)) o.visible = false;
    if (hasVm && /worldmodel/i.test(o.name)) o.visible = false;
  });
}

function LoadedWeapon({
  url,
  fit,
  opacity,
  mode,
  keepOrigin,
}: {
  url: string;
  fit: number;
  opacity: number;
  mode: WeaponRenderMode;
  keepOrigin?: boolean;
}) {
  const gltf = useGLTF(url);
  const scene = useMemo(() => {
    const root = gltf.scene.clone(true);
    pruneWeaponMeshes(root);
    fixValveMaterials(root, { unlit: true, opacity });
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.frustumCulled = false;
        m.renderOrder = 2;
      }
    });

    const box = new THREE.Box3().setFromObject(root);
    const size = new THREE.Vector3();
    box.getSize(size);
    const longest = Math.max(size.x, size.y, size.z, 1e-3);
    root.scale.setScalar(fit / longest);
    root.updateMatrixWorld(true);

    // Viewmodel / wpn-bone: keep VRF grip origin.
    // World stubs: center. Hand without keepOrigin: slight rear bias.
    if (mode === 'world' || (mode === 'hand' && !keepOrigin)) {
      const box2 = new THREE.Box3().setFromObject(root);
      const c = new THREE.Vector3();
      box2.getCenter(c);
      if (mode === 'hand') c.x *= 0.25;
      root.position.sub(c);
    }
    if (mode === 'viewmodel') {
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.renderOrder = 1000;
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          if (!mat) continue;
          mat.depthTest = false;
          mat.depthWrite = false;
          mat.needsUpdate = true;
        }
      });
    }

    return root;
  }, [gltf.scene, fit, opacity, mode, keepOrigin]);

  const yaw = mode === 'world' ? Math.PI / 2 : 0;
  return (
    <group rotation={[0, yaw, 0]}>
      <primitive object={scene} />
    </group>
  );
}

function SolidStub({ cls, fit, opacity }: { cls: WeaponClass; fit: number; opacity: number }) {
  const len = fit;
  const w = cls === 'knife' ? 1.4 : cls === 'pistol' ? 2 : 2.4;
  const h = cls === 'knife' ? 1.6 : 2.6;
  const color = cls === 'knife' ? '#c8d0dc' : '#c4c4cc';
  return (
    <mesh frustumCulled={false} renderOrder={2}>
      <boxGeometry args={[len, h, w]} />
      <meshBasicMaterial color={color} transparent={opacity < 1} opacity={opacity} toneMapped={false} />
    </mesh>
  );
}

class SoftBoundary extends Component<
  { resetKey: string; fallback: ReactNode; children: ReactNode },
  { failed: boolean; key: string }
> {
  state = { failed: false, key: '' };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; key: string },
  ) {
    if (props.resetKey !== state.key) return { failed: false, key: props.resetKey };
    return null;
  }

  componentDidCatch() {
    /* swallow — SoftBoundary fallback renders stub */
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface GlbWeaponProps {
  weapon?: string | null;
  mode?: WeaponRenderMode;
  opacity?: number;
  fitScale?: number;
  /** Keep VRF grip origin (for CS2 `wpn` bone). */
  keepOrigin?: boolean;
}

export function GlbWeapon({
  weapon,
  mode = 'world',
  opacity = 1,
  fitScale = 1,
  keepOrigin = false,
}: GlbWeaponProps) {
  const w = normalizeWeaponName(weapon);
  if (!w) return null;

  const cls = classifyWeapon(w);
  const fit = fitLength(cls, mode) * Math.max(0.01, fitScale);
  const url = `/models/weapons/${w}.glb`;
  const stub = <SolidStub cls={cls} fit={fit} opacity={opacity} />;

  return (
    <SoftBoundary resetKey={`${url}:${mode}:${fit}:${keepOrigin}`} fallback={stub}>
      <Suspense fallback={stub}>
        <LoadedWeapon url={url} fit={fit} opacity={opacity} mode={mode} keepOrigin={keepOrigin} />
      </Suspense>
    </SoftBoundary>
  );
}

export const WEAPON_PRELOAD_LIST: string[] = [...ALL_WEAPON_GLBS];

for (const name of WEAPON_PRELOAD_LIST) {
  try {
    useGLTF.preload(`/models/weapons/${name}.glb`);
  } catch {
    /* ignore */
  }
}
