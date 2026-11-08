// 最小限の ZIP 読み取り（.rhref は remix.json と music.bin などが入った ZIP）
// 圧縮の展開はブラウザ内蔵の DecompressionStream を使い、無い古いブラウザだけ fflate を読み込む。

const FFLATE_URL = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js';

export async function readZip(arrayBuffer) {
  const u8 = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP 形式ではありません（.rhref ファイルを選んでください）');

  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = new Map();
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const localOffset = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method, csize, localOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  return {
    names: [...entries.keys()],
    has: (name) => entries.has(name),
    async read(name) {
      const e = entries.get(name);
      if (!e) return null;
      const nl = dv.getUint16(e.localOffset + 26, true);
      const el = dv.getUint16(e.localOffset + 28, true);
      const start = e.localOffset + 30 + nl + el;
      const data = u8.subarray(start, start + e.csize);
      if (e.method === 0) return data.slice();
      if (e.method === 8) return inflateRaw(data);
      throw new Error(`未対応の圧縮形式です (${e.method})`);
    },
    async readText(name) {
      const b = await this.read(name);
      return b ? new TextDecoder().decode(b) : null;
    },
  };
}

async function inflateRaw(data) {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (_) { /* 古い実装は deflate-raw 非対応 → fflate へ */ }
  }
  const { inflateSync } = await import(FFLATE_URL);
  return inflateSync(data);
}
