// Web Audio による再生・試聴・WAV書き出し。
// 発音は少し先まで予約していく方式（ルックアヘッド）なので、タイマーが多少遅れても音の時刻はずれない。

import { mapLimit } from './db.js?v=8';

const OGG_DECODER_URL = 'https://cdn.jsdelivr.net/npm/@wasm-audio-decoders/ogg-vorbis@0.1.20/dist/ogg-vorbis-decoder.min.js';
const LOOKAHEAD = 0.6; // 秒
const TICK_MS = 50;

function loadScript(src) {
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src;
    s.charset = 'UTF-8';
    s.onload = res;
    s.onerror = () => rej(new Error('音声デコーダを読み込めませんでした'));
    document.head.appendChild(s);
  });
}

const isOgg = (ab) => {
  const b = new Uint8Array(ab, 0, Math.min(4, ab.byteLength));
  return b[0] === 0x4f && b[1] === 0x67 && b[2] === 0x67 && b[3] === 0x53; // "OggS"
};

function decodeNative(ctx, ab) {
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(ab, res, rej);
    if (p && typeof p.then === 'function') p.then(res, rej);
  });
}

// 0.5秒の無音 WAV（古い iPhone を「メディア再生中」にしておくため、<audio> で流す）。
// 流しているあいだはロック画面に再生バーが出るので、新しい iPhone（audioSession がある）では使わない
function silentWavUrl() {
  const n = 4000;
  const dv = new DataView(new ArrayBuffer(44 + n * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 16000, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
  w(36, 'data'); dv.setUint32(40, n * 2, true);
  return URL.createObjectURL(new Blob([dv.buffer], { type: 'audio/wav' }));
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.decodeCtx = null;
    this.buffers = new Map();
    this.forceWasm = /[?&]wasm\b/.test(location.search);
    this.nativeOggFailed = false;
    this.usedWasm = false;
    this.stale = false;
    this.keepAlive = null;
    // 無音の <audio> は古い iPhone・iPad だけ（消音スイッチ対策）。iOS 17 以降は navigator.audioSession で足りる。
    // Android や PC では要らない（流すと通知に再生バーが出る）
    const appleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    this.useKeepAlive = appleMobile && !navigator.audioSession;
  }

  // 実際に鳴らす AudioContext。iPhone ではタップの中（unlock）で作るのが確実
  get context() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  // 読み込み時のデコード専用。音を出さないので、タップ前に作っても iPhone の再生に影響しない
  get decoder() {
    if (!this.decodeCtx) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      this.decodeCtx = OAC ? new OAC(2, 1, 48000) : this.context;
    }
    return this.decodeCtx;
  }

  get state() {
    return this.ctx ? this.ctx.state : 'none';
  }

  // タップの処理の中で（await より前に）呼ぶこと
  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) { /* 未対応 */ }
    this.startKeepAlive();
    // 止まったまま戻らない状態（ホーム画面アプリでよく起きる）なら作り直す
    if (this.ctx && (this.stale || this.ctx.state === 'closed' || this.ctx.state === 'interrupted')) {
      const old = this.ctx;
      this.ctx = null;
      try { old.close(); } catch (_) { /* 済み */ }
    }
    this.stale = false;
    const ctx = this.context;
    try {
      const b = ctx.createBuffer(1, 1, 22050);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.start(0);
    } catch (_) { /* 無視 */ }
    let p = null;
    try { p = ctx.resume(); } catch (_) { /* interrupted だと例外になることがある */ }
    return Promise.resolve(p).catch(() => {});
  }

  startKeepAlive() {
    if (!this.useKeepAlive) return;
    try {
      if (!this.keepAlive) {
        const a = new Audio();
        a.src = silentWavUrl();
        a.loop = true;
        a.setAttribute('playsinline', '');
        this.keepAlive = a;
      }
      clearTimeout(this.keepAliveTimer);
      const p = this.keepAlive.play();
      if (p && p.catch) p.catch(() => {});
    } catch (_) { /* 無視 */ }
  }

  stopKeepAlive() {
    clearTimeout(this.keepAliveTimer);
    this.keepAliveTimer = setTimeout(() => this.releaseKeepAlive(), 1500);
  }

  // 一時停止だけだとロック画面に再生バーが残るので、<audio> ごと片付ける
  releaseKeepAlive() {
    clearTimeout(this.keepAliveTimer);
    const a = this.keepAlive;
    this.keepAlive = null;
    if (a) {
      try {
        a.pause();
        const u = a.src;
        a.removeAttribute('src');
        a.load();
        if (u && u.startsWith('blob:')) URL.revokeObjectURL(u);
      } catch (_) { /* 無視 */ }
    }
    try {
      if (navigator.mediaSession) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; }
    } catch (_) { /* 未対応 */ }
  }

  async decode(ab) {
    const ogg = isOgg(ab);
    if (!ogg || (!this.forceWasm && !this.nativeOggFailed)) {
      try {
        return await decodeNative(this.decoder, ab.slice(0));
      } catch (e) {
        if (!ogg) throw e;
        this.nativeOggFailed = true; // 古い iOS は .ogg を読めない → WASM デコーダへ
      }
    }
    return this.decodeOggWasm(ab);
  }

  async decodeOggWasm(ab) {
    this.usedWasm = true;
    if (!this.wasm) {
      this.wasm = (async () => {
        await loadScript(OGG_DECODER_URL);
        const d = new window['ogg-vorbis-decoder'].OggVorbisDecoder();
        await d.ready;
        return d;
      })();
    }
    const dec = await this.wasm;
    const job = (this.wasmQueue || Promise.resolve()).then(async () => {
      const r = await dec.decodeFile(new Uint8Array(ab));
      await dec.reset();
      return r;
    });
    this.wasmQueue = job.catch(() => {});
    const r = await job;
    const len = Math.max(1, r.samplesDecoded);
    const buf = this.decoder.createBuffer(Math.max(1, r.channelData.length), len, r.sampleRate);
    r.channelData.forEach((ch, i) => buf.getChannelData(i).set(ch.subarray(0, len)));
    return buf;
  }

  async loadSounds(urls, db, onProgress) {
    const failed = [];
    let done = 0;
    await mapLimit(urls, 8, async (url) => {
      if (!this.buffers.has(url)) {
        try {
          this.buffers.set(url, await this.decode(await db.fetchBinary(url)));
        } catch (e) {
          failed.push(url);
        }
      }
      onProgress?.(++done, urls.length);
    });
    return failed;
  }
}

