import { loadRemix, loadRemixJSON, emptyRemixJSON, cleanName, isMulti, DEFAULT_DB_COMMIT } from './remix.js?v=11';
import { AudioEngine, Player, Previewer, renderWav, detectOnset } from './audio.js?v=13';
import { customRegistry } from './db.js?v=8';
import { t, setLang, applyStatic } from './i18n.js?v=11';
import { EditorView, fmtTime, LABELS, applyTheme } from './view.js?v=18';
import { makeZip } from './zip.js?v=4';
import { PLAYALONG_GAME_ID, PlayalongJudge, WINDOW } from './playalong.js?v=2';

const VERSION = '2.8';
const t2 = t; // ループの変数名 t と重ならないように
const CUSTOM_GAME_ID = 'custom_web';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isTouch = window.matchMedia('(pointer: coarse)').matches;
const isAndroid = /Android/.test(navigator.userAgent);

const engine = new AudioEngine();
const player = new Player(engine);
const previewer = new Previewer(engine);

let remix = null;
let musicFile = null; // { bytes, filename, extension }
let musicBuf = null;
let extraFiles = [];
let fileName = 'remix.rhref';
let mode = 'stopped'; // stopped | playing | paused
let pausedSec = 0;
let loading = false;
let metronome = false;
let multiSelect = false;
let armed = null; // 置こうとしているデータモデル（一覧で名前を押したもの）
let pasteArmed = false; // 貼り付ける場所を待っている
let clipboard = null; // { items: [{ json, dB, dT }], width, height }
const textureImages = new Map(); // texHash → Image
const undoStack = [];
const redoStack = [];

const SNAPS = [[1, '1'], [0.5, '1/2'], [0.25, '1/4'], [0.125, '1/8'], [0.0625, '1/16'], [0.03125, '1/32']];

// 並び：シリーズ → 特殊 → 使用中・お気に入り・最近・カスタム（検索は右端に固定）
const SERIES_TABS = [
  ['tengoku', 'GBA'], ['ds', 'DS'], ['fever', 'Wii'], ['megamix', '3DS'], ['groove', 'Groove'], ['side', 'サイド'],
  ['other', 'その他'], ['special', '特殊'], ['used', '使用中'], ['fav', 'お気に入り'], ['recent', '最近'], ['custom', 'カスタム'],
];
let gamesIndex = [];

