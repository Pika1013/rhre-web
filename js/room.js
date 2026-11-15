// みんなで編集：部屋のサーバー（server/room）とのやり取り。つなぐ・つなぎ直す・送る。
// 画面やリミックスのことは知らない（app.js が handlers で受け取る）。
//  handlers：hello(you, back, song, room) ／ state(msg) ／ seeded() ／ ops(msg, mine) ／ sel(id, uids) ／ members(list) ／ song(info) ／ sig(from, data)
//            waiting() ／ knock(id, nick) ／ room(info) ／ play(msg) ／ stop() ／ ask(id, nick, kind) ／ grant(kind, ok) ／ remix(id, nick) ／ err(code) ／ drop()

// 合言葉に使う文字（見分けにくい I・O・0・1 は使わない。サーバーと同じ）
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newRoomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % 32]).join('');
export const cleanRoomCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
export const isRoomCode = (s) => /^[A-HJ-NP-Z2-9]{6}$/.test(s);

// 部屋の人の色（自分の選択の水色とかぶらないもの）。サーバーが 0 から順に空いている番号を配る
export const PEER_COLORS = ['#ff5a5a', '#4d8dff', '#4cd964', '#ffcc00', '#c77dff', '#ff9d3c', '#ff6fb5', '#a3e635', '#e8e8e8', '#b58863'];

const OPS_PER_MSG = 500;

export class RoomClient {
  constructor(url, handlers) {
    this.url = url;
    this.h = handlers;
    this.ws = null;
    this.code = '';
    this.you = null;
    this.cid = 0;
    this.unacked = []; // 送ったが、まだサーバーから返ってきていない変更 [{ cid, ops }]
    this.left = true;
    this.retry = 0;
    this.timer = 0;
    this.ping = 0;
  }

  get open() { return this.ws?.readyState === 1; }

  connect(code, { create = false, nick = '', device = '', isPublic = false, lang = '' } = {}) {
    this.code = code;
    this.left = false;
    this.create = create;
    this.isPublic = isPublic;
    this.lang = lang;
    this.nick = nick;
    this.device = device;
    this.dial();
  }

