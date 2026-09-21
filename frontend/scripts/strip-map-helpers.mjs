/**
 * Permanently remove Hammer tool volumes from map GLBs
 * (orange TRIGGER, green PLACE / BLOCK LIGHT, clips, lightshafts, …).
 *
 * Usage: node scripts/strip-map-helpers.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_DIR = path.resolve(__dirname, '../public/maps/3d');

const HELPER_MAT_RE =
  /^(env_cs_place|func_bomb_target|func_buyzone|func_brush|func_clip|func_nav_markup|post_processing_volume|prop_physics_multiplayer|toolstrigger|toolsblocklight|toolssolidblocklight|tools_?cs_?place|tools_?solid|toolsnodraw|toolsinvisible|toolshint|toolsskip|toolsorange|toolsblack|toolsred|toolsgreen|lightshaft|fogvolume|steam_001)/i;

const HELPER_TEX_RE =
  /tools_?cs_?place|toolstrigger|toolsblocklight|tools_solid_block|toolsnodraw|toolsinvisible|toolsorange|toolsblack|toolsred|toolsgreen|\/tools/i;

const HELPER_NODE_RE =
  /env_cs_place|func_bomb_target|func_buyzone|func_brush|func_clip|func_nav_markup|post_processing_volume|prop_physics_multiplayer|toolstrigger|toolsblocklight|toolssolid|_cb_bl_mesh_blocklight|mesh_blocklight|lightshaft|fogvolume|trigger_|info_player|playerclip/i;

function readGlb(filePath) {
  const buf = fs.readFileSync(filePath);
  const jsonLen = buf.readUInt32LE(12);
  const jsonStart = 20;
  const jsonBytes = buf.subarray(jsonStart, jsonStart + jsonLen);
  const json = JSON.parse(jsonBytes.toString('utf8').replace(/\0+$/, ''));
  const binChunkStart = jsonStart + jsonLen;
  let bin = null;
  if (binChunkStart + 8 <= buf.length) {
    const binLen = buf.readUInt32LE(binChunkStart);
    const binType = buf.toString('utf8', binChunkStart + 4, binChunkStart + 8);
    if (binType === 'BIN\0') {
      bin = buf.subarray(binChunkStart + 8, binChunkStart + 8 + binLen);
    }
  }
  return { json, bin, buf };
}

function writeGlb(filePath, json, bin) {
  // glTF requires JSON chunk padded with 0x20 spaces (NOT nulls) — nulls break JSON.parse.
  let jsonStr = JSON.stringify(json);
  const pad = (4 - (jsonStr.length % 4)) % 4;
  jsonStr += ' '.repeat(pad);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  const binPad = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const binLen = bin ? bin.length + binPad : 0;
  const total = 12 + 8 + jsonBuf.length + (bin ? 8 + binLen : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0); // glTF
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16); // JSON
  jsonBuf.copy(out, 20);
  if (bin) {
    const off = 20 + jsonBuf.length;
    out.writeUInt32LE(binLen, off);
    out.writeUInt32LE(0x004e4942, off + 4); // BIN\0
    bin.copy(out, off + 8);
    // trailing pad bytes stay 0x00 (correct for BIN chunk)
  }
  fs.writeFileSync(filePath, out);
}

function isHelperMaterial(mat, images, textures) {
  const name = mat.name || '';
  if (HELPER_MAT_RE.test(name)) return true;
  const pbr = mat.pbrMetallicRoughness || {};
  if (pbr.baseColorTexture) {
    const tex = textures[pbr.baseColorTexture.index];
    const img = tex && images[tex.source];
    const uri = (img && img.uri) || '';
    if (HELPER_TEX_RE.test(uri)) return true;
  }
  return false;
}

function stripOne(filePath) {
  const { json, bin } = readGlb(filePath);
  const mats = json.materials || [];
  const images = json.images || [];
  const textures = json.textures || [];
  const meshes = json.meshes || [];
  const nodes = json.nodes || [];

  const helperMatIdx = new Set();
  mats.forEach((m, i) => {
    if (isHelperMaterial(m, images, textures)) helperMatIdx.add(i);
  });

  // Make helper materials fully invisible (belt-and-suspenders).
  for (const i of helperMatIdx) {
    const m = mats[i];
    m.alphaMode = 'BLEND';
    m.pbrMetallicRoughness = m.pbrMetallicRoughness || {};
    m.pbrMetallicRoughness.baseColorFactor = [0, 0, 0, 0];
    delete m.pbrMetallicRoughness.baseColorTexture;
    delete m.emissiveTexture;
    delete m.emissiveFactor;
    delete m.normalTexture;
    delete m.occlusionTexture;
  }

  const helperMeshIdx = new Set();
  meshes.forEach((mesh, mi) => {
    const prims = mesh.primitives || [];
    if (prims.length === 0) return;
    const kept = prims.filter((p) => !helperMatIdx.has(p.material));
    if (kept.length === 0) {
      helperMeshIdx.add(mi);
      mesh.primitives = [];
    } else if (kept.length < prims.length) {
      mesh.primitives = kept;
    }
  });

  const helperNodeIdx = new Set();
  nodes.forEach((nd, ni) => {
    if (nd.mesh != null && helperMeshIdx.has(nd.mesh)) helperNodeIdx.add(ni);
    if (HELPER_NODE_RE.test(nd.name || '')) helperNodeIdx.add(ni);
  });

  // Drop helper nodes from all children lists + scenes.
  const pruneChildren = (arr) => {
    if (!Array.isArray(arr)) return arr;
    return arr.filter((i) => !helperNodeIdx.has(i));
  };
  for (const nd of nodes) {
    if (nd.children) nd.children = pruneChildren(nd.children);
  }
  for (const sc of json.scenes || []) {
    if (sc.nodes) sc.nodes = pruneChildren(sc.nodes);
  }

  writeGlb(filePath, json, bin);
  return { helperMats: helperMatIdx.size, helperMeshes: helperMeshIdx.size, helperNodes: helperNodeIdx.size };
}

const files = fs.readdirSync(MAP_DIR).filter((f) => f.endsWith('.glb'));
for (const f of files) {
  const p = path.join(MAP_DIR, f);
  const before = fs.statSync(p).size;
  const r = stripOne(p);
  const after = fs.statSync(p).size;
  console.log(
    `${f}: mats=${r.helperMats} meshes=${r.helperMeshes} nodes=${r.helperNodes} size ${before}→${after}`,
  );
}