// 1つの発音イベントを予約する（リアルタイム／オフライン共通）
export function scheduleEvent(ctx, dest, buffers, ev, when, off, speed = 1) {
  const buf = buffers.get(ev.url);
  if (!buf) return null;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const pm = ev.speedPitch ? speed : 1;
  const rate = ev.rate * pm;
  let bufOff = (Math.max(0, off) / speed) * rate;
  if (ev.loop) {
    src.loop = true;
    const ls = Math.min(ev.loop.start, buf.duration);
    const le = ev.loop.end > 0 ? Math.min(ev.loop.end, buf.duration) : buf.duration;
    src.loopStart = ls;
    src.loopEnd = le;
    if (bufOff > le) bufOff = le - ls > 0 ? ls + ((bufOff - ls) % (le - ls)) : 0;
  } else if (bufOff >= buf.duration) {
    return null;
  }
  const span = Math.max(0, ev.end - ev.start - Math.max(0, off)) / speed;
  src.playbackRate.value = rate;
  if (ev.rateEnd != null && span > 0) {
    src.playbackRate.setValueAtTime(rate, when);
    src.playbackRate.linearRampToValueAtTime(ev.rateEnd * pm, when + span);
  }
  const g = ctx.createGain();
  g.gain.value = ev.vol;
  src.connect(g);
  g.connect(dest);
  src.start(when, bufOff);
  if (ev.stops) src.stop(when + span);
  src.onended = () => { try { g.disconnect(); } catch (_) { /* 済み */ } };
  return src;
}