// 設定（ブラウザに保存）。lang はミニゲームの言語違い（声）をどれで出すか
const SETTINGS_KEY = 'rhre-web-settings';
const settings = (() => {
  try { return { lang: 'ja', ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (_) { return { lang: 'ja' }; }
})();
// この端末で無音の <audio> がないと鳴らなかったことがあれば、次からも使う
if (settings.keepAlive) engine.useKeepAlive = true;
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (_) { /* 保存できない環境 */ } }
let currentTab = 'used';
let playMode = false; // プレイモード（ボタンのキューに合わせて押して遊ぶ）
let judge = null;
let shownGame = null;

const view = new EditorView($('view'), {
  canEdit: () => !!remix && mode !== 'playing' && !loading && !presenting,
  isStretchable: (e) => !!remix && remix.isStretchable(e),
  onSelect: (ent, additive) => { if (!presenting) selectEntity(ent, additive); },
  onPlace: (beat, track) => (pasteArmed ? pasteAt(beat, track) : placeArmed(beat, track)),
  validateMove: (dB, dT) => moveValid(dB, dT),
  onMove: (dB, dT) => doMove(dB, dT),
  validateResize: (ent, b, w) => !remix.collides(b, ent.track, w, ent.height, new Set([ent])),
  onResize: (ent, b, w) => {
    if (remix.collides(b, ent.track, w, ent.height, new Set([ent]))) { toast('ほかのブロックと重なるので、その長さにはできません', 2500); return; }
    if (edit(() => { ent.beat = b; ent.width = w; })) setStatus(describe(ent));
  },
  onSetPlaybackStart: (beat) => {
    if (!remix) return;
    remix.playbackStart = beat;
    if (mode === 'playing') startPlayback(remix.tempo.b2s(beat));
    else { mode = 'stopped'; updateButtons(); updateTimebox(remix.tempo.b2s(beat), beat); }
    view.dirty = true;
    scheduleAutosave();
  },
  onMarkerTap: (beat, snapped, tol) => openMarker(beat, snapped, tol),
  onMarkerGrab: (kind) => setStatus(t(kind === 'tempo' ? 'テンポの印をつかみました。左右に動かしてください' : '音量の印をつかみました。左右に動かしてください')),
  validateMarkerMove: (kind, from, to) => !!remix && !(kind === 'tempo' ? remix.tempoTrackers : remix.musicVolumes)
    .some((m) => Math.abs(m.beat - to) < 1e-6 && Math.abs(m.beat - from) > 1e-6),
  onMoveMarker: (kind, from, to) => moveMarker(kind, from, to),
  onTimeSigTap: (box) => openTsEditor(box),
  isMultiSelect: () => multiSelect,
  onBoxStart: () => { multiSelect = true; updateCtxbar(); setStatus(t('範囲を指でなぞって選んでください')); },
  onBoxSelect: (hits, additive) => {
    if (!additive) view.selection.clear();
    for (const h of hits) view.selection.add(h);
    if (hits.length) multiSelect = true;
    view.dirty = true;
    updateCtxbar();
    setStatus(t('{n} 個を選択中', { n: view.selection.size }));
  },
  textureImage: (ent) => textureImages.get(ent.extra?.texHash) || null,
  onSetMusicStart: (beat) => {
    if (!remix) return;
    // 秒を丸めると目盛りから少しずれるので、そのままの値で持つ
    const sec = remix.tempo.b2s(beat);
    if (edit(() => { remix.musicStartSec = sec; })) setStatus(`音楽開始を ${fmtTime(sec)} にしました（元に戻すボタンで戻せます）`);
  },
  onFlagTap: () => { setStatus('赤い旗（音楽開始）は、横にドラッグすると動かせます'); },
});

// ---------------------------------------------------------------- 表示まわり

function setStatus(text) { $('statusText').textContent = text; }

// ステータスバーの基本表示（編集のたびに数え直す）
let loadWarn = '';
function summaryText() {
  if (!remix) return '';
  return `${fileName} ／ ${fmtTime(remix.durationSec)} ／ ${t('ミニゲーム {g} 種・ブロック {n} 個', { g: usedGames().length, n: remix.entities.length })}${loadWarn}`;
}

let toastTimer = 0;
function toast(msg, ms = 6000, kind = '') {
  const el = $('toast');
  el.textContent = msg;
  el.className = kind;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function showLoading(title, msg, frac) {
  $('loading').hidden = false;
  $('loadTitle').textContent = title;
  $('loadMsg').textContent = msg;
  $('loadMsg').classList.remove('err');
  $('loadBar').style.width = `${Math.round((frac ?? 0) * 100)}%`;
}

function showError(msg) {
  $('loading').hidden = false;
  $('loadTitle').textContent = '開けませんでした';
  $('loadMsg').textContent = msg;
  $('loadMsg').classList.add('err');
  $('loadBar').style.width = '0';
}

function updateButtons() {
  const ready = !!remix && !loading;
  $('playBtn').disabled = !ready || mode === 'playing';
  $('pauseBtn').disabled = mode !== 'playing';
  $('stopBtn').disabled = mode === 'stopped';
  $('exportBtn').disabled = !ready;
  $('saveBtn').disabled = !ready;
  $('undoBtn').disabled = !ready || !undoStack.length;
  $('redoBtn').disabled = !ready || !redoStack.length;
  document.documentElement.classList.toggle('pa-playing', playMode && mode === 'playing');
  // 編集バーの再生ボタンも同じ状態に
  for (const [c, id] of [['play', 'playBtn'], ['pause', 'pauseBtn'], ['stop', 'stopBtn']]) {
    const b = $('ctxbar').querySelector(`[data-c="${c}"]`);
    if (b) b.disabled = $(id).disabled;
  }
}

function updateTimebox(sec, beat) {
  $('timeText').textContent = fmtTime(sec);
  $('beatText').textContent = `Beat ${beat.toFixed(3)}`;
}

function describe(ent) {
  const parts = [];
  if (ent.game) parts.push(ent.game.name);
  parts.push(ent.name);
  parts.push(t('拍 {b}', { b: +ent.beat.toFixed(3) }));
  if (ent.width) parts.push(t('長さ {w}', { w: +ent.width.toFixed(3) }));
  if (ent.semitone) parts.push(t('音程 {s}', { s: `${ent.semitone > 0 ? '+' : ''}${ent.semitone}` }));
  if (ent.volume !== 100) parts.push(t('音量 {v}%', { v: ent.volume }));
  if (!ent.o) parts.push('（データベースに無い ID）');
  return parts.join(' ／ ');
}

// 「[#FED900]yellow flower[] - launch」の色指定を反映する
function richName(name) {
  const frag = document.createDocumentFragment();
  const re = /\[(#[0-9a-fA-F]{6}|[A-Z_]+)?\]/g;
  let last = 0, color = null, m;
  const push = (t) => {
    if (!t) return;
    const s = document.createElement('span');
    s.textContent = t;
    if (color && color.startsWith('#')) s.style.color = color;
    frag.appendChild(s);
  };
  while ((m = re.exec(name))) {
    push(name.slice(last, m.index));
    color = m[1] || null;
    last = re.lastIndex;
  }
  push(name.slice(last));
  return frag;
}

// ---------------------------------------------------------------- 編集の土台（元に戻す・自動保存）

function edit(fn) {
  if (!remix || loading) return false;
  if (mode === 'playing') { toast('再生中は編集できません。■ で止めてから編集してください。', 3500, 'info'); return false; }
  const snap = remix.snapshot();
  const r = fn();
  if (r === false) return false;
  remix.rebuild();
  undoStack.push(snap);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  afterEdit();
  return true;
}

function afterEdit() {
  for (const e of [...view.selection]) if (!remix.entities.includes(e)) view.selection.delete(e);
  if (mode === 'paused') { mode = 'stopped'; view.playhead = null; }
  view.dirty = true;
  updateButtons();
  updateCtxbar();
  if (currentTab === 'used' && !$('search').value) renderGrid();
  scheduleAutosave();
}

function undo() {
  if (!remix || !undoStack.length) return;
  if (mode === 'playing') { toast('再生中は元に戻せません。', 2500, 'info'); return; }
  redoStack.push(remix.snapshot());
  remix.restore(undoStack.pop());
  view.selection.clear();
  afterEdit();
}

function redo() {
  if (!remix || !redoStack.length) return;
  if (mode === 'playing') return;
  undoStack.push(remix.snapshot());
  remix.restore(redoStack.pop());
  view.selection.clear();
  afterEdit();
}

// IndexedDB に作業中のリミックスを保存（次に開いたとき続きから）
const store = {
  db: null,
  open() {
    if (this.db) return this.db;
    this.db = new Promise((res, rej) => {
      try {
        const req = indexedDB.open('rhre-web', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      } catch (e) { rej(e); }
    });
    return this.db;
  },
  async get(key) {
    try {
      const db = await this.open();
      return await new Promise((res, rej) => { const r = db.transaction('kv').objectStore('kv').get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    } catch (_) { return undefined; }
  },
  async set(key, val) {
    try {
      const db = await this.open();
      await new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(val, key); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
    } catch (_) { /* 保存できない環境では何もしない */ }
  },
};

let autosaveTimer = 0;
function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (!remix) return;
    store.set('remix', { json: remix.toJSON(musicFile), name: fileName, extra: extraFiles, savedAt: Date.now() });
  }, 700);
}
function saveMusicToStore() { store.set('music', musicFile || null); }

// ---------------------------------------------------------------- 選ぶ・置く・動かす

function selectEntity(ent, additive) {
  if (!remix) return;
  const sel = view.selection;
  if (!ent) {
    if (!multiSelect && !additive) sel.clear();
  } else if (multiSelect || additive) {
    if (sel.has(ent)) sel.delete(ent); else sel.add(ent);
  } else {
    sel.clear();
    sel.add(ent);
  }
  view.dirty = true;
  updateCtxbar();
  if (sel.size === 1) {
    const e = [...sel][0];
    setStatus(describe(e));
    if (!armed && e.game && !e.game.id.startsWith('special')) showGameList(e.game, e.o);
  } else if (sel.size > 1) setStatus(`${sel.size} 個を選択中`);
  else setStatus(armed ? armHint() : summaryText());
}

function placeAt(o, beat, track) {
  if (!o || !remix) return false;
  if (mode === 'playing') { toast('再生中は置けません。■ で止めてから置いてください。', 3000, 'info'); return false; }
  const ent = remix.createEntity(o, beat, o.type === 'playalongEntity' ? remix.trackCount - 1 : track);
  if (o.game?.id === CUSTOM_GAME_ID) ent.isCustom = true;
  if (remix.collides(ent.beat, ent.track, ent.width, ent.height)) { toast(t('ほかのブロックと重なるので置けません'), 2200); return false; }
  if (!edit(() => { remix.entities.push(ent); })) return false;
  view.selection.clear();
  view.selection.add(ent);
  updateCtxbar();
  setStatus(`${t('置きました')}：${describe(ent)}`);
  engine.loadSounds(remix.soundUrlsOf(o), remix.db);
  if (o.game && !o.game.id.startsWith('special')) {
    settings.recent = [o.game.id, ...(settings.recent || []).filter((x) => x !== o.game.id)].slice(0, 30);
    saveSettings();
  }
  if (o.type === 'subtitleEntity') openTextEditor(ent);
  if (o.type === 'textureEntity') pickTexture(ent);
  return true;
}

// ---------------------------------------------------------------- 一覧で名前を押してから、トラックをタップして置く

function armHint() { return t('「{name}」を置く：トラックの空いている所をタップ', { name: cleanName(armed.name) }); }

function setArmed(o) {
  armed = o;
  if (o) pasteArmed = false;
  view.armed = o && remix ? { width: remix.model.defaultWidth(o), height: remix.model.height(o, remix.trackCount), bottom: o.type === 'playalongEntity' } : null;
  view.hover = null;
  view.dirty = true;
  for (const row of $('list').querySelectorAll('.item')) row.classList.toggle('sel', !!o && row.dataset.id === o.id);
  updateCtxbar();
  setStatus(o ? armHint() : summaryText());
  if (o && remix) engine.loadSounds(remix.soundUrlsOf(o), remix.db);
}

function placeArmed(beat, track) {
  if (!armed) return;
  placeAt(armed, beat, track);
  updateCtxbar();
}

function moveValid(dB, dT) {
  const sel = view.selection;
  for (const e of sel) if (remix.collides(e.beat + dB, e.track + dT, e.width, e.height, sel)) return false;
  return true;
}

function doMove(dB, dT) {
  if (!moveValid(dB, dT)) { toast('ほかのブロックと重なるので動かせません', 2200); return; }
  edit(() => { for (const e of view.selection) { e.beat += dB; e.track += dT; } });
  const sel = [...view.selection];
  if (sel.length === 1) setStatus(describe(sel[0]));
}

function deleteSelection() {
  const sel = view.selection;
  if (!sel.size) return;
  const n = sel.size;
  if (edit(() => { remix.entities = remix.entities.filter((e) => !sel.has(e)); })) {
    sel.clear();
    updateCtxbar();
    setStatus(`${n} 個を削除しました（元に戻すボタンで戻せます）`);
  }
}

function copySelection() {
  const sel = [...view.selection];
  if (!sel.length) return;
  const minB = Math.min(...sel.map((e) => e.beat));
  const minT = Math.min(...sel.map((e) => e.track));
  clipboard = {
    items: sel.map((e) => ({ json: remix.entToJSON(e), dB: e.beat - minB, dT: e.track - minT })),
    width: Math.max(...sel.map((e) => e.beat + e.width)) - minB,
    height: Math.max(...sel.map((e) => e.track + e.height)) - minT,
  };
  startPaste();
  setStatus(t('{n} 個をコピーしました。貼り付ける場所をタップしてください', { n: sel.length }));
}

function startPaste() {
  if (!clipboard) return;
  if (armed) setArmed(null);
  pasteArmed = true;
  view.armed = { width: clipboard.width, height: clipboard.height };
  view.dirty = true;
  updateCtxbar();
  setStatus(t('貼り付ける場所をタップしてください（続けて貼れます）'));
}

function pasteAt(beat, track) {
  if (!clipboard) return;
  const tr = clamp(track, 0, Math.max(0, remix.trackCount - clipboard.height));
  const items = clipboard.items.map((it) => {
    const c = remix.entFromJSON(it.json);
    c.beat = beat + it.dB;
    c.track = tr + it.dT;
    return c;
  });
  if (items.some((c) => remix.collides(c.beat, c.track, c.width, c.height))) { toast(t('ほかのブロックと重なるので貼り付けられません'), 2500); return; }
  if (!edit(() => { remix.entities.push(...items); })) return;
  view.selection.clear();
  for (const c of items) view.selection.add(c);
  updateCtxbar();
  setStatus(t('{n} 個を貼り付けました', { n: items.length }));
}

function splitSelection() {
  const sel = [...view.selection];
  if (sel.length !== 1 || !remix.model.canSplit(sel[0].o)) { toast(t('このブロックは分けられません'), 2200, 'info'); return; }
  const e = sel[0];
  const kids = remix.model.children(e.o, e.beat, e.track, e.width, e.semitone, e.volume, remix.trackCount).map((j) => remix.entFromJSON(j));
  const ignore = new Set([e]);
  for (let i = 0; i < kids.length; i++) {
    const k = kids[i];
    if (remix.collides(k.beat, k.track, k.width, k.height, ignore)) { toast(t('分けると、ほかのブロックと重なります'), 2500); return; }
    ignore.add(k);
  }
  // 子どうしの重なりは RHRE でも起きうるので、外のブロックとの重なりだけ確かめる
  if (!edit(() => { remix.entities = remix.entities.filter((x) => x !== e); remix.entities.push(...kids); })) return;
  view.selection.clear();
  for (const k of kids) view.selection.add(k);
  multiSelect = kids.length > 1 || multiSelect;
  updateCtxbar();
  setStatus(t('{n} 個に分けました', { n: kids.length }));
}

function duplicateSelection() {
  const sel = [...view.selection];
  if (!sel.length) return;
  const minB = Math.min(...sel.map((e) => e.beat));
  const maxE = Math.max(...sel.map((e) => e.beat + e.width));
  const step = view.snap > 0 ? view.snap : 0.25;
  const span = Math.max(step, Math.ceil((maxE - minB) / step - 1e-9) * step);
  for (let k = 1; k <= 32; k++) {
    // 複製の置き場所も目盛りにぴったり合わせる
    const off = Math.round((minB + span * k) / step) * step - minB;
    if (sel.every((e) => !remix.collides(e.beat + off, e.track, e.width, e.height))) {
      const copies = sel.map((e) => { const c = remix.entFromJSON(remix.entToJSON(e)); c.beat += off; return c; });
      if (edit(() => { remix.entities.push(...copies); })) {
        view.selection.clear();
        for (const c of copies) view.selection.add(c);
        updateCtxbar();
        setStatus(`${copies.length} 個を複製しました`);
      }
      return;
    }
  }
  toast('複製を置ける空きが見つかりませんでした', 2500);
}

function changeSemitone(d) {
  const targets = [...view.selection].filter((e) => remix.canRepitch(e));
  if (!targets.length) { toast('選んだブロックは音程を変えられません', 2200, 'info'); return; }
  edit(() => { for (const e of targets) e.semitone = clamp(e.semitone + d, -36, 36); });
  previewSelection();
}

function changeVolume(d) {
  const targets = [...view.selection].filter((e) => remix.hasVolume(e));
  if (!targets.length) { toast('選んだブロックは音量を変えられません', 2200, 'info'); return; }
  edit(() => { for (const e of targets) e.volume = clamp(e.volume + d, 0, 300); });
}

// 音程を変えたとき、1つだけ選んでいればその音を鳴らして確かめられるようにする
function previewSelection() {
  const sel = [...view.selection];
  if (sel.length !== 1 || !sel[0].o) return;
  const e = sel[0];
  engine.unlock();
  const evs = remix.buildSoundEvents(() => 0).filter((ev) => ev.ent === e);
  if (!evs.length) return;
  const t0 = Math.min(...evs.map((ev) => ev.start));
  previewer.play(evs.map((ev) => ({ ...ev, start: ev.start - t0, end: ev.end - t0 })));
}

const ICON = {
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  copy: '<svg viewBox="0 0 24 24"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M5 12h14M12 5v14"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6" fill="#fff"/><circle cx="12" cy="12" r="1.6" fill="#fff"/><circle cx="19" cy="12" r="1.6" fill="#fff"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7L4 12l5 5"/><path d="M4 12h10a6 6 0 0 1 0 12"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="M15 7l5 5-5 5"/><path d="M20 12H10a6 6 0 0 0 0 12"/></svg>',
};

function updateCtxbar() {
  const bar = $('ctxbar');
  const show = (on) => { bar.hidden = !on; $('toolbar').hidden = on; };
  closeMore();
  if (!remix) { show(false); return; }
  const sel = [...view.selection];
  if (!sel.length && !multiSelect && !pasteArmed) { show(false); return; }
  const one = sel.length === 1 ? sel[0] : null;
  // 再生中も編集バーは出したまま（右端の再生・一時停止・停止を使えるように）。編集のボタンだけ押せなくする
  const playing = mode === 'playing';
  const dis = sel.length && !playing ? '' : ' disabled';
  const grp = (html) => `<span class="grp">${html}</span>`;
  const btn = (c, icon, label, extra = '') => `<button class="tb${extra}" data-c="${c}" title="${esc(t(label))}" aria-label="${esc(t(label))}"${dis}>${icon}</button>`;
  let html = grp(`<button class="tb" data-c="clear" title="${esc(t('選択をやめる'))}" aria-label="${esc(t('選択をやめる'))}">${ICON.close}</button><span class="lbl">${sel.length}${t('個') === '個' ? '個' : ' ' + t('個')}</span>`)
    + grp(`<button class="tb" data-c="undo" title="${esc(t('元に戻す'))}" aria-label="${esc(t('元に戻す'))}"${undoStack.length && !playing ? '' : ' disabled'}>${ICON.undo}</button>`
      + `<button class="tb" data-c="redo" title="${esc(t('やり直す'))}" aria-label="${esc(t('やり直す'))}"${redoStack.length && !playing ? '' : ' disabled'}>${ICON.redo}</button>`)
    + grp(btn('del', ICON.trash, '削除', ' danger') + btn('dup', ICON.copy, '複製') + `<button class="tb" data-c="more" title="${esc(t('その他の操作'))}" aria-label="${esc(t('その他の操作'))}">${ICON.more}</button>`)
    + grp(`<button class="txtbtn${multiSelect ? ' on' : ''}" data-c="multi" aria-pressed="${multiSelect}">${esc(t('複数選択'))}</button>`);
  // 字幕・画像を1つ選んでいるときは、それ専用のボタン
  if (one?.type === 'subtitleEntity') html += grp(`<button class="txtbtn" data-c="text"${playing ? ' disabled' : ''}>${esc(t('文字を編集'))}</button>`);
  if (one?.type === 'textureEntity') html += grp(`<button class="txtbtn" data-c="image"${playing ? ' disabled' : ''}>${esc(t('画像を選ぶ'))}</button>`);
  // 音程・音量は、変えられるブロックがあるときだけ
  if (!sel.length || sel.some((e) => remix.canRepitch(e))) {
    const semi = one ? (one.semitone > 0 ? `+${one.semitone}` : `${one.semitone}`) : '…';
    html += grp(`<span class="hint">${esc(t('音程'))}</span>${btn('semi-', ICON.minus, '音程')}<span class="val"><small>${esc(t('音程'))}</small>${semi}</span>${btn('semi+', ICON.plus, '音程')}`);
  }
  if (!sel.length || sel.some((e) => remix.hasVolume(e))) {
    const vol = one ? `${one.volume}%` : '…';
    html += grp(`<span class="hint">${esc(t('音量'))}</span>${btn('vol-', ICON.minus, '音量')}<span class="val"><small>${esc(t('音量'))}</small>${vol}</span>${btn('vol+', ICON.plus, '音量')}`);
  }
  // 右端に、上のツールバーと同じ 一時停止・再生・停止
  const tr = (c, id, label) => `<button class="tb tr-${c}" data-c="${c}" title="${esc(t(label))}" aria-label="${esc(t(label))}"${$(id).disabled ? ' disabled' : ''}>${$(id).innerHTML}</button>`;
  html += `<span class="grp ctx-transport">${tr('pause', 'pauseBtn', '一時停止')}${tr('play', 'playBtn', '再生')}${tr('stop', 'stopBtn', '停止')}</span>`;
  bar.innerHTML = html;
  show(true);
}

// 「…」：コピー・貼り付け・分解（あまり使わないものはここにまとめる）
function openMore(anchor) {
  const m = $('moreMenu');
  const sel = [...view.selection];
  const canSplit = sel.length === 1 && remix.model.canSplit(sel[0].o);
  m.innerHTML = `<button data-m="copy"${sel.length ? '' : ' disabled'}>${esc(t('コピー'))}</button>`
    + `<button data-m="paste"${clipboard ? '' : ' disabled'}>${esc(t('貼り付け'))}</button>`
    + `<button data-m="split"${canSplit ? '' : ' disabled'}>${esc(t('分解'))}</button>`;
  m.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = m.offsetWidth;
  m.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2))}px`;
  m.style.top = `${r.bottom + 6}px`;
}
function closeMore() { const m = $('moreMenu'); if (m) m.hidden = true; }
$('ctxbar').addEventListener('click', (e) => {
  const c = e.target.closest('[data-c]')?.dataset.c;
  if (!c) return;
  switch (c) {
    case 'disarm': setArmed(null); break;
    case 'undo': undo(); break;
    case 'redo': redo(); break;
    case 'play': play(); break;
    case 'pause': pause(); break;
    case 'stop': stopPlayback(); break;
    case 'del': deleteSelection(); break;
    case 'dup': duplicateSelection(); break;
    case 'semi-': changeSemitone(-1); break;
    case 'semi+': changeSemitone(1); break;
    case 'vol-': changeVolume(-10); break;
    case 'vol+': changeVolume(10); break;
    case 'multi': multiSelect = !multiSelect; updateCtxbar(); if (multiSelect) setStatus(t('範囲を指でなぞって選んでください')); break;
    case 'more': { const m = $('moreMenu'); if (!m.hidden) closeMore(); else openMore(e.target.closest('[data-c]')); break; }
    case 'text': openTextEditor([...view.selection][0]); break;
    case 'image': pickTexture([...view.selection][0]); break;
    case 'clear': multiSelect = false; pasteArmed = false; view.selection.clear(); view.dirty = true; if (armed) setArmed(null); else { view.armed = null; updateCtxbar(); setStatus(summaryText()); } break;
  }
});

// ---------------------------------------------------------------- ピッカー（ミニゲーム一覧とパターン一覧）

function buildTabs() {
  const tabs = $('tabs');
  for (const [key, label] of SERIES_TABS) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.dataset.tab = key;
    b.textContent = t(label);
    b.dataset.ja = label;
    b.setAttribute('role', 'tab');
    b.addEventListener('click', () => { $('search').value = ''; currentTab = key; renderGrid(); });
    tabs.appendChild(b);
  }
  $('search').addEventListener('input', () => renderGrid());
}

function usedGames() {
  const seen = new Map();
  if (!remix) return [];
  for (const e of remix.entities) {
    if (!e.game || e.game.id.startsWith('special')) continue;
    if (!seen.has(e.game.id)) seen.set(e.game.id, { id: e.game.id, name: e.game.name, first: e.beat });
  }
  return [...seen.values()];
}

// 同じミニゲームの言語違い（Air Rally の EN / JA など）は1つのアイコンにまとめる（デスクトップ版の group と同じ）
const LANG_LABEL = { ja: '日本語', en: 'English', ko: '한국어', es: 'Español', fr: 'Français', it: 'Italiano', de: 'Deutsch' };
const groupKey = (g) => `${g.series}|${g.group}`;

function groupsOf(list) {
  const map = new Map();
  for (const g of list) {
    const k = groupKey(g);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(g);
  }
  return [...map.values()].map((variants) => ({ variants, rep: pickVariant(variants) }));
}

function pickVariant(variants) {
  return variants.find((v) => v.language === settings.lang)
    || variants.find((v) => v.groupDefault)
    || variants.find((v) => !v.language)
    || variants[0];
}

function variantsOf(gid) {
  const me = gamesIndex.find((g) => g.id === gid);
  if (!me) return [];
  const k = groupKey(me);
  return gamesIndex.filter((g) => groupKey(g) === k);
}

function variantLabel(v, all) {
  if (v.language) return LANG_LABEL[v.language] || v.language.toUpperCase();
  const base = all.find((x) => x.groupDefault) || all[0];
  const extra = v.name.replace(base?.group || '', '').replace(/[()（）]/g, '').trim();
  return extra || '標準';
}

function renderGrid() {
  const grid = $('gameGrid');
  grid.textContent = '';
  const q = $('search').value.trim().toLowerCase();
  for (const tb of $('tabs').querySelectorAll('.tab')) {
    const on = !q && tb.dataset.tab === currentTab;
    tb.classList.toggle('on', on);
    if (on) tb.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  if (!remix) return;
  const used = new Set(usedGames().map((g) => g.id));
  let tiles; // [{ id, name, first?, variants? }]
  if (!q && currentTab === 'used') {
    tiles = usedGames();
    if (!tiles.length) { grid.innerHTML = `<div class="empty">${esc(t('まだ何も置いていません。上のタブからミニゲームを選んでください。'))}</div>`; return; }
  } else if (!q && currentTab === 'special') {
    const b = document.createElement('button');
    b.className = 'game txt';
    b.textContent = t('終わり・字幕・画像');
    b.addEventListener('click', () => openSpecial());
    grid.appendChild(b);
    // ボタンを押して遊ぶキュー（プレゼンテーションモードで遊べる）
    const pb = document.createElement('button');
    pb.className = 'game txt';
    pb.textContent = t('プレイアロング');
    pb.addEventListener('click', () => openPlayalongList());
    grid.appendChild(pb);
    openSpecial();
    return;
  } else if (!q && currentTab === 'custom') {
    renderCustomGrid(grid);
    return;
  } else if (!q && (currentTab === 'fav' || currentTab === 'recent')) {
    const ids = currentTab === 'fav' ? (settings.favs || []) : (settings.recent || []);
    tiles = ids.map((id) => gamesIndex.find((g) => g.id === id) || (id === CUSTOM_GAME_ID && customRegistry.game ? { id, name: customRegistry.game.name } : null))
      .filter(Boolean).map((g) => ({ id: g.id, name: g.name }));
    if (!tiles.length) {
      grid.innerHTML = `<div class="empty">${esc(t(currentTab === 'fav' ? 'パターン一覧の上の ☆ を押すと、ここに並びます。' : '置いたミニゲームが、ここに新しい順で並びます。'))}</div>`;
      return;
    }
  } else {
    let list;
    if (q) list = gamesIndex.filter((g) => !g.id.startsWith('special') && (g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q) || g.hints.some((h) => String(h).toLowerCase().includes(q))));
    else if (currentTab === 'other') list = gamesIndex.filter((g) => (g.series === 'other' || g.noDisplay) && !g.id.startsWith('special'));
    else list = gamesIndex.filter((g) => g.series === currentTab && !g.noDisplay);
    tiles = groupsOf(list)
      .map(({ variants, rep }) => ({ id: rep.id, name: rep.group || rep.name, order: rep.order, variants }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name))
      .slice(0, q ? 80 : 400);
  }
  if (!tiles.length) { grid.innerHTML = `<div class="empty">${esc(t('見つかりませんでした。'))}</div>`; return; }
  const shownKey = shownGame ? variantsOf(shownGame.id).map((v) => v.id) : [];
  for (const t of tiles) {
    const ids = t.variants ? t.variants.map((v) => v.id) : [t.id];
    const b = document.createElement('button');
    b.className = 'game' + (ids.some((id) => shownKey.includes(id) || shownGame?.id === id) ? ' sel' : '');
    b.title = t.name;
    b.setAttribute('aria-label', t.name);
    b.dataset.gids = ids.join(' ');
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    if (t.id === CUSTOM_GAME_ID) { b.classList.add('txt'); b.textContent = t2('カスタム'); b.onclick = () => openGame(t.id); grid.appendChild(b); continue; }
    img.src = `${remix.db.base}games/${t.id}/icon.png`;
    img.onerror = () => { if (!img.dataset.fb) { img.dataset.fb = '1'; img.src = remix.db.rawUrl(img.src); } };
    b.appendChild(img);
    if (currentTab !== 'used' && ids.some((id) => used.has(id))) { const m = document.createElement('span'); m.className = 'mark'; b.appendChild(m); }
    if (t.variants && t.variants.length > 1) { const n = document.createElement('span'); n.className = 'vcount'; n.textContent = t.variants.length; b.appendChild(n); }
    b.addEventListener('click', () => openGame(t.id, !q && currentTab === 'used' ? t.first : null));
    grid.appendChild(b);
  }
}

async function openSpecial() {
  const [a, b] = await Promise.all([remix.db.loadGame('special').catch(() => null), remix.db.loadGame('specialVfx').catch(() => null)]);
  const objs = [...(a?.objects || []).filter((o) => o.type === 'endEntity'), ...(b?.objects || []).filter((o) => o.type === 'subtitleEntity' || o.type === 'textureEntity')];
  showGameList({ id: '__special', name: t('特殊'), objects: objs });
}

function openPlayalongList() {
  const g = remix.db.games.get(PLAYALONG_GAME_ID);
  if (!g) return;
  showGameList({ id: '__playalong', name: 'Playalong', objects: g.objects });
  setStatus(t('置くとトラックの一番下に入ります。上のプレイモードのボタンを押すと遊べます'));
}

async function openGame(gid, jumpBeat, highlightObj) {
  if (gid === CUSTOM_GAME_ID && customRegistry.game) { showGameList(customRegistry.game, highlightObj); return; }
  setStatus('読み込み中…');
  try {
    const game = await remix.db.loadGame(gid);
    showGameList(game, highlightObj);
    setStatus(t('{name} ／ 名前を押してから、トラックの空いている所をタップすると置けます', { name: game.name }));
    if (jumpBeat != null) view.centerOn(jumpBeat + view.visibleBeats * 0.3);
  } catch (e) {
    toast(`${gid} を読み込めませんでした`, 3000);
  }
}

const KIND = { pattern: 'パターン', keepTheBeat: '繰り返し', equidistant: '等間隔', randomCue: 'ランダム', multiCue: '複合', pitchDependent: '音程別', endEntity: '終わり', subtitleEntity: '字幕', textureEntity: '画像', playalongEntity: 'ボタン' };
const PV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';

function renderListHead(game) {
  const head = $('listHead');
  head.textContent = '';
  if (!game.id.startsWith('__')) {
    const fav = (settings.favs || []).includes(game.id);
    const st = document.createElement('button');
    st.className = 'star' + (fav ? ' on' : '');
    st.textContent = fav ? '★' : '☆';
    st.title = t(fav ? 'お気に入りから外す' : 'お気に入りに入れる');
    st.setAttribute('aria-label', st.title);
    st.addEventListener('click', () => {
      const list = settings.favs || [];
      settings.favs = list.includes(game.id) ? list.filter((x) => x !== game.id) : [game.id, ...list];
      saveSettings();
      renderListHead(game);
      if (currentTab === 'fav') renderGrid();
    });
    head.appendChild(st);
  }
  const title = document.createElement('span');
  title.className = 'lh-title';
  title.textContent = game.name;
  head.appendChild(title);
  const vs = variantsOf(game.id);
  if (vs.length > 1) {
    for (const v of [...vs].sort((a, b) => (a.language ? 0 : 1) - (b.language ? 0 : 1) || String(a.language).localeCompare(String(b.language)))) {
      const c = document.createElement('button');
      c.className = 'chip' + (v.id === game.id ? ' on' : '');
      c.textContent = variantLabel(v, vs);
      c.title = v.name;
      c.addEventListener('click', () => openGame(v.id));
      head.appendChild(c);
    }
  }
}

function showGameList(game, highlightObj, filter) {
  shownGame = game;
  renderListHead(game);
  const ids = new Set([game.id, ...variantsOf(game.id).map((v) => v.id)]);
  for (const b of $('gameGrid').children) b.classList?.toggle('sel', !!b.dataset?.gids && b.dataset.gids.split(' ').some((id) => ids.has(id)));
  const used = new Set(remix.entities.map((e) => e.o));
  let objs = game.objects.filter((o) => !o.hidden && (o.type === 'cue' || isMulti(o) || ['endEntity', 'subtitleEntity', 'textureEntity', 'playalongEntity'].includes(o.type)));
  if (filter) objs = objs.filter(filter);
  objs.sort((a, b) => (isMulti(b) ? 1 : 0) - (isMulti(a) ? 1 : 0));
  const list = $('list');
  list.textContent = '';
  for (const o of objs) {
    const row = document.createElement('div');
    // パターンなどではない、ただのキューは文字を灰色に
    row.className = 'item' + (o.type === 'cue' ? ' cue' : '') + ((armed ? armed === o : o === highlightObj) ? ' sel' : '');
    row.dataset.id = o.id;
    const main = document.createElement('button');
    main.className = 'main';
    main.title = '押してからトラックをタップすると置けます';
    const arrow = document.createElement('span');
    arrow.className = 'arrow';
    arrow.textContent = '➜';
    const txt = document.createElement('span');
    txt.className = 'txt';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.appendChild(richName(o.name || o.id));
    txt.appendChild(nm);
    if (KIND[o.type] || used.has(o)) {
      const tags = document.createElement('span');
      tags.className = 'tags';
      if (KIND[o.type]) { const k = document.createElement('span'); k.className = 'kind'; k.textContent = t(KIND[o.type]); tags.appendChild(k); }
      if (used.has(o)) { const u = document.createElement('span'); u.className = 'used'; u.textContent = t('使用中'); tags.appendChild(u); }
      txt.appendChild(tags);
    }
    main.append(arrow, txt);
    main.addEventListener('click', () => { setArmed(armed === o ? null : o); });
    row.append(main);
    if (remix.model.hasSound(o)) {
      const pv = document.createElement('button');
      pv.className = 'pv';
      pv.title = '試聴';
      pv.setAttribute('aria-label', `${cleanName(o.name)} を試聴`);
      pv.innerHTML = PV_SVG;
      pv.addEventListener('click', () => preview(o));
      row.appendChild(pv);
    }
    list.appendChild(row);
    if (o === highlightObj) requestAnimationFrame(() => row.scrollIntoView({ block: 'nearest' }));
  }
  if (!objs.length) list.innerHTML = `<div class="empty">${esc(t('表示できる項目がありません。'))}</div>`;
}

async function preview(o) {
  engine.unlock();
  const urls = remix.soundUrlsOf(o);
  await engine.loadSounds(urls, remix.db);
  const beat = view.playhead ?? remix.playbackStart;
  previewer.play(remix.previewEvents(o, remix.tempo.tempoAt(beat)));
  setTimeout(() => { if (mode !== 'playing') engine.stopKeepAlive(); }, 5000);
}

// ---------------------------------------------------------------- 読み込み・新規

async function applyLoaded(res, name, { music, extra, note } = {}) {
  remix = res.remix;
  fileName = name;
  extraFiles = extra || [];
  musicFile = music || null;
  musicBuf = null;
  remix.musicPresent = !!musicFile;
  undoStack.length = 0;
  redoStack.length = 0;
  multiSelect = false;
  armed = null;
  pasteArmed = false;
  view.armed = null;
  await loadTexturesFromExtra();
  view.setRemix(remix);
  shownGame = null;
  currentTab = 'used';
  $('search').value = '';
  renderGrid();
  $('listHead').textContent = t('パターン');
  $('list').innerHTML = `<div class="empty">${esc(t('ミニゲームを選ぶと、パターンが並びます。名前を押してからトラックの空いている所をタップすると置けます。🔊で試聴できます。'))}</div>`;
  const sounds = [...remix.allSoundCues().keys()];
  const failed = await engine.loadSounds(sounds, remix.db, (d, t) => showLoading(name, `効果音を読み込み中 ${d} / ${t}`, 0.25 + 0.75 * (d / t)));
  if (musicFile) {
    showLoading(name, '音楽を読み込み中…', 1);
    try {
      const b = musicFile.bytes;
      musicBuf = await engine.decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
    } catch (_) {
      failed.push('music');
    }
  }
  $('loading').hidden = true;
  const notes = [];
  if (res.missing?.length) notes.push(`見つからない ID ${res.missing.length} 件`);
  if (failed.length) notes.push(`読めなかった音 ${failed.length} 件`);
  loadWarn = notes.length ? ' ／ ⚠ ' + notes.join('・') : '';
  setStatus(summaryText());
  $('version').textContent = `RHRE Web 試作 ${VERSION} ／ DB v${remix.raw.databaseVersion ?? '?'}`;
  $('helpDiag').textContent = `データベース: ${remix.db.commit}${res.missing?.length ? ' ／ 見つからない ID: ' + res.missing.slice(0, 6).join(', ') : ''}`;
  updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  updateCtxbar();
  if (note) toast(note, 3500, 'info');
}

async function withLoading(name, job) {
  stopPlayback();
  loading = true;
  updateButtons();
  showLoading(name, '開いています…', 0);
  try {
    await job((msg, f) => showLoading(name, msg, f * 0.25));
    scheduleAutosave();
    saveMusicToStore();
  } catch (e) {
    console.error(e);
    showError(e.message || String(e));
  } finally {
    loading = false;
    updateButtons();
    view.dirty = true;
  }
}

function openBuffer(ab, name) {
  return withLoading(name, async (onStatus) => {
    const res = await loadRemix(ab, { onStatus });
    await applyLoaded(res, name, { music: res.music, extra: res.extraFiles });
  });
}

async function openSample() {
  try {
    const res = await fetch('samples/sample.rhref');
    if (!res.ok) throw new Error('サンプルが見つかりません');
    await openBuffer(await res.arrayBuffer(), 'sample.rhref');
  } catch (e) {
    showError(e.message);
  }
}

function newRemix() {
  return withLoading('新しいリミックス', async (onStatus) => {
    const res = await loadRemixJSON(emptyRemixJSON(), { onStatus });
    await applyLoaded(res, 'remix.rhref', { note: '新しいリミックスです。下の「GBA」などのタブからミニゲームを選んで置いてください。' });
    currentTab = 'tengoku';
    renderGrid();
  });
}

async function openAutosave() {
  const rec = await store.get('remix');
  if (!rec?.json) return false;
  const music = await store.get('music');
  await withLoading(rec.name || 'remix.rhref', async (onStatus) => {
    const res = await loadRemixJSON(rec.json, { onStatus });
    await applyLoaded(res, rec.name || 'remix.rhref', { music: music || null, extra: rec.extra || [], note: '前回の続きを開きました（自動保存）' });
  });
  return !!remix;
}

// ---------------------------------------------------------------- 保存

function buildRhref() {
  const json = remix.toJSON(musicFile);
  const used = new Set(remix.entities.map((e) => e.extra?.texHash).filter(Boolean));
  json.textures = [...used];
  const files = [{ name: 'remix.json', data: new TextEncoder().encode(JSON.stringify(json)) }];
  if (musicFile) files.push({ name: 'music.bin', data: musicFile.bytes });
  for (const f of extraFiles) {
    const m = /^(.+)\.png$/i.exec(f.name);
    if (m && !used.has(m[1])) continue;
    files.push(f);
  }
  return makeZip(files, 'Rhythm Heaven Remix Editor Refresh savefile - RHRE Web');
}

let saveUrl = null;
function save() {
  if (!remix || loading) return;
  let name = (fileName || 'remix.rhref').replace(/[\\/:*?"<>|]/g, '_');
  if (!/\.rhref$/i.test(name)) name = name.replace(/\.[^.]*$/, '') + '.rhref';
  const blob = buildRhref();
  const size = blob.size > 1048576 ? `${(blob.size / 1048576).toFixed(1)} MB` : `${Math.ceil(blob.size / 1024)} KB`;
  const showLink = () => {
    if (saveUrl) URL.revokeObjectURL(saveUrl);
    saveUrl = URL.createObjectURL(blob);
    const a = $('saveLink');
    a.href = saveUrl;
    a.download = name;
    $('saveMsg').textContent = `${name}（${size}）。下のボタンで保存します。RHRE fresh でそのまま開けます。`;
    $('saveModal').hidden = false;
  };
  if (!isTouch || isAndroid) {
    if (saveUrl) URL.revokeObjectURL(saveUrl);
    saveUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = saveUrl;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast(`保存しました：${name}`, 2500, 'info');
    return;
  }
  try {
    const file = new File([blob], name, { type: 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name })
        .then(() => toast(`保存しました：${name}`, 2500, 'info'))
        .catch((err) => { if (err?.name !== 'AbortError') showLink(); });
      return;
    }
  } catch (_) { /* 共有できなければリンクで */ }
  showLink();
}

// ---------------------------------------------------------------- テンポ・音楽のダイアログ

// トラックの下の段をタップ → テンポ／拍子／音楽の音量を1つの画面で（近くに印があればそれを編集）
let markerCtx = null;
function openMarker(beat, snapped, tol) {
  if (!remix) return;
  if (mode === 'playing') { toast(t('再生中は編集できません。■ で止めてから編集してください。'), 2500, 'info'); return; }
  const tempo = remix.near(remix.tempoTrackers, beat, tol);
  const ts = remix.near(remix.timeSignatures, beat, tol);
  const vol = remix.near(remix.musicVolumes, beat, tol);
  markerCtx = { beat: snapped, tempo, ts, vol };
  setMarkerKind(tempo ? 'tempo' : vol ? 'vol' : ts ? 'ts' : 'tempo');
  $('markerModal').hidden = false;
}

// テンポ・音量の印をドラッグで動かしたとき
function moveMarker(kind, from, to) {
  if (!remix) return;
  const list = kind === 'tempo' ? remix.tempoTrackers : remix.musicVolumes;
  if (list.some((m) => Math.abs(m.beat - to) < 1e-6)) { toast(t('その位置にはもう印があります'), 2500); return; }
  const b = +to.toFixed(3);
  if (edit(() => remix.moveMarker(kind, from, to))) setStatus(t(kind === 'tempo' ? 'テンポを拍 {b} に動かしました' : '音量の変化を拍 {b} に動かしました', { b }));
}

// 拍子の大きな数字をタップ → 数字の上に入力欄を出して、そのままキーボードで入れる
let tsEd = null;
const tsInput = $('tsEdit');
function placeTsEditor() {
  if (!tsEd || !remix) return;
  const ts = remix.timeSignatures.find((x) => Math.abs(x.beat - tsEd.beat) < 1e-6);
  if (!ts) { closeTsEditor(false); return; }
  const b = view.timeSigBox(ts, tsEd.part);
  const r = $('view').getBoundingClientRect();
  const s = b.size;
  Object.assign(tsInput.style, {
    left: `${Math.round(r.left + b.x - 6)}px`,
    top: `${Math.round(r.top + b.cy - s * 0.55)}px`,
    width: `${Math.round(Math.max(b.w, s * 1.15) + 14)}px`,
    height: `${Math.round(s * 1.1)}px`,
    fontSize: `${Math.round(s)}px`,
  });
}
function openTsEditor(box) {
  if (!remix || mode === 'playing') return;
  closeTsEditor(true);
  tsEd = { beat: box.ts.beat, part: box.part, opened: performance.now() };
  tsInput.value = String(box.part === 'top' ? box.ts.perMeasure : box.ts.unit);
  tsInput.hidden = false;
  placeTsEditor();
  view.tsEditing = { beat: tsEd.beat, part: tsEd.part };
  view.dirty = true;
  tsInput.focus();
  try { tsInput.setSelectionRange(0, tsInput.value.length); } catch (_) { /* 選べない環境 */ }
  setStatus(t(box.part === 'top' ? '1小節の拍数を入れてください' : '音符（2・4・8・16）を入れてください'));
}
function closeTsEditor(commit) {
  if (!tsEd) return;
  const ed = tsEd;
  tsEd = null;
  tsInput.hidden = true;
  view.tsEditing = null;
  view.dirty = true;
  if (!commit || !remix) return;
  const ts = remix.timeSignatures.find((x) => Math.abs(x.beat - ed.beat) < 1e-6);
  const raw = tsInput.value.trim();
  if (!ts || !raw) return;
  const v = parseInt(raw, 10);
  if (ed.part === 'top') {
    if (!(v >= 1 && v <= 64)) { toast(t('拍数は 1〜64 の数で入れてください'), 2500); return; }
    if (v !== ts.perMeasure && edit(() => remix.setTimeSignature(ts.beat, v, ts.unit))) setStatus(t('拍子を {n}/{u} にしました', { n: v, u: ts.unit }));
  } else {
    if (![2, 4, 8, 16].includes(v)) { toast(t('音符は 2・4・8・16 のどれかで入れてください'), 2500); return; }
    if (v !== ts.unit && edit(() => remix.setTimeSignature(ts.beat, ts.perMeasure, v))) setStatus(t('拍子を {n}/{u} にしました', { n: ts.perMeasure, u: v }));
  }
}
tsInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); tsInput.blur(); }
  else if (e.key === 'Escape') { e.preventDefault(); closeTsEditor(false); }
});
tsInput.addEventListener('input', () => { tsInput.value = tsInput.value.replace(/[^0-9]/g, '').slice(0, 2); });
tsInput.addEventListener('blur', () => closeTsEditor(true));
// iPhone でキーボードを確実に出す：指を離した瞬間にもう一度入力欄へ
$('view').addEventListener('touchend', (e) => {
  if (tsEd && performance.now() - tsEd.opened < 800) {
    e.preventDefault();
    if (document.activeElement !== tsInput) tsInput.focus();
  }
}, { passive: false });
$('view').addEventListener('pointerdown', () => { if (tsEd && performance.now() - tsEd.opened > 300) tsInput.blur(); });
$('view').addEventListener('wheel', () => { if (tsEd) tsInput.blur(); }, { passive: true });
window.addEventListener('resize', placeTsEditor);
window.visualViewport?.addEventListener('resize', placeTsEditor);

function setMarkerKind(kind) {
  markerCtx.kind = kind;
  for (const b of document.querySelectorAll('#markerModal [data-mt]')) b.classList.toggle('on', b.dataset.mt === kind);
  $('mtTempo').hidden = kind !== 'tempo';
  $('mtTs').hidden = kind !== 'ts';
  $('mtVol').hidden = kind !== 'vol';
  const fmtB = (b) => +b.toFixed(3);
  let existing = null, first = false;
  if (kind === 'tempo') {
    existing = markerCtx.tempo;
    first = !!existing && (existing.isImmutable || Math.abs(existing.beat) < 1e-6);
    const b = existing ? existing.beat : markerCtx.beat;
    $('markerInfo').textContent = existing ? t('拍 {b} のテンポです。', { b: fmtB(b) }) + (first ? t('最初のテンポなので削除はできません。') : t('印を長押しすると、左右に動かせます。')) : t('拍 {b} から、このテンポに変わります。', { b: fmtB(b) });
    $('tempoInput').value = String(+(existing ? existing.bpm : remix.tempo.tempoAt(b)).toFixed(2));
    $('rampInput').value = String(existing ? existing.width : 0);
    const ratio = existing ? Number(existing.swingRatio) : 50;
    $('swingSelect').value = [50, 60, 67, 75].includes(ratio) ? String(ratio) : '50';
    $('swingDiv').value = existing && Number(existing.swingDivision) === 0.5 ? '0.5' : '1';
  } else if (kind === 'ts') {
    existing = markerCtx.ts;
    first = !!existing && Math.abs(existing.beat) < 1e-6;
    const b = existing ? existing.beat : Math.round(markerCtx.beat);
    $('markerInfo').textContent = (existing ? t('拍 {b} の拍子です。', { b: fmtB(b) }) + (first ? t('最初の拍子なので削除はできません。') : '') : t('拍 {b} から、この拍子になります。', { b: fmtB(b) })) + t('大きな数字をタップしても変えられます。');
    const cur = existing || remix.measureAt(b);
    $('tsBeats').value = String(existing ? existing.perMeasure : cur.perMeasure || 4);
    $('tsUnit').value = String(existing ? existing.unit : 4);
  } else {
    existing = markerCtx.vol;
    const b = existing ? existing.beat : markerCtx.beat;
    $('markerInfo').textContent = existing ? t('拍 {b} の音楽の音量です。', { b: fmtB(b) }) + t('印を長押しすると、左右に動かせます。') : t('拍 {b} から、音楽の音量が変わります。', { b: fmtB(b) });
    $('volInput').value = String(existing ? existing.volume : Math.round(remix.musicVolumeAt(b + 1e-6) * 100));
    $('volRamp').value = String(existing ? existing.width : 0);
  }
  $('markerDel').hidden = !existing || first;
}
for (const b of document.querySelectorAll('#markerModal [data-mt]')) b.addEventListener('click', () => setMarkerKind(b.dataset.mt));

$('markerOk').addEventListener('click', () => {
  const k = markerCtx.kind;
  if (k === 'tempo') {
    const v = parseFloat($('tempoInput').value);
    if (!(v >= 5 && v <= 600)) { toast(t('テンポは 5〜600 の数で入れてください'), 2500); return; }
    const b = markerCtx.tempo ? markerCtx.tempo.beat : markerCtx.beat;
    const width = Math.max(0, parseFloat($('rampInput').value) || 0);
    edit(() => remix.setTempo(b, Math.round(v * 1000) / 1000, { width, swingRatio: Number($('swingSelect').value), swingDivision: Number($('swingDiv').value) }));
  } else if (k === 'ts') {
    const n = clamp(parseInt($('tsBeats').value, 10) || 4, 1, 64);
    const u = Number($('tsUnit').value) || 4;
    const b = markerCtx.ts ? markerCtx.ts.beat : Math.round(markerCtx.beat);
    edit(() => remix.setTimeSignature(b, n, u));
  } else {
    const v = parseFloat($('volInput').value);
    if (!(v >= 0 && v <= 200)) { toast(t('音量は 0〜200 の数で入れてください'), 2500); return; }
    const b = markerCtx.vol ? markerCtx.vol.beat : markerCtx.beat;
    const width = Math.max(0, parseFloat($('volRamp').value) || 0);
    edit(() => remix.setMusicVolume(b, Math.round(v), width));
  }
  $('markerModal').hidden = true;
});
$('markerDel').addEventListener('click', () => {
  const k = markerCtx.kind;
  if (k === 'tempo' && markerCtx.tempo) edit(() => remix.removeTempo(markerCtx.tempo.beat));
  if (k === 'ts' && markerCtx.ts) edit(() => remix.removeTimeSignature(markerCtx.ts.beat));
  if (k === 'vol' && markerCtx.vol) edit(() => remix.removeMusicVolume(markerCtx.vol.beat));
  $('markerModal').hidden = true;
});
$('markerCancel').addEventListener('click', () => { $('markerModal').hidden = true; });

function openMusicStart() {
  if (!remix) return;
  $('musicStartInput').value = String(+remix.musicStartSec.toFixed(3));
  $('musicInfo').textContent = musicFile
    ? `「${musicFile.filename}」が鳴り始める時刻（秒）です。赤い旗をドラッグしても動かせます。`
    : 'まだ音楽を選んでいません。先にメニューの「音楽を選ぶ」から選んでください。';
  $('musicModal').hidden = false;
}
$('musicAlign').addEventListener('click', () => { $('musicStartInput').value = String(+remix.tempo.b2s(remix.playbackStart).toFixed(3)); });
$('musicAuto').addEventListener('click', () => {
  if (!musicBuf) { toast('先に音楽を選んでください', 2500, 'info'); return; }
  $('musicStartInput').value = String(+(remix.tempo.b2s(0) - detectOnset(musicBuf)).toFixed(3));
});
$('musicOk').addEventListener('click', () => {
  const v = parseFloat($('musicStartInput').value);
  if (!Number.isFinite(v)) { toast('秒を数で入れてください', 2500); return; }
  edit(() => { remix.musicStartSec = v; });
  $('musicModal').hidden = true;
});
$('musicCancel').addEventListener('click', () => { $('musicModal').hidden = true; });

$('musicInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f || !remix) return;
  try {
    toast('音楽を読み込んでいます…', 4000, 'info');
    const ab = await f.arrayBuffer();
    const buf = await engine.decode(ab.slice(0));
    musicFile = { bytes: new Uint8Array(ab), filename: f.name, extension: (f.name.split('.').pop() || '').toLowerCase() };
    musicBuf = buf;
    remix.musicPresent = true;
    view.dirty = true;
    saveMusicToStore();
    if (mode !== 'stopped') stopPlayback();
    const onset = detectOnset(buf);
    const start = Math.round((remix.tempo.b2s(0) - onset) * 1000) / 1000;
    edit(() => { remix.musicStartSec = start; });
    toast(`音楽を読み込みました：${f.name}（${fmtTime(buf.duration)}）。曲の始まり（${onset.toFixed(3)} 秒）が 0 拍目に来るよう、音楽開始を ${fmtTime(start)} に合わせました。`, 6000, 'info');
  } catch (_) {
    toast('この音楽ファイルは読み込めませんでした（mp3・wav・m4a などを選んでください）', 4000);
  }
});

let confirmAction = null;
function confirmBox(title, msg, okLabel, fn) {
  $('confirmTitle').textContent = title;
  $('confirmMsg').textContent = msg;
  $('confirmOk').textContent = okLabel;
  confirmAction = fn;
  $('confirmModal').hidden = false;
}
$('confirmOk').addEventListener('click', () => { $('confirmModal').hidden = true; const f = confirmAction; confirmAction = null; f?.(); });
$('confirmCancel').addEventListener('click', () => { $('confirmModal').hidden = true; confirmAction = null; });

// ---------------------------------------------------------------- 再生

let watchTimer = 0;
function watchAudio() {
  const ctx = engine.ctx;
  if (!ctx) return;
  const t0 = ctx.currentTime;
  clearTimeout(watchTimer);
  watchTimer = setTimeout(() => {
    if (mode !== 'playing') return;
    if (ctx.state !== 'running' || ctx.currentTime - t0 < 0.2) {
      const st = ctx.state;
      stopPlayback();
      engine.stale = true;
      // 鳴らなかった端末では、次の ▶ から無音の <audio> も使う（覚えておく）
      if (!engine.useKeepAlive) { engine.useKeepAlive = true; settings.keepAlive = true; saveSettings(); }
      toast(`音を開始できませんでした（状態: ${st}）。もう一度 ▶ を押してください。続くときはアプリを閉じて開き直してください。`, 9000);
    }
  }, 900);
}

function startPlayback(fromSec) {
  previewer.stop();
  player.metronome = metronome;
  player.onEnd = () => {
    mode = 'stopped';
    view.playhead = null;
    view.dirty = true;
    engine.stopKeepAlive();
    updateButtons();
    updateCtxbar();
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  };
  player.start(remix, musicBuf, fromSec);
  mode = 'playing';
  updateButtons();
  updateCtxbar();
  watchAudio();
}

function play() {
  if (!remix || loading || mode === 'playing') return;
  engine.unlock(); // iPhone ではタップの中で音を有効にする必要がある（await より前に呼ぶ）
  $('toast').hidden = true;
  const fresh = mode !== 'paused';
  const from = fresh ? remix.tempo.b2s(remix.playbackStart) : pausedSec;
  startPlayback(from);
  if (playMode && fresh) { resetJudge(); judge?.skipBefore(from - 0.05); }
}

function pause() {
  if (mode !== 'playing') return;
  player.pause();
  pausedSec = player.pausedAt;
  mode = 'paused';
  engine.stopKeepAlive();
  updateButtons();
  updateCtxbar();
}

function stopPlayback() {
  player.stop();
  previewer.stop();
  engine.stopKeepAlive();
  if (mode !== 'stopped' && remix) {
    // 停止したら時間の表示は再生開始位置に戻すが、画面のスクロールはそのまま
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  }
  mode = 'stopped';
  view.playhead = null;
  view.dirty = true;
  $('subtitle').hidden = true;
  showStageImage($('stageImg'), null);
  updateButtons();
  updateCtxbar();
}

// 再生位置にある「特殊」の画像（最後に始まったもの）
function activeTexture(beat) {
  let cur = null;
  for (const e of remix.entities) {
    if (e.type === 'textureEntity' && e.extra?.texHash && beat >= e.beat && beat < e.beat + e.width) {
      if (!cur || e.beat >= cur.beat) cur = e;
    }
  }
  return cur;
}
// 画面の中央下に、縦横比を変えずに出す。小さい画像は枠（maxW×maxH）いっぱいまで拡大する
function showStageImage(el, ent, maxW, maxH) {
  const img = ent ? textureImages.get(ent.extra.texHash) : null;
  if (!img) { if (!el.hidden) { el.hidden = true; el.removeAttribute('src'); el.dataset.hash = ''; } return; }
  if (el.dataset.hash !== ent.extra.texHash) { el.src = img.src; el.dataset.hash = ent.extra.texHash; }
  const nw = img.naturalWidth || img.width, nh = img.naturalHeight || img.height;
  if (nw && nh && maxW && maxH) {
    const s = Math.min(maxW / nw, maxH / nh);
    el.style.width = `${Math.round(nw * s)}px`;
    el.style.height = `${Math.round(nh * s)}px`;
    // ドット絵のような小さい画像は、ぼやけないように拡大する
    el.style.imageRendering = s >= 2 ? 'pixelated' : 'auto';
  }
  el.hidden = false;
}

function updateSubtitle(beat) {
  const active = remix.subtitles.filter((s) => beat >= s.beat && beat < s.beat + s.width);
  const el = $('subtitle');
  const text = active.map((s) => s.subtitle).join('\n');
  if (text) { if (el.textContent !== text) el.textContent = text; el.hidden = false; }
  else el.hidden = true;
  const ed = $('editor');
  showStageImage($('stageImg'), activeTexture(beat), ed.clientWidth * 0.5, ed.clientHeight * 0.4);
}

function frame(now) {
  if (remix && mode === 'playing') {
    const t = player.time;
    const beat = remix.tempo.s2b(t);
    view.playhead = beat;
    view.follow(beat);
    for (const { ent, leaf } of player.takeVisual(t)) {
      if (!leaf || (leaf.beat >= ent.beat - 1e-6 && leaf.beat < ent.beat + ent.width + 1e-6)) ent.flashAt = now;
      if (leaf) (ent.leafFlash ||= []).push({ ...leaf, at: now });
    }
    view.dirty = true;
    updateTimebox(Math.max(t, player.t0), beat);
    updateSubtitle(beat);
    if (playMode && judge) judge.update(paTime());
  } else if (remix && mode === 'paused') {
    view.playhead = remix.tempo.s2b(pausedSec);
  }
  view.stepMomentum(now);
  if (view.dirty) {
    view.dirty = false;
    view.draw(now);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------------------------------------------------------------- ボタン

function doAction(act) {
  switch (act) {
    case 'new':
      confirmBox('新規作成', '今のリミックスを閉じて、新しく始めますか？保存していない変更は消えます（自動保存も新しい方に変わります）。', '新規作成', () => newRemix());
      break;
    case 'open': $('fileInput').click(); break;
    case 'sample':
      confirmBox('サンプルを開く', '今のリミックスを閉じて、サンプルを開きますか？保存していない変更は消えます。', '開く', () => openSample());
      break;
    case 'save': openSave(); break;
    case 'export': exportWav(); break;
    case 'music': $('musicInput').click(); break;
    case 'musicStart': openMusicStart(); break;
    case 'musicRemove':
      if (!musicFile) { toast('音楽は選ばれていません', 2000, 'info'); break; }
      confirmBox('音楽を外す', `「${musicFile.filename}」を外しますか？`, '外す', () => {
        musicFile = null; musicBuf = null; remix.musicPresent = false; view.dirty = true; saveMusicToStore(); scheduleAutosave();
      });
      break;
    case 'help': openHelp(); break;
    case 'tracks': openTracks(); break;
    case 'present': startPresentation(); break;
  }
}

$('menuBtn').addEventListener('click', () => { $('menuModal').hidden = false; });
$('menuModal').addEventListener('click', (e) => {
  if (e.target === $('menuModal')) { $('menuModal').hidden = true; return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act) return;
  $('menuModal').hidden = true;
  if (act !== 'close') doAction(act);
});
$('newBtn').addEventListener('click', () => doAction('new'));
$('openBtn').addEventListener('click', () => doAction('open'));
$('saveBtn').addEventListener('click', () => doAction('save'));
$('exportBtn').addEventListener('click', () => doAction('export'));
$('musicBtn').addEventListener('click', () => doAction('music'));
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);

$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) openBuffer(await f.arrayBuffer(), f.name);
});
$('playBtn').addEventListener('click', play);
$('pauseBtn').addEventListener('click', pause);
$('stopBtn').addEventListener('click', stopPlayback);
$('metroBtn').addEventListener('click', () => {
  metronome = !metronome;
  player.metronome = metronome;
  $('metroBtn').classList.toggle('on', metronome);
  $('metroBtn').setAttribute('aria-pressed', String(metronome));
});
// スナップ：押すと選択肢が出る（1〜1/32）。選んだものは覚えておく
function setSnap(v) {
  const hit = SNAPS.find(([n]) => n === v) || SNAPS[2];
  view.snap = hit[0];
  view.dirty = true;
  $('snapVal').textContent = hit[1];
  settings.snap = hit[0];
  saveSettings();
}
function closeSnapMenu() { $('snapMenu').hidden = true; }
$('snapBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  const m = $('snapMenu');
  if (!m.hidden) { closeSnapMenu(); return; }
  m.innerHTML = SNAPS.map(([v, label]) => `<button data-snap="${v}" class="${v === view.snap ? 'on' : ''}" role="menuitemradio" aria-checked="${v === view.snap}">${label}</button>`).join('');
  m.hidden = false;
  const r = $('snapBtn').getBoundingClientRect();
  const w = m.offsetWidth;
  m.style.left = `${Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2))}px`;
  m.style.top = `${r.bottom + 6}px`;
});
$('snapMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-snap]');
  if (!b) return;
  setSnap(Number(b.dataset.snap));
  closeSnapMenu();
});
document.addEventListener('pointerdown', (e) => { if (!$('snapMenu').hidden && !e.target.closest('#snapMenu, #snapBtn')) closeSnapMenu(); });
setSnap(Number(settings.snap) || 0.25);

// 下のピッカー：背の低い画面（横向きのスマホ）では最初から畳む。向きごとに押した状態を覚える
const panelPref = { short: null, tall: null };
const isShort = () => window.innerHeight < 430;
function applyPanel() {
  const key = isShort() ? 'short' : 'tall';
  const collapsed = panelPref[key] ?? isShort();
  $('panel').classList.toggle('collapsed', collapsed);
  $('panelToggle').classList.toggle('collapsed', collapsed);
  $('panelToggle').setAttribute('aria-expanded', String(!collapsed));
  // ドラッグで決めた高さ（縦向き・横向きそれぞれ）
  const saved = settings.panelH?.[key];
  if (!collapsed && saved) setPanelHeight(saved); else $('panel').style.height = '';
  view.compactTop = !collapsed;
  view.dirty = true;
}

// ゲーム一覧の高さ：境目のつまみを上下にドラッグ。ダブルタップで元の高さに
function panelMaxH() {
  const top = $('topbar').getBoundingClientRect().bottom;
  return Math.max(110, window.innerHeight - top - $('status').offsetHeight - 120);
}
function setPanelHeight(h) { $('panel').style.height = `${Math.round(clamp(h, 100, panelMaxH()))}px`; }
{
  const grip = $('panelGrip');
  let lastDown = 0;
  grip.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const key = isShort() ? 'short' : 'tall';
    const now = performance.now();
    if (now - lastDown < 320) {
      lastDown = 0;
      if (settings.panelH) delete settings.panelH[key];
      saveSettings();
      applyPanel();
      return;
    }
    lastDown = now;
    try { grip.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど */ }
    const y0 = e.clientY, h0 = $('panel').getBoundingClientRect().height;
    grip.classList.add('dragging');
    const move = (ev) => setPanelHeight(h0 - (ev.clientY - y0));
    const up = () => {
      grip.classList.remove('dragging');
      grip.removeEventListener('pointermove', move);
      grip.removeEventListener('pointerup', up);
      grip.removeEventListener('pointercancel', up);
      const h = $('panel').getBoundingClientRect().height;
      if (Math.abs(h - h0) > 2) { settings.panelH = { ...(settings.panelH || {}), [key]: Math.round(h) }; saveSettings(); }
    };
    grip.addEventListener('pointermove', move);
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
  });
}
$('panelToggle').addEventListener('click', () => {
  panelPref[isShort() ? 'short' : 'tall'] = !$('panel').classList.contains('collapsed');
  applyPanel();
});
window.addEventListener('resize', applyPanel);
applyPanel();

// 全画面（iPad・PC など対応している環境だけボタンを出す。iPhone はホーム画面に追加、Android は案内画面から全画面に）
const root = document.documentElement;
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const inStandalone = window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
const androidGate = root.classList.contains('gate-android');
$('fsBtn').hidden = !fsSupported || inStandalone || androidGate;

// ---- ブラウザで開いたスマホ向けの案内画面
// iPhone：ホーム画面に追加するまで使えない（作業中のものだけは保存できる）
$('gateSave').addEventListener('click', () => openSave());
// Android：全画面にして使う。全画面が解けたら、もう一度案内を出す
let gateFsFailed = false;
function enterFullscreen() {
  // 全画面にできなくても（断られた・対応していない）、案内は閉じてそのまま使えるようにする
  root.classList.remove('gate-android');
  try {
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    const p = req ? req.call(root, { navigationUI: 'hide' }) : null;
    if (!req) gateFsFailed = true;
    if (p && p.catch) p.catch(() => { gateFsFailed = true; });
  } catch (_) { gateFsFailed = true; }
  applyPanel();
}
$('gateFs').addEventListener('click', enterFullscreen);
const onFsChange = () => {
  if (!androidGate || gateFsFailed) return;
  if (!(document.fullscreenElement || document.webkitFullscreenElement)) {
    $('gateTitleA').textContent = t('全画面に戻る');
    $('gateFs').textContent = t('全画面に戻る');
    root.classList.add('gate-android');
  }
};
document.addEventListener('fullscreenchange', onFsChange);
document.addEventListener('webkitfullscreenchange', onFsChange);
// Chrome などがアプリとして入れられると言ってきたら、ボタンを出す
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installEvt = e;
  $('gateInstall').hidden = false;
});
const installedNote = () => { $('gateInstall').hidden = true; $('gateAndroidNote').textContent = t('追加しました。ホーム画面（アプリ一覧）の RHRE Web から開くと、いつも全画面です。'); };
$('gateInstall').addEventListener('click', async () => {
  if (!installEvt) return;
  const ev = installEvt;
  installEvt = null;
  try {
    ev.prompt();
    const r = await ev.userChoice;
    if (r?.outcome === 'accepted') installedNote();
    else $('gateInstall').hidden = true;
  } catch (_) { $('gateInstall').hidden = true; }
});
window.addEventListener('appinstalled', installedNote);
// インストールのためのサービスワーカー（Android だけ。何も保存しない）
if (isAndroid && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// Android の「戻る」：開いている画面やメニューを閉じる（何も開いていなければ普通に戻る）
if (isAndroid) {
  try { history.pushState({ rhre: 1 }, ''); } catch (_) { /* 無視 */ }
  window.addEventListener('popstate', () => {
    const open = [...document.querySelectorAll('.modal:not([hidden]), .popover:not([hidden])')];
    if (!open.length) return;
    open[open.length - 1].hidden = true;
    try { history.pushState({ rhre: 1 }, ''); } catch (_) { /* 無視 */ }
  });
}
// 長押しで出るブラウザのメニュー（画像を保存など）を出さない。文字の入力欄だけは残す
document.addEventListener('contextmenu', (e) => { if (!e.target.closest?.('input, textarea')) e.preventDefault(); });
$('fsBtn').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      await (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      await (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
    }
  } catch (_) { /* 断られたらそのまま */ }
});

function openHelp() {
  $('helpAudio').textContent = `音の状態: ${engine.state} ／ ${inStandalone ? 'ホーム画面アプリ' : 'ブラウザ'} ／ ogg: ${engine.usedWasm ? 'WASM（予備）' : 'ブラウザ内蔵'}`;
  $('helpModal').hidden = false;
}
$('helpBtn').addEventListener('click', openHelp);

// 設定画面
$('settingsBtn').addEventListener('click', () => {
  $('langSelect').value = settings.lang;
  renderThemeGrid();
  applyBackgroundOptions();
  $('paOffset').value = String(Number(settings.paOffset) || 0);
  $('paOffsetVal').textContent = `${Number(settings.paOffset) || 0}ms`;
  $('uiLangSelect').value = settings.uiLang || 'ja';
  $('settingsModal').hidden = false;
});
$('langSelect').addEventListener('change', () => {
  settings.lang = $('langSelect').value;
  saveSettings();
  renderGrid();
  if (shownGame) {
    const vs = variantsOf(shownGame.id);
    if (vs.length > 1) { const v = pickVariant(vs); if (v.id !== shownGame.id) openGame(v.id); }
  }
});
$('settingsClose').addEventListener('click', () => { $('settingsModal').hidden = true; });
$('helpClose').addEventListener('click', () => { $('helpModal').hidden = true; });

let exportUrl = null;
async function exportWav() {
  if (!remix) return;
  if (mode === 'playing') pause();
  $('exportModal').hidden = false;
  $('exportSave').hidden = true;
  $('exportBar').style.width = '10%';
  const from = remix.tempo.b2s(remix.playbackStart);
  $('exportMsg').textContent = `再生開始位置（${fmtTime(from)}）から最後まで、${fmtTime(remix.durationSec - from)} を書き出しています…`;
  try {
    await engine.loadSounds([...remix.allSoundCues().keys()], remix.db);
    const blob = await renderWav(engine, remix, musicBuf, from);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(blob);
    const a = $('exportSave');
    a.href = exportUrl;
    a.download = fileName.replace(/\.[^.]+$/, '') + '.wav';
    a.hidden = false;
    $('exportBar').style.width = '100%';
    $('exportMsg').textContent = `書き出しました（${(blob.size / 1048576).toFixed(1)} MB）。下のボタンで保存できます。`;
  } catch (e) {
    $('exportMsg').textContent = `書き出しに失敗しました: ${e.message}`;
  }
}
$('exportClose').addEventListener('click', () => { $('exportModal').hidden = true; });
$('saveClose').addEventListener('click', () => { $('saveModal').hidden = true; });

window.addEventListener('keydown', (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const mod = e.ctrlKey || e.metaKey;
  if (e.code === 'Space') { e.preventDefault(); mode === 'playing' ? stopPlayback() : play(); }
  else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
  else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); }
  else if (mod && e.key.toLowerCase() === 'c') { if (view.selection.size) { e.preventDefault(); copySelection(); } }
  else if (mod && e.key.toLowerCase() === 'v') { if (clipboard) { e.preventDefault(); startPaste(); } }
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); openSave(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (view.selection.size) { e.preventDefault(); deleteSelection(); } }
  else if (e.key === 'Escape') { if (presenting) stopPresentation(); else if (pasteArmed) { pasteArmed = false; view.armed = null; updateCtxbar(); setStatus(summaryText()); } else if (armed) setArmed(null); else { multiSelect = false; view.selection.clear(); view.dirty = true; updateCtxbar(); } }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) openBuffer(await f.arrayBuffer(), f.name);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'playing') pause(); engine.releaseKeepAlive(); }
  else if (mode !== 'playing') engine.stale = true; // 戻ってきたら、次の ▶ で音の部品を作り直す
});
window.addEventListener('pageshow', (e) => { if (e.persisted) engine.stale = true; });

// ---------------------------------------------------------------- 字幕・画像

let textTarget = null;
function openTextEditor(ent) {
  if (!ent) return;
  textTarget = ent;
  $('textInput').value = ent.subtitle || '';
  $('textModal').hidden = false;
  setTimeout(() => $('textInput').focus(), 50);
}
$('textOk').addEventListener('click', () => {
  const ent = textTarget;
  const v = $('textInput').value;
  $('textModal').hidden = true;
  if (ent && v !== (ent.subtitle || '')) edit(() => { ent.subtitle = v; });
  updateCtxbar();
});
$('textCancel').addEventListener('click', () => { $('textModal').hidden = true; });

let textureTarget = null;
function pickTexture(ent) {
  if (!ent) return;
  textureTarget = ent;
  $('imageInput').click();
}
// どんな画像も PNG にして .rhref に入れる（RHRE は "<名前>.png" を読む）
$('imageInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  const ent = textureTarget;
  if (!f || !ent) return;
  try {
    const bmp = await createImageBitmap(f);
    const cv = document.createElement('canvas');
    const scale = Math.min(1, 1024 / Math.max(bmp.width, bmp.height));
    cv.width = Math.max(1, Math.round(bmp.width * scale));
    cv.height = Math.max(1, Math.round(bmp.height * scale));
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const hash = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => b.toString(16).padStart(2, '0')).join('');
    extraFiles.push({ name: `${hash}.png`, data: bytes });
    await addTextureImage(hash, bytes);
    edit(() => { ent.extra = { ...ent.extra, texHash: hash }; });
  } catch (_) {
    toast('この画像は読み込めませんでした', 3000);
  }
});

function addTextureImage(hash, bytes) {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => { textureImages.set(hash, img); view.dirty = true; res(); };
    img.onerror = () => res();
    img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  });
}

async function loadTexturesFromExtra() {
  textureImages.clear();
  for (const f of extraFiles) {
    const m = /^(.+)\.png$/i.exec(f.name);
    if (m) await addTextureImage(m[1], f.data);
  }
}

// ---------------------------------------------------------------- カスタム効果音（自分の音声ファイル）

let customSounds = []; // [{ id, name, bytes }]

function buildCustomGame() {
  if (!customSounds.length) { customRegistry.game = null; return; }
  const game = { id: CUSTOM_GAME_ID, name: t('カスタム効果音'), series: 'custom', icon: null, objects: [] };
  for (const c of customSounds) {
    game.objects.push({ type: 'cue', id: `${CUSTOM_GAME_ID}/${c.id}`, name: c.name, duration: 1, stretchable: true, repitchable: true, game, url: `custom:${c.id}` });
  }
  customRegistry.game = game;
  if (remix) { remix.db.addGame(game); remix.rebuild(); view.dirty = true; }
}

async function decodeCustom(c) {
  try { engine.buffers.set(`custom:${c.id}`, await engine.decode(c.bytes.buffer.slice(c.bytes.byteOffset, c.bytes.byteOffset + c.bytes.byteLength))); } catch (_) { /* 読めない */ }
}

async function restoreCustomSounds() {
  const list = await store.get('customSounds');
  if (!Array.isArray(list)) return;
  customSounds = list;
  await Promise.all(customSounds.map(decodeCustom));
  buildCustomGame();
}

function renderCustomGrid(grid) {
  const add = document.createElement('button');
  add.className = 'game txt';
  add.textContent = t('＋ 音声ファイルを追加');
  add.addEventListener('click', () => $('customInput').click());
  grid.appendChild(add);
  if (customRegistry.game) {
    const b = document.createElement('button');
    b.className = 'game txt' + (shownGame?.id === CUSTOM_GAME_ID ? ' sel' : '');
    b.dataset.gids = CUSTOM_GAME_ID;
    b.textContent = `${t('カスタム効果音')}（${customSounds.length}）`;
    b.addEventListener('click', () => openGame(CUSTOM_GAME_ID));
    grid.appendChild(b);
    showGameList(customRegistry.game);
  }
}

$('customInput').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (!files.length) return;
  let added = 0;
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer());
    const base = f.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'sound';
    let id = base, n = 2;
    while (customSounds.some((c) => c.id === id)) id = `${base}_${n++}`;
    const c = { id, name: f.name.replace(/\.[^.]+$/, ''), bytes };
    await decodeCustom(c);
    if (!engine.buffers.has(`custom:${id}`)) continue;
    customSounds.push(c);
    added++;
  }
  store.set('customSounds', customSounds);
  buildCustomGame();
  renderGrid();
  toast(added ? `${added} 個の音声を追加しました。保存した .rhref をデスクトップ版で開くときは、同じファイルを RHRE fresh のカスタム効果音フォルダ「web」に入れてください。` : 'この音声ファイルは読み込めませんでした', 6000, added ? 'info' : '');
});

// ---------------------------------------------------------------- トラックの数

// 保存ボタン → 名前を決める画面 → 「💾 保存」で保存（押した瞬間に保存するので iPhone の共有シートも出せる）
function openSave() {
  if (!remix || loading) return;
  const inp = $('saveNameInput');
  inp.value = (fileName || 'remix.rhref').replace(/\.rhref$/i, '');
  $('saveNameModal').hidden = false;
  inp.focus();
  try { inp.select(); } catch (_) { /* 選べない環境 */ }
}
function commitSave() {
  // ファイル名に使えない文字は _ に。空なら remix
  const base = $('saveNameInput').value.trim().replace(/\.rhref$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120).trim() || 'remix';
  const next = `${base}.rhref`;
  $('saveNameModal').hidden = true;
  if (next !== fileName) { fileName = next; scheduleAutosave(); setStatus(summaryText()); }
  save();
}
$('saveNameOk').addEventListener('click', commitSave);
$('saveNameCancel').addEventListener('click', () => { $('saveNameModal').hidden = true; });
$('saveNameInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); commitSave(); }
  else if (e.key === 'Escape') { e.preventDefault(); $('saveNameModal').hidden = true; }
});

function openTracks() {
  if (!remix) return;
  $('tracksInput').value = String(remix.trackCount);
  $('tracksModal').hidden = false;
}
$('tracksOk').addEventListener('click', () => {
  const n = parseInt($('tracksInput').value, 10);
  if (!(n >= 5 && n <= 10)) { toast(t('トラックの数は 5〜10 です'), 2500); return; }
  const snap = remix.snapshot();
  if (!remix.setTrackCount(n)) { toast(t('はみ出すブロックがあるので、トラックを減らせません'), 3000); return; }
  remix.rebuild();
  undoStack.push(snap);
  redoStack.length = 0;
  afterEdit();
  $('tracksModal').hidden = true;
});
$('tracksCancel').addEventListener('click', () => { $('tracksModal').hidden = true; });

// ---------------------------------------------------------------- プレゼンテーションモード（上下のバーを隠して、トラックだけを大きく）

let presenting = false;
function startPresentation() {
  if (!remix) return;
  if (armed) setArmed(null);
  pasteArmed = false;
  multiSelect = false;
  view.armed = null;
  view.selection.clear();
  updateCtxbar();
  presenting = true;
  document.documentElement.classList.add('presenting');
  view.dirty = true;
  if (mode !== 'playing') play();
}
function stopPresentation() {
  if (!presenting) return;
  presenting = false;
  document.documentElement.classList.remove('presenting');
  stopPlayback();
  applyPanel();
  view.dirty = true;
}
$('presentExit').addEventListener('click', stopPresentation);

// ---------------------------------------------------------------- プレイモード（RHRE fresh の Playalong）
// 上の Ⓐ ボタンで切り替え。下のゲーム一覧の代わりにスコアとズレのバーを出し、▶ で再生してボタンのキューに合わせて押す

// 聞こえている音の時刻（スピーカーやイヤホンの遅れと、設定の「タイミング調整」を引く）
function paTime() {
  const ctx = engine.ctx;
  const lat = (ctx?.outputLatency || 0) + (ctx?.baseLatency || 0) + (Number(settings.paOffset) || 0) / 1000;
  return player.time - lat * (player.speed || 1);
}

function setPlayMode(on) {
  playMode = on;
  root.classList.toggle('playmode', on);
  $('playModeBtn').classList.toggle('on', on);
  $('playModeBtn').setAttribute('aria-pressed', String(on));
  view.playMode = on;
  if (on) {
    if (armed) setArmed(null);
    resetJudge();
    setStatus(t('プレイモード：▶ で再生して、キューに合わせて押してください'));
  } else {
    judge = null;
    for (const e of remix?.entities || []) e.judge = null;
    $('psMarks').textContent = '';
    setStatus(summaryText());
  }
  updateButtons();
  view.dirty = true;
}
$('playModeBtn').addEventListener('click', () => setPlayMode(!playMode));

function resetJudge() {
  $('psMarks').textContent = '';
  for (const e of remix?.entities || []) e.judge = null;
  if (!remix) { judge = null; updatePlayStage(); return; }
  judge = new PlayalongJudge(remix, player.speed || Number(settings.speed) || 1);
  judge.onJudge = (a, timing, isEnd, off, forced) => {
    a.ent.judge = a.ent.judge === 'MISS' ? 'MISS' : timing;
    // 押したときだけ、ズレのバーに印をつける（左が早い、右が遅い）
    if (!forced) addTimingMark(off / (judge.speed || 1), timing);
    updatePlayStage();
    view.dirty = true;
  };
  // 要るボタンだけ出す
  const keys = judge.neededKeys();
  $('psDpad').classList.toggle('off', !['UP', 'DOWN', 'LEFT', 'RIGHT'].some((k) => keys.has(k)));
  $('psAB').querySelector('.akey').classList.toggle('off', !keys.has('A'));
  $('psAB').querySelector('.bkey').classList.toggle('off', !keys.has('B'));
  updatePlayStage();
}
function updatePlayStage() {
  const n = judge ? judge.actions.filter((a) => !a.skipped).length : 0;
  const aces = judge ? judge.counts.ACE : 0;
  $('psScore').textContent = String(judge ? Math.floor(judge.score) : 0);
  $('psAces').textContent = `${aces} Aces / ${n} Inputs`;
}
function addTimingMark(off, timing) {
  const m = document.createElement('div');
  m.className = `ps-mark ${timing.toLowerCase()}`;
  m.style.left = `${50 + clamp(off / WINDOW.MAX, -1, 1) * 50}%`;
  $('psMarks').appendChild(m);
  setTimeout(() => m.remove(), 3000);
}

function paPress(key) { if (playMode && judge && mode === 'playing') judge.press(key, paTime()); }
function paRelease(key) { if (playMode && judge && mode === 'playing') judge.release(key, paTime()); }

// 画面のボタン（A・B・十字）
for (const b of document.querySelectorAll('#playStage .pkey')) {
  const key = b.dataset.key;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど */ }
    b.classList.add('down-now');
    try { navigator.vibrate?.(6); } catch (_) { /* 未対応 */ }
    paPress(key);
  });
  const up = () => { if (!b.classList.contains('down-now')) return; b.classList.remove('down-now'); paRelease(key); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
// 再生中はトラックの上どこでもタッチ（タップ・フリック・スライド）
{
  const pad = $('touchPad');
  const touches = new Map();
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { pad.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど */ }
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now(), slid: false, flicked: false });
    paPress('TOUCH');
  });
  pad.addEventListener('pointermove', (e) => {
    const s = touches.get(e.pointerId);
    if (!s) return;
    const d = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    const dt = performance.now() - s.t;
    if (!s.flicked && d > 34 && dt < 220) { s.flicked = true; paPress('FLICK'); }
    if (!s.slid && d > 26) { s.slid = true; paPress('SLIDE'); }
  });
  const end = (e) => { if (!touches.has(e.pointerId)) return; touches.delete(e.pointerId); paRelease('TOUCH'); };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
}
// キーボード（パソコン）：A＝J、B＝K、十字＝WASD・矢印
const PA_KEYS = { KeyJ: 'A', KeyK: 'B', ArrowUp: 'UP', KeyW: 'UP', ArrowDown: 'DOWN', KeyS: 'DOWN', ArrowLeft: 'LEFT', KeyA: 'LEFT', ArrowRight: 'RIGHT', KeyD: 'RIGHT' };
window.addEventListener('keydown', (e) => {
  if (!playMode || mode !== 'playing') return;
  const tag = document.activeElement?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = PA_KEYS[e.code];
  if (!k || e.ctrlKey || e.metaKey) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (!e.repeat) paPress(k);
}, true);
window.addEventListener('keyup', (e) => {
  if (!playMode || mode !== 'playing') return;
  const k = PA_KEYS[e.code];
  if (!k) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  paRelease(k);
}, true);

// ---------------------------------------------------------------- 設定（言語・再生速度・テーマ・画面の言語）

// ---- テーマ：色の組をいろいろ用意。カスタムは 背景・線・アクセント を自分で選べる
const THEME_PRESETS = [
  { id: 'dark', name: 'ダーク', bg: '#242424', grid: '#9cc7ee', accent: '#5fd3ff', builtin: true },
  { id: 'black', name: 'ブラック', bg: '#000000', grid: '#7fb0de', accent: '#5fd3ff', builtin: true },
  { id: 'light', name: 'ライト', bg: '#eef1f5', grid: '#5d84ad', accent: '#1f8fc0', builtin: true },
  { id: 'navy', name: 'ネイビー', bg: '#15203a', grid: '#9cc0ff', accent: '#6fb4ff' },
  { id: 'ocean', name: 'オーシャン', bg: '#0f2a33', grid: '#86e3ee', accent: '#3fd0e0' },
  { id: 'forest', name: 'フォレスト', bg: '#13271b', grid: '#95dcaa', accent: '#5ed68a' },
  { id: 'purple', name: 'パープル', bg: '#1f1733', grid: '#c6b0ff', accent: '#b18cff' },
  { id: 'wine', name: 'ワイン', bg: '#2b151b', grid: '#f3a9b8', accent: '#ff7a9a' },
  { id: 'sunset', name: 'サンセット', bg: '#2c1b12', grid: '#ffc58f', accent: '#ffa04d' },
  { id: 'retro', name: 'レトロ', bg: '#0f2f17', grid: '#9bd37a', accent: '#b8e86a' },
  { id: 'sakura', name: 'さくら', bg: '#fff0f4', grid: '#d77d9b', accent: '#e0608a' },
  { id: 'mint', name: 'ミント', bg: '#ebf8f2', grid: '#4f9e80', accent: '#2fae84' },
  { id: 'lemon', name: 'レモン', bg: '#fffae3', grid: '#a8902b', accent: '#d8a800' },
  { id: 'lavender', name: 'ラベンダー', bg: '#f3effd', grid: '#8673c4', accent: '#7a5cd6' },
  { id: 'sky', name: 'そら', bg: '#eaf5ff', grid: '#4f86c0', accent: '#2f8fe0' },
];
const hexRgb = (h) => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
const mixHex = (a, b, k) => { const x = hexRgb(a), y = hexRgb(b); return rgbHex(x[0] + (y[0] - x[0]) * k, x[1] + (y[1] - x[1]) * k, x[2] + (y[2] - x[2]) * k); };
const isLightHex = (h) => { const [r, g, b] = hexRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55; };
const THEME_VARS = ['--chrome', '--chrome-edge', '--btn', '--btn-hi', '--panel', '--panel-line', '--accent', '--on'];

function currentTheme() {
  if (settings.theme === 'custom') {
    const c = settings.customTheme || {};
    return { id: 'custom', bg: c.bg || '#242424', grid: c.grid || '#9cc7ee', accent: c.accent || '#5fd3ff' };
  }
  return THEME_PRESETS.find((p) => p.id === settings.theme) || THEME_PRESETS[0];
}

function applyThemeSettings() {
  const th = currentTheme();
  const rs = document.documentElement.style;
  if (th.builtin) {
    // もとからあるダーク・ブラック・ライトは、今までどおりの色
    applyTheme(th.id);
    document.documentElement.dataset.theme = th.id;
    for (const v of THEME_VARS) rs.removeProperty(v);
    document.body.style.background = '';
    $('editor').style.background = '';
  } else {
    const light = isLightHex(th.bg);
    const [r, g, b] = hexRgb(th.grid);
    applyTheme({
      bg: th.bg, grid: th.grid, gridRGB: `${r},${g},${b}`,
      beatNum: mixHex(th.grid, light ? '#000000' : '#ffffff', 0.15),
      timeSig: `rgba(${r}, ${g}, ${b}, ${light ? 0.45 : 0.7})`,
      tempoTri: '#2b34b8', tempoText: light ? '#2b34b8' : '#7c86ff',
    });
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    const ink = light ? '#000000' : '#ffffff';
    const vars = light
      ? { '--chrome': mixHex(th.bg, ink, 0.08), '--chrome-edge': mixHex(th.bg, ink, 0.2), '--btn': mixHex(th.bg, ink, 0.15), '--btn-hi': mixHex(th.bg, ink, 0.22), '--panel': mixHex(th.bg, '#ffffff', 0.55), '--panel-line': mixHex(th.bg, ink, 0.15), '--on': mixHex(th.accent, '#ffffff', 0.45) }
      : { '--chrome': mixHex(th.bg, ink, 0.14), '--chrome-edge': mixHex(th.bg, '#000000', 0.4), '--btn': mixHex(th.bg, ink, 0.22), '--btn-hi': mixHex(th.bg, ink, 0.3), '--panel': mixHex(th.bg, '#000000', 0.35), '--panel-line': mixHex(th.bg, ink, 0.22), '--on': mixHex(th.accent, th.bg, 0.45) };
    vars['--accent'] = th.accent;
    for (const [k, v] of Object.entries(vars)) rs.setProperty(k, v);
    document.body.style.background = vars['--panel'];
    $('editor').style.background = th.bg;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim() || '#3b3b3b';
  view.dirty = true;
}

// 設定画面のテーマの見本（押すとすぐ変わる）
function renderThemeGrid() {
  const grid = $('themeGrid');
  const cur = settings.theme || 'dark';
  const sw = (id, name, style) => `<button class="theme-sw${cur === id ? ' on' : ''}" data-theme="${id}" style="${style}" aria-pressed="${cur === id}"><span class="sw"></span><span class="nm">${esc(t(name))}</span></button>`;
  grid.innerHTML = THEME_PRESETS.map((p) => sw(p.id, p.name, `--sw-bg:${p.bg};--sw-grid:${p.grid};--sw-acc:${p.accent}`)).join('')
    + sw('custom', 'カスタム', 'background:none');
  const c = currentTheme();
  $('customColors').hidden = cur !== 'custom';
  $('ccBg').value = c.bg; $('ccGrid').value = c.grid; $('ccAccent').value = c.accent;
}
$('themeGrid').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme]');
  if (!b) return;
  if (b.dataset.theme === 'custom' && settings.theme !== 'custom') {
    // カスタムは、今のテーマの色から始める
    const c = currentTheme();
    settings.customTheme = { bg: c.bg, grid: c.grid, accent: c.accent };
  }
  settings.theme = b.dataset.theme;
  saveSettings();
  applySettings();
  renderThemeGrid();
});
for (const [id, key] of [['ccBg', 'bg'], ['ccGrid', 'grid'], ['ccAccent', 'accent']]) {
  $(id).addEventListener('input', () => {
    settings.customTheme = { ...(settings.customTheme || {}), [key]: $(id).value };
    settings.theme = 'custom';
    applyThemeSettings();
  });
  $(id).addEventListener('change', () => saveSettings());
}

// ---- 背景の画像（端末に保存。縦横比は変えない）
let bgUrl = null;
async function setBackgroundImage(bytes, type) {
  if (bgUrl) URL.revokeObjectURL(bgUrl);
  bgUrl = null;
  view.bgImage = null;
  if (bytes) {
    bgUrl = URL.createObjectURL(new Blob([bytes], { type: type || 'image/png' }));
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = bgUrl; });
    view.bgImage = { img, fit: settings.bgFit || 'cover', alpha: (Number(settings.bgAlpha) || 60) / 100 };
  }
  applyBackgroundOptions();
}
function applyBackgroundOptions() {
  const fit = settings.bgFit || 'cover';
  const alpha = (Number(settings.bgAlpha) || 60) / 100;
  if (view.bgImage) { view.bgImage.fit = fit; view.bgImage.alpha = alpha; view.bgImage.cacheKey = ''; }
  $('bgClear').disabled = !bgUrl;
  $('bgFit').value = fit;
  $('bgAlpha').value = String(Math.round(alpha * 100));
  $('bgAlphaVal').textContent = `${Math.round(alpha * 100)}%`;
  view.dirty = true;
}
$('paOffset').addEventListener('input', () => { settings.paOffset = Number($('paOffset').value); $('paOffsetVal').textContent = `${settings.paOffset}ms`; });
$('paOffset').addEventListener('change', () => saveSettings());
$('bgPick').addEventListener('click', () => $('bgInput').click());
$('bgInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (!f) return;
  try {
    const bytes = await f.arrayBuffer();
    await setBackgroundImage(bytes, f.type);
    store.set('bgImage', { bytes, type: f.type });
    setStatus(t('背景の画像を設定しました'));
  } catch (_) { toast(t('この画像は読み込めませんでした'), 3000); }
});
$('bgClear').addEventListener('click', () => { setBackgroundImage(null); store.set('bgImage', null); setStatus(t('背景の画像を外しました')); });
$('bgFit').addEventListener('change', () => { settings.bgFit = $('bgFit').value; saveSettings(); applyBackgroundOptions(); });
$('bgAlpha').addEventListener('input', () => { settings.bgAlpha = Number($('bgAlpha').value); applyBackgroundOptions(); });
$('bgAlpha').addEventListener('change', () => saveSettings());
store.get('bgImage').then((rec) => { if (rec?.bytes) setBackgroundImage(rec.bytes, rec.type).catch(() => {}); else applyBackgroundOptions(); });

function applySettings() {
  player.speedSetting = Number(settings.speed) || 1;
  applyThemeSettings();
  setLang(settings.uiLang || 'ja');
  document.documentElement.lang = settings.uiLang === 'en' ? 'en' : 'ja';
  LABELS.music = t('音楽開始');
  LABELS.playback = t('再生開始');
  LABELS.volume = t('音量');
  applyStatic(document.body);
  for (const b of document.querySelectorAll('#tabs .tab')) b.textContent = t(b.dataset.ja);
  const sp = Number(settings.speed) || 1;
  $('speedVal').textContent = `${sp.toFixed(sp * 10 % 1 ? 2 : 1)}×`;
  $('speedThumb').style.left = `${((sp - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%`;
  // つまみが右寄りのときは、数字を左に出して重ならないように
  const right = (sp - SPEED_MIN) / (SPEED_MAX - SPEED_MIN) > 0.62;
  $('speedVal').style.left = right ? '7px' : '';
  $('speedVal').style.right = right ? 'auto' : '';
  $('speedCtl').setAttribute('aria-valuenow', String(sp));
  view.dirty = true;
}
// 再生速度のつまみ：横にドラッグ（0.25〜2.0、1.0 の近くで止まる）、ダブルタップで 1.0
const SPEED_MIN = 0.25, SPEED_MAX = 2;
function setSpeed(v, commit) {
  let sp = clamp(Math.round(v * 20) / 20, SPEED_MIN, SPEED_MAX);
  if (Math.abs(sp - 1) < 0.051) sp = 1;
  settings.speed = sp;
  applySettings();
  updateTimebox(player.time || 0, remix ? remix.tempo.s2b(player.time || 0) : 0);
  if (commit) {
    saveSettings();
    if (mode === 'playing') startPlayback(player.time);
  }
}
{
  const ctl = $('speedCtl');
  const fromX = (clientX) => {
    const r = ctl.querySelector('.sp-track').getBoundingClientRect();
    return SPEED_MIN + clamp((clientX - r.left) / r.width, 0, 1) * (SPEED_MAX - SPEED_MIN);
  };
  let dragging = false, lastTap = 0;
  ctl.addEventListener('pointerdown', (e) => {
    const now = performance.now();
    if (now - lastTap < 320) { setSpeed(1, true); lastTap = 0; return; }
    lastTap = now;
    dragging = true;
    try { ctl.setPointerCapture(e.pointerId); } catch (_) { /* 無視 */ }
    setSpeed(fromX(e.clientX), false);
  });
  ctl.addEventListener('pointermove', (e) => { if (dragging) setSpeed(fromX(e.clientX), false); });
  const end = () => { if (!dragging) return; dragging = false; setSpeed(Number(settings.speed) || 1, true); };
  ctl.addEventListener('pointerup', end);
  ctl.addEventListener('pointercancel', end);
  ctl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); setSpeed((Number(settings.speed) || 1) - 0.05, true); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); setSpeed((Number(settings.speed) || 1) + 0.05, true); }
  });
}
$('uiLangSelect').addEventListener('change', () => {
  settings.uiLang = $('uiLangSelect').value;
  saveSettings();
  applySettings();
  buildCustomGame();
  renderGrid();
  if (shownGame) showGameList(shownGame.id === CUSTOM_GAME_ID && customRegistry.game ? customRegistry.game : shownGame);
  else {
    $('listHead').textContent = t('パターン');
    $('list').innerHTML = `<div class="empty">${esc(t('ミニゲームを選ぶと、パターンが並びます。名前を押してからトラックの空いている所をタップすると置けます。🔊で試聴できます。'))}</div>`;
  }
  updateCtxbar();
  setStatus(summaryText());
});

// 「…」メニュー
$('moreMenu').addEventListener('click', (e) => {
  const b = e.target.closest('[data-m]');
  if (!b || b.disabled) return;
  closeMore();
  if (b.dataset.m === 'copy') copySelection();
  else if (b.dataset.m === 'paste') startPaste();
  else if (b.dataset.m === 'split') splitSelection();
});
document.addEventListener('pointerdown', (e) => { if (!$('moreMenu').hidden && !e.target.closest('#moreMenu, [data-c="more"]')) closeMore(); });

// ---------------------------------------------------------------- 新しい版の確認
// GitHub Pages はページを10分ほどキャッシュするので、起動時と画面に戻ったときに version.json を見て、
// 新しい版があれば「更新する」ボタンを出す（押すと URL を変えて読み直すので、古いページが残らない）
let updateShown = false;
async function checkUpdate() {
  if (updateShown || location.protocol === 'file:') return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || version === VERSION) return;
    updateShown = true;
    $('updateText').textContent = `新しい版（試作 ${version}）があります`;
    $('updateBar').hidden = false;
    $('updateBtn').onclick = () => {
      if (mode === 'playing') stopPlayback();
      location.replace(`${location.pathname}?u=${encodeURIComponent(version)}`);
    };
  } catch (_) { /* オフラインなど */ }
}
$('updateLater').addEventListener('click', () => { $('updateBar').hidden = true; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
setTimeout(checkUpdate, 1500);

// ---------------------------------------------------------------- 起動

buildTabs();
updateButtons();
document.fonts?.ready.then(() => { view.dirty = true; });
fetch(`data/games-${DEFAULT_DB_COMMIT}.json`).then((r) => r.json()).then((d) => { gamesIndex = d.games || []; renderGrid(); }).catch(() => {});
// 動作確認用（URL に ?debug を付けたときだけ）
if (/[?&]debug\b/.test(location.search)) window.__rhre = { view, engine, player, get remix() { return remix; }, get judge() { return judge; } };

applySettings();
(async () => {
  await restoreCustomSounds().catch(() => {});
  const restored = await openAutosave().catch(() => false);
  if (!restored) await openSample();
})();
