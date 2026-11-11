// 曲のテンポを自動で見つける。
//  1. 音の立ち上がり（オンセット）の強さを、短い区切りごとに出す（スペクトルの増え方）
//  2. 立ち上がりのくり返しの間隔（自己相関）から、曲全体と場所ごとのテンポを見つける
//  3. そのテンポに沿って拍を 1 つずつ探す（動的計画法の拍トラッキング）
//  4. 拍の間隔から場所ごとのテンポを出して、「一定の所」「急に変わる所」「だんだん変わる所」に分ける
// テンポは整数に丸める（打ち込みの曲はほぼ一定なので、細かい小数は使わない）
// ブラウザの部品は使わないので、Node でも試せる（AudioBuffer と同じ形 { sampleRate, length, numberOfChannels, getChannelData } を受け取る）

const TARGET_FS = 11025; // ここまで下げてから調べる
const N = 512; // FFT の長さ
const H = 128; // 区切りの間隔（約 86 コマ／秒）
const BPM_MIN = 50, BPM_MAX = 220;

// ---------------------------------------------------------------- 下ごしらえ

function monoDown(buf) {
  const d = Math.max(1, Math.round(buf.sampleRate / TARGET_FS));
  const fs = buf.sampleRate / d;
  const chans = [];
  for (let c = 0; c < buf.numberOfChannels; c++) chans.push(buf.getChannelData(c));
  const n = Math.floor(buf.length / d);
  const out = new Float32Array(n);
  const k = 1 / (d * chans.length);
  for (let i = 0; i < n; i++) {
    let s = 0;
    const o = i * d;
    for (const ch of chans) for (let j = 0; j < d; j++) s += ch[o + j];
    out[i] = s * k;
  }
  return { x: out, fs };
}

// 実数の FFT（長さ N の複素 FFT を使う）。大きさだけ返す
function makeFft(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = Math.sin((2 * Math.PI * i) / n); }
  const re = new Float64Array(n), im = new Float64Array(n);
  return (input, mag) => {
    for (let i = 0; i < n; i++) { re[rev[i]] = input[i]; im[rev[i]] = 0; }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cos[k] + im[b] * sin[k];
          const ti = -re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti;
          re[a] += tr; im[a] += ti;
        }
      }
    }
    for (let i = 0; i <= n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  };
}

// 立ち上がりの強さ（対数で縮めたスペクトルの増えた分の合計）。平均を引いて、ばらつきを 1 にそろえる
function onsetEnvelope(x, fs) {
  const frames = Math.max(0, Math.floor((x.length - N) / H) + 1);
  const env = new Float32Array(frames);
  if (!frames) return env;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const fft = makeFft(N);
  const buf = new Float64Array(N);
  const mag = new Float64Array(N / 2 + 1);
  let prev = new Float64Array(N / 2 + 1), cur = new Float64Array(N / 2 + 1);
  const lo = Math.max(1, Math.floor((30 * N) / fs));
  for (let f = 0; f < frames; f++) {
    const o = f * H;
    for (let i = 0; i < N; i++) buf[i] = x[o + i] * win[i];
    fft(buf, mag);
    let s = 0;
    for (let k = lo; k <= N / 2; k++) {
      cur[k] = Math.log1p(100 * mag[k]);
      if (f > 0) { const d = cur[k] - prev[k]; if (d > 0) s += d; }
    }
    env[f] = s;
    [prev, cur] = [cur, prev];
  }
  // 0.4 秒の移動平均を引いて、0 より下は 0 に
  const fps = fs / H;
  const r = Math.max(1, Math.round(0.2 * fps));
  const out = new Float32Array(frames);
  let acc = 0;
  const pre = new Float64Array(frames + 1);
  for (let i = 0; i < frames; i++) { acc += env[i]; pre[i + 1] = acc; }
  let sum = 0, sq = 0;
  for (let i = 0; i < frames; i++) {
    const a = Math.max(0, i - r), b = Math.min(frames, i + r + 1);
    const v = Math.max(0, env[i] - (pre[b] - pre[a]) / (b - a));
    out[i] = v;
    sum += v; sq += v * v;
  }
  const mean = sum / frames, sd = Math.sqrt(Math.max(1e-12, sq / frames - mean * mean));
  for (let i = 0; i < frames; i++) out[i] /= sd;
  return out;
}

// ---------------------------------------------------------------- テンポの候補

