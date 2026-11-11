// 動画の書き出し：0 拍目から最後までを、プレゼンテーションモードと同じ見た目の動画にする。
// 最初の lead 秒（2 秒）は 0 拍目で止まった画面のまま音もなく、そのあと再生が始まる。
//  ・計算で作る（WebCodecs）：音は WAV と同じく計算で一気に作り、映像は 1 コマずつ決まった時刻の絵を描いて固める。
//    コマ落ちせず、たいてい再生するより速く終わる。mp4（H.264 + AAC）
//  ・録画で作る（MediaRecorder）：音を mp4 用に固める部品（AudioEncoder）がない端末（iOS 26 より前の iPhone など）では、
//    作った音を実際に流しながら、絵を描いて録る。再生と同じ時間がかかる
// 画面の部品（EditorView など）は app.js から受け取る（同じプログラムを 2 回読み込まないように）

const LOGICAL_H = 480; // スマホの横向きくらいの大きさで描いて、動画の大きさに拡大する
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const VIDEO_SIZES = { 720: [1280, 720], 1080: [1920, 1080] };

// 計算で作れるか（映像と音の両方を固める部品があるか）
export function canRenderFast() {
  return typeof VideoEncoder === 'function' && typeof AudioEncoder === 'function'
    && typeof VideoFrame === 'function' && typeof AudioData === 'function';
}
// 録画で作れるか
export function canRecord() {
  return typeof MediaRecorder === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

// 動画用の画面を作る。今の画面と同じ拡大率（見えている拍の数）・背景の画像で、文字は出さずアイコンだけ
function makeStage(deps, main, w, h, fromSec) {
  const scale = h / LOGICAL_H;
  const W = Math.round(w / scale), H = LOGICAL_H;
  const cv = document.createElement('canvas');
  const v = new deps.EditorView(cv, {
    iconsOnly: () => true,
    textureImage: main.h.textureImage,
    playalongLabel: main.h.playalongLabel,
  }, { W, H, scale });
  v.remix = main.remix;
  v.snap = main.snap;
  v.ppb = clamp(W / clamp(main.visibleBeats, 4, 64), 6, 600);
  v.scrollBeat = main.remix.tempo.s2b(fromSec) - (W * 0.3) / v.ppb;
  v.noFlags = true; // 動画は 0 拍目から始まるので、赤と緑の旗は出さない
  v.playheadInfo = true; // 再生位置の線の上に、テンポ・拍・時間
  // 背景の画像は、縮めた絵の取り置きが今の画面とぶつからないように別の入れ物にする
  v.bgImage = main.bgImage?.img ? { img: main.bgImage.img, fit: main.bgImage.fit, alpha: main.bgImage.alpha } : null;
  v.metronome = false;
  v.playMode = false;
  return { cv, v, W, H, scale };
}

// 今のゲーム（RHRE fresh の Remix.gameSections / getGameSection と同じ作り）。
// End Remix より前の、表示しないゲーム（特殊・カウントなど）以外のブロックを後ろから見て、同じゲームが続く所を 1 つの区間にする。
// ある拍のゲームは「その拍より前に始まった区間のうち一番あと」のもの（最後の区間はそのあともずっと続く）
function gameSections(remix, info) {
  const sorted = remix.entities.slice().sort((a, b) => a.beat - b.beat);
  const endIdx = sorted.findIndex((e) => e.type === 'endEntity');
  const before = endIdx >= 0 ? sorted.slice(0, endIdx) : sorted;
  const shown = before.filter((e) => e.game && info(e.game.id) && !info(e.game.id).noDisplay).reverse();
  const end = endIdx >= 0 ? sorted[endIdx].beat : Math.max(0, ...remix.entities.map((e) => e.beat + e.width));
  const out = [];
  let cur = null, curEnd = end;
  shown.forEach((e, i) => {
    if (e.game.id !== cur?.id) {
      const prevGame = cur;
      cur = e.game;
      if (prevGame) {
        const prev = shown[i - 1];
        out.push({ start: prev.beat, end: curEnd, game: prevGame });
        curEnd = prev.beat;
      }
    }
  });
  if (cur) out.push({ start: shown[shown.length - 1].beat, end: curEnd, game: shown[shown.length - 1].game });
  return out.sort((a, b) => a.start - b.start);
}
function sectionAt(sections, beat) {
  let found = null;
  for (const s of sections) { if (s.start < beat) found = s; else break; }
  return found;
}

// 発音した瞬間にブロックを光らせるための一覧（再生と同じ作り）
function visualEvents(remix, fromSec, toSec) {
  return remix.buildSoundEvents()
    .filter((e) => e.ent && e.start >= fromSec - 1e-6 && e.start <= toSec)
    .map((e) => ({ t: e.start, ent: e.ent, leaf: e.leaf }));
}

// 左上の今のゲーム（RHRE fresh の GameDisplayStage と同じく、アイコンとゲームの名前。名前は白に黒いふち）
function drawGameDisplay(deps, st, sec, icons) {
  if (!sec) return;
  const g = st.v.ctx;
  const size = 28, x = 8, y = 8;
  const icon = icons.get(sec.game.icon);
  if (icon) {
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(icon, x, y, size, size);
    g.restore();
  }
  const name = deps.gameInfo(sec.game.id)?.name || sec.game.name;
  const fs = 17;
  const tx = x + size * 1.25;
  // 再生位置の文字とぶつからないように、入りきらない名前は横に縮める（RHRE fresh の drawCompressed と同じ考え）
  const maxW = Math.max(60, st.v.W * 0.3 - 10 - tx);
  g.save();
  g.font = `700 ${fs}px ${deps.FONT}`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = 3.5;
  g.strokeStyle = 'rgba(0,0,0,0.9)';
  g.fillStyle = '#ffffff';
  const w = g.measureText(name).width;
  const sx = w > maxW ? maxW / w : 1;
  g.translate(tx, y + size / 2);
  g.scale(sx, 1);
  g.strokeText(name, 0, 0);
  g.fillText(name, 0, 0);
  g.restore();
}

// 右下に小さく灰色で「RHRE Web v…」（RHRE Web で作った印）
function drawSignature(deps, st) {
  const g = st.v.ctx;
  g.save();
  g.setTransform(st.scale, 0, 0, st.scale, 0, 0);
  g.font = `700 12px ${deps.FONT}`;
  g.textAlign = 'right';
  g.textBaseline = 'bottom';
  g.fillStyle = 'rgba(160,160,160,0.8)';
  g.fillText(`RHRE Web v${deps.version || ''}`, st.W - 8, st.H - 6);
  g.restore();
}

// 字幕と「特殊」の画像を、画面の中央下に（再生中の画面と同じ並び・大きさ）
function drawOverlay(deps, st, remix, beat) {
  const g = st.v.ctx;
  const { W, H } = st;
  g.setTransform(st.scale, 0, 0, st.scale, 0, 0);
  const subs = remix.subtitles.filter((s) => beat >= s.beat && beat < s.beat + s.width);
  const text = subs.map((s) => String(s.subtitle ?? '')).join('\n').trim();
  let tex = null;
  for (const e of remix.entities) {
    if (e.type === 'textureEntity' && e.extra?.texHash && beat >= e.beat && beat < e.beat + e.width) {
      if (!tex || e.beat >= tex.beat) tex = e;
    }
  }
  const img = tex ? deps.textureImage(tex) : null;
  let bottom = H - 10;
  // 字幕：黒い半透明の帯に白い太字（幅は画面の 92% の 95% まで、はみ出す行は折り返す）
  if (text) {
    const fs = 18, lh = 24, padX = 14, padY = 4;
    g.font = `700 ${fs}px ${deps.FONT}`;
    const maxW = W * 0.92 * 0.95 - padX * 2;
    const lines = [];
    for (const para of text.split('\n')) {
      let cur = '';
      for (const ch of [...para]) {
        if (cur && g.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
      }
      lines.push(cur);
    }
    const bw = Math.min(W * 0.92 * 0.95, Math.max(...lines.map((l) => g.measureText(l).width)) + padX * 2);
    const bh = lines.length * lh + padY * 2;
    const x = (W - bw) / 2, y = bottom - bh;
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.beginPath();
    if (g.roundRect) g.roundRect(x, y, bw, bh, 6); else g.rect(x, y, bw, bh);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, W / 2, y + padY + lh * (i + 0.5)));
    bottom = y - 6;
  }
  // 画像：縦横比はそのまま、横は画面の半分・縦は 4 割まで（小さい画像はそこまで拡大。ドット絵はぼかさない）
  if (img) {
    const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
    if (nw && nh) {
      const s = Math.min((W * 0.5) / nw, (H * 0.4) / nh);
      const dw = nw * s, dh = nh * s;
      g.save();
      g.imageSmoothingEnabled = s < 2;
      g.shadowColor = 'rgba(0,0,0,0.5)';
      g.shadowBlur = 6;
      g.shadowOffsetY = 2;
      g.drawImage(img, (W - dw) / 2, bottom - dh, dw, dh);
      g.restore();
    }
  }
}

