// RHRE Web の「みんなで編集」の部屋（Cloudflare Workers + Durable Objects）
// 部屋 1 つ＝ Durable Object 1 つ（合言葉から作る）。部屋のリミックス（ブロック・テンポなど）を持ち、
// だれかの変更を全員に配る。同じブロックを同時に変えたときは、あとから届いたほうが勝つ。
//  ・/ws?room=合言葉&d=端末の番号&nick=名前[&create=1[&public=1&lang=言語]]：WebSocket でつなぐ
//  ・/lobby：公開の部屋の一覧（JSON）
// 受け取るのは、リミックスの中身・端末ごとのランダムな番号・好きに付けた名前だけ。曲はここを通らない。
// 全員が抜けて 2 分たったら、部屋の中身をすべて消す（サーバーに何も残さない）。
// だれも何もしない時間が 2 時間続いた部屋も、閉じて中身を消す（つないだまま放っておかれた部屋）。
// 同じ端末（d）が前のつながりを残したまま入り直したときは、前のつながりと入れ替える（同じ人が 2 人に見えないように）。
//
// 部屋は 2 種類
//  ・合言葉の部屋：一覧に出ない。合言葉を知っていれば入れる
//  ・公開の部屋：一覧に出る（番号・部屋の名前・言語・人数・使っているゲーム。人の名前は出さない）。
//    入るには「入りたい」を送り、部屋を作った人が「入れる」を押した人だけ入れる（合言葉で来ても同じ）
//
// やり取り（どれも JSON）
//  届く： seed（部屋を作った人が最初のリミックスを送る。多いときは何回かに分ける）／ ops（変更）／ sel（選んでいるブロック）／ nick（名前）
//        song（部屋の曲の名前・大きさ・目印。曲そのものは送らない）／ have（その曲を持っている）／ sig（端末どうしを直接つなぐための紹介。相手に渡すだけ）
//        time（時計合わせ）／ 部屋を作った人だけ：admit・deny（入れる・ことわる）／ kick（外す）／ lock（締める）／ play・stop（みんなで再生）／ info（一覧に出すゲーム）／ title（部屋の名前）
//  送る： hello（あなたの番号と色・部屋の様子・部屋の曲の情報）／ waiting（返事待ち）／ knock（入りたい人。部屋を作った人へ）／ room（部屋の様子）
//        state（部屋のリミックス。ents は { uid, e } の並び。何回かに分ける）／ seeded ／ ops ／ sel ／ members（いる人）／ song ／ sig ／ time ／ play ／ stop ／ err（入れない理由）
//  ops の中身：{ k: 'put', uid, e }（ブロックを置く・変える）／ { k: 'del', uid }（消す）／ { k: 'g', v }（テンポ・拍子などをまとめて）
import { DurableObject } from 'cloudflare:workers';

const ALLOWED_ORIGINS = ['https://pika1013.github.io', 'http://localhost:8123', 'http://127.0.0.1:8123'];
const MAX_MEMBERS = 10;
const STALE_MS = 90_000; // 90 秒以上 ping が来ない人は、いないとみなす
const EMPTY_KEEP_MS = 120_000; // 全員いなくなってから消すまで（電波が切れてつなぎ直す人のため）
const REFRESH_MS = 10 * 60_000; // 人がいる間の見回り（一覧の出し直し・使われていない部屋を閉じる）の間隔
const IDLE_MS = 2 * 60 * 60_000; // だれも何もしない時間がこれだけ続いたら、部屋を閉じる
// 部屋と一覧の名前の頭。変えると、それまでの部屋はだれも入れなくなる（中身は見回りで消える）。
// v2：2026-11-15 の正式公開の前に、試しで作った部屋をすべて消すため
const NS = 'v2:';
const LOBBY_STALE_MS = 25 * 60_000; // これより長く出し直しの無い部屋は、一覧から消す
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/; // 見分けにくい I・O・0・1 は使わない
const UID_RE = /^[a-z0-9]{1,24}$/i;
const GAME_RE = /^[A-Za-z0-9_]{1,48}$/;
const LANG_RE = /^[a-zA-Z-]{2,8}$/;
const MAX_MSG = 1_000_000;
const MAX_OPS = 2000;
const STATE_CHUNK = 400;
const MAX_SIG = 64_000;
const HASH_RE = /^[0-9a-f]{16,64}$/;

