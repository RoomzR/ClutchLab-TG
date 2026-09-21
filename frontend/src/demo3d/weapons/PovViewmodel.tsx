import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { fixValveMaterials } from '../core/fixValveMaterials';
import { GlbWeapon } from './GlbWeapon';
import { classifyWeapon, resolveActiveWeapon, type WeaponClass } from './weaponMesh';
import { DONK_VIEWMODEL } from './weaponGrip';

interface PovViewmodelProps {
  active: boolean;
  team: 'CT' | 'T';
  weapon?: string | null;
}

/**
 * CS2 FP: weapon_arms (idle + wpn) with visible textured mesh.
 * Team gloves overlay when available (bone-synced in glove hierarchy order).
 */
const ARMS_URL = '/models/viewmodels/arms.glb';
const GLOVE_CT_URL = '/models/viewmodels/glove_ct.glb';
const GLOVE_T_URL = '/models/viewmodels/glove_t.glb';

function gloveUrlFor(team: 'CT' | 'T'): string {
  return team === 'T' ? GLOVE_T_URL : GLOVE_CT_URL;
}

function idleClipFor(cls: WeaponClass, weapon: string | null): string {
  if (cls === 'knife') return 'idle_knife';
  if (cls === 'pistol' || cls === 'nade') return 'idle_pistol';
  if (cls === 'sniper' && weapon === 'awp') return 'idle_awp';
  if (cls === 'sniper') return 'idle_rifle';
  if (weapon === 'ak47') return 'idle_ak';
  return 'idle_rifle';
}

function findBone(root: THREE.Object3D, names: string[]): THREE.Object3D | null {
  for (const name of names) {
    let hit: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (!hit && o.name === name) hit = o;
    });
    if (hit) return hit;
  }
  return null;
}

function indexBones(root: THREE.Object3D): Map<string, THREE.Object3D> {
  const map = new Map<string, THREE.Object3D>();
  root.traverse((o) => {
    if (o.name && !map.has(o.name)) map.set(o.name, o);
  });
  return map;
}

function boneDepth(o: THREE.Object3D): number {
  let d = 0;
  let p: THREE.Object3D | null = o.parent;
  while (p) {
    d += 1;
    p = p.parent;
  }
  return d;
}

function pickClip(
  animations: THREE.AnimationClip[],
  preferred: string,
): THREE.AnimationClip | null {
  return (
    animations.find((a) => a.name === preferred) ||
    animations.find((a) => a.name === 'idle_rifle') ||
    animations.find((a) => a.name === 'idle_ak') ||
    animations[0] ||
    null
  );
}

function makeViewmodelOverlay(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false;
    m.castShadow = false;
    m.receiveShadow = false;
    m.renderOrder = 999;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      if (!mat) continue;
      mat.depthTest = false;
      mat.depthWrite = false;
      mat.transparent = false;
      mat.needsUpdate = true;
    }
  });
}

function showViewmodelMeshesOnly(root: THREE.Object3D): void {
  let hasVm = false;
  root.traverse((o) => {
    if (/viewmodel/i.test(o.name)) hasVm = true;
  });
  if (!hasVm) return;
  root.traverse((o) => {
    if (!o.name) return;
    if (/worldmodel/i.test(o.name)) {
      o.visible = false;
      o.traverse((c) => {
        c.visible = false;
      });
    }
  });
}

function syncGloveBonesFromArms(
  sharedSorted: string[],
  armsBones: Map<string, THREE.Object3D>,
  gloveBones: Map<string, THREE.Object3D>,
  mat: THREE.Matrix4,
  inv: THREE.Matrix4,
  pos: THREE.Vector3,
  quat: THREE.Quaternion,
  scl: THREE.Vector3,
): void {
  for (const name of sharedSorted) {
    const src = armsBones.get(name);
    const dst = gloveBones.get(name);
    if (!src || !dst?.parent) continue;
    src.updateWorldMatrix(true, false);
    dst.parent.updateWorldMatrix(true, false);
    inv.copy(dst.parent.matrixWorld).invert();
    mat.multiplyMatrices(inv, src.matrixWorld);
    mat.decompose(pos, quat, scl);
    dst.position.copy(pos);
    dst.quaternion.copy(quat);
    dst.scale.set(1, 1, 1);
    dst.updateMatrix();
    dst.matrixWorldNeedsUpdate = true;
  }
}

type PreparedVm = {
  root: THREE.Group;
  attach: THREE.Object3D | null;
  armsMixer: THREE.AnimationMixer;
  armsBones: Map<string, THREE.Object3D>;
  gloveBones: Map<string, THREE.Object3D>;
  sharedSorted: string[];
  mode: 'arms+gloves' | 'arms';
};

