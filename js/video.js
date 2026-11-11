// 動画の書き出し：再生開始位置から最後までを、プレゼンテーションモードと同じ見た目の動画にする。
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
function makeStage(deps, main, w, h) {
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
  v.scrollBeat = main.remix.playbackStart - (W * 0.3) / v.ppb;
  // 背景の画像は、縮めた絵の取り置きが今の画面とぶつからないように別の入れ物にする
  v.bgImage = main.bgImage?.img ? { img: main.bgImage.img, fit: main.bgImage.fit, alpha: main.bgImage.alpha } : null;
  v.metronome = false;
  v.playMode = false;
  return { cv, v, W, H, scale };
}

// 発音した瞬間にブロックを光らせるための一覧（再生と同じ作り）
function visualEvents(remix, fromSec, toSec) {
  return remix.buildSoundEvents()
    .filter((e) => e.ent && e.start >= fromSec - 1e-6 && e.start <= toSec)
    .map((e) => ({ t: e.start, ent: e.ent, leaf: e.leaf }));
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
  const toSec = remix.durationSec + 1.0;
  const audio = await deps.renderMix(fromSec, opts.sampleRate || 48000);
  const [w, h] = VIDEO_SIZES[opts.size] || VIDEO_SIZES[720];
  const st = makeStage(deps, main, w, h);
  const vis = visualEvents(remix, fromSec, toSec);
  let k = 0;
  // 時刻 t（秒）の絵を描く。光り方の時計は、本物の時計の代わりに t から作る（0 だと「光っていない」なので大きな数を足す）
  const renderAt = (t) => {
    const nowMs = 1e7 + t * 1000;
    while (k < vis.length && vis[k].t <= t) {
      const { ent, leaf } = vis[k++];
      if (!leaf || (leaf.beat >= ent.beat - 1e-6 && leaf.beat < ent.beat + ent.width + 1e-6)) ent.flashAt = nowMs;
      if (leaf) (ent.leafFlash ||= []).push({ ...leaf, at: nowMs });
    }
    const beat = remix.tempo.s2b(t);
    st.v.playhead = beat;
    st.v.follow(beat);
    st.v.draw(nowMs);
    drawOverlay(deps, st, remix, beat);
  };
  // 書き出しのあと、今の画面の光り方の記録を空にする（動画用の時計の値が残らないように）
  const cleanup = () => {
    for (const e of remix.entities) { e.flashAt = 0; e.leafFlash = []; }
  };
  return { remix, fromSec, toSec, audio, st, w, h, renderAt, cleanup };
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

    // 音
    const aenc = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (e) => { failure = e; } });
    aenc.configure(ainfo.config);
    const buf = P.audio;
    const sr = buf.sampleRate;
    const c0 = buf.getChannelData(0), c1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : c0;
    const STEP = 4096;
    for (let off = 0; off < buf.length; off += STEP) {
      if (signal?.aborted) throw abortError();
      if (failure) throw failure;
      const n = Math.min(STEP, buf.length - off);
      const data = new Float32Array(n * 2);
      data.set(c0.subarray(off, off + n), 0);
      data.set(c1.subarray(off, off + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round((off * 1e6) / sr), data });
      aenc.encode(ad);
      ad.close();
      while (aenc.encodeQueueSize > 16) await tick();
      if ((off / STEP) % 64 === 0) { onProgress?.(0.05 * (off / buf.length), 'audio'); await tick(); }
    }
    await aenc.flush();
    aenc.close();

    // 映像（1 コマずつ、決まった時刻の絵を描いて固める。2 秒ごとに区切りのコマ）
    const venc = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (e) => { failure = e; } });
    venc.configure(vcfg);
    const total = P.toSec - P.fromSec;
    const n = Math.max(1, Math.ceil(total * fps));
    const dur = Math.round(1e6 / fps);
    let lastShow = 0;
    for (let i = 0; i < n; i++) {
      if (signal?.aborted) throw abortError();
      if (failure) throw failure;
      P.renderAt(P.fromSec + i / fps);
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
    return { blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }), ext: 'mp4', seconds: total };
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
  P.renderAt(P.fromSec);
  const vstream = P.st.cv.captureStream(fps);
  const stream = new MediaStream([...vstream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: P.h >= 1080 ? 8_000_000 : 4_000_000, audioBitsPerSecond: 192_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => { rec.onstop = r; });
  const total = P.toSec - P.fromSec;
  let raf = 0, aborted = false;
  try {
    if (ctx.state !== 'running') await ctx.resume().catch(() => {});
    rec.start(1000);
    const t0 = ctx.currentTime + 0.15;
    src.start(t0);
    await new Promise((resolve) => {
      const step = () => {
        if (signal?.aborted) { aborted = true; resolve(); return; }
        const t = P.fromSec + Math.max(0, ctx.currentTime - t0);
        P.renderAt(t);
        onProgress?.(Math.min(1, (t - P.fromSec) / total), 'record');
        if (t >= P.toSec) { resolve(); return; }
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
  return { blob: new Blob(chunks, { type }), ext: type.includes('mp4') ? 'mp4' : 'webm', seconds: total };
}
