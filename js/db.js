// RHRE-database（RHRE fresh と同じ効果音データベース）を GitHub から jsDelivr 経由で必要な分だけ読む。
// 全体は約 260MB あるので、リミックスで使うミニゲームの data.json と .ogg だけを取りに行く。

import { makePlayalongGame } from './playalong.js?v=4';

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

// 自分で読み込んだ効果音（カスタム）。新しく作るデータベースにも入れる。
// game：「＋ 音声ファイルを追加」で 1 つずつ入れた音（custom_web）。
// packs：フォルダごと入れたゲーム（RHRE fresh の customSounds の中のフォルダ 1 つ＝ゲーム 1 つ）。
// readFile：packs の音（url が cpack: で始まる）の中身を端末の保存から読む関数（app.js が入れる）
export const customRegistry = { game: null, packs: [], readFile: null };

// data.json（RHRE-database・カスタムのフォルダ共通）からゲームを作る。soundUrl を渡すと、各キューの音の場所をそれにする
export function gameFromJSON(d, gid, { icon = null, soundUrl = null } = {}) {
  const id = d.id || gid;
  const game = {
    id,
    name: d.name || id,
    series: d.series || 'other',
    icon,
    objects: [],
  };
  for (const raw of d.objects || []) {
    const o = { ...raw, id: subStar(raw.id, id), game };
    if (Array.isArray(raw.cues)) o.cues = raw.cues.map((c) => ({ ...c, id: subStar(c.id, id) }));
    if (raw.introSound) o.introSound = subStar(raw.introSound, id);
    if (raw.endingSound) o.endingSound = subStar(raw.endingSound, id);
    if (raw.intervals) {
      o.intervals = Object.entries(raw.intervals).map(([range, iv]) => ({ range: parseRange(range), id: subStar(iv, id) }));
    }
    if (soundUrl && (o.type || 'cue') === 'cue') o.url = soundUrl(o);
    game.objects.push(o);
  }
  return game;
}

// 拡張音源：RHRE Web だけにある効果音（作者の自作）。RHRE-database のゲームを読み込んだときに、そのゲームの最後に足す。
// RHRE fresh のデータベースには無いので、これを使ったリミックスを RHRE fresh で開くと、その音は「MISSING ENTITY」になる。
// 音の大きさは、まわりの効果音（Skill Star や perfect breaks）と同じくらいにしてある（元の音から -7dB）。
// 音を差し替えたら ?v= を上げる（アプリが端末に保存しているため）
const EXT_URL = (file) => new URL(`../assets/ext/${file}`, import.meta.url).href;
export const EXT_SOUNDS = {
  extraSFX: [
    { id: 'extraSFX/rhreWeb/clearedSwitch', name: 'Cleared! (Switch)', duration: 1, url: EXT_URL('cleared_switch.wav?v=1') },
  ],
};

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
    for (const g of customRegistry.packs) this.addGame(g);
    // プレイアロングのキーは、データベースではなくエディタ側にある（RHRE fresh と同じ）
    this.addGame(makePlayalongGame());
  }

  addGame(game) {
    this.games.set(game.id, game);
    for (const o of game.objects) this.objects.set(o.id, o);
    for (const o of game.objects) {
      for (const dep of o.deprecatedIDs || []) if (!this.objects.has(dep)) this.objects.set(dep, o);
    }
  }

  // カスタムのゲームを全部外して、今の customRegistry のものを入れ直す（フォルダを足した・消したとき）
  resetCustom() {
    for (const [k, o] of this.objects) if (o.game?.isCustom) this.objects.delete(k);
    for (const [k, g] of this.games) if (g.isCustom) this.games.delete(k);
    if (customRegistry.game) this.addGame(customRegistry.game);
    for (const g of customRegistry.packs) this.addGame(g);
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
      // 星の置きかえは、いつもフォルダの名前（gid）で（RHRE fresh と同じ）
      const game = gameFromJSON({ ...d, id: gid, name: d.name || gid }, gid, { icon: `${this.base}games/${gid}/icon.png` });
      game.id = d.id || gid;
      for (const x of EXT_SOUNDS[game.id] || []) {
        const o = { type: 'cue', subtext: '', deprecatedIDs: [], ...x, ext: true, game };
        game.objects.push(o);
      }
      for (const o of game.objects) this.objects.set(o.id, o);
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
      // custom_ で始まる ID はカスタム効果音だけのもの（RHRE fresh でもデータベースには無い）なので取りに行かない
      const games = [...new Set(queue.filter((id) => !this.objects.has(id) && !id.startsWith('custom_')).map(SFXDatabase.gameIdOf))]
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
    // フォルダごと入れたカスタム効果音は、端末の保存から読む
    if (url.startsWith('cpack:')) {
      const b = await customRegistry.readFile?.(url);
      if (!b) throw new Error(`${url.slice(6)} が見つかりません`);
      return b;
    }
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