function prepareViewmodel(
  armsGltf: { scene: THREE.Object3D; animations: THREE.AnimationClip[] },
  gloveGltf: { scene: THREE.Object3D } | null,
): PreparedVm {
  const wrap = new THREE.Group();

  const arms = cloneSkinned(armsGltf.scene);
  fixValveMaterials(arms, { unlit: true });
  makeViewmodelOverlay(arms);
  arms.rotation.y = Math.PI;

  let gloveBones = new Map<string, THREE.Object3D>();
  let sharedSorted: string[] = [];
  let mode: PreparedVm['mode'] = 'arms';

  if (gloveGltf) {
    try {
      const gloves = cloneSkinned(gloveGltf.scene);
      showViewmodelMeshesOnly(gloves);
      fixValveMaterials(gloves, { unlit: true });
      makeViewmodelOverlay(gloves);
      gloves.rotation.y = Math.PI;
      // Keep arms visible underneath as guaranteed textured FP mesh;
      // gloves sit on top once bone-synced (CS2 HudModelArms layering).
      wrap.add(arms);
      wrap.add(gloves);
      const armsBones = indexBones(arms);
      gloveBones = indexBones(gloves);
      sharedSorted = [...armsBones.keys()]
        .filter((n) => gloveBones.has(n))
        .sort((a, b) => boneDepth(gloveBones.get(a)!) - boneDepth(gloveBones.get(b)!));
      mode = 'arms+gloves';
      wrap.scale.setScalar(DONK_VIEWMODEL.rigScale);
      wrap.updateMatrixWorld(true);

      const armsMixer = new THREE.AnimationMixer(arms);
      const warm =
        armsGltf.animations.find((a) => a.name === 'idle_rifle') ||
        armsGltf.animations.find((a) => a.name === 'idle_ak') ||
        armsGltf.animations[0];
      if (warm) {
        armsMixer.clipAction(warm).play();
        armsMixer.update(0);
      }
      if (typeof window !== 'undefined') {
        (window as unknown as { __POV_DEBUG?: unknown }).__POV_DEBUG = {
          mode,
          shared: sharedSorted.length,
          hasWpn: !!findBone(arms, ['wpn']),
        };
      }
      return {
        root: wrap,
        attach: findBone(arms, ['wpn', 'wpnHand_R', 'attachHand_R', 'hand_R']),
        armsMixer,
        armsBones,
        gloveBones,
        sharedSorted,
        mode,
      };
    } catch (e) {
      console.warn('[PovViewmodel] gloves prepare failed, arms only', e);
      // fall through to arms-only
      wrap.clear();
      arms.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.visible = true;
      });
    }
  }

  wrap.add(arms);
  wrap.scale.setScalar(DONK_VIEWMODEL.rigScale);
  wrap.updateMatrixWorld(true);
  const armsBones = indexBones(arms);
  const armsMixer = new THREE.AnimationMixer(arms);
  const warm =
    armsGltf.animations.find((a) => a.name === 'idle_rifle') ||
    armsGltf.animations.find((a) => a.name === 'idle_ak') ||
    armsGltf.animations[0];
  if (warm) {
    armsMixer.clipAction(warm).play();
    armsMixer.update(0);
  }
  if (typeof window !== 'undefined') {
    (window as unknown as { __POV_DEBUG?: unknown }).__POV_DEBUG = {
      mode: 'arms',
      shared: 0,
      hasWpn: !!findBone(arms, ['wpn']),
    };
  }
  return {
    root: wrap,
    attach: findBone(arms, ['wpn', 'wpnHand_R', 'attachHand_R', 'hand_R']),
    armsMixer,
    armsBones,
    gloveBones,
    sharedSorted,
    mode: 'arms',
  };
}