// 書き出しの準備：音を計算で作り、動画用の画面を用意する
async function prepare(deps, main, opts) {
  const remix = main.remix;
  const fromSec = opts.fromSec;
  const toSec = deps.mixEndSec(remix); // End Remix があればそこで終わる（音と同じ）
  const audio = await deps.renderMix(fromSec, opts.sampleRate || 48000);
  const [w, h] = VIDEO_SIZES[opts.size] || VIDEO_SIZES[720];
  const st = makeStage(deps, main, w, h, fromSec);
  const vis = visualEvents(remix, fromSec, toSec);
  // アイコンは最初のコマから出るように、全部読み終わってから描き始める
  const iconUrls = [...new Set(remix.entities.filter((e) => e.game?.icon && e.type !== 'playalongEntity').map((e) => e.game.icon))];
  const icons = new Map();
  await Promise.all(iconUrls.map(async (u) => { const img = await deps.loadIcon(u); if (img) icons.set(u, img); }));
  const sections = gameSections(remix, deps.gameInfo);
  const lead = opts.lead ?? 0;
  let k = 0;
  // 動画の時刻 vt（秒）の絵を描く。最初の lead 秒は 0 拍目で止まったまま（光らせない）。
  // 光り方の時計は、本物の時計の代わりに vt から作る（0 だと「光っていない」なので大きな数を足す）
  const renderAt = (vt) => {
    const nowMs = 1e7 + vt * 1000;
    const live = vt >= lead;
    const t = fromSec + Math.max(0, vt - lead);
    while (live && k < vis.length && vis[k].t <= t) {
      const { ent, leaf } = vis[k++];
      if (!leaf || (leaf.beat >= ent.beat - 1e-6 && leaf.beat < ent.beat + ent.width + 1e-6)) ent.flashAt = nowMs;
      if (leaf) (ent.leafFlash ||= []).push({ ...leaf, at: nowMs });
    }
    const beat = remix.tempo.s2b(t);
    st.v.playhead = beat;
    st.v.follow(beat);
    st.v.draw(nowMs);
    drawOverlay(deps, st, remix, beat);
    // 今のゲームは、再生が始まってから（最初に待っている間は出さない。RHRE fresh も止まっているときは出さない）
    if (live) drawGameDisplay(deps, st, sectionAt(sections, beat), icons);
    drawSignature(deps, st);
  };
  // 書き出しのあと、今の画面の光り方の記録を空にする（動画用の時計の値が残らないように）
  const cleanup = () => {
    for (const e of remix.entities) { e.flashAt = 0; e.leafFlash = []; }
  };
  // 動画の長さ：待つ時間 ＋ 0 拍目から最後まで
  return { remix, fromSec, toSec, lead, length: lead + (toSec - fromSec), audio, st, w, h, renderAt, cleanup };
}

