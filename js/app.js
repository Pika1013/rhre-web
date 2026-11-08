import { loadRemix, loadRemixJSON, emptyRemixJSON, cleanName, isMulti, DEFAULT_DB_COMMIT } from './remix.js?v=4';
import { AudioEngine, Player, Previewer, renderWav } from './audio.js?v=4';
import { EditorView, Minimap, fmtTime } from './view.js?v=4';
import { makeZip } from './zip.js?v=4';

const VERSION = '0.2';
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isTouch = window.matchMedia('(pointer: coarse)').matches;

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
let armed = null; // 置こうとしているデータモデル
let multiSelect = false;
const undoStack = [];
const redoStack = [];

const SNAPS = [[0.25, '1/4'], [0.125, '1/8'], [0.5, '1/2'], [1, '1'], [0, '自由']];
let snapIdx = 0;

const SERIES_TABS = [
  ['used', '使用中'], ['tengoku', 'GBA'], ['ds', 'DS'], ['fever', 'Wii'], ['megamix', '3DS'],
  ['groove', 'Groove'], ['side', 'サイド'], ['other', 'その他'], ['special', '特殊'],
];
let gamesIndex = [];
let currentTab = 'used';
let shownGame = null;

const view = new EditorView($('view'), {
  canEdit: () => !!remix && mode !== 'playing' && !loading,
  isStretchable: (e) => !!remix && remix.isStretchable(e),
  onSelect: (ent, additive) => selectEntity(ent, additive),
  onPlace: (beat, track) => placeArmed(beat, track),
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
  onTempoTap: (beat, marker) => openTempo(beat, marker),
});
const mini = new Minimap($('minimap'), view);

// ---------------------------------------------------------------- 表示まわり

function setStatus(text) { $('statusText').textContent = text; }

// ステータスバーの基本表示（編集のたびに数え直す）
let loadWarn = '';
function summaryText() {
  if (!remix) return '';
  return `${fileName} ／ ${fmtTime(remix.durationSec)} ／ ミニゲーム ${usedGames().length} 種・ブロック ${remix.entities.length} 個${loadWarn}`;
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
}

function updateTimebox(sec, beat) {
  $('timeText').textContent = fmtTime(sec);
  $('beatText').textContent = `Beat ${beat.toFixed(3)}`;
}

