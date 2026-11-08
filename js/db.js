// RHRE-database（RHRE fresh と同じ効果音データベース）を GitHub から jsDelivr 経由で必要な分だけ読む。
// 全体は約 260MB あるので、リミックスで使うミニゲームの data.json と .ogg だけを取りに行く。

import { makePlayalongGame } from './playalong.js?v=2';

export const DB_REPO = 'RHREfresh/RHRE-database';
const CDN = 'https://cdn.jsdelivr.net/gh/';

// 一部の data.json はコメント付きで厳密な JSON ではない
export function parseLenientJSON(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  try { return JSON.parse(text); } catch (_) { /* 下で緩く読む */ }
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      out += c;
      if (c === '\\') { out += text[++i] ?? ''; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && text[i + 1] === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

// HTTPS（またはlocalhost）なら Cache API に保存して2回目以降は通信しない
async function cachedFetch(url, cacheName) {
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(cacheName);
      const hit = await cache.match(url);
      if (hit) return hit;
      const res = await fetch(url);
      if (res.ok) await cache.put(url, res.clone());
      return res;
    } catch (_) { /* 失敗したら普通に取る */ }
  }
  return fetch(url);
}

const subStar = (s, gid) => (typeof s === 'string' ? s.split('*').join(gid) : s);

// 自分で読み込んだ効果音（カスタム）。新しく作るデータベースにも入れる
export const customRegistry = { game: null };

export class SFXDatabase {
  constructor(commit) {
    this.commit = (commit || 'master').trim();
    this.base = `${CDN}${DB_REPO}@${this.commit}/`;
    // jsDelivr が混んでいる・断られたときの予備（GitHub から直接）
    this.rawBase = `https://raw.githubusercontent.com/${DB_REPO}/${this.commit}/`;
    this.cacheName = `rhre-db-${this.commit}`;
    this.games = new Map();
    this.objects = new Map();
    this.pending = new Map();
    this.failedGames = new Map();
    if (customRegistry.game) this.addGame(customRegistry.game);
    // プレイアロングのキーは、データベースではなくエディタ側にある（RHRE fresh と同じ）
    this.addGame(makePlayalongGame());
  }

  addGame(game) {
    this.games.set(game.id, game);
    for (const o of game.objects) this.objects.set(o.id, o);
  }

  static gameIdOf(id) {
    return id.split(/[_/]/)[0];
  }

  // まず jsDelivr、だめなら GitHub から直接
  async fetchWithFallback(url) {
    let res = null;
    try { res = await cachedFetch(url, this.cacheName); } catch (_) { /* 下で予備へ */ }
    if ((!res || !res.ok) && url.startsWith(this.base)) {
      try { res = await fetch(this.rawBase + url.slice(this.base.length)); } catch (_) { /* そのまま */ }
    }
    if (!res) throw new Error(`${url} を取得できません`);
    return res;
  }

  rawUrl(url) {
    return url.startsWith(this.base) ? this.rawBase + url.slice(this.base.length) : url;
  }

  async fetchText(path) {
    let res = await this.fetchWithFallback(this.base + path);
    if (!res.ok && this.commit !== 'master') {
      // コミットが見つからないときは最新版で再挑戦
      res = await fetch(`${CDN}${DB_REPO}@master/${path}`);
    }
    if (!res.ok) throw new Error(`${path} を取得できません (${res.status})`);
    return res.text();
  }

  loadGame(gid) {
    if (this.games.has(gid)) return Promise.resolve(this.games.get(gid));
    if (this.failedGames.has(gid)) return Promise.reject(this.failedGames.get(gid));
    if (this.pending.has(gid)) return this.pending.get(gid);
    const p = (async () => {
      const d = parseLenientJSON(await this.fetchText(`games/${gid}/data.json`));
      const game = {
        id: d.id || gid,
        name: d.name || gid,
        series: d.series || 'other',
        icon: `${this.base}games/${gid}/icon.png`,
        objects: [],
      };
      for (const raw of d.objects || []) {
        const o = { ...raw, id: subStar(raw.id, gid), game };
        if (Array.isArray(raw.cues)) o.cues = raw.cues.map((c) => ({ ...c, id: subStar(c.id, gid) }));
        if (raw.introSound) o.introSound = subStar(raw.introSound, gid);
        if (raw.endingSound) o.endingSound = subStar(raw.endingSound, gid);
        if (raw.intervals) {
          o.intervals = Object.entries(raw.intervals).map(([range, id]) => ({ range: parseRange(range), id: subStar(id, gid) }));
        }
        this.objects.set(o.id, o);
        game.objects.push(o);
      }
      for (const o of game.objects) {
        for (const dep of o.deprecatedIDs || []) if (!this.objects.has(dep)) this.objects.set(dep, o);
      }
      this.games.set(gid, game);
      return game;
    })();
    this.pending.set(gid, p);
    p.catch((e) => this.failedGames.set(gid, e)).finally(() => this.pending.delete(gid));
    return p;
  }

  get(id) {
    return this.objects.get(id);
  }

  // id とそこから参照されるすべてのオブジェクトを読み込む。見つからない id を返す
  async ensureAll(ids, onProgress) {
    const missing = new Set();
    const seen = new Set();
    let queue = [...new Set(ids)];
    while (queue.length) {
      const games = [...new Set(queue.filter((id) => !this.objects.has(id)).map(SFXDatabase.gameIdOf))]
        .filter((g) => !this.games.has(g) && !this.failedGames.has(g));
      let done = 0;
      await mapLimit(games, 6, async (g) => {
        try { await this.loadGame(g); } catch (_) { /* 後で missing に入る */ }
        onProgress?.(++done, games.length, g);
      });
      const next = [];
      for (const id of queue) {
        if (seen.has(id)) continue;
        seen.add(id);
        const o = this.objects.get(id);
        if (!o) { missing.add(id); continue; }
        for (const ref of refsOf(o)) if (!seen.has(ref)) next.push(ref);
      }
      queue = next;
    }
    return [...missing];
  }

  soundUrl(cue) {
    if (cue.url) return cue.url; // カスタム効果音
    return `${this.base}games/${cue.id}.${cue.fileExtension || 'ogg'}`;
  }

  async fetchBinary(url) {
    const res = await this.fetchWithFallback(url);
    if (!res.ok) throw new Error(`${url} を取得できません (${res.status})`);
    return res.arrayBuffer();
  }
}

export function refsOf(o) {
  const out = [];
  for (const c of o.cues || []) out.push(c.id);
  for (const iv of o.intervals || []) out.push(iv.id);
  if (o.introSound) out.push(o.introSound);
  if (o.endingSound) out.push(o.endingSound);
  return out;
}

// RHRE の PitchRange: "-3..2" "..-1" "0.." など
function parseRange(str) {
  const m = /^([+-]?\d+)?\s*\.\.\s*([+-]?\d+)?$/.exec(String(str).trim());
  if (!m) return { lo: 1, hi: 0 }; // 無効
  const lo = m[1] != null ? parseInt(m[1].replace('+', ''), 10) : -Infinity;
  const hi = m[2] != null ? parseInt(m[2].replace('+', ''), 10) : Infinity;
  return { lo, hi };
}

export async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}