function scheduleClick(ctx, dest, when, accent) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = accent ? 1760 : 1320;
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.35, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
  o.connect(g);
  g.connect(dest);
  o.start(when);
  o.stop(when + 0.06);
}

// RHRE fresh（libGDX＋JLayer）は mp3 の先頭にある情報フレーム（LAME タグ）と、エンコーダ・デコーダの空白を
// 取り除かずに読むので、ブラウザ（それらを取り除く）より少し遅れて鳴る。同じ .rhref で同じ聞こえ方にするため、
// その差（秒）を求めて、こちらでも音楽をその分だけ遅らせる。mp3 以外や、タグのない mp3 は差がない
export function rhreMusicLeadIn(bytes, buf) {
  try {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    // ogg・wav・flac・m4a は対象外
    const magic = String.fromCharCode(...b.subarray(0, 4));
    if (['OggS', 'RIFF', 'fLaC'].includes(magic) || String.fromCharCode(...b.subarray(4, 8)) === 'ftyp') return 0;
    let i = 0;
    if (magic.startsWith('ID3')) i = 10 + ((b[6] << 21) | (b[7] << 14) | (b[8] << 7) | b[9]);
    const i0 = i;
    const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
    const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
    const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
    let frames = 0, sr = 0, spf = 0, info = false, delay = null, pad = null, guard = 0;
    while (i + 4 <= b.length && guard++ < 2000000) {
      if (b[i] !== 0xFF || (b[i + 1] & 0xE0) !== 0xE0) { i++; continue; }
      const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3;
      const bri = b[i + 2] >> 4, sri = (b[i + 2] >> 2) & 3, padb = (b[i + 2] >> 1) & 1;
      if (layer !== 1 || bri === 0 || bri === 15 || sri === 3 || ver === 1) { i++; continue; }
      const rate = SR[ver][sri];
      const len = Math.floor(((ver === 3 ? 144 : 72) * (ver === 3 ? BR1 : BR2)[bri] * 1000) / rate) + padb;
      if (len < 24) { i++; continue; }
      if (!frames) {
        if (i - i0 > 4096) return 0; // 最初のフレームが見つからない：mp3 ではなさそう
        sr = rate; spf = ver === 3 ? 1152 : 576;
        const seg = b.subarray(i, Math.min(b.length, i + len));
        const str = String.fromCharCode(...seg.subarray(0, Math.min(seg.length, 200)));
        const k = Math.max(str.indexOf('Xing'), str.indexOf('Info'));
        if (k >= 0) {
          info = true;
          const lt = k + 120;
          const tag = String.fromCharCode(...seg.subarray(lt, lt + 4));
          if (['LAME', 'Lavf', 'Lavc', 'GOGO'].includes(tag) && seg.length >= lt + 24) {
            delay = (seg[lt + 21] << 4) | (seg[lt + 22] >> 4);
            pad = ((seg[lt + 22] & 0x0F) << 8) | seg[lt + 23];
          }
        }
      }
      frames++;
      i += len;
    }
    if (!frames || !info || !buf) return 0;
    // ブラウザがどこまで取り除いたかを、読み込んだ長さから見分ける
    const dec = (buf.length * sr) / buf.sampleRate;
    const cands = [
      { len: frames * spf, lead: 0 },                // 何も取り除いていない（RHRE fresh と同じ）
      { len: (frames - 1) * spf, lead: spf },        // 情報フレームだけ飛ばした
    ];
    if (delay != null) cands.push({ len: (frames - 1) * spf - delay - pad, lead: spf + delay + 529 }); // 空白も取り除いた
    cands.sort((x, y) => Math.abs(x.len - dec) - Math.abs(y.len - dec));
    return cands[0].lead / sr;
  } catch (_) {
    return 0;
  }
}