function describe(ent) {
  const parts = [];
  if (ent.game) parts.push(ent.game.name);
  parts.push(ent.name);
  parts.push(`拍 ${+ent.beat.toFixed(3)}`);
  if (ent.width) parts.push(`長さ ${+ent.width.toFixed(3)}`);
  if (ent.semitone) parts.push(`音程 ${ent.semitone > 0 ? '+' : ''}${ent.semitone}`);
  if (ent.volume !== 100) parts.push(`音量 ${ent.volume}%`);
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

function armHint() { return `「${cleanName(armed.name)}」を置く：トラックの空いている所をタップ`; }

function setArmed(o) {
  armed = o;
  view.armed = o && remix ? { width: remix.model.defaultWidth(o), height: remix.model.height(o, remix.trackCount) } : null;
  view.hover = null;
  view.dirty = true;
  for (const row of $('list').querySelectorAll('.item')) row.classList.toggle('sel', !!o && row.dataset.id === o.id);
  updateCtxbar();
  setStatus(o ? armHint() : summaryText());
  if (o && remix) engine.loadSounds(remix.soundUrlsOf(o), remix.db);
}

function placeArmed(beat, track) {
  const o = armed;
  if (!o || !remix) return;
  if (mode === 'playing') { toast('再生中は置けません。■ で止めてから置いてください。', 3000, 'info'); return; }
  const ent = remix.createEntity(o, beat, track);
  if (remix.collides(ent.beat, ent.track, ent.width, ent.height)) { toast('ほかのブロックと重なるので置けません', 2200); return; }
  if (!edit(() => { remix.entities.push(ent); })) return;
  view.selection.clear();
  view.selection.add(ent);
  updateCtxbar();
  setStatus(`置きました：${describe(ent)}`);
  engine.loadSounds(remix.soundUrlsOf(o), remix.db);
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

function duplicateSelection() {
  const sel = [...view.selection];
  if (!sel.length) return;
  const minB = Math.min(...sel.map((e) => e.beat));
  const maxE = Math.max(...sel.map((e) => e.beat + e.width));
  const step = view.snap > 0 ? view.snap : 0.25;
  const span = Math.max(step, Math.ceil((maxE - minB) / step - 1e-9) * step);
  for (let k = 1; k <= 32; k++) {
    const off = span * k;
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
};

function updateCtxbar() {
  const bar = $('ctxbar');
  if (!remix) { bar.hidden = true; return; }
  if (armed) {
    bar.innerHTML = `<button class="txtbtn" data-c="disarm">やめる</button><span class="lbl">置く：</span><span class="lbl" style="color:#fff">${esc(cleanName(armed.name))}</span>`
      + `<span class="hint">トラックの空いている所をタップ（続けて置けます）</span>`;
    bar.hidden = false;
    return;
  }
  const sel = [...view.selection];
  if (!sel.length && !multiSelect) { bar.hidden = true; return; }
  const one = sel.length === 1 ? sel[0] : null;
  const semi = one ? (one.semitone > 0 ? `+${one.semitone}` : `${one.semitone}`) : '…';
  const vol = one ? `${one.volume}%` : '…';
  const dis = sel.length ? '' : ' disabled';
  bar.innerHTML = `<span class="lbl">${sel.length}個</span>`
    + `<button class="tb danger" data-c="del" title="削除" aria-label="削除"${dis}>${ICON.trash}</button>`
    + `<button class="tb" data-c="dup" title="複製" aria-label="複製"${dis}>${ICON.copy}</button>`
    + `<span class="sep"></span><span class="hint">音程</span>`
    + `<button class="tb" data-c="semi-" aria-label="音程を下げる"${dis}>${ICON.minus}</button><span class="val">${semi}</span>`
    + `<button class="tb" data-c="semi+" aria-label="音程を上げる"${dis}>${ICON.plus}</button>`
    + `<span class="sep"></span><span class="hint">音量</span>`
    + `<button class="tb" data-c="vol-" aria-label="音量を下げる"${dis}>${ICON.minus}</button><span class="val">${vol}</span>`
    + `<button class="tb" data-c="vol+" aria-label="音量を上げる"${dis}>${ICON.plus}</button>`
    + `<span class="sep"></span><button class="txtbtn${multiSelect ? ' on' : ''}" data-c="multi" aria-pressed="${multiSelect}">複数選択</button>`
    + `<button class="tb" data-c="clear" title="選択解除" aria-label="選択解除">${ICON.close}</button>`;
  bar.hidden = false;
}

$('ctxbar').addEventListener('click', (e) => {
  const c = e.target.closest('[data-c]')?.dataset.c;
  if (!c) return;
  switch (c) {
    case 'disarm': setArmed(null); break;
    case 'del': deleteSelection(); break;
    case 'dup': duplicateSelection(); break;
    case 'semi-': changeSemitone(-1); break;
    case 'semi+': changeSemitone(1); break;
    case 'vol-': changeVolume(-10); break;
    case 'vol+': changeVolume(10); break;
    case 'multi': multiSelect = !multiSelect; updateCtxbar(); break;
    case 'clear': multiSelect = false; view.selection.clear(); view.dirty = true; updateCtxbar(); setStatus(summaryText()); break;
  }
});

// ---------------------------------------------------------------- ピッカー（ミニゲーム一覧とパターン一覧）

function buildTabs() {
  const tabs = $('tabs');
  for (const [key, label] of SERIES_TABS) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.dataset.tab = key;
    b.textContent = label;
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

function renderGrid() {
  const grid = $('gameGrid');
  grid.textContent = '';
  const q = $('search').value.trim().toLowerCase();
  for (const t of $('tabs').querySelectorAll('.tab')) t.classList.toggle('on', !q && t.dataset.tab === currentTab);
  if (!remix) return;
  const used = new Set(usedGames().map((g) => g.id));
  let list;
  if (q) {
    list = gamesIndex.filter((g) => !g.id.startsWith('special') && (g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q) || g.hints.some((h) => String(h).toLowerCase().includes(q)))).slice(0, 80);
  } else if (currentTab === 'used') {
    list = usedGames();
    if (!list.length) { grid.innerHTML = '<div class="empty">まだ何も置いていません。上のタブからミニゲームを選んでください。</div>'; return; }
  } else if (currentTab === 'special') {
    const b = document.createElement('button');
    b.className = 'game txt';
    b.textContent = 'End Remix';
    b.title = 'リミックスの終わり';
    b.addEventListener('click', async () => {
      const g = await remix.db.loadGame('special').catch(() => null);
      if (g) showGameList(g, null, (o) => o.type === 'endEntity');
    });
    grid.appendChild(b);
    return;
  } else if (currentTab === 'other') {
    list = gamesIndex.filter((g) => (g.series === 'other' || g.noDisplay) && !g.id.startsWith('special'));
  } else {
    list = gamesIndex.filter((g) => g.series === currentTab && !g.noDisplay);
  }
  if (currentTab !== 'used' || q) list = [...list].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  if (!list.length) { grid.innerHTML = '<div class="empty">見つかりませんでした。</div>'; return; }
  for (const g of list) {
    const b = document.createElement('button');
    b.className = 'game' + (shownGame?.id === g.id ? ' sel' : '');
    b.title = g.name;
    b.setAttribute('aria-label', g.name);
    b.dataset.gid = g.id;
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = `${remix.db.base}games/${g.id}/icon.png`;
    b.appendChild(img);
    if (used.has(g.id) && currentTab !== 'used') { const m = document.createElement('span'); m.className = 'mark'; b.appendChild(m); }
    b.addEventListener('click', () => openGame(g.id, currentTab === 'used' && !q ? g.first : null));
    grid.appendChild(b);
  }
}

async function openGame(gid, jumpBeat) {
  setStatus('読み込み中…');
  try {
    const game = await remix.db.loadGame(gid);
    showGameList(game);
    setStatus(game.name);
    if (jumpBeat != null) view.centerOn(jumpBeat + view.visibleBeats * 0.3);
  } catch (e) {
    toast(`${gid} を読み込めませんでした`, 3000);
  }
}

const KIND = { pattern: 'パターン', keepTheBeat: '繰り返し', equidistant: '等間隔', randomCue: 'ランダム', multiCue: '複合', pitchDependent: '音程別', endEntity: '終わり' };
const PV_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>';

function showGameList(game, highlightObj, filter) {
  shownGame = game;
  $('listHead').textContent = game.name;
  for (const b of $('gameGrid').children) b.classList?.toggle('sel', b.dataset?.gid === game.id);
  const used = new Set(remix.entities.map((e) => e.o));
  let objs = game.objects.filter((o) => !o.hidden && (o.type === 'cue' || isMulti(o) || o.type === 'endEntity'));
  if (filter) objs = objs.filter(filter);
  objs.sort((a, b) => (isMulti(b) ? 1 : 0) - (isMulti(a) ? 1 : 0));
  const list = $('list');
  list.textContent = '';
  for (const o of objs) {
    const row = document.createElement('div');
    row.className = 'item' + ((armed ? armed === o : o === highlightObj) ? ' sel' : '');
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
      if (KIND[o.type]) { const k = document.createElement('span'); k.className = 'kind'; k.textContent = KIND[o.type]; tags.appendChild(k); }
      if (used.has(o)) { const u = document.createElement('span'); u.className = 'used'; u.textContent = '使用中'; tags.appendChild(u); }
      txt.appendChild(tags);
    }
    main.append(arrow, txt);
    main.addEventListener('click', () => { setArmed(armed === o ? null : o); });
    row.appendChild(main);
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
  if (!objs.length) list.innerHTML = '<div class="empty">表示できる項目がありません。</div>';
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
  armed = null;
  multiSelect = false;
  view.armed = null;
  view.setRemix(remix);
  shownGame = null;
  currentTab = 'used';
  $('search').value = '';
  renderGrid();
  $('listHead').textContent = 'パターン';
  $('list').innerHTML = '<div class="empty">ミニゲームを選ぶと、パターンが並びます。名前を押してからトラックをタップすると置けます。🔊で試聴できます。</div>';
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
  const files = [{ name: 'remix.json', data: new TextEncoder().encode(JSON.stringify(json)) }];
  if (musicFile) files.push({ name: 'music.bin', data: musicFile.bytes });
  for (const f of extraFiles) files.push(f);
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
  try {
    const file = new File([blob], name, { type: 'application/octet-stream' });
    if (isTouch && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name })
        .then(() => toast(`保存しました：${name}`, 2500, 'info'))
        .catch((err) => { if (err?.name !== 'AbortError') showLink(); });
      return;
    }
  } catch (_) { /* 共有できなければリンクで */ }
  showLink();
}

// ---------------------------------------------------------------- テンポ・音楽のダイアログ

let tempoCtx = null;
function openTempo(beat, marker) {
  if (!remix) return;
  if (mode === 'playing') { toast('再生中はテンポを変えられません。', 2500, 'info'); return; }
  tempoCtx = { beat: marker ? marker.beat : beat, marker };
  const first = marker && (marker.isImmutable || Math.abs(marker.beat) < 1e-6);
  $('tempoTitle').textContent = marker ? 'テンポを変更' : 'テンポ変更を追加';
  $('tempoInfo').textContent = marker
    ? `拍 ${+marker.beat.toFixed(3)} のテンポです。${first ? '最初のテンポなので削除はできません。' : ''}`
    : `拍 ${+beat.toFixed(3)} から、このテンポに変わります。`;
  $('tempoInput').value = String(+(marker ? marker.bpm : remix.tempo.tempoAt(beat)).toFixed(2));
  $('tempoDel').hidden = !marker || first;
  $('tempoModal').hidden = false;
}
$('tempoOk').addEventListener('click', () => {
  const v = parseFloat($('tempoInput').value);
  if (!(v >= 5 && v <= 600)) { toast('テンポは 5〜600 の数で入れてください', 2500); return; }
  const b = tempoCtx.beat;
  edit(() => remix.setTempo(b, Math.round(v * 1000) / 1000));
  $('tempoModal').hidden = true;
});
$('tempoDel').addEventListener('click', () => {
  const b = tempoCtx.beat;
  edit(() => remix.removeTempo(b));
  $('tempoModal').hidden = true;
});
$('tempoCancel').addEventListener('click', () => { $('tempoModal').hidden = true; });

function openMusicStart() {
  if (!remix) return;
  $('musicStartInput').value = String(+remix.musicStartSec.toFixed(3));
  $('musicInfo').textContent = musicFile
    ? `「${musicFile.filename}」が鳴り始める時刻（秒）です。デスクトップ版の赤い旗と同じです。`
    : 'まだ音楽を選んでいません。先にメニューの「音楽を選ぶ」から選んでください。';
  $('musicModal').hidden = false;
}
$('musicAlign').addEventListener('click', () => { $('musicStartInput').value = String(+remix.tempo.b2s(remix.playbackStart).toFixed(3)); });
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
    scheduleAutosave();
    toast(`音楽を読み込みました：${f.name}（${fmtTime(buf.duration)}）`, 3500, 'info');
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
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  };
  player.start(remix, musicBuf, fromSec);
  mode = 'playing';
  updateButtons();
  watchAudio();
}

