import * as THREE from 'three';

/**
 * Hammer / Source editor helpers that must not appear in the spectator.
 * Prefer name-based matching only — never colour heuristics (Dust2 terracotta
 * looks "orange" and would wipe real geometry before textures load).
 */

const HELPER_NAME_RE =
  /env_cs_place|func_bomb_target|func_buyzone|func_brush|func_clip|func_nav_markup|post_processing_volume|prop_physics_multiplayer|trigger_|info_player|info_ladder|light_environment|sky_camera|env_cubemap|toolstrigger|toolsblocklight|toolssolidblocklight|tools_?cs_?place|toolsnodraw|toolsinvisible|toolshint|toolsskip|toolsorange|playerclip|lightshaft|fogvolume|_cb_bl_mesh_blocklight|mesh_blocklight/i;

const HELPER_MATERIAL_RE =
  /^(env_cs_place|func_bomb_target|func_buyzone|func_brush|func_clip|func_nav_markup|post_processing_volume|prop_physics_multiplayer|toolstrigger|toolsblocklight|toolssolidblocklight|tools_?cs_?place|toolsnodraw|toolsinvisible|toolshint|toolsskip|toolsorange|toolsblack|toolsred|toolsgreen|lightshaft|fogvolume|steam_001)(\.\d+)?$/i;

const HELPER_TEXTURE_RE =
  /tools_?cs_?place|toolstrigger|toolsblocklight|tools_solid_block|toolsnodraw|toolsinvisible|toolsorange|toolsblack|toolsred|toolsgreen/i;

function textureLabel(tex: THREE.Texture | null | undefined): string {
  if (!tex) return '';
  const img = tex.image as { src?: string; currentSrc?: string; name?: string } | undefined;
  return [
    tex.name || '',
    img?.src || '',
    img?.currentSrc || '',
    img?.name || '',
    (tex.userData as { uri?: string } | undefined)?.uri || '',
  ].join(' ');
}

function materialIsHelper(mat: THREE.Material): boolean {
  const name = (mat.name || '').trim();
  if (HELPER_MATERIAL_RE.test(name)) return true;

  const std = mat as THREE.MeshStandardMaterial;
  for (const tex of [std.map, std.emissiveMap, std.alphaMap]) {
    if (HELPER_TEXTURE_RE.test(textureLabel(tex))) return true;
  }
  return false;
}

function objectLooksHelper(obj: THREE.Object3D): boolean {
  if (HELPER_NAME_RE.test(obj.name || '')) return true;
  const mesh = obj as THREE.Mesh;
  if (!mesh.isMesh) return false;
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  if (mats.length === 0) return false;
  return mats.every((m) => m && materialIsHelper(m));
}

function hideMesh(obj: THREE.Object3D): void {
  obj.visible = false;
  const mesh = obj as THREE.Mesh;
  if (!mesh.isMesh) return;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
}

/** Detach helper volumes (do not dispose — textures may be shared). */
export function stripMapHelpers(root: THREE.Object3D): number {
  const drop: THREE.Object3D[] = [];
  root.traverse((obj) => {
    if (obj === root) return;
    if (objectLooksHelper(obj)) drop.push(obj);
  });
  for (const obj of drop) {
    hideMesh(obj);
    obj.parent?.remove(obj);
  }
  return drop.length;
}

/** Light material cleanup for remaining map geo — never hide by colour alone. */
export function sanitizeMapMaterials(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;

    if (objectLooksHelper(mesh)) {
      hideMesh(mesh);
      return;
    }

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (!mat) continue;
      if (materialIsHelper(mat)) {
        hideMesh(mesh);
        return;
      }

      const std = mat as THREE.MeshStandardMaterial;
      std.side = THREE.FrontSide;
      if ('envMapIntensity' in std) std.envMapIntensity = 0.3;

      if (std.map) {
        std.map.colorSpace = THREE.SRGBColorSpace;
        std.map.needsUpdate = true;
        if (std.color && std.color.r + std.color.g + std.color.b < 0.12) {
          std.color.setRGB(1, 1, 1);
        }
        if (typeof std.metalness === 'number' && std.metalness > 0.85) std.metalness = 0.15;
        if (typeof std.roughness === 'number' && std.roughness < 0.2) std.roughness = 0.55;
      }
    }
  });
}