function scheduleMusic(ctx, dest, remix, musicBuf, ctxStart, fromSec, speed = 1) {
  if (!musicBuf) return null;
  const src = ctx.createBufferSource();
  src.buffer = musicBuf;
  src.playbackRate.value = speed;
  const g = ctx.createGain();
  g.gain.setValueAtTime(remix.musicVolumeAt(remix.tempo.s2b(fromSec)), ctxStart);
  for (const p of remix.musicVolumeAutomation()) {
    if (p.t <= fromSec) continue;
    const at = ctxStart + (p.t - fromSec) / speed;
    if (p.ramp) g.gain.linearRampToValueAtTime(p.v, at);
    else g.gain.setValueAtTime(p.v, at);
  }
  src.connect(g);
  g.connect(dest);
  // RHRE fresh と同じ聞こえ方にするための遅れ（mp3 のとき）
  const off = fromSec - (remix.musicStartSec + (musicBuf.rhreLeadIn || 0));
  if (off >= 0) {
    if (off >= musicBuf.duration) return null;
    src.start(ctxStart, off);
  } else {
    src.start(ctxStart - off / speed, 0);
  }
  return src;
}

export class Player {
  constructor(engine) {
    this.engine = engine;
    this.playing = false;
    this.metronome = false;
    this.visual = [];
    this.onEnd = null;
    this.speed = 1;
    this.speedSetting = 1;
  }

  get time() {
    if (!this.playing) return this.pausedAt ?? 0;
    return this.t0 + (this.engine.context.currentTime - this.ctxT0) * this.speed;
  }

  start(remix, musicBuf, fromSec) {
    this.stop();
    const ctx = this.engine.context;
    this.remix = remix;
    this.events = remix.buildSoundEvents();
    this.out = ctx.createGain();
    this.out.connect(this.engine.master);
    this.ctxT0 = ctx.currentTime + 0.08;
    this.t0 = fromSec;
    this.speed = Math.max(0.1, Number(this.speedSetting) || 1);
    // End Remix を置いていなければ、止めるまでずっと進む（デスクトップ版と同じ）
    this.endSec = remix.hasEndEntity ? remix.durationSec : Infinity;
    this.sources = [];
    this.visual = [];
    for (const ev of this.events) {
      if (ev.start < fromSec && ev.end > fromSec) {
        const s = scheduleEvent(ctx, this.out, this.engine.buffers, ev, this.ctxT0, fromSec - ev.start, this.speed);
        if (s) this.sources.push(s);
      }
    }
    let lo = 0, hi = this.events.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.events[m].start < fromSec) lo = m + 1; else hi = m; }
    this.idx = lo;
    this.metroBeat = Math.ceil(remix.tempo.s2b(fromSec) - 1e-6);
    const m = scheduleMusic(ctx, this.out, remix, musicBuf, this.ctxT0, fromSec, this.speed);
    if (m) this.sources.push(m);
    this.playing = true;
    this.pausedAt = null;
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  tick() {
    if (!this.playing) return;
    const ctx = this.engine.context;
    const now = this.time;
    const horizon = now + LOOKAHEAD * this.speed;
    const ev = this.events;
    while (this.idx < ev.length && ev[this.idx].start < horizon) {
      const e = ev[this.idx++];
      if (e.start > this.endSec) continue;
      const when = this.ctxT0 + (e.start - this.t0) / this.speed;
      const s = scheduleEvent(ctx, this.out, this.engine.buffers, e, when, 0, this.speed);
      if (s) this.sources.push(s);
      if (e.ent) this.visual.push({ t: e.start, ent: e.ent, leaf: e.leaf });
    }
    if (this.metronome) {
      const T = this.remix.tempo;
      while (T.b2s(this.metroBeat) < horizon) {
        const b = this.metroBeat++;
        const at = T.b2s(b);
        if (at < this.t0 - 1e-6) continue;
        const { beatInMeasure } = this.remix.measureAt(b);
        scheduleClick(ctx, this.out, this.ctxT0 + (at - this.t0) / this.speed, Math.abs(beatInMeasure) < 1e-6);
      }
    } else {
      this.metroBeat = Math.ceil(this.remix.tempo.s2b(horizon) - 1e-6);
    }
    if (this.sources.length > 400) this.sources = this.sources.slice(-200);
    if (now >= this.endSec + 0.05) {
      const cb = this.onEnd;
      this.stop();
      cb?.();
    }
  }

  // 発音した瞬間のエンティティを返す（画面の点滅用）
  takeVisual(now) {
    const hit = [];
    while (this.visual.length && this.visual[0].t <= now) hit.push(this.visual.shift());
    return hit;
  }

  stop() {
    if (!this.playing && !this.out) return;
    clearInterval(this.timer);
    const now = this.engine.ctx ? this.engine.ctx.currentTime : 0;
    if (this.out) {
      try {
        this.out.gain.setValueAtTime(this.out.gain.value, now);
        this.out.gain.linearRampToValueAtTime(0, now + 0.03);
      } catch (_) { /* 済み */ }
      const out = this.out;
      const srcs = this.sources || [];
      setTimeout(() => {
        for (const s of srcs) { try { s.stop(); } catch (_) { /* 済み */ } }
        try { out.disconnect(); } catch (_) { /* 済み */ }
      }, 60);
    }
    this.out = null;
    this.sources = [];
    this.playing = false;
  }

  pause() {
    const t = this.time;
    this.stop();
    this.pausedAt = t;
  }
}

