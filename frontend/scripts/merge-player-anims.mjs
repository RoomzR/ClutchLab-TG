/**
 * Merge CS2 worldmodel .vnmclip GLBs into a character GLB by bone name.
 * Usage: node merge-player-anims.mjs <character.glb> <out.glb> idle.glb=idle walk.glb=walk ...
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';

function readGlb(path) {
  const buf = readFileSync(path);
  const magic = buf.toString('utf8', 0, 4);
  if (magic !== 'glTF') throw new Error(`Not GLB: ${path}`);
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset + 8 <= buf.length) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.toString('utf8', offset + 4, offset + 8);
    const start = offset + 8;
    const end = start + chunkLen;
    if (chunkType === 'JSON') {
      json = JSON.parse(buf.toString('utf8', start, end).replace(/\0+$/, ''));
    } else if (chunkType === 'BIN\0') {
      bin = buf.subarray(start, end);
    }
    offset = end;
  }
  if (!json) throw new Error(`No JSON in ${path}`);
  if (!bin) bin = Buffer.alloc(0);
  return { json, bin, path };
}

function writeGlb(path, json, bin) {
  let jsonStr = JSON.stringify(json);
  const jsonPad = (4 - (jsonStr.length % 4)) % 4;
  jsonStr += ' '.repeat(jsonPad);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binPadded = binPad ? Buffer.concat([bin, Buffer.alloc(binPad)]) : bin;

  const jsonChunk = Buffer.alloc(8 + jsonStr.length);
  jsonChunk.writeUInt32LE(jsonStr.length, 0);
  jsonChunk.writeUInt32LE(0x4e4f534a, 4); // JSON
  jsonChunk.write(jsonStr, 8);

  const binChunk = Buffer.alloc(8 + binPadded.length);
  binChunk.writeUInt32LE(binPadded.length, 0);
  binChunk.writeUInt32LE(0x004e4942, 4); // BIN\0
  binPadded.copy(binChunk, 8);

  const total = 12 + jsonChunk.length + binChunk.length;
  const out = Buffer.alloc(total);
  out.write('glTF', 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  jsonChunk.copy(out, 12);
  binChunk.copy(out, 12 + jsonChunk.length);
  writeFileSync(path, out);
}

function ensureArrays(json) {
  for (const k of [
    'accessors',
    'bufferViews',
    'buffers',
    'animations',
    'nodes',
    'meshes',
    'skins',
    'materials',
    'textures',
    'images',
    'samplers',
  ]) {
    if (!json[k]) json[k] = [];
  }
  if (!json.buffers.length) json.buffers.push({ byteLength: 0 });
}

function mergeClip(base, clip, animName) {
  ensureArrays(base.json);
  ensureArrays(clip.json);

  const baseNodeByName = new Map();
  base.json.nodes.forEach((n, i) => {
    if (n.name) baseNodeByName.set(n.name, i);
  });

  const clipAnims = clip.json.animations || [];
  if (!clipAnims.length) {
    console.warn(`  skip ${basename(clip.path)}: no animations`);
    return;
  }

  const accessorOffset = base.json.accessors.length;
  const viewOffset = base.json.bufferViews.length;
  const binOffset = base.bin.length;

  // Append clip binary
  base.bin = Buffer.concat([base.bin, clip.bin]);
  base.json.buffers[0].byteLength = base.bin.length;

  // Copy bufferViews with shifted offsets
  for (const bv of clip.json.bufferViews) {
    base.json.bufferViews.push({
      ...bv,
      buffer: 0,
      byteOffset: (bv.byteOffset || 0) + binOffset,
    });
  }

  // Copy accessors with shifted bufferView
  for (const acc of clip.json.accessors) {
    const copy = { ...acc };
    if (copy.bufferView != null) copy.bufferView = copy.bufferView + viewOffset;
    if (copy.sparse) {
      // rare — skip sparse for now
      delete copy.sparse;
    }
    base.json.accessors.push(copy);
  }

  for (const anim of clipAnims) {
    const channels = [];
    const samplers = [];
    let dropped = 0;

    for (const samp of anim.samplers || []) {
      samplers.push({
        input: samp.input + accessorOffset,
        output: samp.output + accessorOffset,
        interpolation: samp.interpolation || 'LINEAR',
      });
    }

    for (const ch of anim.channels || []) {
      const clipNode = clip.json.nodes[ch.target.node];
      const boneName = clipNode?.name;
      const baseIdx = boneName != null ? baseNodeByName.get(boneName) : undefined;
      if (baseIdx == null) {
        dropped++;
        continue;
      }
      // Demo positions the pawn externally — keep root_motion rotation/scale, drop translation.
      if (boneName === 'root_motion' && ch.target.path === 'translation') {
        dropped++;
        continue;
      }
      channels.push({
        sampler: ch.sampler,
        target: { node: baseIdx, path: ch.target.path },
      });
    }

    // Remap sampler indices are already local to this anim's samplers array
    base.json.animations.push({
      name: animName,
      samplers,
      channels,
    });
    console.log(
      `  + ${animName}: ${channels.length} channels (dropped ${dropped} unmatched) from ${basename(clip.path)}`,
    );
  }
}

function copySidecarTextures(srcGlb, destDir) {
  const srcDir = dirname(srcGlb);
  mkdirSync(destDir, { recursive: true });
  for (const name of readdirSync(srcDir)) {
    if (!/\.(png|jpg|jpeg|webp)$/i.test(name)) continue;
    const from = join(srcDir, name);
    if (!statSync(from).isFile()) continue;
    copyFileSync(from, join(destDir, name));
  }
}

const [charPath, outPath, ...pairs] = process.argv.slice(2);
if (!charPath || !outPath || !pairs.length) {
  console.error(
    'Usage: node merge-player-anims.mjs <character.glb> <out.glb> clip.glb=name [...]',
  );
  process.exit(1);
}

const base = readGlb(charPath);
ensureArrays(base.json);
// Drop junk preview clips
base.json.animations = (base.json.animations || []).filter(
  (a) => !/tools_preview|eye_test/i.test(a.name || ''),
);

for (const pair of pairs) {
  const eq = pair.indexOf('=');
  if (eq < 0) throw new Error(`Bad pair: ${pair}`);
  const clipPath = pair.slice(0, eq);
  const name = pair.slice(eq + 1);
  mergeClip(base, readGlb(clipPath), name);
}

mkdirSync(dirname(outPath), { recursive: true });
writeGlb(outPath, base.json, base.bin);
copySidecarTextures(charPath, dirname(outPath));
console.log(`Wrote ${outPath} (${base.bin.length} bin bytes, ${base.json.animations.length} anims)`);