function ViewmodelRig({ weapon, team }: { weapon?: string | null; team: 'CT' | 'T' }) {
  const armsGltf = useGLTF(ARMS_URL);
  // Always load gloves; prepare falls back to arms-only on failure
  const gloveGltf = useGLTF(gloveUrlFor(team));
  const prepared = useMemo(
    () => prepareViewmodel(armsGltf, gloveGltf),
    [armsGltf.scene, armsGltf.animations, gloveGltf.scene, team],
  );

  const gunAttach = useRef<THREE.Group>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  const clipNameRef = useRef('');

  const scratchPos = useRef(new THREE.Vector3());
  const scratchQuat = useRef(new THREE.Quaternion());
  const scratchScale = useRef(new THREE.Vector3(1, 1, 1));
  const localMat = useRef(new THREE.Matrix4());
  const worldMat = useRef(new THREE.Matrix4());
  const parentInv = useRef(new THREE.Matrix4());
  const identityQuat = useRef(new THREE.Quaternion());
  const zeroPos = useRef(new THREE.Vector3(0, 0, 0));
  const syncMat = useRef(new THREE.Matrix4());
  const syncInv = useRef(new THREE.Matrix4());
  const syncPos = useRef(new THREE.Vector3());
  const syncQuat = useRef(new THREE.Quaternion());
  const syncScl = useRef(new THREE.Vector3());

  const w = resolveActiveWeapon(weapon, team);
  const cls = classifyWeapon(w);
  const wantClip = idleClipFor(cls, w);

  useEffect(() => {
    const clip = pickClip(armsGltf.animations, wantClip);
    if (!clip) return;
    if (clipNameRef.current === clip.name) return;
    actionRef.current?.fadeOut(0.08);
    const next = prepared.armsMixer.clipAction(clip);
    next.reset();
    next.setLoop(THREE.LoopRepeat, Infinity);
    next.fadeIn(0.08);
    next.play();
    actionRef.current = next;
    clipNameRef.current = clip.name;
  }, [prepared.armsMixer, armsGltf.animations, wantClip]);

  useEffect(
    () => () => {
      prepared.armsMixer.stopAllAction();
    },
    [prepared],
  );

  useLayoutEffect(() => {
    const attach = gunAttach.current;
    if (!attach || !prepared.root) return;
    if (attach.parent !== prepared.root) prepared.root.add(attach);
  }, [prepared.root, w]);

  useFrame((_, delta) => {
    prepared.armsMixer.update(delta);
    if (prepared.sharedSorted.length) {
      syncGloveBonesFromArms(
        prepared.sharedSorted,
        prepared.armsBones,
        prepared.gloveBones,
        syncMat.current,
        syncInv.current,
        syncPos.current,
        syncQuat.current,
        syncScl.current,
      );
    }

    const attach = gunAttach.current;
    const bone = prepared.attach;
    if (!attach || !w) {
      if (attach) attach.visible = false;
      return;
    }
    attach.visible = true;
    if (!bone || !attach.parent) return;

    bone.updateWorldMatrix(true, false);
    localMat.current.compose(zeroPos.current, identityQuat.current, scratchScale.current.set(1, 1, 1));
    worldMat.current.multiplyMatrices(bone.matrixWorld, localMat.current);
    parentInv.current.copy(attach.parent.matrixWorld).invert();
    worldMat.current.premultiply(parentInv.current);
    worldMat.current.decompose(scratchPos.current, scratchQuat.current, scratchScale.current);
    attach.position.copy(scratchPos.current);
    attach.quaternion.copy(scratchQuat.current);
    attach.scale.set(1, 1, 1);
  });

  return (
    <>
      <primitive object={prepared.root} />
      <group ref={gunAttach} frustumCulled={false}>
        {w && <GlbWeapon weapon={w} mode="viewmodel" fitScale={cls === 'knife' ? 1.08 : 1} />}
      </group>
    </>
  );
}

/** Bright stub so we never show an empty POV while GLBs load. */
function LoadingStub({ weapon, team }: { weapon?: string | null; team: 'CT' | 'T' }) {
  const w = resolveActiveWeapon(weapon, team);
  return (
    <group position={[0.28, -0.35, -0.85]}>
      <mesh position={[0.15, 0.05, 0]} renderOrder={1000} frustumCulled={false}>
        <boxGeometry args={[0.35, 0.12, 0.08]} />
        <meshBasicMaterial color="#c4a484" depthTest={false} toneMapped={false} />
      </mesh>
      <mesh position={[-0.05, 0.02, 0.05]} renderOrder={1000} frustumCulled={false}>
        <boxGeometry args={[0.28, 0.1, 0.07]} />
        <meshBasicMaterial color="#c4a484" depthTest={false} toneMapped={false} />
      </mesh>
      {w && (
        <group position={[0.05, 0.02, -0.15]}>
          <GlbWeapon weapon={w} mode="viewmodel" />
        </group>
      )}
    </group>
  );
}

export function PovViewmodel({ active, team, weapon }: PovViewmodelProps) {
  const root = useRef<THREE.Group>(null);
  const bob = useRef(0);
  const scratch = useRef(new THREE.Vector3());
  const { camera } = useThree();

  useFrame((_, delta) => {
    const g = root.current;
    if (!g) return;
    g.visible = active;
    if (!active) return;

    g.position.copy(camera.position);
    g.quaternion.copy(camera.quaternion);

    bob.current += delta * 2.0;
    const a = DONK_VIEWMODEL.bobAmp;
    scratch.current
      .set(Math.sin(bob.current) * a, Math.cos(bob.current * 2) * a * 0.65, 0)
      .applyQuaternion(camera.quaternion);
    g.position.add(scratch.current);

    if (typeof window !== 'undefined') {
      const dbg = (window as unknown as { __POV_DEBUG?: Record<string, unknown> }).__POV_DEBUG;
      if (dbg) {
        dbg.active = active;
        dbg.camNear = (camera as THREE.PerspectiveCamera).near;
        dbg.camFov = (camera as THREE.PerspectiveCamera).fov;
      }
    }
  }, -1);

  return (
    <group ref={root} visible={active} frustumCulled={false} renderOrder={1000}>
      <ambientLight intensity={1.4} />
      <pointLight position={[0.45, 0.9, -0.7]} intensity={2.0} distance={8} color="#fff6ea" />
      <pointLight position={[-0.15, 0.35, -0.45]} intensity={0.8} distance={6} color="#d8e8ff" />

      <group position={DONK_VIEWMODEL.rootPosition} rotation={DONK_VIEWMODEL.rootRotation}>
        <Suspense fallback={<LoadingStub weapon={weapon} team={team} />}>
          <ViewmodelRig weapon={weapon} team={team} />
        </Suspense>
      </group>
    </group>
  );
}

try {
  useGLTF.preload(ARMS_URL);
  useGLTF.preload(GLOVE_CT_URL);
  useGLTF.preload(GLOVE_T_URL);
} catch {
  /* ignore */
}