// ピッカーの試聴（同時に1つだけ）
export class Previewer {
  constructor(engine) { this.engine = engine; this.out = null; }
  play(events) {
    this.stop();
    const ctx = this.engine.context;
    this.out = ctx.createGain();
    this.out.connect(this.engine.master);
    const t0 = ctx.currentTime + 0.05;
    for (const e of events) scheduleEvent(ctx, this.out, this.engine.buffers, e, t0 + e.start, 0);
  }
  stop() {
    if (this.out) { try { this.out.disconnect(); } catch (_) { /* 済み */ } }
    this.out = null;
  }
}

// 再生開始位置から最後までを WAV に書き出す
export async function renderWav(engine, remix, musicBuf, fromSec) {
  const sr = 44100;
  const toSec = remix.durationSec + 1.0;
  const length = Math.max(1, Math.ceil((toSec - fromSec) * sr));
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const octx = new OAC(2, length, sr);
  const events = remix.buildSoundEvents();
  for (const ev of events) {
    if (ev.start > remix.durationSec) continue;
    if (ev.start < fromSec) {
      if (ev.end > fromSec) scheduleEvent(octx, octx.destination, engine.buffers, ev, 0, fromSec - ev.start);
    } else {
      scheduleEvent(octx, octx.destination, engine.buffers, ev, ev.start - fromSec, 0);
    }
  }
  scheduleMusic(octx, octx.destination, remix, musicBuf, 0, fromSec);
  const rendered = await octx.startRendering();
  return encodeWav(rendered);
}

function encodeWav(buf) {
  const ch = Math.min(2, buf.numberOfChannels);
  const n = buf.length;
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2));
  const w = (o, s) => { for (let i = 0; i < s.length; i++) data.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); data.setUint32(4, 36 + n * ch * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, ch, true);
  data.setUint32(24, buf.sampleRate, true); data.setUint32(28, buf.sampleRate * ch * 2, true);
  data.setUint16(32, ch * 2, true); data.setUint16(34, 16, true);
  w(36, 'data'); data.setUint32(40, n * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c][i]));
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([data.buffer], { type: 'audio/wav' });
}

// 曲の頭の無音を飛ばして、音が鳴り始める位置（秒）を返す
export function detectOnset(buf) {
  const n = buf.length;
  const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
  let peak = 0;
  for (const d of chans) for (let i = 0; i < n; i += 8) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  if (peak <= 0) return 0;
  const thr = Math.max(0.003, peak * 0.03);
  for (let i = 0; i < n; i++) {
    for (const d of chans) {
      if (Math.abs(d[i]) > thr) return Math.max(0, i - Math.round(buf.sampleRate * 0.003)) / buf.sampleRate;
    }
  }
  return 0;
}
