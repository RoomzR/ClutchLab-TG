/**
 * donk / Spirit CS2 viewmodel (pro baseline):
 *   viewmodel_fov 68
 *   viewmodel_offset_x 2.5
 *   viewmodel_offset_y 0
 *   viewmodel_offset_z -1.5
 *   viewmodel_presetpos 2
 *
 * In CS2 the viewmodel is a *separate overlay pass* (own projection, clears
 * depth) sitting in the lower-right. We approximate that in one camera by
 * using a small meter-scale pack + depthTest:false.
 *
 * Three.js camera space: +X right, +Y up, −Z forward.
 */
export const DONK_VIEWMODEL = {
  /** Match CS2 viewmodel_fov for how large the pack reads. */
  fov: 68,
  /**
   * weapon_arms GLB is in meters. Keep this ~2–2.5 so the pack is a small
   * lower-right corner (scale 10+ filled half the screen).
   */
  rigScale: 2.15,
  /**
   * Place idle-pose hands into lower-right.
   * Tuned against arms.glb idle_rifle: wpn ≈ (0.34, −0.40, −1.49) after scale.
   */
  rootPosition: [0.05, -0.22, -0.55] as [number, number, number],
  rootRotation: [0.02, 0.05, -0.01] as [number, number, number],
  bobAmp: 0.008,
};

export type GripPose = {
  position: [number, number, number];
  rotation: [number, number, number];
};

export function handGripPose(cls: string): GripPose {
  switch (cls) {
    case 'knife':
      return { position: [2.5, -0.8, 1.5], rotation: [0.4, 0.45, -1.15] };
    case 'pistol':
      return { position: [3.2, -1.2, 2.0], rotation: [0.08, 0.06, 0.04] };
    default:
      return { position: [4.0, -2.0, 2.5], rotation: [0.04, 0.04, 0.02] };
  }
}