function play() {
  if (!remix || loading || mode === 'playing') return;
  engine.unlock(); // iPhone ではタップの中で音を有効にする必要がある（await より前に呼ぶ）
  $('toast').hidden = true;
  const from = mode === 'paused' ? pausedSec : remix.tempo.b2s(remix.playbackStart);
  startPlayback(from);
}

function pause() {
  if (mode !== 'playing') return;
  player.pause();
  pausedSec = player.pausedAt;
  mode = 'paused';
  engine.stopKeepAlive();
  updateButtons();
}

function stopPlayback() {
  player.stop();
  previewer.stop();
  engine.stopKeepAlive();
  if (mode !== 'stopped' && remix) {
    // デスクトップ版と同じく、停止したら再生開始位置へ戻る
    view.scrollBeat = remix.playbackStart - (view.W * 0.3) / view.ppb;
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  }
  mode = 'stopped';
  view.playhead = null;
  view.dirty = true;
  $('subtitle').hidden = true;
  updateButtons();
}

function updateSubtitle(beat) {
  const active = remix.subtitles.filter((s) => beat >= s.beat && beat < s.beat + s.width);
  const el = $('subtitle');
  const text = active.map((s) => s.subtitle).join('\n');
  if (text) { if (el.textContent !== text) el.textContent = text; el.hidden = false; }
  else el.hidden = true;
}

