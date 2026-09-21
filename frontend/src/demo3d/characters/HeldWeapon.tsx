import { Suspense, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { GlbWeapon } from '../weapons/GlbWeapon';
import { classifyWeapon, resolveActiveWeapon } from '../weapons/weaponMesh';

interface HeldWeaponProps {
  sceneRef: React.RefObject<THREE.Object3D | null>;
  team: 'CT' | 'T';
  weapon?: string | null;
  pitchRadRef: React.RefObject<number>;
  opacity?: number;
  dead?: boolean;
}

/** CS2 agents expose `wpn` — preferred attach (same as game). */
const ATTACH_NAMES = [
  'wpn',
  'wpnHand_R',
  'weapon_bone',
  'weapon_R',
  'hand_R',
  'hand_r',
  'Hand_R',
  'attachHand_R',
  'RightHand',
];

function findAttach(root: THREE.Object3D | null): THREE.Object3D | null {
  if (!root) return null;
  for (const name of ATTACH_NAMES) {
    let hit: THREE.Object3D | null = null;
    root.traverse((o) => {
      if (!hit && o.name === name) hit = o;
    });
    if (hit) return hit;
  }
  return null;
}

function isWpnBone(bone: THREE.Object3D): boolean {
  const n = bone.name.toLowerCase();
  return n === 'wpn' || n === 'wpnhand_r' || n === 'weapon_bone' || n === 'weapon_r';
}

/**
 * Fallback grip when only hand_R exists (no wpn). Model-meter local.
 * Tuned so the stock/grip sits in the palm, barrel forward.
 */
function handGripLocal(cls: string): { pos: THREE.Vector3; quat: THREE.Quaternion } {
  const pos = new THREE.Vector3();
  const euler = new THREE.Euler();
  switch (cls) {
    case 'knife':
      pos.set(0.04, -0.01, 0.02);
      euler.set(0.15, 0.55, 1.05, 'XYZ');
      break;
    case 'pistol':
      pos.set(0.03, -0.005, 0.01);
      euler.set(0.05, 0.15, 1.2, 'XYZ');
      break;
    case 'sniper':
      pos.set(0.035, -0.01, 0.015);
      euler.set(0.02, 0.1, 1.25, 'XYZ');
      break;
    default:
      pos.set(0.035, -0.008, 0.012);
      euler.set(0.02, 0.1, 1.28, 'XYZ');
      break;
  }
  return { pos, quat: new THREE.Quaternion().setFromEuler(euler) };
}

/**
 * Third-person weapon — prefers CS2 `wpn` bone (identity local = sits in hand).
 * Falls back to hand_R with a tight palm grip.
 */
export function HeldWeapon({
  sceneRef,
  team,
  weapon,
  pitchRadRef,
  opacity = 1,
  dead = false,
}: HeldWeaponProps) {
  const attachRef = useRef<THREE.Group>(null);
  const boneRef = useRef<THREE.Object3D | null>(null);
  const wName = resolveActiveWeapon(weapon, team);
  const cls = classifyWeapon(wName);
  const handGrip = useMemo(() => handGripLocal(cls), [cls]);

  const pos = useRef(new THREE.Vector3());
  const quat = useRef(new THREE.Quaternion());
  const scl = useRef(new THREE.Vector3());
  const localMat = useRef(new THREE.Matrix4());
  const worldMat = useRef(new THREE.Matrix4());
  const parentInv = useRef(new THREE.Matrix4());
  const pitchQ = useRef(new THREE.Quaternion());
  const axisX = useRef(new THREE.Vector3(1, 0, 0));
  const identityQ = useRef(new THREE.Quaternion());
  const zero = useRef(new THREE.Vector3(0, 0, 0));

  useFrame(() => {
    const attach = attachRef.current;
    const root = sceneRef.current;
    if (!attach || !root || dead || !wName) {
      if (attach) attach.visible = false;
      return;
    }
    attach.visible = true;

    if (!boneRef.current || boneRef.current.parent == null) {
      boneRef.current = findAttach(root);
    }
    const bone = boneRef.current;
    if (!bone || !attach.parent) {
      attach.visible = false;
      return;
    }

    bone.updateWorldMatrix(true, false);
    const onWpn = isWpnBone(bone);

    if (onWpn) {
      // CS2: weapon parented to wpn with identity — VRF grip origin matches bone.
      localMat.current.compose(zero.current, identityQ.current, scl.current.set(1, 1, 1));
    } else {
      pitchQ.current.setFromAxisAngle(axisX.current, (pitchRadRef.current ?? 0) * 0.08);
      quat.current.copy(handGrip.quat).multiply(pitchQ.current);
      localMat.current.compose(handGrip.pos, quat.current, scl.current.set(1, 1, 1));
    }

    worldMat.current.multiplyMatrices(bone.matrixWorld, localMat.current);
    parentInv.current.copy(attach.parent.matrixWorld).invert();
    worldMat.current.premultiply(parentInv.current);
    worldMat.current.decompose(pos.current, quat.current, scl.current);
    attach.position.copy(pos.current);
    attach.quaternion.copy(quat.current);
    attach.scale.set(1, 1, 1);
  });

  if (dead || !wName) return null;

  // On wpn bone keep VRF origin; on hand_R use recentered hand fit.
  const mode = 'hand' as const;
  const keepOrigin = true; // prefer grip origin; GlbWeapon hand+keepOrigin

  return (
    <group ref={attachRef} frustumCulled={false}>
      <Suspense fallback={null}>
        <GlbWeapon weapon={wName} mode={mode} opacity={opacity} keepOrigin={keepOrigin} />
      </Suspense>
    </group>
  );
}
