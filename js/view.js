// エディタ画面（トラックとエンティティ）の描画とタッチ操作。見た目は RHRE fresh のデスクトップ版の配置に合わせている。

const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", system-ui, sans-serif';

export const C = {
  bg: '#242424',
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
    this.hover = null; // マウスで置く位置の目安
    this.moveState = null;
    this.resizeState = null;
    this.snap = 0.25;
    this.dirty = true;
    this.lastUser = 0;
    this.pointers = new Map();
    this.momentum = null;
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
    const infoH = compact ? 36 : clamp(this.H * 0.16, 46, 74);
    const rulerH = compact ? 18 : 22;
    const tempoH = compact ? 24 : 38;
    const avail = this.H - infoH - rulerH - tempoH - 6;
    const rowH = clamp(avail / tc, 18, 64);
    const tracksTop = infoH + rulerH;
    return { infoH, rulerH, tempoH, rowH, tracksTop, tracksBottom: tracksTop + rowH * tc, tc };
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
      cv.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      this.momentum = null;
      this.lastUser = performance.now();
      if (this.pointers.size === 1) {
        const L = this.remix ? this.layout() : null;
        let mode = 'scroll', edge = null;
        if (L && e.offsetY >= L.tracksTop && e.offsetY <= L.tracksBottom) {
          edge = this.edgeAt(e.offsetX, e.offsetY, L);
          if (edge) mode = 'resize';
          else {
            const hit = this.hitTest(e.offsetX, e.offsetY, L);
            if (hit && this.selection.has(hit) && this.h.canEdit?.()) mode = 'move';
          }
        }
        this.drag = { mode, edge, x0: e.offsetX, y0: e.offsetY, s0: this.scrollBeat, t0: performance.now(), moved: false, vx: 0, lx: e.offsetX, lt: performance.now(), shift: e.shiftKey || e.ctrlKey || e.metaKey };
        this.pinch = null;
      } else if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const mid = (a.x + b.x) / 2;
        this.pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, ppb0: this.ppb, midBeat: this.beatAt(mid) };
        this.drag = null;
        this.moveState = null;
        this.resizeState = null;
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
      if (d.mode === 'move') {
        const dBeat = this.snapRound(this.beatAt(e.offsetX) - this.beatAt(d.x0));
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
      const ms = this.moveState, rs = this.resizeState;
      this.moveState = null;
      this.resizeState = null;
      this.dirty = true;
      if (!d || e.type === 'pointercancel') return;
      if (!d.moved) {
        if (performance.now() - d.t0 < 600) this.tap(e.offsetX, e.offsetY, d.shift);
        return;
      }
      if (d.mode === 'move' && ms && (ms.dBeat || ms.dTrack)) this.h.onMove?.(ms.dBeat, ms.dTrack);
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
      if (y <= L.tracksBottom + L.tempoH + 6) {
        const marker = this.remix.tempoMarkerNear(this.beatAt(x), 16 / this.ppb);
        this.h.onTempoTap?.(this.snapFloor(this.beatAt(x)), marker);
      }
      return;
    }
    const hit = this.hitTest(x, y, L);
    if (hit) this.h.onSelect?.(hit, additive);
    else if (this.armed) this.h.onPlace?.(this.snapFloor(this.beatAt(x)), this.trackAt(y, L));
    else this.h.onSelect?.(null, additive);
    this.dirty = true;
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
    if (this.ppb >= 90) {
      g.strokeStyle = 'rgba(156,199,238,0.16)';
      g.lineWidth = 1;
      g.beginPath();
      for (let b = Math.floor(b0 / 0.25) * 0.25; b <= b1; b += 0.25) {
        if (Math.abs(b - Math.round(b)) < 1e-6) continue;
        const x = Math.round(this.x(b)) + 0.5;
        g.moveTo(x, L.tracksTop); g.lineTo(x, L.tracksBottom);
      }
      g.stroke();
    }
    for (let b = Math.floor(b0); b <= b1; b++) {
      const { beatInMeasure } = R.measureAt(b);
      const isMeasure = Math.abs(beatInMeasure) < 1e-6;
      const x = Math.round(this.x(b)) + 0.5;
      if (step === 1 || b % step === 0 || isMeasure) {
        g.strokeStyle = isMeasure ? 'rgba(156,199,238,0.95)' : 'rgba(156,199,238,0.5)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, L.tracksTop); g.lineTo(x, L.tracksBottom); g.stroke();
      }
      if (b % step === 0) {
        g.fillStyle = C.beatNum;
        g.fillText(String(b), x, L.tracksTop - 4);
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
    for (const ts of R.timeSignatures) {
      const x = this.x(ts.beat) + 2;
      if (x > W || x < -tsSize) continue;
      const mid = (L.tracksTop + L.tracksBottom) / 2;
      g.fillText(String(ts.perMeasure), x, mid - tsSize * 0.42);
      g.fillText(String(ts.unit), x, mid + tsSize * 0.46);
    }

    // エンティティ
    for (const e of R.entities) {
      if (e.minBeat > b1 || e.maxBeat < b0) continue;
      this.drawEntity(g, e, L, now);
    }
    this.drawEditOverlay(g, L);

    // テンポ変更・音量変更
    const ty = L.tracksBottom + 3;
    const triH = Math.min(18, L.tempoH - 6);
    g.font = `700 ${Math.min(16, L.tempoH - 8)}px ${FONT}`;
    g.textBaseline = 'top';
    for (const t of R.tempo.list) {
      const x = this.x(t.beat);
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
    g.font = `700 12px ${FONT}`;
    g.textBaseline = 'bottom';
    for (const mv of R.musicVolumes) {
      const x = this.x(mv.beat);
      if (x < -100 || x > W + 10) continue;
      g.fillStyle = C.volText;
      g.fillRect(x - 1, L.tracksTop - 16, 2, 16);
      g.fillText(`音量 ${mv.volume}%`, x + 4, L.tracksTop - 2);
    }

    // 音楽開始（赤）と再生開始（緑）の旗
    const musicBeat = R.tempo.s2b(R.musicStartSec);
    this.drawFlag(g, L, musicBeat, C.music, 4, '音楽開始', [fmtTime(R.musicStartSec)], R.musicPresent);
    const pbSec = R.tempo.b2s(R.playbackStart);
    this.drawFlag(g, L, R.playbackStart, C.playback, L.infoH * 0.5, '再生開始', [`Beat ${R.playbackStart.toFixed(3)}`, fmtTime(pbSec)], true);

    // 再生位置
    if (this.playhead != null) {
      const x = Math.round(this.x(this.playhead)) + 0.5;
      g.strokeStyle = C.playhead;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, L.infoH); g.lineTo(x, L.tracksBottom); g.stroke();
    }
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
    if (this.drop) {
      const d = this.drop;
      ghost(d.beat, d.track, d.width, d.height, d.valid);
    }
    if (this.hover && this.armed) {
      const a = this.armed;
      const t = Math.max(0, Math.min(this.hover.track, L.tc - a.height));
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
    g.fillStyle = base;
    g.fillRect(x, y, w, h);

    // 中の cue の位置（デスクトップ版と同じく薄い枠）
    if (e.leaves.length > 1 || (e.leaves[0] && e.type !== 'cue')) {
      g.lineWidth = 1;
      for (const lf of e.leaves) {
        const lx = this.x(lf.beat), lw = Math.max(2, lf.width * this.ppb);
        const ly = L.tracksTop + lf.track * L.rowH + 3;
        const inside = lf.beat >= e.beat - 1e-6 && lf.beat + lf.width <= e.beat + e.width + 1e-6;
        if (!inside) {
          // 枠の外で鳴る音（パターンの前に鳴る準備音など）は、エンティティの色で示す
          g.globalAlpha = 0.22;
          g.fillStyle = base;
          g.fillRect(lx, ly, lw, L.rowH - 6);
          g.globalAlpha = 0.75;
          g.strokeStyle = base;
        } else {
          g.strokeStyle = 'rgba(0,0,0,0.28)';
        }
        g.strokeRect(Math.round(lx) + 0.5, Math.round(ly) + 0.5, Math.round(lw) - 1, Math.round(L.rowH - 6));
        g.globalAlpha = 1;
      }
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

    if (w < 14) return;
    g.save();
    g.beginPath(); g.rect(x + 2, y + 2, w - 4, h - 4); g.clip();
    const iconSize = Math.min(L.rowH - 8, 30);
    let tx = x + 4;
    const icon = e.game ? getIcon(e.game.icon, () => { this.dirty = true; }) : null;
    if (icon && w > iconSize + 6) {
      g.imageSmoothingEnabled = false;
      g.drawImage(icon, x + 4, y + (Math.min(h, L.rowH) - iconSize) / 2, iconSize, iconSize);
      tx += iconSize + 3;
    }
    const fs = clamp(L.rowH * 0.36, 10, 14);
    g.font = `700 ${fs}px ${FONT}`;
    g.fillStyle = '#121212';
    g.textAlign = 'left';
    g.textBaseline = 'top';
    const maxW = x + w - 4 - tx;
    if (maxW > 8) {
      const lines = wrap(g, e.name, maxW, Math.max(1, Math.floor((h - 4) / (fs + 2))));
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