function frame(now) {
  if (remix && mode === 'playing') {
    const t = player.time;
    const beat = remix.tempo.s2b(t);
    view.playhead = beat;
    view.follow(beat);
    for (const ent of player.takeVisual(t)) ent.flashAt = now;
    view.dirty = true;
    updateTimebox(Math.max(t, player.t0), beat);
    updateSubtitle(beat);
  } else if (remix && mode === 'paused') {
    view.playhead = remix.tempo.s2b(pausedSec);
  }
  view.stepMomentum(now);
  if (view.dirty) {
    view.dirty = false;
    view.draw(now);
    mini.draw();
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
    case 'save': save(); break;
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
$('snapBtn').addEventListener('click', () => {
  snapIdx = (snapIdx + 1) % SNAPS.length;
  view.snap = SNAPS[snapIdx][0];
  $('snapVal').textContent = SNAPS[snapIdx][1];
});
$('zoomIn').addEventListener('click', () => view.zoomBy(1.4));
$('zoomOut').addEventListener('click', () => view.zoomBy(1 / 1.4));
$('pageLeft').addEventListener('click', () => { view.scrollBeat -= view.visibleBeats * 0.8; view.lastUser = performance.now(); view.dirty = true; });
$('pageRight').addEventListener('click', () => { view.scrollBeat += view.visibleBeats * 0.8; view.lastUser = performance.now(); view.dirty = true; });

// 下のピッカー：背の低い画面（横向きのスマホ）では最初から畳む。向きごとに押した状態を覚える
const panelPref = { short: null, tall: null };
const isShort = () => window.innerHeight < 430;
function applyPanel() {
  const key = isShort() ? 'short' : 'tall';
  const collapsed = panelPref[key] ?? isShort();
  $('panel').classList.toggle('collapsed', collapsed);
  $('panelToggle').setAttribute('aria-expanded', String(!collapsed));
}
$('panelToggle').addEventListener('click', () => {
  panelPref[isShort() ? 'short' : 'tall'] = !$('panel').classList.contains('collapsed');
  applyPanel();
});
window.addEventListener('resize', applyPanel);
applyPanel();

// 全画面（iPad・Android・PC など対応している環境だけボタンを出す。iPhone はホーム画面に追加で全画面になる）
const root = document.documentElement;
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const inStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
$('fsBtn').hidden = !fsSupported || inStandalone;
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
  else if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { if (view.selection.size) { e.preventDefault(); deleteSelection(); } }
  else if (e.key === 'Escape') { if (armed) setArmed(null); else { view.selection.clear(); view.dirty = true; updateCtxbar(); } }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) openBuffer(await f.arrayBuffer(), f.name);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (mode === 'playing') pause(); }
  else if (mode !== 'playing') engine.stale = true; // 戻ってきたら、次の ▶ で音の部品を作り直す
});
window.addEventListener('pageshow', (e) => { if (e.persisted) engine.stale = true; });

// ---------------------------------------------------------------- 起動

buildTabs();
updateButtons();
document.fonts?.ready.then(() => { view.dirty = true; });
fetch(`data/games-${DEFAULT_DB_COMMIT}.json`).then((r) => r.json()).then((d) => { gamesIndex = d.games || []; renderGrid(); }).catch(() => {});
(async () => {
  const restored = await openAutosave().catch(() => false);
  if (!restored) await openSample();
})();
