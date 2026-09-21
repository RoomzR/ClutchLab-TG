/**
 * Repair GLBs whose JSON chunk was padded with \\0 instead of spaces.
 * Does not re-strip helpers — only rewrites padding so Three.js can parse.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAP_DIR = path.resolve(__dirname, '../public/maps/3d');

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
      // payload may include 0-3 pad bytes in chunk length; actual data = buffers[0].byteLength
      const declared = (json.buffers && json.buffers[0] && json.buffers[0].byteLength) || binLen;
      bin = buf.subarray(binChunkStart + 8, binChunkStart + 8 + declared);
    }
  }
  return { json, bin };
}

function writeGlb(filePath, json, bin) {
  let jsonStr = JSON.stringify(json);
  const pad = (4 - (jsonStr.length % 4)) % 4;
  jsonStr += ' '.repeat(pad);
  const jsonBuf = Buffer.from(jsonStr, 'utf8');

  const binPad = bin ? (4 - (bin.length % 4)) % 4 : 0;
  const binLen = bin ? bin.length + binPad : 0;
  const total = 12 + 8 + jsonBuf.length + (bin ? 8 + binLen : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  jsonBuf.copy(out, 20);
  if (bin) {
    const off = 20 + jsonBuf.length;
    out.writeUInt32LE(binLen, off);
    out.writeUInt32LE(0x004e4942, off + 4);
    bin.copy(out, off + 8);
  }
  fs.writeFileSync(filePath, out);
}

for (const f of fs.readdirSync(MAP_DIR).filter((x) => x.endsWith('.glb'))) {
  const p = path.join(MAP_DIR, f);
  const { json, bin } = readGlb(p);
  writeGlb(p, json, bin);
  const b = fs.readFileSync(p);
  const jsonLen = b.readUInt32LE(12);
  try {
    JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
    console.log(f, 'OK', b.length);
  } catch (e) {
    console.log(f, 'STILL BAD', e.message);
  }
}
