import * as THREE from 'three';

type MatLike = THREE.Material & {
  map?: THREE.Texture | null;
  color?: THREE.Color;
  transparent?: boolean;
  opacity?: number;
  name?: string;
};

/**
 * Force Valve/VRF GLBs to always be visible (no black metalness holes).
 * Never throws — bad materials are replaced with solid colors.
 */
export function fixValveMaterials(
  root: THREE.Object3D,
  opts?: { unlit?: boolean; opacity?: number },
): void {
  const unlit = opts?.unlit ?? true;
  const opacity = opts?.opacity ?? 1;

  root.traverse((o) => {
    try {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.material) return;
      mesh.frustumCulled = false;
      mesh.visible = true;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next: THREE.Material[] = [];

      for (const mat of mats) {
        if (!mat) continue;
        try {
          const src = mat as MatLike;
          const map = src.map ?? null;
          if (map) {
            try {
              map.colorSpace = THREE.SRGBColorSpace;
              map.needsUpdate = true;
            } catch {
              /* ignore broken texture metadata */
            }
          }

          let color = new THREE.Color(0xd4d4d8);
          try {
            if (src.color) {
              color = src.color.clone();
              if (color.r + color.g + color.b < 0.15) color.setRGB(0.85, 0.85, 0.88);
            }
          } catch {
            color.setRGB(0.85, 0.85, 0.88);
          }

          if (unlit || map) {
            next.push(
              new THREE.MeshBasicMaterial({
                map,
                color: map ? 0xffffff : color,
                transparent: opacity < 1,
                opacity,
                side: THREE.DoubleSide,
                depthWrite: opacity >= 1,
                toneMapped: false,
                name: src.name || 'valve_basic',
              }),
            );
          } else {
            next.push(
              new THREE.MeshStandardMaterial({
                color,
                metalness: 0.15,
                roughness: 0.7,
                transparent: opacity < 1,
                opacity,
                side: THREE.DoubleSide,
                emissive: new THREE.Color(0x111111),
                emissiveIntensity: 0.15,
              }),
            );
          }
        } catch {
          next.push(
            new THREE.MeshBasicMaterial({
              color: 0xb0b0b8,
              side: THREE.DoubleSide,
              toneMapped: false,
            }),
          );
        }
      }

      mesh.material = next.length === 1 ? next[0]! : next;
    } catch {
      /* skip broken mesh */
    }
  });
}
