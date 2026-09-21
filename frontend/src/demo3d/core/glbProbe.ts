/** GLB magic header: "glTF" */
export async function probeGlb(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-3' },
      cache: 'force-cache',
    });
    if (!res.ok && res.status !== 206) return false;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('text/html') || ct.includes('text/plain')) return false;
    const buf = new Uint8Array(await res.arrayBuffer());
    // Full body returned (Range ignored): still OK if content-type is glTF/binary
    // or magic matches at the start.
    if (buf.length >= 4 && buf[0] === 0x67 && buf[1] === 0x6c && buf[2] === 0x54 && buf[3] === 0x46) {
      return true;
    }
    if (
      buf.length > 64 &&
      (ct.includes('model/gltf') || ct.includes('octet-stream') || ct.includes('application/gltf'))
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