// H.264 の設定を選ぶ（大きさとなめらかさに合うレベル。High → Main → Baseline の順に試す）
async function pickVideoConfig(w, h, fps) {
  const level = h >= 1080 ? (fps > 30 ? '2a' : '28') : (fps > 30 ? '20' : '1f');
  const bitrate = h >= 1080 ? 8_000_000 : 4_000_000;
  for (const prof of ['6400', '4d00', '4200']) {
    for (const hw of ['prefer-hardware', 'no-preference']) {
      const cfg = { codec: `avc1.${prof}${level}`, width: w, height: h, bitrate, framerate: fps, hardwareAcceleration: hw, avc: { format: 'avc' } };
      try {
        const r = await VideoEncoder.isConfigSupported(cfg);
        if (r.supported) return r.config;
      } catch (_) { /* 次を試す */ }
    }
  }
  return null;
}

async function pickAudioConfig(sampleRate) {
  for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {
    const cfg = { codec, sampleRate, numberOfChannels: 2, bitrate: 192_000 };
    try {
      const r = await AudioEncoder.isConfigSupported(cfg);
      if (r.supported) return { config: r.config, mux };
    } catch (_) { /* 次を試す */ }
  }
  return null;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
function abortError() { const e = new Error('aborted'); e.name = 'AbortError'; return e; }

// 計算で作る：音 → 映像の順に固めて、mp4 にまとめる
export async function renderVideoFast(deps, main, opts, onProgress, signal) {
  const fps = opts.fps || 30;
  const P = await prepare(deps, main, { ...opts, sampleRate: 48000 });
  opts.host?.replaceChildren(P.st.cv); // 進み具合が見えるように、描いている絵をそのまま小さく見せる
  const { Muxer, ArrayBufferTarget } = await import('./vendor/mp4-muxer.mjs');
  try {
    const vcfg = await pickVideoConfig(P.w, P.h, fps);
    if (!vcfg) throw new Error('この端末では、この大きさの動画（H.264）を作れません');
    let ainfo = await pickAudioConfig(P.audio.sampleRate);
    if (!ainfo) throw new Error('この端末では、動画の音（AAC）を作れません');
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: 'avc', width: P.w, height: P.h, frameRate: fps },
      audio: { codec: ainfo.mux, numberOfChannels: 2, sampleRate: P.audio.sampleRate },
      fastStart: 'in-memory',
      firstTimestampBehavior: 'offset',
    });
    let failure = null;
    const diag = { method: 'fast', video: vcfg.codec, audio: ainfo.config.codec, sampleRate: P.audio.sampleRate, audioChunks: 0, audioDesc: false };

    // 音
    // iPhone（Safari）の AAC は、区切りの長さ（duration）が付いてこないことがある。そのまま渡すと mp4 にまとめる部品が
    // 例外を出して、その音を黙って捨ててしまう（＝音のない動画になる）。長さは自分で入れて、まとめるときの失敗も拾う。
    // AAC の「読み方の情報」（description）も端末ごとに形が違うことがあるので使わず、部品が作る AAC-LC の標準のものにする
    const isAac = ainfo.mux === 'aac';
    const aDur = isAac ? (1024 * 1e6) / P.audio.sampleRate : 20000;
    let aShift = null; // 最初の区切りの時刻がマイナス（AAC の頭の準備分）のときにずらす量
    const aenc = new AudioEncoder({
      output: (chunk, meta) => {
        try {
          diag.audioChunks++;
          if (meta?.decoderConfig?.description) diag.audioDesc = true;
          if (chunk.duration == null) diag.noDuration = true;
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          if (aShift === null) aShift = Math.max(0, -chunk.timestamp);
          const ts = Math.max(0, chunk.timestamp + aShift);
          const dur = chunk.duration ?? aDur;
          let m = meta;
          if (isAac && meta?.decoderConfig) {
            const { description, ...rest } = meta.decoderConfig; // description は使わない
            m = { ...meta, decoderConfig: rest };
          }
          muxer.addAudioChunkRaw(data, chunk.type, ts, dur, m);
          diag.audioAdded = (diag.audioAdded || 0) + 1;
        } catch (e) { failure ||= e; }
      },
      error: (e) => { failure = e; },
    });
    aenc.configure(ainfo.config);
    const buf = P.audio;
    const sr = buf.sampleRate;
    const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    const STEP = 4096;
    const pad = Math.round(P.lead * sr); // 最初に待つ分は無音
    const totalFrames = pad + buf.length;
    for (let off = 0; off < totalFrames; off += STEP) {
      if (signal?.aborted) throw abortError();
      if (failure) throw failure;
      const n = Math.min(STEP, totalFrames - off);
      const data = new Float32Array(n * 2);
      // この区切りのうち、音のある所だけ写す（無音の所は 0 のまま）
      const from = Math.max(off, pad), to = off + n;
      if (to > from) {
        data.set(c0.subarray(from - pad, to - pad), from - off);
        data.set(c1.subarray(from - pad, to - pad), n + (from - off));
      }
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off * 1e6) / sr), data });
      aenc.encode(ad);
      ad.close();
      while (aenc.encodeQueueSize > 16) await tick();
      if ((off / STEP) % 64 === 0) { onProgress?.(0.05 * (off / totalFrames), 'audio'); await tick(); }
    }
    await aenc.flush();
    aenc.close();

    // 映像（1 コマずつ、決まった時刻の絵を描いて固める。2 秒ごとに区切りのコマ）
    const dur = Math.round(1e6 / fps);
    // 映像も同じく、長さが付いてこない端末のために自分で入れて、まとめるときの失敗を拾う
    const venc = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          muxer.addVideoChunkRaw(data, chunk.type, chunk.timestamp, chunk.duration ?? dur, meta);
          diag.videoAdded = (diag.videoAdded || 0) + 1;
        } catch (e) { failure ||= e; }
      },
      error: (e) => { failure = e; },
    });
    venc.configure(vcfg);
    const total = P.length;
    const n = Math.max(1, Math.ceil(total * fps));
    let lastShow = 0;
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw abortError();
      if (failure) throw failure;
      P.renderAt(i / fps);
      const frame = new VideoFrame(P.st.cv, { timestamp: Math.round((i * 1e6) / fps), duration: dur });
      venc.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      while (venc.encodeQueueSize > 8) await tick();
      const now = performance.now();
      if (now - lastShow > 120) { lastShow = now; onProgress?.(0.05 + 0.93 * (i / n), 'video', P.st.cv); await tick(); }
    }
    await venc.flush();
    venc.close();
    if (failure) throw failure;
    muxer.finalize();
    onProgress?.(1, 'done', P.st.cv);
    if (!diag.audioAdded) throw new Error('音を動画用に固められませんでした（この端末の音の部品が何も返しませんでした）');
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', seconds: total, diag };
  } finally {
    P.cleanup();
  }
}