const cleanNick = (s) => String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 16);
const cleanTitle = (s) => [...String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim()].slice(0, 20).join(''); // 部屋の名前（20 文字まで）
const lobbyOf = (env) => env.LOBBY.get(env.LOBBY.idFromName(`${NS}lobby`));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (url.pathname === '/ws') {
      if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Forbidden', { status: 403 });
      const code = (url.searchParams.get('room') || '').toUpperCase();
      if (!CODE_RE.test(code)) return new Response('Bad room', { status: 400 });
      return env.ROOM.get(env.ROOM.idFromName(NS + code)).fetch(request);
    }
    if (url.pathname === '/lobby') {
      const res = await lobbyOf(env).fetch(new Request('https://lobby/list'));
      const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
      if (ALLOWED_ORIGINS.includes(origin)) headers['access-control-allow-origin'] = origin;
      return new Response(res.body, { headers });
    }
    return new Response('RHRE Web rooms\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  },
};

// 公開の部屋の一覧（1 つだけ）。部屋が自分の情報を出し直し、出し直しが止まった部屋は消す
export class Lobby extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/set') {
      const { code, info } = await request.json();
      if (!CODE_RE.test(code || '')) return new Response('bad', { status: 400 });
      if (info) await this.ctx.storage.put(`r:${code}`, { ...info, code, at: Date.now() });
      else await this.ctx.storage.delete(`r:${code}`);
      return new Response('ok');
    }
    if (url.pathname === '/list') {
      const now = Date.now();
      const rooms = [];
      for (const [k, v] of await this.ctx.storage.list({ prefix: 'r:' })) {
        if (now - v.at > LOBBY_STALE_MS) { await this.ctx.storage.delete(k); continue; }
        rooms.push({ code: v.code, num: v.num, title: v.title || '', lang: v.lang, count: v.count, icons: v.icons || [], created: v.created });
      }
      rooms.sort((a, b) => (a.count >= MAX_MEMBERS) - (b.count >= MAX_MEMBERS) || b.created - a.created);
      return Response.json({ rooms: rooms.slice(0, 60), max: MAX_MEMBERS });
    }
    return new Response('not found', { status: 404 });
  }
}

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // ping にはサーバーを起こさずに返事をする
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.sels = new Map(); // 番号 → 選んでいるブロック（休んでいる間に消えてもよい）
  }

  // 今いる人（入りたいと待っている人は入れない。90 秒以上 ping の無い人は閉じる）
  sockets(except) {
    const now = Date.now();
    const out = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const a = ws.deserializeAttachment();
      if (!a?.id || a.replaced) continue;
      const last = Math.max(this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() || 0, a.t || 0);
      if (now - last > STALE_MS) { try { ws.close(1001, 'stale'); } catch (_) { /* もう閉じている */ } continue; }
      out.push({ ws, a });
    }
    return out;
  }
  members(except) { return this.sockets(except).filter((m) => !m.a.waiting); }
  waiters(except) { return this.sockets(except).filter((m) => m.a.waiting); }

  info(a) { return { id: a.id, nick: a.nick, color: a.color, host: !!a.host, has: a.has || '', sel: this.sels.get(a.id) || [] }; }
  roomInfo(meta) { return { public: !!meta.public, num: meta.num || 0, locked: !!meta.locked, title: meta.title || '' }; }
  send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) { /* 閉じかけ */ } }
  broadcast(obj, except) {
    const s = JSON.stringify(obj);
    for (const { ws } of this.members(except)) { try { ws.send(s); } catch (_) { /* 閉じかけ */ } }
  }
  sendMembers(except) { this.broadcast({ t: 'members', members: this.members(except).map((m) => this.info(m.a)) }, except); }
  host(except) { return this.members(except).find((m) => m.a.host); }

  // 一覧の情報を出し直す（公開の部屋で、締めていないときだけ一覧に出す）
  async updateLobby(meta, except) {
    if (!meta?.public) return;
    const count = this.members(except).length;
    const info = !meta.seeding && !meta.locked && count > 0
      ? { num: meta.num, title: meta.title || '', lang: meta.lang || '', count, icons: meta.icons || [], created: meta.created }
      : null;
    try {
      await lobbyOf(this.env).fetch(new Request('https://lobby/set', { method: 'POST', body: JSON.stringify({ code: meta.code, info }) }));
    } catch (_) { /* 一覧が出せなくても部屋は使える */ }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const create = url.searchParams.get('create') === '1';
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const done = () => new Response(null, { status: 101, webSocket: client });
    const fail = (code) => { this.send(server, { t: 'err', code }); try { server.close(4000, code); } catch (_) { /* もう閉じている */ } return done(); };

    const d = (url.searchParams.get('d') || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
    // 同じ端末の前のつながりが残っていたら閉じて、色と「部屋を作った人」を引き継ぐ
    const prev = d && !create ? this.sockets(server).find((x) => x.a.d === d) : null;
    if (prev) {
      prev.a.replaced = true;
      prev.ws.serializeAttachment(prev.a);
      this.send(prev.ws, { t: 'err', code: 'replaced' });
      try { prev.ws.close(4000, 'replaced'); } catch (_) { /* もう閉じている */ }
    }
    const others = this.members(server);
    let meta = await this.ctx.storage.get('meta');
    if (create) {
      if (meta && (others.length || this.waiters(server).length)) return fail('exists'); // 同じ合言葉の部屋がもうある（作る側が別の合言葉で作り直す）
      await this.ctx.storage.deleteAll(); // 前の部屋の残り
      const lang = url.searchParams.get('lang') || '';
      meta = {
        seq: 0, seeding: true, created: Date.now(),
        code: (url.searchParams.get('room') || '').toUpperCase(),
        public: url.searchParams.get('public') === '1',
        num: 1000 + Math.floor(Math.random() * 9000),
        lang: LANG_RE.test(lang) ? lang : '',
        icons: [], locked: false, banned: [], admitted: [], active: Date.now(),
      };
      await this.ctx.storage.put('meta', meta);
    } else {
      if (!meta || meta.seeding) return fail('noroom');
      if (meta.locked) return fail('locked');
      if (d && meta.banned?.includes(d)) return fail('denied');
    }
    if (others.length >= MAX_MEMBERS) return fail('full');

    const a = {
      id: crypto.randomUUID().replace(/-/g, '').slice(0, 10),
      nick: cleanNick(url.searchParams.get('nick')),
      d,
      color: prev && !prev.a.waiting ? prev.a.color : -1,
      host: create || !!(prev && !prev.a.waiting && prev.a.host),
      t: Date.now(),
    };
    this.touch();
    await this.ctx.storage.setAlarm(Date.now() + REFRESH_MS); // 人がいる間は消さない（一覧の出し直しだけ）
    // 公開の部屋：部屋を作った人の返事を待つ（一度入れてもらった端末のつなぎ直し・読み込み直しと、だれもいないときは待たない）
    if (!create && meta.public && others.length && !(prev && !prev.a.waiting) && !(d && meta.admitted?.includes(d))) {
      a.waiting = true;
      server.serializeAttachment(a);
      this.send(server, { t: 'waiting' });
      const h = this.host();
      if (h) this.send(h.ws, { t: 'knock', id: a.id, nick: a.nick });
      return done();
    }
    await this.admitSocket(server, a, meta, others);
    return done();
  }

  // 部屋に入れる：色を決めて、部屋のリミックスを送る
  async admitSocket(ws, a, meta, others = this.members(ws)) {
    const used = new Set(others.map((m) => m.a.color));
    // 入り直した端末は、前と同じ色（空いていれば）
    let color = a.color >= 0 && !used.has(a.color) ? a.color : 0;
    while (used.has(color)) color++;
    a.color = color;
    a.waiting = false;
    if (others.some((m) => m.a.host)) a.host = false;
    else a.host = true;
    ws.serializeAttachment(a);
    if (a.d && !meta.admitted?.includes(a.d)) {
      meta.admitted = [...(meta.admitted || []), a.d].slice(-50);
      await this.ctx.storage.put('meta', meta);
    }
    this.send(ws, { t: 'hello', you: this.info(a), room: this.roomInfo(meta), song: (await this.ctx.storage.get('song')) || null, now: Date.now() });
    if (!meta.seeding) await this.sendState(ws, meta);
    this.sendMembers();
    if (!meta.seeding) await this.updateLobby(meta);
  }

  // 部屋のリミックスを、入ってきた人に送る（ブロックは STATE_CHUNK 個ずつ）
  async sendState(ws, meta) {
    const g = (await this.ctx.storage.get('g')) || null;
    const ents = [...(await this.ctx.storage.list({ prefix: 'e:' })).entries()].map(([k, e]) => ({ uid: k.slice(2), e }));
    const parts = Math.max(1, Math.ceil(ents.length / STATE_CHUNK));
    for (let i = 0; i < parts; i++) {
      this.send(ws, { t: 'state', seq: meta.seq, g: i === 0 ? g : undefined, ents: ents.slice(i * STATE_CHUNK, (i + 1) * STATE_CHUNK), last: i === parts - 1 });
    }
  }

  // 変更を保存する（put と delete は 128 個ずつ）
  async applyOps(ops) {
    const puts = {};
    const dels = [];
    let g = null;
    for (const op of ops) {
      if (op.k === 'put' && UID_RE.test(op.uid) && op.e && typeof op.e === 'object') { puts[`e:${op.uid}`] = op.e; }
      else if (op.k === 'del' && UID_RE.test(op.uid)) { dels.push(`e:${op.uid}`); delete puts[`e:${op.uid}`]; }
      else if (op.k === 'g' && op.v && typeof op.v === 'object') g = op.v;
    }
    const keys = Object.keys(puts);
    for (let i = 0; i < keys.length; i += 128) {
      const part = {};
      for (const k of keys.slice(i, i + 128)) part[k] = puts[k];
      await this.ctx.storage.put(part);
    }
    for (let i = 0; i < dels.length; i += 128) await this.ctx.storage.delete(dels.slice(i, i + 128));
    if (g) await this.ctx.storage.put('g', g);
  }

  async webSocketMessage(ws, msg) {
    if (typeof msg !== 'string' || msg.length > MAX_MSG) return;
    let m;
    try { m = JSON.parse(msg); } catch (_) { return; }
    const a = ws.deserializeAttachment();
    if (!a?.id || !m || typeof m !== 'object') return;
    a.t = Date.now();
    ws.serializeAttachment(a);
    if (a.waiting) return; // 返事待ちの人からは受け取らない
    const meta = await this.ctx.storage.get('meta');
    if (!meta) return;
    if (m.t !== 'time') this.touch();

    if (m.t === 'time') { this.send(ws, { t: 'time', c: m.c, s: Date.now() }); return; }

    if (m.t === 'seed') {
      // 部屋を作った人が、最初のリミックスを送ってくる
      if (!a.host || !meta.seeding || !Array.isArray(m.ops) || m.ops.length > MAX_OPS) return;
      await this.applyOps(m.ops);
      if (m.last) {
        meta.seeding = false;
        await this.ctx.storage.put('meta', meta);
        this.send(ws, { t: 'seeded', seq: meta.seq });
        await this.updateLobby(meta);
      }
      return;
    }
    if (m.t === 'ops') {
      if (meta.seeding || !Array.isArray(m.ops) || m.ops.length > MAX_OPS) return;
      await this.applyOps(m.ops);
      meta.seq++;
      await this.ctx.storage.put('meta', meta);
      // 送った本人にも返す（届いた順番＝決まった順番。本人はこれで「届いた」と分かる）
      this.broadcast({ t: 'ops', seq: meta.seq, from: a.id, cid: m.cid, ops: m.ops });
      return;
    }
    if (m.t === 'sel') {
      const uids = Array.isArray(m.uids) ? m.uids.filter((u) => typeof u === 'string' && UID_RE.test(u)).slice(0, 300) : [];
      this.sels.set(a.id, uids);
      this.broadcast({ t: 'sel', id: a.id, uids }, ws);
      return;
    }
    if (m.t === 'sig') {
      // 端末どうしを直接つなぐための紹介（相手の住所など）。中身は見ずに、相手にだけ渡す
      if (typeof m.to !== 'string' || JSON.stringify(m.data || null).length > MAX_SIG) return;
      const to = this.members().find((x) => x.a.id === m.to);
      if (to) this.send(to.ws, { t: 'sig', from: a.id, data: m.data });
      return;
    }
    if (m.t === 'song') {
      // 部屋の曲の情報だけ（名前・形式・大きさ・目印）
      const s = m.song;
      if (!s || !HASH_RE.test(s.hash || '') || !(s.size > 0)) return;
      const song = { hash: s.hash, name: String(s.name || '').slice(0, 120), ext: String(s.ext || '').replace(/[^a-z0-9]/gi, '').slice(0, 8), size: Math.floor(s.size), by: a.id };
      await this.ctx.storage.put('song', song);
      a.has = song.hash;
      ws.serializeAttachment(a);
      this.broadcast({ t: 'song', song });
      this.sendMembers();
      return;
    }
    if (m.t === 'have') {
      a.has = HASH_RE.test(m.hash || '') ? m.hash : '';
      ws.serializeAttachment(a);
      this.sendMembers();
      return;
    }
    if (m.t === 'nick') {
      a.nick = cleanNick(m.nick);
      ws.serializeAttachment(a);
      this.sendMembers();
      return;
    }

    // ここから下は、部屋を作った人だけ
    if (!a.host) return;
    if (m.t === 'admit' || m.t === 'deny') {
      const w = this.waiters().find((x) => x.a.id === m.id);
      if (!w) return;
      if (m.t === 'deny') { this.send(w.ws, { t: 'err', code: 'denied' }); try { w.ws.close(4000, 'denied'); } catch (_) { /* もう閉じている */ } return; }
      if (meta.locked || this.members().length >= MAX_MEMBERS) { this.send(w.ws, { t: 'err', code: meta.locked ? 'locked' : 'full' }); try { w.ws.close(4000, 'full'); } catch (_) { /* もう閉じている */ } return; }
      await this.admitSocket(w.ws, w.a, meta);
      return;
    }
    if (m.t === 'kick') {
      const x = this.sockets().find((s) => s.a.id === m.id && s.ws !== ws);
      if (!x) return;
      if (x.a.d) {
        meta.banned = [...(meta.banned || []), x.a.d].slice(-100);
        meta.admitted = (meta.admitted || []).filter((v) => v !== x.a.d);
        await this.ctx.storage.put('meta', meta);
      }
      this.send(x.ws, { t: 'err', code: 'kicked' });
      try { x.ws.close(4000, 'kicked'); } catch (_) { /* もう閉じている */ }
      return;
    }
    if (m.t === 'lock') {
      meta.locked = !!m.on;
      await this.ctx.storage.put('meta', meta);
      this.broadcast({ t: 'room', room: this.roomInfo(meta) });
      // 締めたら、返事待ちの人にもことわる
      if (meta.locked) for (const w of this.waiters()) { this.send(w.ws, { t: 'err', code: 'locked' }); try { w.ws.close(4000, 'locked'); } catch (_) { /* もう閉じている */ } }
      await this.updateLobby(meta);
      return;
    }
    if (m.t === 'title') {
      // 部屋の名前（部屋を作った人だけ）
      meta.title = cleanTitle(m.title);
      await this.ctx.storage.put('meta', meta);
      this.broadcast({ t: 'room', room: this.roomInfo(meta) });
      await this.updateLobby(meta);
      return;
    }
    if (m.t === 'info') {
      meta.icons = Array.isArray(m.icons) ? m.icons.filter((g) => typeof g === 'string' && GAME_RE.test(g)).slice(0, 4) : [];
      await this.ctx.storage.put('meta', meta);
      await this.updateLobby(meta);
      return;
    }
    if (m.t === 'play') {
      if (!(Number(m.at) > 0) || !Number.isFinite(Number(m.beat))) return;
      this.broadcast({ t: 'play', at: Number(m.at), beat: Number(m.beat) }, ws);
      return;
    }
    if (m.t === 'stop') this.broadcast({ t: 'stop' }, ws);
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch (_) { /* もう閉じている */ }
    await this.left(ws);
  }

  async webSocketError(ws) {
    await this.left(ws);
  }

  // だれかが何かをした（使われている）。保存は 1 分に 1 回まで
  touch() {
    this.lastActive = Date.now();
    if (Date.now() - (this.savedActive || 0) < 60_000) return;
    this.savedActive = Date.now();
    this.ctx.storage.get('meta').then((meta) => { if (meta) { meta.active = this.lastActive; return this.ctx.storage.put('meta', meta); } }).catch(() => {});
  }

  async left(ws) {
    const a = ws.deserializeAttachment();
    if (a?.waiting || !a?.id || a.replaced) return; // 返事待ちの人・入れなかった人・入れ替わった前のつながりが抜けても、部屋は変わらない
    this.sels.delete(a.id);
    const meta = await this.ctx.storage.get('meta');
    const rest = this.members(ws);
    if (!rest.length) {
      // 全員いなくなった：一覧から外し、少し待って、だれも戻らなければ消す
      await this.updateLobby(meta, ws);
      for (const w of this.waiters(ws)) { this.send(w.ws, { t: 'err', code: 'noroom' }); try { w.ws.close(4000, 'noroom'); } catch (_) { /* もう閉じている */ } }
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_KEEP_MS);
      return;
    }
    // 部屋を作った人が抜けたら、一番前からいる人に引き継ぐ（返事待ちの人は、新しい人に知らせる）
    if (!rest.some((m) => m.a.host)) {
      rest[0].a.host = true;
      rest[0].ws.serializeAttachment(rest[0].a);
      for (const w of this.waiters(ws)) this.send(rest[0].ws, { t: 'knock', id: w.a.id, nick: w.a.nick });
    }
    this.sendMembers(ws);
    await this.updateLobby(meta, ws);
  }

  async alarm() {
    const meta = await this.ctx.storage.get('meta');
    // だれも何もしない時間が続いた部屋は閉じる（つないだまま放っておかれた部屋）
    const active = Math.max(this.lastActive || 0, meta?.active || meta?.created || 0);
    if (meta && Date.now() - active > IDLE_MS) {
      for (const s of this.sockets()) { this.send(s.ws, { t: 'err', code: 'expired' }); try { s.ws.close(4000, 'expired'); } catch (_) { /* もう閉じている */ } }
      if (meta.public) await this.updateLobby({ ...meta, locked: true });
      await this.ctx.storage.deleteAll();
      return;
    }
    if (this.members().length) {
      // 人がいる：一覧の情報を出し直して、また 10 分後に
      await this.updateLobby(meta);
      await this.ctx.storage.setAlarm(Date.now() + REFRESH_MS);
      return;
    }
    if (meta?.public) await this.updateLobby({ ...meta, locked: true });
    await this.ctx.storage.deleteAll();
  }
}