// 区間 [a, b) の自己相関（ずらし L は小数でもよい：となりの値から直線でつなぐ）
function autocorr(o, a, b, Lmax) {
  const r = new Float64Array(Lmax + 2);
  for (let L = 0; L <= Lmax + 1; L++) {
    let s = 0;
    const end = b - L;
    for (let t = a; t < end; t++) s += o[t] * o[t + L];
    r[L] = end > a ? s / (end - a) : 0;
  }
  return r;
}
const at = (r, L) => {
  if (L < 0 || L >= r.length - 1) return 0;
  const i = Math.floor(L), f = L - i;
  return r[i] * (1 - f) + r[i + 1] * f;
};

// テンポ B の点数：その間隔と 2・3・4 倍の間隔でくり返しているほど高い（倍のテンポにだまされにくくする）
function tempoScore(r, fps, B) {
  const L = (60 * fps) / B;
  return at(r, L) + 0.5 * at(r, 2 * L) + 0.33 * at(r, 3 * L) + 0.25 * at(r, 4 * L);
}
// 150 前後を少しだけ選びやすくする（とても遅い・速いテンポを避ける）。
// リズム天国の曲は速めが多く、RHRE_BGM の 5 曲（117〜182）で倍・半分を間違えなかった中心と幅
const prior = (B) => Math.exp(-0.5 * (Math.log2(B / 150) / 0.8) ** 2);

const GRID = [];
for (let B = BPM_MIN; B <= BPM_MAX + 1e-9; B += 0.25) GRID.push(B);

// 曲全体のテンポと、8 秒ごと（1 秒ずつずらす）の場所ごとのテンポ
function tempogram(o, fps) {
  const W = Math.round(8 * fps), hop = Math.round(1 * fps);
  const Lmax = Math.ceil(((60 * fps) / BPM_MIN) * 4) + 2;
  const wins = [];
  for (let a = 0; a + Math.min(W, o.length) <= o.length; a += hop) {
    const b = Math.min(o.length, a + W);
    let energy = 0;
    for (let t = a; t < b; t++) energy += o[t];
    const r = autocorr(o, a, b, Math.min(Lmax, b - a - 2));
    const r0 = r[0] || 1;
    const scores = GRID.map((B) => tempoScore(r, fps, B) / r0);
    wins.push({ center: (a + b) / 2, energy: energy / (b - a), scores });
    if (b === o.length) break;
  }
  return wins;
}

function pickGlobal(wins) {
  const maxE = Math.max(1e-9, ...wins.map((w) => w.energy));
  const sum = new Float64Array(GRID.length);
  for (const w of wins) {
    if (w.energy < maxE * 0.1) continue; // ほとんど音のない所は数えない
    w.scores.forEach((s, i) => { sum[i] += s; });
  }
  let best = 0;
  for (let i = 1; i < GRID.length; i++) if (sum[i] * prior(GRID[i]) > sum[best] * prior(GRID[best])) best = i;
  return GRID[best];
}

// 場所ごとのテンポ：8 秒ごとの点数から、なめらかにつながる道筋を選ぶ（ビタビ）。
// テンポが跳ぶ（急に変わる・倍や半分になる）と点が引かれるので、しばらく続けてその方が合うときだけ跳ぶ
function localTempos(wins, global) {
  const step = 2; // GRID の 2 つおき（0.5 BPM ごと）で調べる
  const idx = [];
  for (let i = 0; i < GRID.length; i += step) idx.push(i);
  const S = idx.length;
  const lg = idx.map((i) => Math.log2(GRID[i]));
  const JUMP = 2.0; // テンポが 2 倍に跳ぶときに引く点
  const em = (w) => idx.map((i, k) => Math.log(Math.max(1e-3, w.scores[i])) + Math.log(prior(GRID[i])) * 0.5 - 0.3 * Math.abs(lg[k] - Math.log2(global)));
  let score = em(wins[0]);
  const back = [];
  for (let t = 1; t < wins.length; t++) {
    const e = em(wins[t]);
    const next = new Float64Array(S), arg = new Int32Array(S);
    for (let k = 0; k < S; k++) {
      let best = -Infinity, bi = 0;
      for (let j = 0; j < S; j++) {
        const v = score[j] - JUMP * Math.abs(lg[k] - lg[j]);
        if (v > best) { best = v; bi = j; }
      }
      next[k] = best + e[k];
      arg[k] = bi;
    }
    back.push(arg);
    score = next;
  }
  let k = 0;
  for (let j = 1; j < S; j++) if (score[j] > score[k]) k = j;
  const path = new Array(wins.length);
  for (let t = wins.length - 1; t >= 0; t--) { path[t] = k; if (t > 0) k = back[t - 1][k]; }
  return wins.map((w, t) => ({ center: w.center, bpm: GRID[idx[path[t]]] }));
}

