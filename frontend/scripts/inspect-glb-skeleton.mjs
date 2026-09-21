import fs from 'fs';
import path from 'path';

const ROOT = path.join(process.cwd(), 'public', 'models');

const FILES = [
  { label: 'player CT', rel: 'players/ct.glb', listFirst40: false },
  { label: 'player T', rel: 'players/t.glb', listFirst40: false },
  { label: 'arms viewmodel', rel: 'viewmodels/arms.glb', listFirst40: true },
  { label: 'glove CT', rel: 'viewmodels/glove_ct.glb', listFirst40: true },
  { label: 'ak47', rel: 'weapons/ak47.glb', listFirst40: false },
  { label: 'knife T', rel: 'weapons/knife_t.glb', listFirst40: false },
];

const BONE_RE = /hand|wrist|finger|weapon|arm|root|grip/i;

function readGltfJson(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.toString('utf8', 0, 4) !== 'glTF') {
    throw new Error('Not a GLB: ' + filePath);
  }
  const jsonLen = buf.readUInt32LE(12);
  const jsonStr = buf.slice(20, 20 + jsonLen).toString('utf8').replace(/\0+$/, '');
  return JSON.parse(jsonStr);
}

function nodeName(nodes, index) {
  if (index == null || index < 0 || index >= nodes.length) return `#${index}`;
  return nodes[index].name ?? `(unnamed node ${index})`;
}

function computeSceneBbox(gltf) {
  const { accessors = [], meshes = [] } = gltf;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let found = false;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives || []) {
      const posIdx = prim.attributes?.POSITION;
      if (posIdx == null) continue;
      const acc = accessors[posIdx];
      if (!acc?.min || !acc?.max) continue;
      found = true;
      minX = Math.min(minX, acc.min[0]);
      minY = Math.min(minY, acc.min[1]);
      minZ = Math.min(minZ, acc.min[2]);
      maxX = Math.max(maxX, acc.max[0]);
      maxY = Math.max(maxY, acc.max[1]);
      maxZ = Math.max(maxZ, acc.max[2]);
    }
  }

  if (!found) return null;
  const size = [maxX - minX, maxY - minY, maxZ - minZ];
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], size };
}

function inspect(filePath, opts) {
  console.log('\n' + '='.repeat(72));
  console.log(opts.label);
  console.log(filePath);
  console.log('='.repeat(72));

  if (!fs.existsSync(filePath)) {
    console.log('MISSING FILE');
    return;
  }

  const gltf = readGltfJson(filePath);
  const nodes = gltf.nodes || [];

  const bbox = computeSceneBbox(gltf);
  if (bbox) {
    console.log('Scene bbox (accessor min/max union, mesh-local):');
    console.log('  min:', bbox.min.map((v) => v.toFixed(4)).join(', '));
    console.log('  max:', bbox.max.map((v) => v.toFixed(4)).join(', '));
    console.log('  size:', bbox.size.map((v) => v.toFixed(4)).join(' x '));
  } else {
    console.log('Scene bbox: (no POSITION accessor min/max found)');
  }

  const matching = [];
  nodes.forEach((n, i) => {
    const name = n.name ?? '';
    if (BONE_RE.test(name)) matching.push({ i, name });
  });
  console.log(`\nNodes matching ${BONE_RE} (${matching.length}):`);
  for (const { i, name } of matching) console.log(`  [${i}] ${name}`);

  if (gltf.skins?.length) {
    console.log(`\nSkins (${gltf.skins.length}):`);
    for (let si = 0; si < gltf.skins.length; si++) {
      const skin = gltf.skins[si];
      console.log(`  Skin ${si}: ${skin.name ?? '(unnamed)'}, joints: ${(skin.joints || []).length}, skeleton root: ${nodeName(nodes, skin.skeleton)}`);
      const jointMatches = (skin.joints || [])
        .map((j) => ({ j, name: nodeName(nodes, j) }))
        .filter(({ name }) => BONE_RE.test(name));
      if (jointMatches.length) {
        console.log('    Matching joints in skin:');
        for (const { j, name } of jointMatches) console.log(`      [${j}] ${name}`);
      }
    }
  } else {
    console.log('\nSkins: none');
  }

  if (opts.listFirst40) {
    console.log(`\nFirst ${Math.min(40, nodes.length)} node names (${nodes.length} total):`);
    for (let i = 0; i < Math.min(40, nodes.length); i++) {
      const n = nodes[i];
      console.log(`  [${i}] ${n.name ?? '(unnamed)'}`);
    }
  }

  return { nodes, matching };
}

console.log('GLB skeleton inspection — hand / weapon attachment bones');
console.log('cwd:', process.cwd());

const playerHandSummary = [];

for (const f of FILES) {
  const filePath = path.join(ROOT, ...f.rel.split('/'));
  const result = inspect(filePath, f);
  if (result && /player|arms|glove/i.test(f.label)) {
    playerHandSummary.push({ label: f.label, matching: result.matching.map((m) => m.name) });
  }
}

console.log('\n' + '#'.repeat(72));
console.log('SUMMARY — hand / arm attachment bone names');
console.log('#'.repeat(72));
for (const { label, matching } of playerHandSummary) {
  console.log(`\n${label}:`);
  if (matching.length) matching.forEach((n) => console.log('  - ' + n));
  else console.log('  (no names matched filter — see first-40 lists above)');
}