// 録画で作る：作った音を実際に流しながら、時刻に合わせて絵を描いて録る
export async function recordVideoRealtime(deps, main, opts, onProgress, signal) {
  const fps = opts.fps || 30;
  const ctx = deps.audioContext();
  const P = await prepare(deps, main, { ...opts, sampleRate: ctx.sampleRate });
  const types = ['video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  const mime = types.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (_) { return false; } }) || '';
  const dest = ctx.createMediaStreamDestination();
  const src = ctx.createBufferSource();
  src.buffer = P.audio;
  src.connect(dest);
  src.connect(ctx.destination); // 録りながら聞こえるように
  // 絵は画面に置いたキャンバスに描く（端末によっては、画面に無いキャンバスは録れないため）
  opts.host?.replaceChildren(P.st.cv);
  P.renderAt(0);
  const vstream = P.st.cv.captureStream(fps);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: P.h >= 1080 ? 8_000_000 : 4_000_000, audioBitsPerSecond: 192_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  const total = P.length;
  let raf = 0, aborted = false;
  try {
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    rec.start(1000);
    const t0 = ctx.currentTime + 0.15;
    src.start(t0 + P.lead); // 最初に待つ分だけ遅らせて流す
    await new Promise((resolve) => {
      const step = () => {
        if (signal?.aborted) { aborted = true; resolve(); return; }
        const vt = Math.max(0, ctx.currentTime - t0);
        P.renderAt(vt);
        onProgress?.(Math.min(1, vt / total), 'record');
        if (vt >= total) { resolve(); return; }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
  } finally {
    cancelAnimationFrame(raf);
    try { src.stop(); } catch (_) { /* 済み */ }
    try { src.disconnect(); dest.disconnect(); } catch (_) { /* 済み */ }
    if (rec.state !== 'inactive') rec.stop();
    await stopped;
    for (const tr of stream.getTracks()) tr.stop();
    P.cleanup();
  }
  if (aborted) throw abortError();
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', seconds: total, diag: { method: 'record', mime: rec.mimeType || mime } };
}