// ---------------------------------------------------------------- 拍を探す（Ellis の動的計画法。間隔は場所ごとのテンポに合わせる）

function trackBeats(o, fps, locals, global) {
  const n = o.length;
  if (!n) return [];
  // コマごとの拍の間隔（コマ数）
  const period = new Float64Array(n);
  let j = 0;
  for (let t = 0; t < n; t++) {
    while (j + 1 < locals.length && locals[j + 1].center <= t) j++;
    let B = locals.length ? locals[j].bpm : global;
    if (j + 1 < locals.length && locals[j].center <= t) {
      const a = locals[j], b = locals[j + 1];
      const f = (t - a.center) / Math.max(1, b.center - a.center);
      B = a.bpm + (b.bpm - a.bpm) * Math.min(1, Math.max(0, f));
    }
    period[t] = (60 * fps) / B;
  }
  const alpha = 100; // 間隔のずれにどれだけ厳しいか
  const C = new Float64Array(n), back = new Int32Array(n).fill(-1);
  for (let t = 0; t < n; t++) {
    const P = period[t];
    const lo = Math.max(0, Math.floor(t - 2 * P)), hi = Math.floor(t - P / 2);
    let best = 0, arg = -1;
    for (let u = lo; u <= hi; u++) {
      const lr = Math.log((t - u) / P);
      const v = C[u] - alpha * lr * lr;
      if (arg < 0 || v > best) { best = v; arg = u; }
    }
    C[t] = o[t] + (arg >= 0 ? Math.max(0, best) : 0);
    back[t] = arg >= 0 && best > 0 ? arg : -1;
  }
  // 最後の 1 拍分の中で点数がいちばん高い所から、さかのぼる
  const P = period[n - 1];
  let end = n - 1;
  for (let t = Math.max(0, Math.floor(n - P)); t < n; t++) if (C[t] > C[end]) end = t;
  const beats = [];
  for (let t = end; t >= 0; t = back[t]) { beats.push(t); if (back[t] < 0) break; }
  return beats.reverse();
}

// ---------------------------------------------------------------- 拍からテンポの変化へ

// 拍 i のまわり（前後 half 拍）の間隔を直線で合わせた、その場所のテンポ
function localBpmAt(times, i, half) {
  const a = Math.max(0, i - half), b = Math.min(times.length - 1, i + half);
  return fitBpm(times, a, b);
}
// 拍 a〜b の時刻を、拍の番号に対する直線で合わせたときのテンポ
function fitBpm(times, a, b) {
  const n = b - a + 1;
  if (n < 2) return 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = a; i <= b; i++) { const x = i - a, y = times[i]; sx += x; sy += y; sxx += x * x; sxy += x * y; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  return slope > 0 ? 60 / slope : 0;
}
function median(arr) {
  const s = [...arr].sort((x, y) => x - y);
  return s.length ? s[s.length >> 1] : 0;
}

