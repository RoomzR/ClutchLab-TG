import * as THREE from 'three';

/** Source hammer units per meter (VRF / Blender CS2 exports). */
export const SOURCE_UNITS_PER_METER = 1 / 0.0254;

const METER_SCALE = 0.0254;
const BLENDER_SOURCE_QUAT = new THREE.Quaternion(-0.5, -0.5, -0.5, 0.5);

export interface GlbAlignTransform {
  scale: number;
  rotation: [number, number, number];
  mode: 'blender-meters' | 'meters-yup' | 'source-zup' | 'vrf-yup' | 'identity';
}

function almost(a: number, b: number, eps = 0.003): boolean {
  return Math.abs(a - b) <= eps;
}

function isMeterScale(sx: number, sy: number, sz: number): boolean {
  return almost(sx, METER_SCALE) && almost(sy, METER_SCALE) && almost(sz, METER_SCALE);
}

function isBlenderSourceQuat(q: THREE.Quaternion): boolean {
  return Math.abs(q.dot(BLENDER_SOURCE_QUAT)) > 0.999;
}

/**
 * Align map GLB into the same space as `gameToThree` (Source units, Y-up).
 *
 * - Blender dust2-style: per-node scale 0.0254 + Blender quat
 * - Source2Viewer CLI maps: usually already Y-up Source units (identity)
 * - Raw Z-up: rotate −90° X
 */
export function detectGlbAlign(scene: THREE.Object3D): GlbAlignTransform {
  let nodes = 0;
  let meterNodes = 0;
  let blenderQuatNodes = 0;

  scene.updateMatrixWorld(true);

  scene.traverse((obj) => {
    if (obj === scene) return;
    const hasMesh = (obj as THREE.Mesh).isMesh;
    const hasChildren = obj.children.length > 0;
    if (!hasMesh && !hasChildren && obj.position.lengthSq() === 0) return;

    nodes += 1;
    const { x: sx, y: sy, z: sz } = obj.scale;
    if (isMeterScale(sx, sy, sz)) {
      meterNodes += 1;
      if (isBlenderSourceQuat(obj.quaternion)) blenderQuatNodes += 1;
    }
  });

  const meterRatio = nodes > 0 ? meterNodes / nodes : 0;
  const blenderRatio = meterNodes > 0 ? blenderQuatNodes / meterNodes : 0;

  if (meterRatio > 0.35 && blenderRatio > 0.5) {
    return {
      scale: SOURCE_UNITS_PER_METER,
      rotation: [0, Math.PI / 2, 0],
      mode: 'blender-meters',
    };
  }

  if (meterRatio > 0.35) {
    return {
      scale: SOURCE_UNITS_PER_METER,
      rotation: [0, 0, 0],
      mode: 'meters-yup',
    };
  }

  const box = new THREE.Box3().setFromObject(scene);
  if (!box.isEmpty()) {
    const size = new THREE.Vector3();
    box.getSize(size);
    const minDim = Math.min(size.x, size.y, size.z);
    const maxDim = Math.max(size.x, size.y, size.z);

    // Z-up Source: height on Z, huge X/Y footprint.
    if (size.z > 80 && size.z < size.x * 0.9 && size.z < size.y * 0.9 && size.x > 400) {
      return {
        scale: 1,
        rotation: [-Math.PI / 2, 0, 0],
        mode: 'source-zup',
      };
    }

    // Already Y-up Source units (typical VRF map GLB): tall Y, large XZ.
    if (size.y > 80 && size.y < maxDim && size.x > 400 && size.z > 400 && minDim > 50) {
      return {
        scale: 1,
        rotation: [0, 0, 0],
        mode: 'vrf-yup',
      };
    }
  }

  return { scale: 1, rotation: [0, 0, 0], mode: 'identity' };
}