  dial() {
    clearTimeout(this.timer);
    const q = new URLSearchParams({ room: this.code, d: this.device, nick: this.nick });
    if (this.create) {
      q.set('create', '1');
      if (this.isPublic) { q.set('public', '1'); q.set('lang', this.lang); }
    }
    let ws;
    try { ws = new WebSocket(`${this.url}?${q}`); } catch (_) { this.again(); return; }
    this.ws = ws;
    this.gotErr = false;
    ws.onopen = () => {
      clearInterval(this.ping);
      this.ping = setInterval(() => { try { ws.send('ping'); } catch (_) { /* 閉じかけ */ } }, 30000);
    };
    ws.onmessage = (e) => {
      if (e.data === 'pong' || this.ws !== ws) return;
      let m;
      try { m = JSON.parse(e.data); } catch (_) { return; }
      this.onMessage(m);
    };
    ws.onclose = () => {
      clearInterval(this.ping);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.left || this.gotErr) return;
      // 電波が切れたなど：つなぎ直す（作るときに切れたら、次からは入る側として）
      this.create = false;
      this.h.drop?.();
      this.again();
    };
  }

  again() {
    if (this.left) return;
    const wait = Math.min(15000, 1000 * 2 ** Math.min(this.retry++, 4));
    this.timer = setTimeout(() => this.dial(), wait);
  }

  onMessage(m) {
    switch (m.t) {
      case 'hello': {
        const back = !!this.you;
        this.you = m.you;
        this.retry = 0;
        this.h.hello?.(m.you, back, m.song || null, m.room || {});
        this.syncClock();
        break;
      }
      case 'state': this.h.state?.(m); break;
      case 'seeded': this.h.seeded?.(); break;
      case 'ops': {
        const mine = m.from === this.you?.id;
        if (mine) this.unacked = this.unacked.filter((u) => u.cid !== m.cid);
        this.h.ops?.(m, mine);
        break;
      }
      case 'sel': this.h.sel?.(m.id, m.uids || []); break;
      case 'members': this.h.members?.(m.members || []); break;
      case 'song': this.h.song?.(m.song || null); break;
      case 'sig': this.h.sig?.(m.from, m.data); break;
      case 'waiting': this.h.waiting?.(); break;
      case 'knock': this.h.knock?.(m.id, m.nick || ''); break;
      case 'room': this.h.room?.(m.room || {}); break;
      case 'play': this.h.play?.(m); break;
      case 'stop': this.h.stop?.(); break;
      case 'ask': this.h.ask?.(m.id, m.nick || '', m.kind); break;
      case 'grant': this.h.grant?.(m.kind, !!m.ok); break;
      case 'remix': this.h.remix?.(m.id, m.nick || ''); break;
      case 'time': {
        // 時計合わせ：行って帰ってくるのが一番速かったときの値を使う
        const now = Date.now();
        const rtt = now - m.c;
        if (rtt >= 0 && rtt < (this.bestRtt ?? Infinity)) { this.bestRtt = rtt; this.offset = m.s - (m.c + rtt / 2); }
        break;
      }
      case 'err': this.gotErr = true; this.h.err?.(m.code); break;
      default: break;
    }
  }

  send(obj) {
    if (!this.open) return false;
    try { this.ws.send(JSON.stringify(obj)); return true; } catch (_) { return false; }
  }

  // 変更を送る（多いときは分ける）。つながっていないときは、つなぎ直したあとで送る。分けた [{ cid, ops }] を返す
  sendOps(ops) {
    const out = [];
    for (let i = 0; i < ops.length; i += OPS_PER_MSG) {
      const part = { cid: ++this.cid, ops: ops.slice(i, i + OPS_PER_MSG) };
      this.unacked.push(part);
      this.send({ t: 'ops', cid: part.cid, ops: part.ops });
      out.push(part);
    }
    return out;
  }

  // つなぎ直したあと、届いたか分からない変更を送り直す（同じ変更を 2 回送っても結果は同じ）
  resend() {
    for (const u of this.unacked) this.send({ t: 'ops', cid: u.cid, ops: u.ops });
  }

  // 部屋を作った人が、最初のリミックスを送る
  seed(ops) {
    for (let i = 0; i < Math.max(1, ops.length); i += OPS_PER_MSG) {
      this.send({ t: 'seed', ops: ops.slice(i, i + OPS_PER_MSG), last: i + OPS_PER_MSG >= ops.length });
    }
  }

  // サーバーの時計（みんなで再生を同時に始めるため）。合わせる前は自分の時計
  serverNow() { return Date.now() + (this.offset || 0); }
  syncClock() {
    this.bestRtt = Infinity;
    for (let i = 0; i < 5; i++) setTimeout(() => this.send({ t: 'time', c: Date.now() }), i * 200);
  }

  // 部屋を作った人だけ：入れる・ことわる・外す・締める・一覧に出すゲーム・部屋の名前・みんなで再生
  admit(id) { this.send({ t: 'admit', id }); }
  deny(id) { this.send({ t: 'deny', id }); }
  kick(id) { this.send({ t: 'kick', id }); }
  lock(on) { this.send({ t: 'lock', on: !!on }); }
  info(icons) { this.send({ t: 'info', icons }); }
  title(title) { this.send({ t: 'title', title }); }
  grant(id, kind, ok) { this.send({ t: 'grant', id, kind, ok: !!ok }); }

  // 部屋を作った人だけができることを、部屋を作った人にお願いする
  ask(kind) { this.send({ t: 'ask', kind }); }

  // 部屋のリミックスを丸ごと入れ替える（多いときは分ける）
  replace(ops) {
    for (let i = 0; i < Math.max(1, ops.length); i += OPS_PER_MSG) {
      this.send({ t: 'replace', ops: ops.slice(i, i + OPS_PER_MSG), first: i === 0, last: i + OPS_PER_MSG >= ops.length });
    }
  }
  play(beat, at) { this.send({ t: 'play', beat, at }); }
  stop() { this.send({ t: 'stop' }); }

  // 端末どうしを直接つなぐための紹介を、相手に渡してもらう
  sendSig(to, data) { return this.send({ t: 'sig', to, data }); }

  leave() {
    this.left = true;
    clearTimeout(this.timer);
    clearInterval(this.ping);
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(1000, 'leave'); } catch (_) { /* もう閉じている */ }
  }
}