// テンポがほぼ一定の所（12 拍以上）を見つけて、その間を「急に変わる」か「だんだん変わる」かに分ける
function segment(times) {
  const n = times.length;
  if (n < 8) return null;
  const loc = times.map((_, i) => localBpmAt(times, i, 4));
  const sm = loc.map((_, i) => median(loc.slice(Math.max(0, i - 4), i + 5)));
  const MIN_RUN = 12, TOL = 1.2;
  const runs = [];
  let s = 0;
  while (s < n) {
    let lo = sm[s], hi = sm[s], e = s;
    while (e + 1 < n) {
      const v = sm[e + 1];
      if (Math.max(hi, v) - Math.min(lo, v) > 2 * TOL) break;
      lo = Math.min(lo, v); hi = Math.max(hi, v); e++;
    }
    if (e - s + 1 >= MIN_RUN) runs.push({ start: s, end: e });
    s = e + 1;
  }
  if (!runs.length) return { bpm: Math.round(fitBpm(times, 0, n - 1)), changes: [] };
  for (const r of runs) r.bpm = Math.round(fitBpm(times, r.start, r.end));
  // 同じテンポ（丸めた差が 1 以内。測り方のぶれ）のとなり合う所はまとめる
  const merged = [runs[0]];
  for (const r of runs.slice(1)) {
    const last = merged[merged.length - 1];
    if (Math.abs(r.bpm - last.bpm) <= 1) { last.end = r.end; last.bpm = Math.round(fitBpm(times, last.start, last.end)); }
    else merged.push(r);
  }
  const changes = [];
  const ibi = (i) => times[i + 1] - times[i];
  for (let k = 1; k < merged.length; k++) {
    const A = merged[k - 1], B = merged[k];
    if (A.bpm === B.bpm) continue;
    const gap = B.start - A.end;
    // 見る範囲：一定だった所の終わり 3 拍前〜次の一定の所の 3 拍あと
    const lo = Math.max(0, A.end - 3), hi = Math.min(n - 2, B.start + 3);
    // 段：どこか 1 か所で切り替わる
    const pa = 60 / A.bpm, pb = 60 / B.bpm;
    let stepK = B.start, stepErr = Infinity;
    for (let c = lo + 1; c <= hi; c++) {
      let err = 0;
      for (let i = lo; i <= hi; i++) { const d = ibi(i) - (i < c ? pa : pb); err += d * d; }
      if (err < stepErr) { stepErr = err; stepK = c; }
    }
    // 坂：拍 s から w 拍かけて、テンポが直線で変わる（いちばん合う s と w を探す）
    let rampErr = Infinity, rampS = A.end, rampW = gap;
    for (let s0 = lo; s0 <= hi - 2; s0++) {
      for (let w = 3; s0 + w <= hi + 1; w++) {
        let err = 0;
        for (let i = lo; i <= hi; i++) {
          const f = Math.min(1, Math.max(0, (i + 0.5 - s0) / w));
          const d = ibi(i) - 60 / (A.bpm + (B.bpm - A.bpm) * f);
          err += d * d;
        }
        if (err < rampErr) { rampErr = err; rampS = s0; rampW = w; }
      }
    }
    // 坂の方がはっきり合うとき（段より 3 割以上ずれが小さい）だけ、だんだん変える
    if (rampW >= 4 && rampErr < stepErr * 0.7) changes.push({ index: rampS, bpm: B.bpm, width: rampW });
    else changes.push({ index: stepK, bpm: B.bpm, width: 0 });
  }
  // 最後の一定の所のあと、だんだん遅く（速く）なって終わる曲
  const last = merged[merged.length - 1];
  const rest = n - 1 - last.end;
  if (rest >= 6) {
    // 終わりのテンポは、拍の間隔に「一定の所のテンポから直線で変わる坂」を当てはめて、いちばん合う値にする
    let endBpm = last.bpm, bestErr = Infinity;
    for (let E = 20; E <= 300; E++) {
      let err = 0;
      for (let i = last.end; i < n - 1; i++) {
        const f = (i + 0.5 - last.end) / rest;
        const d = ibi(i) - 60 / (last.bpm + (E - last.bpm) * f);
        err += d * d;
      }
      if (err < bestErr) { bestErr = err; endBpm = E; }
    }
    if (Math.abs(endBpm - last.bpm) >= 3) changes.push({ index: last.end, bpm: endBpm, width: rest });
  }
  return { bpm: merged[0].bpm, changes };
}

// ---------------------------------------------------------------- まとめ

// 結果：{ bpm（最初のテンポ）, beats（拍の時刻・秒、曲の頭から）, changes: [{ time（秒）, index, bpm, width（拍） }] }
// 見つからないときは null
export function analyzeTempo(buf) {
  if (!buf || !buf.length) return null;
  const { x, fs } = monoDown(buf);
  const o = onsetEnvelope(x, fs);
  if (o.length < 64) return null;
  const fps = fs / H;
  const wins = tempogram(o, fps);
  if (!wins.length) return null;
  const global = pickGlobal(wins);
  const locals = localTempos(wins, global);
  let frames = trackBeats(o, fps, locals, global);
  // 曲の頭と終わりの、音のない所の拍は捨てる（拍探しは間隔に沿って続けてしまうため）
  let first = 0, last = o.length - 1;
  while (first < o.length && o[first] < 1) first++;
  while (last > 0 && o[last] < 1) last--;
  const slack = Math.round(0.25 * fps);
  frames = frames.filter((f) => f >= first - slack && f <= last + slack);
  const offset = N / 2 / fs; // 区切りの真ん中の時刻
  const times = frames.map((f) => (f * H) / fs + offset);
  const seg = segment(times);
  if (!seg || !(seg.bpm > 0)) return null;
  return {
    bpm: seg.bpm,
    globalBpm: global,
    beats: times,
    changes: seg.changes.map((c) => ({ ...c, time: times[c.index] })),
  };
}

// 試すとき用（Node から中を見る）
export const _internal = { monoDown, onsetEnvelope, tempogram, GRID, H };
