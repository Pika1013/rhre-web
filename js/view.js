// エディタ画面（トラックとエンティティ）の描画とタッチ操作。見た目は RHRE fresh のデスクトップ版の配置に合わせている。

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';

export const C = {
  bg: '#242424',
  gridRGB: '156,199,238',
  grid: '#9cc7ee',
  beatNum: '#a8cbeb',
  timeSig: 'rgba(122, 162, 206, 0.85)',
  music: '#ff2a2a',
  playback: '#1fe01f',
  tempoTri: '#2b34b8',
  tempoText: '#5361ff',
  volText: '#ff9d2e',
  playhead: '#ffe14d',
  select: '#19f0ff',
  entity: {
    cue: '#d6d6d6',
    pattern: '#8fb3ff',
    keepTheBeat: '#ffc56e',
    equidistant: '#ff9393',
    randomCue: '#c7a2ff',
    multiCue: '#f4a8d8',
    pitchDependent: '#a3dcff',
    special: '#9b9b9b',
    playalongEntity: '#86dcb6',
    missing: '#ff4d4d',
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return `rgb(${r},${g},${b})`;
}

export function fmtTime(sec) {
  const neg = sec < 0;
  const s = Math.abs(sec);
  const m = Math.floor(s / 60);
  const r = s - m * 60;
  return `${neg ? '-' : ''}${String(m).padStart(2, '0')}:${r.toFixed(3).padStart(6, '0')}`;
}

// キャンバスに描く言葉（設定で英語にできる）
export const LABELS = { music: '音楽開始', playback: '再生開始', volume: '音量' };

// テーマ（色）。トラックまわりの色を入れ替える
const THEMES = {
  dark: { bg: '#242424', grid: '#9cc7ee', beatNum: '#a8cbeb', timeSig: 'rgba(122, 162, 206, 0.85)', tempoTri: '#2b34b8', tempoText: '#5361ff', gridRGB: '156,199,238' },
  black: { bg: '#000000', grid: '#7fb0de', beatNum: '#9cc2e6', timeSig: 'rgba(110, 150, 196, 0.8)', tempoTri: '#3a44d0', tempoText: '#7480ff', gridRGB: '127,176,222' },
  light: { bg: '#eef1f5', grid: '#5d84ad', beatNum: '#3c5f85', timeSig: 'rgba(70, 110, 160, 0.45)', tempoTri: '#2b34b8', tempoText: '#2b34b8', gridRGB: '93,132,173' },
};
// 名前（ダーク・ブラック・ライト）か、色の組 { bg, grid, gridRGB, beatNum, timeSig, tempoTri, tempoText } を受け取る
export function applyTheme(spec) {
  const t = typeof spec === 'string' ? (THEMES[spec] || THEMES.dark) : spec;
  for (const k of Object.keys(t)) C[k] = t[k];
}

const iconCache = new Map();
function getIcon(url, onload) {
  if (!url) return null;
  let e = iconCache.get(url);
  if (!e) {
    const img = new Image();
    e = { img, ok: false };
    img.onload = () => { e.ok = true; onload?.(); };
    img.src = url;
    iconCache.set(url, e);
  }
  return e.ok ? e.img : null;
}
export { getIcon };

export class EditorView {
  constructor(canvas, handlers = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.h = handlers;
    this.remix = null;
    this.ppb = 48;
    this.scrollBeat = -2;
    this.playhead = null;
    this.selection = new Set();
    this.armed = null; // 置こうとしている項目 { width, height, name, color }
    this.drop = null; // 一覧からドラッグ中の置き場所 { beat, track, width, height, valid }
    this.flagDrag = null; // 旗をドラッグ中 { kind: 'music' | 'playback', beat }
    this.hover = null; // マウスで置く位置の目安
    this.moveState = null;
    this.resizeState = null;
    this.snap = 0.25;
    this.dirty = true;
    this.lastUser = 0;
    this.pointers = new Map();
    this.momentum = null;
    this.bgImage = null; // { img, fit: 'cover' | 'contain', alpha }
    this.resize();
    new ResizeObserver(() => { this.resize(); this.dirty = true; }).observe(canvas);
    this.bindInput();
  }

  setRemix(remix) {
    this.remix = remix;
    this.selection.clear();
    this.ppb = clamp(this.W / 14, 26, 90);
    this.scrollBeat = remix.playbackStart - (this.W * 0.3) / this.ppb;
    this.dirty = true;
  }

  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.W = Math.max(1, r.width);
    this.H = Math.max(1, r.height);
    this.cv.width = Math.round(this.W * dpr);
    this.cv.height = Math.round(this.H * dpr);
    this.dpr = dpr;
  }

  layout() {
    const tc = this.remix ? this.remix.trackCount : 5;
    const compact = this.H < 260;
    // ゲーム一覧を開いているあいだは、上の旗の欄と目盛りを小さくしてトラックを上に詰める（下のテンポの段はそのまま）
    const tight = compact || this.compactTop;
    const infoH = tight ? 36 : clamp(this.H * 0.16, 46, 74);
    const rulerH = tight ? 18 : 22;
    const tempoH = compact ? 24 : 38;
    const avail = this.H - infoH - rulerH - tempoH - 6;
    const rowH = clamp(avail / tc, 18, 64);
    const contentH = infoH + rulerH + rowH * tc + tempoH + 6;
    const maxScrollY = Math.max(0, contentH - this.H);
    if (this.stickBottom !== false) this.scrollY = maxScrollY;
    this.scrollY = clamp(this.scrollY || 0, 0, maxScrollY);
    const top = -this.scrollY;
    const tracksTop = top + infoH + rulerH;
    return { infoH, rulerH, tempoH, rowH, top, maxScrollY, tracksTop, tracksBottom: tracksTop + rowH * tc, tc };
  }

  x(beat) { return (beat - this.scrollBeat) * this.ppb; }
  beatAt(x) { return this.scrollBeat + x / this.ppb; }
  get visibleBeats() { return this.W / this.ppb; }

  centerOn(beat) {
    this.scrollBeat = beat - this.visibleBeats / 2;
    this.lastUser = performance.now();
    this.dirty = true;
  }

  zoomBy(f, anchorX = this.W / 2) {
    const b = this.beatAt(anchorX);
    this.ppb = clamp(this.ppb * f, 6, 600);
    this.scrollBeat = b - anchorX / this.ppb;
    this.dirty = true;
  }

  follow(beat) {
    if (performance.now() - this.lastUser < 1800 || this.pointers.size) return;
    const target = beat - (this.W * 0.3) / this.ppb;
    if (Math.abs(target - this.scrollBeat) > 1e-4) { this.scrollBeat = target; this.dirty = true; }
  }

  // ---------------------------------------------------------------- 入力
  // 1本指: 選択中のブロックの上から → 移動 ／ 選択中の伸ばせるブロックの端 → 長さ変更 ／ それ以外 → スクロール
  // タップ: ブロック → 選択、空き → 置く（置く項目を選んでいるとき）か選択解除、上の目盛り → 再生開始位置、テンポの段 → テンポ

  snapFloor(b) { return this.snap > 0 ? Math.floor(b / this.snap + 1e-6) * this.snap : b; }
  snapRound(b) { return this.snap > 0 ? Math.round(b / this.snap) * this.snap : b; }

  trackAt(y, L) { return Math.floor((y - L.tracksTop) / L.rowH); }

  // 旗をつかんだか：上半分の赤い旗＝音楽開始、下半分と目盛りの緑の旗＝再生開始
  flagAt(x, y, L) {
    if (!this.remix || y >= L.tracksTop) return null;
    const R = this.remix;
    const mx = this.x(R.tempo.s2b(R.musicStartSec));
    const px = this.x(R.playbackStart);
    const tol = 22;
    const upper = y < L.top + L.infoH * 0.5;
    if (upper && Math.abs(x - mx) <= tol) return 'music';
    if (!upper && Math.abs(x - px) <= tol) return 'playback';
    if (upper && Math.abs(x - px) <= tol && Math.abs(x - mx) > tol) return 'playback';
    return null;
  }

  // 選択中で伸ばせるブロックの端に触れたか
  edgeAt(x, y, L) {
    if (this.selection.size !== 1 || !this.h.canEdit?.()) return null;
    const e = [...this.selection][0];
    if (!this.h.isStretchable?.(e)) return null;
    const top = L.tracksTop + e.track * L.rowH;
    if (y < top - 4 || y > top + e.height * L.rowH + 4) return null;
    const x0 = this.x(e.beat), x1 = this.x(e.beat + e.width);
    const grip = Math.min(18, Math.max(8, (x1 - x0) / 3));
    if (x >= x1 - grip && x <= x1 + 10) return { ent: e, side: 'R' };
    if (x >= x0 - 10 && x <= x0 + grip) return { ent: e, side: 'L' };
    return null;
  }

  bindInput() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど */ }
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.momentum = null;
      this.lastUser = performance.now();
      if (this.pointers.size === 1) {
        const L = this.remix ? this.layout() : null;
        let mode = 'scroll', edge = null, anchor = null;
        const flag = L ? this.flagAt(e.offsetX, e.offsetY, L) : null;
        // テンポ・音量の印：指は長押しでつかむ、マウスはそのままドラッグ
        const mark = L && !flag && e.offsetY > L.tracksBottom && e.offsetY <= L.tracksBottom + L.tempoH + 6 && this.h.canEdit?.()
          ? this.markerAt(e.offsetX, e.offsetY, L) : null;
        if (flag && (this.h.canEdit?.() || (flag === 'playback' && this.h.canMovePlayback?.()))) mode = flag;
        else if (mark && e.pointerType === 'mouse') mode = 'marker';
        else if (L && e.offsetY >= L.tracksTop && e.offsetY <= L.tracksBottom) {
          edge = this.edgeAt(e.offsetX, e.offsetY, L);
          if (edge) mode = 'resize';
          else {
            const hit = this.hitTest(e.offsetX, e.offsetY, L);
            if (hit && this.selection.has(hit) && this.h.canEdit?.()) { mode = 'move'; anchor = hit; }
            else if (!hit && !this.armed && this.h.canEdit?.() && (e.pointerType === 'mouse' || this.h.isMultiSelect?.())) mode = 'box';
          }
        }
        this.drag = { mode, edge, anchor, x0: e.offsetX, y0: e.offsetY, s0: this.scrollBeat, t0: performance.now(), moved: false, vx: 0, lx: e.offsetX, lt: performance.now(), shift: e.shiftKey || e.ctrlKey || e.metaKey };
        if (mode === 'box') this.box = { b0: this.beatAt(e.offsetX), y0: e.offsetY, b1: this.beatAt(e.offsetX), y1: e.offsetY };
        this.markerDrag = mode === 'marker' ? { ...mark, beat: mark.from, valid: true } : null;
        // 指で空き地を長押し → 範囲選択を始める
        clearTimeout(this.longTimer);
        if (mark && mode === 'scroll') {
          const d = this.drag;
          this.longTimer = setTimeout(() => {
            if (this.drag !== d || d.moved || this.pointers.size !== 1) return;
            d.mode = 'marker';
            d.moved = true;
            this.markerDrag = { ...mark, beat: mark.from, valid: true };
            this.h.onMarkerGrab?.(mark.kind);
            try { navigator.vibrate?.(12); } catch (_) { /* 未対応 */ }
            this.dirty = true;
          }, 420);
        }
        if (mode === 'scroll' && e.pointerType !== 'mouse' && L && e.offsetY >= L.tracksTop && e.offsetY <= L.tracksBottom && !this.armed
          && this.h.canEdit?.() && !this.hitTest(e.offsetX, e.offsetY, L)) {
          const d = this.drag;
          this.longTimer = setTimeout(() => {
            if (this.drag !== d || d.moved || this.pointers.size !== 1) return;
            d.mode = 'box';
            d.moved = true;
            d.x0 = d.lx;
            this.box = { b0: this.beatAt(d.x0), y0: d.y0, b1: this.beatAt(d.x0), y1: d.y0 };
            this.h.onBoxStart?.();
            try { navigator.vibrate?.(12); } catch (_) { /* 未対応 */ }
            this.dirty = true;
          }, 420);
        }
        this.pinch = null;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const mid = (a.x + b.x) / 2;
        this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, ppb0: this.ppb, midBeat: this.beatAt(mid) };
        this.drag = null;
        this.moveState = null;
        this.resizeState = null;
        this.markerDrag = null;
      }
      this.dirty = true;
    });
    cv.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        // マウスのホバー：置く位置の目安を出す
        if (e.pointerType === 'mouse' && this.armed && this.remix) {
          const L = this.layout();
          const t = this.trackAt(e.offsetY, L);
          this.hover = t >= 0 && t < L.tc ? { beat: this.snapFloor(this.beatAt(e.offsetX)), track: t } : null;
          this.dirty = true;
        }
        return;
      }
      p.x = e.offsetX; p.y = e.offsetY;
      this.lastUser = performance.now();
      if (this.pinch && this.pointers.size >= 2) {
        const [a, b] = [...this.pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        this.ppb = clamp(this.pinch.ppb0 * (d / this.pinch.d0), 6, 600);
        this.scrollBeat = this.pinch.midBeat - ((a.x + b.x) / 2) / this.ppb;
        this.dirty = true;
        return;
      }
      const d = this.drag;
      if (!d) return;
      const dx = e.offsetX - d.x0, dy = e.offsetY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) > 7) d.moved = true;
      if (!d.moved) return;
      const L = this.layout();
      if (d.mode === 'music' || d.mode === 'playback') {
        const R = this.remix;
        if (d.mode === 'music') {
          // 音楽開始も、行き先を目盛りにぴったり合わせる
          const orig = R.tempo.s2b(R.musicStartSec);
          this.flagDrag = { kind: 'music', beat: this.snapRound(orig + this.beatAt(e.offsetX) - this.beatAt(d.x0)) };
        } else {
          this.flagDrag = { kind: 'playback', beat: this.snapRound(this.beatAt(e.offsetX)) };
        }
        this.edgeScroll(e.offsetX);
      } else if (d.mode === 'marker') {
        const md = this.markerDrag;
        if (md) {
          let b = this.snapRound(this.beatAt(e.offsetX));
          // 最初のテンポ（拍0）より前・同じ位置には動かせない
          if (md.kind === 'tempo') b = Math.max(b, this.snap > 0 ? this.snap : 0.0625);
          md.beat = b;
          md.valid = this.h.validateMarkerMove?.(md.kind, md.from, b) ?? true;
        }
        this.edgeScroll(e.offsetX);
      } else if (d.mode === 'box') {
        if (this.box) { this.box.b1 = this.beatAt(e.offsetX); this.box.y1 = e.offsetY; }
        this.edgeScroll(e.offsetX);
      } else if (d.mode === 'move') {
        // つかんだブロックの行き先を、目盛りにぴったり合わせる（1/32 で置いたものを 1/8 で動かしても 1/8 の位置へ）
        const raw = this.beatAt(e.offsetX) - this.beatAt(d.x0);
        const a = d.anchor ? d.anchor.beat : 0;
        const dBeat = this.snapRound(a + raw) - a;
        const dTrack = Math.round(dy / L.rowH);
        if (!this.moveState || this.moveState.dBeat !== dBeat || this.moveState.dTrack !== dTrack) {
          this.moveState = { dBeat, dTrack, valid: this.h.validateMove?.(dBeat, dTrack) ?? true };
        }
        this.edgeScroll(e.offsetX);
      } else if (d.mode === 'resize') {
        const ent = d.edge.ent;
        const minW = Math.max(this.snap || 0.0625, 0.0625);
        const pos = this.snapRound(this.beatAt(e.offsetX));
        let beat = ent.beat, width = ent.width;
        if (d.edge.side === 'R') width = Math.max(minW, pos - ent.beat);
        else { const end = ent.beat + ent.width; beat = Math.min(pos, end - minW); width = end - beat; }
        this.resizeState = { ent, beat, width, valid: this.h.validateResize?.(ent, beat, width) ?? true };
        this.edgeScroll(e.offsetX);
      } else {
        this.scrollBeat = d.s0 - dx / this.ppb;
        const L2 = this.layout();
        if (this.h.lockY?.()) this.stickBottom = true;
        else if (L2.maxScrollY > 0) {
          if (d.sy0 == null) d.sy0 = this.scrollY;
          this.stickBottom = false;
          this.scrollY = clamp(d.sy0 - dy, 0, L2.maxScrollY);
          if (this.scrollY >= L2.maxScrollY - 1) this.stickBottom = true;
        }
        const t = performance.now();
        const dt = Math.max(1, t - d.lt);
        d.vx = 0.8 * ((e.offsetX - d.lx) / dt) + 0.2 * d.vx;
        d.lx = e.offsetX; d.lt = t;
      }
      this.dirty = true;
    });
    const up = (e) => {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.delete(e.pointerId);
      this.lastUser = performance.now();
      if (this.pinch) {
        this.pinch = null;
        const rest = [...this.pointers.values()][0];
        this.drag = rest ? { mode: 'scroll', x0: rest.x, y0: rest.y, s0: this.scrollBeat, t0: 0, moved: true, vx: 0, lx: rest.x, lt: performance.now() } : null;
        return;
      }
      const d = this.drag;
      this.drag = null;
      clearTimeout(this.longTimer);
      const ms = this.moveState, rs = this.resizeState, fd = this.flagDrag, box = this.box, md = this.markerDrag;
      this.markerDrag = null;
      this.moveState = null;
      this.resizeState = null;
      this.flagDrag = null;
      this.box = null;
      this.dirty = true;
      if (!d || e.type === 'pointercancel') return;
      if (d.mode === 'box' && box && (d.moved || Math.abs(box.b1 - box.b0) * this.ppb > 6)) {
        const L = this.layout();
        const lo = Math.min(box.b0, box.b1), hi = Math.max(box.b0, box.b1);
        const t0 = Math.floor((Math.min(box.y0, box.y1) - L.tracksTop) / L.rowH);
        const t1 = Math.floor((Math.max(box.y0, box.y1) - L.tracksTop) / L.rowH);
        const hits = this.remix.entities.filter((en) => en.beat < hi && en.beat + Math.max(en.width, 1e-3) > lo && en.track <= t1 && en.track + en.height - 1 >= t0);
        this.h.onBoxSelect?.(hits, d.shift);
        return;
      }
      if (!d.moved) {
        if (d.mode === 'music') { this.h.onFlagTap?.('music'); return; }
        if (performance.now() - d.t0 < 600) this.tap(e.offsetX, e.offsetY, d.shift);
        return;
      }
      if (fd && fd.kind === 'music') this.h.onSetMusicStart?.(fd.beat);
      else if (fd && fd.kind === 'playback') this.h.onSetPlaybackStart?.(fd.beat);
      else if (d.mode === 'marker' && md && Math.abs(md.beat - md.from) > 1e-6) this.h.onMoveMarker?.(md.kind, md.from, md.beat);
      else if (d.mode === 'move' && ms && (ms.dBeat || ms.dTrack)) this.h.onMove?.(ms.dBeat, ms.dTrack);
      else if (d.mode === 'resize' && rs && (rs.beat !== rs.ent.beat || rs.width !== rs.ent.width)) this.h.onResize?.(rs.ent, rs.beat, rs.width);
      else if (d.mode === 'scroll' && Math.abs(d.vx) > 0.15 && performance.now() - d.lt < 80) this.momentum = { v: d.vx, t: performance.now() };
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.dirty = true; } });
    cv.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.lastUser = performance.now();
      if (e.ctrlKey || e.metaKey) this.zoomBy(Math.exp(-e.deltaY * 0.01), e.offsetX);
      else { this.scrollBeat += (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / this.ppb; this.dirty = true; }
    }, { passive: false });
  }

  // 下の一覧からドラッグしてきた指の位置 → 置く拍とトラック（トラックの外なら null）
  dropTarget(clientX, clientY, height = 1) {
    if (!this.remix) return null;
    const r = this.cv.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    if (x < 0 || x > r.width || y < 0 || y > r.height) return null;
    const L = this.layout();
    if (y < L.tracksTop || y > L.tracksBottom) return null;
    const track = clamp(this.trackAt(y, L), 0, Math.max(0, L.tc - height));
    return { beat: this.snapFloor(this.beatAt(x)), track, localX: x };
  }

  // ドラッグ中に画面の端へ寄せたら、その方向へ少しずつ進む
  edgeScroll(x) {
    const zone = 28;
    if (x < zone) this.scrollBeat -= ((zone - x) / zone) * 0.25;
    else if (x > this.W - zone) this.scrollBeat += ((x - (this.W - zone)) / zone) * 0.25;
  }

  tap(x, y, additive) {
    if (!this.remix) return;
    const L = this.layout();
    if (y < L.tracksTop) {
      // 上の目盛り部分のタップ → 再生開始位置（デスクトップ版の右クリック）
      this.h.onSetPlaybackStart?.(this.snapRound(this.beatAt(x)));
      return;
    }
    if (y > L.tracksBottom) {
      if (y <= L.tracksBottom + L.tempoH + 6) this.h.onMarkerTap?.(this.beatAt(x), this.snapRound(this.beatAt(x)), 16 / this.ppb);
      return;
    }
    const hit = this.hitTest(x, y, L);
    if (hit) this.h.onSelect?.(hit, additive);
    else if (this.armed) this.h.onPlace?.(this.snapFloor(this.beatAt(x)), this.trackAt(y, L));
    else {
      // 拍子の大きな数字をタップ → その場で数字を入れる
      const ts = this.h.canEdit?.() ? this.timeSigAt(x, y, L) : null;
      if (ts) this.h.onTimeSigTap?.(ts);
      else this.h.onSelect?.(null, additive);
    }
    this.dirty = true;
  }

  // つかめるテンポ・音量の印（上半分はテンポ優先、下半分は音量優先）。最初のテンポは動かせない
  markerAt(x, y, L) {
    const R = this.remix;
    const pick = (list) => {
      let best = null, bd = 16;
      for (const m of list) { const d = Math.abs(this.x(m.beat) - x); if (d <= bd) { bd = d; best = m; } }
      return best;
    };
    const tempo = pick(R.tempoTrackers.filter((t) => !(t.isImmutable || Math.abs(t.beat) < 1e-6)));
    const vol = pick(R.musicVolumes);
    const T = tempo && { kind: 'tempo', from: tempo.beat }, V = vol && { kind: 'vol', from: vol.beat };
    return (y < L.tracksBottom + 3 + L.tempoH * 0.5 ? T || V : V || T) || null;
  }

  // 拍子の数字の大きさと縦の位置
  timeSigGeom(L) {
    const size = Math.min((L.tracksBottom - L.tracksTop) * 0.56, 150);
    const mid = (L.tracksTop + L.tracksBottom) / 2;
    return { size, top: mid - size * 0.42, bottom: mid + size * 0.46 };
  }

  // 拍子の数字の箱（画面上の位置）。part は 'top'（拍数）か 'bottom'（音符）
  timeSigBox(ts, part, L = this.layout()) {
    const G = this.timeSigGeom(L);
    this.ctx.font = `800 ${G.size}px ${FONT}`;
    const w = Math.max(this.ctx.measureText(String(part === 'top' ? ts.perMeasure : ts.unit)).width, G.size * 0.5);
    return { ts, part, x: this.x(ts.beat) + 2, cy: G[part], w, size: G.size };
  }

  timeSigAt(x, y, L) {
    const list = this.remix.timeSignatures;
    for (let i = list.length - 1; i >= 0; i--) {
      for (const part of ['top', 'bottom']) {
        const b = this.timeSigBox(list[i], part, L);
        if (x >= b.x - 8 && x <= b.x + b.w + 8 && Math.abs(y - b.cy) <= b.size * 0.46) return b;
      }
    }
    return null;
  }

  hitTest(x, y, L) {
    const b = this.beatAt(x);
    const ents = this.remix.entities;
    for (let i = ents.length - 1; i >= 0; i--) {
      const e = ents[i];
      const w = Math.max(e.width, 10 / this.ppb);
      if (b >= e.beat && b <= e.beat + w) {
        const top = L.tracksTop + e.track * L.rowH;
        if (y >= top && y <= top + e.height * L.rowH) return e;
      }
    }
    return null;
  }

  stepMomentum(now) {
    if (!this.momentum) return false;
    const m = this.momentum;
    const dt = now - m.t;
    m.t = now;
    this.scrollBeat -= (m.v * dt) / this.ppb;
    m.v *= Math.pow(0.994, dt);
    this.lastUser = now;
    if (Math.abs(m.v) < 0.02) this.momentum = null;
    this.dirty = true;
    return true;
  }

  // ---------------------------------------------------------------- 描画

  draw(now = performance.now()) {
    const g = this.ctx;
    const { W, H } = this;
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = C.bg;
    g.fillRect(0, 0, W, H);
    this.drawBackgroundImage(g, W, H);
    if (!this.remix) return;
    const R = this.remix;
    const L = this.layout();
    const b0 = this.scrollBeat, b1 = this.beatAt(W);

    // 拍の線と番号
    let step = 1;
    while (step * this.ppb < 30) step *= 2;
    g.font = `700 ${clamp(L.rulerH - 4, 13, 18)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    // スナップの細かい線：拡大しているほど細かく。縮小して線が詰まるときは 2倍・4倍…の間隔に間引く
    const snap = this.snap > 0 ? this.snap : 0.25;
    let gs = snap;
    while (gs < 1 && gs * this.ppb < 7) gs *= 2;
    if (gs < 1) this.drawSubLines(g, L, b0, b1, gs, `rgba(${C.gridRGB},0.16)`, `rgba(${C.gridRGB},0.28)`);

    // 編集中のキューがある小節だけは、必ずスナップの間隔で線を出す（うっすら色も付ける）
    if (snap < 1) {
      const spacing = snap * this.ppb;
      const a = clamp(spacing / 16, 0.08, 0.42);
      for (const [rs, re] of this.editRanges()) {
        if (re < b0 || rs > b1) continue;
        g.fillStyle = 'rgba(25,240,255,0.06)';
        g.fillRect(this.x(rs), L.tracksTop, (re - rs) * this.ppb, L.tracksBottom - L.tracksTop);
        this.drawSubLines(g, L, Math.max(rs, b0), Math.min(re, b1), snap, `rgba(120,230,255,${a})`, `rgba(120,230,255,${Math.min(0.6, a + 0.15)})`);
      }
    }
    // 拍と小節の縦線（ブロックの下）
    this.drawBeatLines(g, L, b0, b1);
    // 拍の番号
    for (let b = Math.floor(b0); b <= b1; b++) {
      const { beatInMeasure } = R.measureAt(b);
      const isMeasure = Math.abs(beatInMeasure) < 1e-6;
      const x = Math.round(this.x(b)) + 0.5;
      if (b % step === 0) {
        // 小節の 1 拍目の数字ははっきり、それ以外の拍は薄く
        g.globalAlpha = isMeasure ? 1 : 0.38;
        g.fillStyle = C.beatNum;
        g.fillText(String(b), x, L.tracksTop - 4);
        g.globalAlpha = 1;
      }
    }
    g.strokeStyle = C.grid;
    g.lineWidth = 1.5;
    g.beginPath();
    for (let t = 0; t <= L.tc; t++) {
      const y = Math.round(L.tracksTop + t * L.rowH) + 0.5;
      g.moveTo(0, y); g.lineTo(W, y);
    }
    g.stroke();

    // 拍子（大きな数字）
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    const tsSize = Math.min((L.tracksBottom - L.tracksTop) * 0.56, 150);
    g.font = `800 ${tsSize}px ${FONT}`;
    g.fillStyle = C.timeSig;
    const tg = this.timeSigGeom(L);
    const te = this.tsEditing;
    for (const ts of R.timeSignatures) {
      const x = this.x(ts.beat) + 2;
      if (x > W || x < -tsSize) continue;
      const editing = te && Math.abs(te.beat - ts.beat) < 1e-6 ? te.part : '';
      if (editing !== 'top') g.fillText(String(ts.perMeasure), x, tg.top);
      if (editing !== 'bottom') g.fillText(String(ts.unit), x, tg.bottom);
    }

    // エンティティ
    for (const e of R.entities) {
      if (e.minBeat > b1 || e.maxBeat < b0) continue;
      this.drawEntity(g, e, L, now);
    }
    g.globalAlpha = 1;
    this.drawEditOverlay(g, L);
    if (this.playMode) this.drawPlayalongInputs(g, L, b0, b1);

    // テンポ変更・音量変更
    const ty = L.tracksBottom + 3;
    const triH = Math.min(18, L.tempoH - 6);
    g.font = `700 ${Math.min(16, L.tempoH - 8)}px ${FONT}`;
    g.textBaseline = 'top';
    const md = this.markerDrag;
    for (const t of R.tempo.list) {
      const dragging = md?.kind === 'tempo' && Math.abs(t.beat - md.from) < 1e-6;
      const x = this.x(dragging ? md.beat : t.beat);
      if (dragging) { this.drawMarkerGuide(g, L, x, md, C.tempoText); g.font = `700 ${Math.min(16, L.tempoH - 8)}px ${FONT}`; g.textBaseline = 'top'; }
      if (x < -120 || x > W + 10) continue;
      if (t.width > 0) {
        g.fillStyle = 'rgba(83,97,255,0.35)';
        g.fillRect(x, ty + 4, t.width * this.ppb, 6);
      }
      g.fillStyle = C.tempoTri;
      g.beginPath(); g.moveTo(x, ty); g.lineTo(x - triH / 2, ty + triH); g.lineTo(x + triH / 2, ty + triH); g.closePath(); g.fill();
      g.fillStyle = C.tempoText;
      const sw = t.swing.ratio !== 0.5 ? `  ${Math.round(t.swing.ratio * 100)}%` : '';
      g.fillText(`♩=${t.bpm.toFixed(1)}${sw}`, x + triH / 2 + 2, ty + 3);
    }
    g.font = `700 ${L.tempoH > 30 ? 12 : 10}px ${FONT}`;
    g.textBaseline = 'bottom';
    for (const mv of R.musicVolumes) {
      const dragging = md?.kind === 'vol' && Math.abs(mv.beat - md.from) < 1e-6;
      const x = this.x(dragging ? md.beat : mv.beat);
      if (dragging) { this.drawMarkerGuide(g, L, x, md, C.volText); g.font = `700 ${L.tempoH > 30 ? 12 : 10}px ${FONT}`; g.textBaseline = 'bottom'; }
      if (x < -100 || x > W + 10) continue;
      const yb = L.tracksBottom + L.tempoH + 2;
      g.fillStyle = C.volText;
      if (mv.width > 0) { g.globalAlpha = 0.35; g.fillRect(x, yb - 4, mv.width * this.ppb, 3); g.globalAlpha = 1; }
      // 上向きの三角：てっぺんが置いた拍
      g.beginPath(); g.moveTo(x, yb - 9); g.lineTo(x - 5.5, yb); g.lineTo(x + 5.5, yb); g.closePath(); g.fill();
      g.fillText(`${LABELS.volume} ${mv.volume}%`, x + 7, yb);
    }

    // 音楽開始（赤）と再生開始（緑）の旗
    const fd = this.flagDrag;
    const musicBeat = fd?.kind === 'music' ? fd.beat : R.tempo.s2b(R.musicStartSec);
    const musicSec = fd?.kind === 'music' ? R.tempo.b2s(fd.beat) : R.musicStartSec;
    this.drawFlag(g, L, musicBeat, C.music, L.top + 4, LABELS.music, [fmtTime(musicSec)], R.musicPresent || fd?.kind === 'music');
    const pbBeat = fd?.kind === 'playback' ? fd.beat : R.playbackStart;
    const pbSec = R.tempo.b2s(pbBeat);
    this.drawFlag(g, L, pbBeat, C.playback, L.top + L.infoH * 0.5, LABELS.playback, [`Beat ${pbBeat.toFixed(3)}`, fmtTime(pbSec)], true);

    // Play-Yan（RHRE fresh と同じく、メトロノームを入れているときだけ）
    if (this.metronome) this.drawPlayYan(g, L, now);

    // 再生位置
    if (this.playhead != null) {
      const x = Math.round(this.x(this.playhead)) + 0.5;
      g.strokeStyle = C.playhead;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, L.top + L.infoH); g.lineTo(x, L.tracksBottom); g.stroke();
    }
  }

  // RHRE fresh の renderPlayYan の移植。トラックの一番上の線の上に立つ（絵の左端が拍の位置）。
  // 再生中・一時停止中は拍ごとに跳ねる（スイングのときはホッピング）。止まっているときは再生開始位置で足踏みする
  drawPlayYan(g, L, now) {
    const R = this.remix;
    const s = this.W / 1280;
    const ready = (img) => img.complete && img.naturalWidth > 0;
    g.save();
    g.imageSmoothingEnabled = false;
    if (this.playhead != null) {
      const beat = this.playhead;
      let ts = null;
      for (const t of R.timeSignatures) { if (t.beat <= beat + 1e-9) ts = t; else break; }
      const interval = ts ? 4 / (ts.unit || 4) : 1;
      const tsBeat = ts ? ts.beat : 0;
      const beatPercent = (beat - tsBeat) % interval;
      const pbPercent = (R.playbackStart - tsBeat) % interval;
      const floorPb = Math.floor(pbPercent);
      const arg = pbPercent > 0 && beat < floorPb + 1 ? (beat - R.playbackStart) / (1 - pbPercent) : beatPercent;
      const jump = Math.abs(Math.sin((Math.PI / interval) * arg));
      let swing = 0.5;
      for (const t of R.tempo.list) { if (t.beat <= beat + 1e-9) swing = t.swing?.ratio ?? 0.5; else break; }
      const img = Math.abs(swing - 0.5) < 1e-6 ? PLAYYAN.jumping : PLAYYAN.pogo;
      if (ready(img)) g.drawImage(img, 0, 0, 34, 42, this.x(beat), L.tracksTop - jump * L.rowH - 42 * s, 34 * s, 42 * s);
    } else {
      const step = Math.floor(((now % 250) / 250) * 4);
      if (ready(PLAYYAN.walking)) g.drawImage(PLAYYAN.walking, step * 32, 0, 32, 38, this.x(R.playbackStart), L.tracksTop - 38 * s, 34 * s, 38 * s);
      this.dirty = true; // 足踏みのために描き続ける
    }
    g.restore();
  }

  // RHRE fresh の renderBeatLines の移植（太さ・濃さ・位置は同じ。ブロックの下に描く）。太さは RHRE fresh の画面（横 1280）での 2px を、この画面の幅に合わせる
  //  1. 整数の拍ごとに細い線。小節の途中の拍は不透明度 25%、小節の頭（とマイナスの拍）は 100%
  //  2. 1/4 拍ずつ見て、拍子の拍（6/8 なら 0.5 拍ごと）が変わる所に線。小節の頭は 3 倍の太さで 100%、途中は 20%
  drawBeatLines(g, L, b0, b1) {
    const R = this.remix;
    const rgb = C.gridRGB;
    const thin = Math.max(1, (2 * this.W) / 1280);
    // 一番上と一番下の横線（round(y)+0.5 に太さ 1.5 で描いている）からはみ出さない
    const top = Math.round(L.tracksTop);
    const h = Math.round(L.tracksBottom) + 1 - top;
    const tsList = R.timeSignatures;
    const tsAt = (beat) => {
      let cur = null;
      for (const t of tsList) { if (t.beat <= beat + 1e-9) cur = t; else break; }
      return cur;
    };
    // RHRE fresh の getMeasurePart：小節の中で何番目の拍（拍子の下の数で数える）か。マイナスの拍は -1
    const partOf = (beat) => {
      if (beat < 0) return -1;
      const t = tsAt(beat);
      if (!t) return -1;
      return Math.floor((((beat - t.beat) / (4 / t.unit)) % t.perMeasure) + 1e-9);
    };
    // 小節が変わったか見分けるための番号（拍子ごと × 小節）
    const measureKey = (beat) => {
      if (beat < 0) return -1;
      const t = tsAt(beat);
      if (!t) return -1;
      const len = (4 / t.unit) * t.perMeasure;
      return tsList.indexOf(t) * 1e6 + Math.floor((beat - t.beat) / len + 1e-9);
    };
    const line = (beat, alpha, w) => {
      g.fillStyle = `rgba(${rgb},${alpha})`;
      g.fillRect(this.x(beat) - w / 2, top, w, h);
    };
    for (let i = Math.floor(b0) - 1; i <= Math.ceil(b1) + 1; i++) line(i, partOf(i) > 0 ? 0.25 : 1, thin);
    const step = 0.25;
    let lastPart = -1, lastMeasure = -1;
    // 画面の左端より 2 拍前から数え始める（最初の 1 本が画面に出ないように）
    for (let i = Math.floor(b0) - 2; i <= Math.ceil(b1) + 1 + 1e-9; i += step) {
      const p = partOf(i), m = measureKey(i);
      if (p === lastPart && m === lastMeasure) continue;
      lastPart = p;
      lastMeasure = m;
      if (p > 0) line(i, 0.2, thin);
      else line(i, 1, p === 0 ? thin * 3 : thin);
    }
  }

  // プレイモード：ボタンのキューの位置に、トラックの高さの真ん中で大きな白い丸（A・B・十字・Tap など）
  drawPlayalongInputs(g, L, b0, b1) {
    const ents = this.remix.entities
      .filter((e) => e.type === 'playalongEntity' && e.beat + e.width >= b0 - 2 && e.beat <= b1 + 2)
      .sort((a, b) => a.beat - b.beat || a.track - b.track);
    if (!ents.length) return;
    const H = L.tracksBottom - L.tracksTop;
    const cy = (L.tracksTop + L.tracksBottom) / 2;
    const r0 = clamp(Math.min(H * 0.2, this.ppb * 0.42), 10, 72);
    const release = (m) => m === 'RELEASE' || m === 'RELEASE_AND_HOLD';
    // いつもは全部トラックの真ん中に（重なってもいい）。
    // 同じ拍に違うボタン（A と十字の左を同時に、など）があるときだけ、その拍のボタンを縦に並べる（上の段に置いたものほど上）
    const pos = new Map();
    const byBeat = new Map();
    for (const e of ents) {
      const key = Math.round(e.beat * 1e6);
      if (!byBeat.has(key)) byBeat.set(key, []);
      byBeat.get(key).push(e);
    }
    for (const group of byBeat.values()) {
      const inputs = [...new Set(group.map((e) => e.o.input))];
      if (inputs.length < 2) { for (const e of group) pos.set(e, { y: cy, r: r0 }); continue; }
      const top = (inp) => Math.min(...group.filter((e) => e.o.input === inp).map((e) => e.track));
      inputs.sort((a, b) => top(a) - top(b));
      const n = inputs.length;
      const spacing = Math.min(r0 * 2.5, H / n);
      const r = Math.min(r0, spacing / 2.5);
      for (const e of group) pos.set(e, { y: cy + (inputs.indexOf(e.o.input) - (n - 1) / 2) * spacing, r });
    }
    for (const e of ents) {
      const { y: cy, r } = pos.get(e);
      const x0 = this.x(e.beat), x1 = this.x(e.beat + e.width);
      const instant = e.o.method === 'PRESS' || e.o.method === 'RELEASE';
      // 長押し中は青、終わって上手くいったら緑、失敗したら赤
      const tint = e.paHold ? PA_COLOR.hold : e.judge ? (e.judge === 'MISS' ? PA_COLOR.miss : PA_COLOR.ok) : null;
      g.save();
      // 押しっぱなしなどは、終わりまで帯でつなぐ（端は丸く）
      if (!instant) {
        const band = (hr, color) => {
          g.fillStyle = color;
          g.fillRect(x0, cy - hr, Math.max(0, x1 - x0), hr * 2);
          g.beginPath(); g.arc(x1, cy, hr, -Math.PI / 2, Math.PI / 2); g.fill();
        };
        band(r * 0.32, '#1a1a1a');
        band(r * 0.2, tint || '#ffffff');
        // 「離して、終わりで押す」だけは、終わりにも押す丸を出す（長押しの尻尾には出さない）
        if (e.o.method === 'RELEASE_AND_HOLD') drawBigInput(g, e.o.input, x1, cy, r * 0.62, false, tint);
      }
      g.fillStyle = 'rgba(26, 26, 26, 0.9)';
      g.fillRect(x0 - r * 1.18, cy - r * 1.18, r * 2.36, r * 2.36);
      // はじく：RHRE fresh と同じ、ペンではじく手の絵（結果の色に染める）
      const flickImg = e.o.input === 'TOUCH_FLICK' ? tintedFlick(tint, () => { this.dirty = true; }) : null;
      if (flickImg) g.drawImage(flickImg, x0 - r * 1.18, cy - r * 1.18, r * 2.36, r * 2.36);
      else drawBigInput(g, e.o.input, x0, cy, r, release(e.o.method), tint);
      g.restore();
    }
  }

  // 背景の画像：縦横比はそのまま。「画面いっぱい」ははみ出す所を切る、「全体」は全部見せる。
  // 毎回大きな画像を縮めると重いので、今の画面の大きさに縮めたものを取っておく
  drawBackgroundImage(g, W, H) {
    const bg = this.bgImage;
    if (!bg?.img) return;
    const key = `${W}x${H}@${this.dpr}/${bg.fit}`;
    if (!bg.cache || bg.cacheKey !== key) {
      const iw = bg.img.naturalWidth || bg.img.width, ih = bg.img.naturalHeight || bg.img.height;
      if (!iw || !ih) return;
      const s = bg.fit === 'contain' ? Math.min(W / iw, H / ih) : Math.max(W / iw, H / ih);
      const dw = iw * s, dh = ih * s;
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W * this.dpr));
      c.height = Math.max(1, Math.round(H * this.dpr));
      const cg = c.getContext('2d');
      cg.imageSmoothingQuality = 'high';
      cg.drawImage(bg.img, ((W - dw) / 2) * this.dpr, ((H - dh) / 2) * this.dpr, dw * this.dpr, dh * this.dpr);
      bg.cache = c;
      bg.cacheKey = key;
    }
    g.globalAlpha = bg.alpha ?? 0.6;
    g.drawImage(bg.cache, 0, 0, W, H);
    g.globalAlpha = 1;
  }

  // テンポ・音量の印をドラッグ中：トラックを縦に貫く点線と、拍の数字（置けない位置は赤）
  drawMarkerGuide(g, L, x, md, color) {
    const c = md.valid ? color : '#ff4d4d';
    g.save();
    g.strokeStyle = c;
    g.lineWidth = 1.5;
    g.setLineDash([5, 4]);
    g.beginPath(); g.moveTo(Math.round(x) + 0.5, L.tracksTop); g.lineTo(Math.round(x) + 0.5, L.tracksBottom + L.tempoH); g.stroke();
    g.setLineDash([]);
    g.font = `700 12px ${FONT}`;
    g.textBaseline = 'top';
    g.textAlign = 'left';
    const label = `${LABELS.beat || 'Beat'} ${+md.beat.toFixed(3)}`;
    const w = g.measureText(label).width + 8;
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(x + 3, L.tracksTop + 2, w, 16);
    g.fillStyle = c;
    g.fillText(label, x + 7, L.tracksTop + 4);
    g.restore();
  }

  // 拍の間の線（拍ちょうどの位置は拍の線に任せる）。半拍の線は少し濃く
  drawSubLines(g, L, from, to, step, color, halfColor) {
    const start = Math.ceil(from / step - 1e-6);
    const end = Math.floor(to / step + 1e-6);
    if (end - start > 4000) return;
    const paths = [[color, []], [halfColor, []]];
    for (let k = start; k <= end; k++) {
      const b = k * step;
      if (Math.abs(b - Math.round(b)) < 1e-6) continue;
      const half = Math.abs(b * 2 - Math.round(b * 2)) < 1e-6;
      paths[half ? 1 : 0][1].push(Math.round(this.x(b)) + 0.5);
    }
    g.lineWidth = 1;
    for (const [c, xs] of paths) {
      if (!xs.length) continue;
      g.strokeStyle = c;
      g.beginPath();
      for (const x of xs) { g.moveTo(x, L.tracksTop); g.lineTo(x, L.tracksBottom); }
      g.stroke();
    }
  }

  // 編集中のキューがある小節の範囲（選択中・移動先・長さ変更中・マウスで置く位置）。重なりはまとめる
  editRanges() {
    const R = this.remix;
    if (!R) return [];
    const spans = [];
    const add = (b, w) => spans.push([b, b + Math.max(w, 1e-6)]);
    const ms = this.moveState;
    for (const e of this.selection) {
      add(e.beat, e.width);
      if (ms) add(e.beat + ms.dBeat, e.width);
    }
    if (this.resizeState) add(this.resizeState.beat, this.resizeState.width);
    if (this.hover && this.armed) add(this.hover.beat, this.armed.width);
    if (this.drop) add(this.drop.beat, this.drop.width);
    const out = [];
    for (const [s, e] of spans) {
      const m0 = R.measureAt(s);
      const m1 = R.measureAt(e - 1e-6);
      out.push([s - m0.beatInMeasure, e - 1e-6 - m1.beatInMeasure + m1.length]);
    }
    out.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const r of out) {
      const last = merged[merged.length - 1];
      if (last && r[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], r[1]);
      else merged.push([...r]);
    }
    return merged;
  }

  // 移動・長さ変更中の行き先、伸ばせるブロックのつまみ、マウスで置く位置の目安
  drawEditOverlay(g, L) {
    const ghost = (beat, track, width, height, valid) => {
      const x = this.x(beat), y = L.tracksTop + track * L.rowH + 1;
      const w = Math.max(3, width * this.ppb), h = height * L.rowH - 2;
      g.fillStyle = valid ? 'rgba(25,240,255,0.22)' : 'rgba(255,60,60,0.28)';
      g.fillRect(x, y, w, h);
      g.setLineDash([6, 4]);
      g.strokeStyle = valid ? C.select : '#ff4d4d';
      g.lineWidth = 2;
      g.strokeRect(x + 1, y + 1, w - 2, h - 2);
      g.setLineDash([]);
    };
    if (this.moveState) {
      const { dBeat, dTrack, valid } = this.moveState;
      for (const e of this.selection) ghost(e.beat + dBeat, e.track + dTrack, e.width, e.height, valid);
    }
    if (this.resizeState) {
      const { ent, beat, width, valid } = this.resizeState;
      ghost(beat, ent.track, width, ent.height, valid);
    }
    if (this.box) {
      const b = this.box;
      const x0 = this.x(b.b0), x1 = this.x(b.b1);
      g.fillStyle = 'rgba(25,240,255,0.12)';
      g.strokeStyle = C.select;
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      g.fillRect(Math.min(x0, x1), Math.min(b.y0, b.y1), Math.abs(x1 - x0), Math.abs(b.y1 - b.y0));
      g.strokeRect(Math.min(x0, x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(x1 - x0), Math.abs(b.y1 - b.y0));
      g.setLineDash([]);
    }
    if (this.drop) {
      const d = this.drop;
      ghost(d.beat, d.track, d.width, d.height, d.valid);
    }
    if (this.hover && this.armed) {
      const a = this.armed;
      const t = a.bottom ? L.tc - 1 : Math.max(0, Math.min(this.hover.track, L.tc - a.height));
      ghost(this.hover.beat, t, a.width, a.height, true);
    }
    // つまみ（1つだけ選んでいて、伸ばせるとき）
    if (this.selection.size === 1 && !this.moveState && !this.resizeState && this.h.canEdit?.()) {
      const e = [...this.selection][0];
      if (this.h.isStretchable?.(e)) {
        const y = L.tracksTop + e.track * L.rowH;
        const h = e.height * L.rowH;
        for (const bx of [e.beat, e.beat + e.width]) {
          const x = this.x(bx);
          g.fillStyle = '#ffffff';
          g.strokeStyle = '#0a5560';
          g.lineWidth = 1.5;
          const gw = 7, gh = Math.max(14, h * 0.55);
          g.beginPath();
          g.roundRect ? g.roundRect(x - gw / 2, y + (h - gh) / 2, gw, gh, 3) : g.rect(x - gw / 2, y + (h - gh) / 2, gw, gh);
          g.fill();
          g.stroke();
        }
      }
    }
  }

  drawFlag(g, L, beat, color, y, label, right, strong) {
    const x = Math.round(this.x(beat)) + 0.5;
    if (x < -260 || x > this.W + 260) return;
    g.save();
    g.globalAlpha = strong ? 1 : 0.55;
    g.strokeStyle = color;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, L.tracksBottom); g.stroke();
    g.fillStyle = color;
    const fs = clamp(L.infoH * 0.24, 11, 17);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + fs * 1.1, y); g.lineTo(x, y + fs * 1.1); g.closePath(); g.fill();
    g.font = `700 ${fs}px ${FONT}`;
    g.textBaseline = 'top';
    g.textAlign = 'right';
    g.fillText(label, x - 5, y);
    g.textAlign = 'left';
    right.forEach((t, i) => g.fillText(t, x + fs * 1.2 + 2, y + i * (fs + 1)));
    g.restore();
  }

  drawEntity(g, e, L, now) {
    const x = this.x(e.beat);
    const w = Math.max(3, e.width * this.ppb);
    const y = L.tracksTop + e.track * L.rowH + 1;
    const h = e.height * L.rowH - 2;
    const isSpecial = e.o && !['cue', 'pattern', 'keepTheBeat', 'equidistant', 'randomCue', 'multiCue', 'pitchDependent'].includes(e.type);
    const base = e.o ? (C.entity[e.type] || (isSpecial ? C.entity.special : C.entity.pattern)) : C.entity.missing;
    // プレイモード中はブロックを薄くして、押す丸を目立たせる
    const alpha = this.playMode ? 0.38 : 1;
    // 枠の外に音がある（等間隔など）ときは、全体を薄い帯でつないで見せる。
    // ブロックの外にはみ出た所は半透明にして、ブロック本体（あとで上に描く）と見分けやすくする
    const outside = e.leaves.length && (e.minBeat < e.beat - 1e-6 || e.maxBeat > e.beat + e.width + 1e-6);
    if (outside) {
      const t0 = Math.min(e.track, ...e.leaves.map((l) => l.track));
      const t1 = Math.max(e.track + e.height - 1, ...e.leaves.map((l) => l.track));
      const bx = this.x(e.minBeat), bw = (e.maxBeat - e.minBeat) * this.ppb;
      const by = L.tracksTop + t0 * L.rowH + 2, bh = (t1 - t0 + 1) * L.rowH - 4;
      // 背景はブロックと同じ色、枠はブロックの外枠と同じ色で上下左右すべてに
      g.globalAlpha = alpha * 0.45;
      g.fillStyle = base;
      g.fillRect(bx, by, bw, bh);
      g.strokeStyle = shade(base.startsWith('#') ? base : '#9b9b9b', 0.55);
      g.lineWidth = 2;
      g.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
    }
    g.globalAlpha = alpha;
    g.fillStyle = base;
    g.fillRect(x, y, w, h);

    // 中の cue の位置（デスクトップ版と同じく薄い枠）
    if (e.leaves.length > 1 || (e.leaves[0] && e.type !== 'cue')) {
      g.lineWidth = 1;
      for (const lf of e.leaves) {
        const lx = this.x(lf.beat), lw = Math.max(2, lf.width * this.ppb);
        const ly = L.tracksTop + lf.track * L.rowH + 3;
        // 枠の外の音も帯（ブロックと同じ色）の上なので、中と同じ控えめな線で区切る
        g.strokeStyle = 'rgba(0,0,0,0.28)';
        g.strokeRect(Math.round(lx) + 0.5, Math.round(ly) + 0.5, Math.round(lw) - 1, Math.round(L.rowH - 6));
        g.globalAlpha = alpha;
      }
    }

    // 鳴った音そのものの位置を光らせる（等間隔の離れた部分も）
    if (e.leafFlash?.length) {
      e.leafFlash = e.leafFlash.filter((f) => now - f.at < 260);
      for (const f of e.leafFlash) {
        const a = 1 - (now - f.at) / 260;
        g.fillStyle = `rgba(255,255,255,${0.6 * a})`;
        g.fillRect(this.x(f.beat), L.tracksTop + f.track * L.rowH + 2, Math.max(3, f.width * this.ppb), L.rowH - 4);
      }
      if (e.leafFlash.length) this.dirty = true;
    }

    // 発音した瞬間に光らせる
    if (e.flashAt) {
      const a = 1 - (now - e.flashAt) / 220;
      if (a > 0) {
        g.fillStyle = `rgba(255,255,255,${0.55 * a})`;
        g.fillRect(x, y, w, h);
        this.dirty = true;
      } else e.flashAt = 0;
    }

    const sel = this.selection.has(e);
    g.strokeStyle = sel ? C.select : shade(base.startsWith('#') ? base : '#9b9b9b', 0.55);
    g.lineWidth = sel ? 3 : 2;
    g.strokeRect(x + 1, y + 1, w - 2, h - 2);

    if (e.type === 'textureEntity') {
      const img = this.h.textureImage?.(e);
      if (img) {
        // 縦横比はそのまま、ブロックの中に収まる大きさで真ん中に
        const bw = w - 4, bh = h - 4;
        const s = Math.min(bw / (img.naturalWidth || img.width || 1), bh / (img.naturalHeight || img.height || 1));
        const dw = (img.naturalWidth || img.width) * s, dh = (img.naturalHeight || img.height) * s;
        g.save();
        g.beginPath(); g.rect(x + 2, y + 2, bw, bh); g.clip();
        g.drawImage(img, x + 2 + (bw - dw) / 2, y + 2 + (bh - dh) / 2, dw, dh);
        g.restore();
        if (sel) { g.strokeStyle = C.select; g.lineWidth = 3; g.strokeRect(x + 1, y + 1, w - 2, h - 2); }
        return;
      }
    }
    if (w < 14) return;
    g.save();
    g.beginPath(); g.rect(x + 2, y + 2, w - 4, h - 4); g.clip();
    const iconSize = Math.min(L.rowH - 8, 30);
    let tx = x + 4;
    // プレイアロング：小さいアイコン（水色の四角に白い丸）
    if (e.type === 'playalongEntity' && w > iconSize + 2) {
      drawPlayalongIcon(g, x + 4, y + (Math.min(h, L.rowH) - iconSize) / 2, iconSize);
      tx += iconSize + 3;
    }
    const icon = e.game && e.type !== 'playalongEntity' ? getIcon(e.game.icon, () => { this.dirty = true; }) : null;
    if (icon && w > iconSize + 6) {
      g.imageSmoothingEnabled = false;
      g.drawImage(icon, x + 4, y + (Math.min(h, L.rowH) - iconSize) / 2, iconSize, iconSize);
      tx += iconSize + 3;
    }
    // プレゼンテーション中は文字を出さない（アイコンだけ）
    if (this.h.iconsOnly?.()) { g.restore(); return; }
    const fs = clamp(L.rowH * 0.36, 10, 14);
    g.font = `700 ${fs}px ${FONT}`;
    g.fillStyle = '#121212';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    const maxW = x + w - 4 - tx;
    if (maxW > 8) {
      const label = e.type === 'subtitleEntity' && e.subtitle ? `${e.name}：${String(e.subtitle).replace(/\n/g, ' ')}`
        : e.type === 'playalongEntity' ? (this.h.playalongLabel?.(e) ?? `Playalong ${e.name}`) : e.name;
      const lines = wrap(g, label, maxW, Math.max(1, Math.floor((h - 4) / (fs + 2))));
      lines.forEach((ln, i) => g.fillText(ln, tx, y + 3 + i * (fs + 2)));
    }
    if (e.semitone || e.volume !== 100) {
      const tag = [e.semitone ? (e.semitone > 0 ? `+${e.semitone}` : `${e.semitone}`) : '', e.volume !== 100 ? `${e.volume}%` : ''].filter(Boolean).join(' ');
      g.font = `700 ${Math.max(9, fs - 2)}px ${FONT}`;
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillStyle = '#3a3a3a';
      g.fillText(tag, x + w - 4, y + h - 2);
    }
    g.restore();
  }
}

// プレイモードの丸の色：長押し中・成功・失敗（RHRE fresh と同じ）
const PA_COLOR = { hold: '#3391ff', ok: '#33ff33', miss: '#ff2626' };

// Play-Yan の絵（RHRE fresh のもの）
const PLAYYAN = (() => {
  const load = (n) => { const i = new Image(); i.src = `assets/playyan/${n}_pixel.png`; return i; };
  return { jumping: load('jumping'), pogo: load('pogo'), walking: load('walking') };
})();

// はじくキューの絵（RHRE fresh の tap_flick.png）。色を付けたものは作っておく
const FLICK_IMG = new Image();
FLICK_IMG.src = 'assets/playalong/tap_flick.png';
const flickTints = new Map();
function tintedFlick(color, onLoad) {
  if (!FLICK_IMG.complete || !FLICK_IMG.naturalWidth) { FLICK_IMG.addEventListener('load', onLoad, { once: true }); return null; }
  const key = color || '';
  if (!flickTints.has(key)) {
    const c = document.createElement('canvas');
    c.width = FLICK_IMG.naturalWidth; c.height = FLICK_IMG.naturalHeight;
    const x = c.getContext('2d');
    x.drawImage(FLICK_IMG, 0, 0);
    if (color) {
      // RHRE fresh と同じく、白い所が結果の色、線は暗い色になるように掛け合わせる
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = color;
      x.fillRect(0, 0, c.width, c.height);
      x.globalCompositeOperation = 'destination-in';
      x.drawImage(FLICK_IMG, 0, 0);
    }
    flickTints.set(key, c);
  }
  return flickTints.get(key);
}

// プレイモードの大きな丸。hollow＝離すとき（黒い丸に白い文字）。tint があれば、その色の丸に白い文字
function drawBigInput(g, input, cx, cy, r, hollow, tint) {
  const ink = tint || hollow ? '#ffffff' : '#111111';
  const fill = tint || (hollow ? '#1a1a1a' : '#ffffff');
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill();
  g.lineWidth = Math.max(2, r * 0.09); g.strokeStyle = tint ? '#000000' : hollow ? '#ffffff' : '#000000'; g.stroke();
  g.fillStyle = ink;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const cross = (size, dir) => {
    const a = size * 0.34, b = size / 2;
    g.fillRect(cx - a / 2, cy - b, a, size); g.fillRect(cx - b, cy - a / 2, size, a);
    if (dir != null) {
      g.save(); g.translate(cx, cy); g.rotate(dir);
      g.fillStyle = fill;
      g.beginPath(); g.moveTo(b * 0.92, 0); g.lineTo(b * 0.42, -a * 0.36); g.lineTo(b * 0.42, a * 0.36); g.closePath(); g.fill();
      g.restore();
    }
  };
  if (input === 'BUTTON_A' || input === 'BUTTON_B') {
    g.font = `800 ${Math.round(r * 1.15)}px ${FONT}`;
    g.fillText(input === 'BUTTON_A' ? 'A' : 'B', cx, cy + r * 0.05);
  } else if (input === 'BUTTON_A_OR_DPAD') {
    g.font = `800 ${Math.round(r * 0.72)}px ${FONT}`;
    g.fillText('A/+', cx, cy + r * 0.04);
  } else if (input && input.startsWith('BUTTON_DPAD')) {
    cross(r * 1.25, ARROW[input]);
  } else {
    const label = { TOUCH_TAP: 'Tap', TOUCH_FLICK: 'Flick', TOUCH_RELEASE: 'Release', TOUCH_QUICK_TAP: 'Quick\nTap', TOUCH_SLIDE: 'Slide' }[input] || 'Tap';
    const lines = label.split('\n');
    const fs = Math.round(r * (lines.length > 1 ? 0.4 : 0.48));
    g.font = `800 ${fs}px ${FONT}`;
    lines.forEach((ln, i) => g.fillText(ln, cx, cy + (i - (lines.length - 1) / 2) * fs * 1.05));
  }
}

// ブロックの小さいアイコン（プレイアロング）
function drawPlayalongIcon(g, x, y, s) {
  g.save();
  g.fillStyle = '#3fb7c9';
  g.fillRect(x, y, s, s);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.36, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#3fb7c9';
  g.font = `800 ${Math.round(s * 0.46)}px ${FONT}`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('A', x + s / 2, y + s / 2 + s * 0.03);
  g.restore();
}

// プレイアロングの記号（A＝赤い丸、B＝黄色い丸、十字＝灰色の十字と矢印、タッチ＝指の丸）。描いた幅を返す
const ARROW = { BUTTON_DPAD_UP: -Math.PI / 2, BUTTON_DPAD_DOWN: Math.PI / 2, BUTTON_DPAD_LEFT: Math.PI, BUTTON_DPAD_RIGHT: 0 };
export function drawInputGlyph(g, input, x, y, s) {
  const circle = (cx, cy, r, fill, letter, ink) => {
    g.fillStyle = fill; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = ink; g.font = `800 ${Math.round(r * 1.25)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(letter, cx, cy + r * 0.06);
  };
  const cross = (cx, cy, size, dir) => {
    const a = size * 0.34, b = size / 2;
    g.fillStyle = '#5a5f66';
    g.fillRect(cx - a / 2, cy - b, a, size); g.fillRect(cx - b, cy - a / 2, size, a);
    if (dir != null) {
      g.save(); g.translate(cx, cy); g.rotate(dir);
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(b * 0.95, 0); g.lineTo(b * 0.45, -a * 0.42); g.lineTo(b * 0.45, a * 0.42); g.closePath(); g.fill();
      g.restore();
    }
  };
  g.save();
  const r = s / 2;
  let wDrawn = s;
  if (input === 'BUTTON_A') circle(x + r, y + r, r * 0.92, '#e8504a', 'A', '#fff');
  else if (input === 'BUTTON_B') circle(x + r, y + r, r * 0.92, '#f2c230', 'B', '#2a2200');
  else if (input === 'BUTTON_A_OR_DPAD') {
    circle(x + r * 0.7, y + r, r * 0.66, '#e8504a', 'A', '#fff');
    cross(x + s + r * 0.15, y + r, s * 0.78, null);
    wDrawn = s * 1.6;
  } else if (input && input.startsWith('BUTTON_DPAD')) cross(x + r, y + r, s * 0.92, ARROW[input]);
  else {
    // タッチ：白い丸に点（フリック・スライドは矢印つき）
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + r, y + r, r * 0.86, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#3a8f6a'; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#3a8f6a'; g.beginPath(); g.arc(x + r, y + r, r * 0.28, 0, Math.PI * 2); g.fill();
    if (input === 'TOUCH_FLICK' || input === 'TOUCH_SLIDE') {
      g.strokeStyle = '#3a8f6a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + r * 0.5, y + r * 1.55); g.lineTo(x + r * 1.6, y + r * 0.45); g.stroke();
    }
    if (input === 'TOUCH_RELEASE' || input === 'TOUCH_QUICK_TAP') {
      g.strokeStyle = '#3a8f6a'; g.lineWidth = 2;
      g.beginPath(); g.arc(x + r, y + r, r * 0.55, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    }
  }
  g.restore();
  return wDrawn;
}

function wrap(g, text, maxW, maxLines) {
  const out = [];
  let line = '';
  for (const ch of text) {
    if (g.measureText(line + ch).width > maxW && line) {
      out.push(line);
      line = ch === ' ' ? '' : ch;
      if (out.length === maxLines) return out.map((l, i) => (i === maxLines - 1 ? l.replace(/.$/, '…') : l));
    } else line += ch;
  }
  if (line) out.push(line);
  return out;
}
