import { loadRemix, loadRemixJSON, emptyRemixJSON, cleanName, isMulti, DEFAULT_DB_COMMIT, TempoMap } from './remix.js?v=16';
import { analyzeTempo } from './tempo.js?v=2';
import { AudioEngine, Player, Previewer, renderWav, renderMix, mixEndSec, detectOnset, rhreMusicLeadIn } from './audio.js?v=21';
import { customRegistry } from './db.js?v=10';
import { t, setLang, applyStatic, getLang } from './i18n.js?v=36';
import { EditorView, fmtTime, LABELS, applyTheme, FONT, loadIcon } from './view.js?v=39';
import { makeZip } from './zip.js?v=4';
import { PLAYALONG_GAME_ID, PlayalongJudge, WINDOW } from './playalong.js?v=4';
import { canRenderFast, canRecord, renderVideoFast, recordVideoRealtime } from './video.js?v=9';
import { CHANGELOG } from './changelog.js?v=18';

const VERSION = '1.9.11';
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
let rewound = false; // 0拍目に戻したあと（プレイモードの判定を最初からにする）
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
  // プレイモード中とプレゼンテーション中は、トラックを編集できない（見る・スクロールだけ）
  canEdit: () => !!remix && mode !== 'playing' && !loading && !presenting && !playMode,
  // 再生位置（緑の旗）だけは、プレイモード中も動かせる
  canMovePlayback: () => !!remix && mode !== 'playing' && !loading && !presenting,
  // プレイモード中はトラックを上下に動かさない
  lockY: () => playMode,
  iconsOnly: () => presenting, // プレゼンテーション中はブロックの文字を出さず、ゲームのアイコンだけ
  playalongLabel: (e) => (getLang() === 'en' ? `Playalong ${e.name}` : objName(e.o)),
  isStretchable: (e) => !!remix && remix.isStretchable(e),
  onSelect: (ent, additive) => { if (!presenting && !playMode) selectEntity(ent, additive); },
  onPlace: (beat, track) => { if (playMode) return; pasteArmed ? pasteAt(beat, track) : placeArmed(beat, track); },
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
    if (mode === 'playing') {
      const sec = remix.tempo.b2s(beat);
      startPlayback(sec);
      // プレイモードで途中に飛んだら、判定をそこからやり直す
      if (playMode) { resetJudge(); judge?.skipBefore(sec - 0.05); }
    }
    else { mode = 'stopped'; updateButtons(); updateTimebox(remix.tempo.b2s(beat), beat); }
    view.dirty = true;
    scheduleAutosave();
  },
  onMarkerTap: (beat, snapped, tol) => { if (!playMode) openMarker(beat, snapped, tol); },
  onMarkerGrab: (kind) => setStatus(t(kind === 'tempo' ? 'テンポの印をつかみました。左右に動かしてください' : '音量の印をつかみました。左右に動かしてください')),
  validateMarkerMove: (kind, from, to) => !!remix && !(kind === 'tempo' ? remix.tempoTrackers : remix.musicVolumes)
    .some((m) => Math.abs(m.beat - to) < 1e-6 && Math.abs(m.beat - from) > 1e-6),
  onMoveMarker: (kind, from, to) => moveMarker(kind, from, to),
  onTimeSigTap: (box) => { if (!playMode) openTsEditor(box); },
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
    if (!remix || playMode) return;
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
// お知らせは、タップするとすぐ消える
$('toast').addEventListener('pointerdown', (e) => { e.stopPropagation(); clearTimeout(toastTimer); $('toast').hidden = true; });
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

// 失敗したときの画面：何が起きたか（原因）と、詳しい情報
let errAfter = null;
function showErrorBox(title, cause, err, after) {
  $('loading').hidden = true;
  $('errTitle').textContent = title;
  $('errMsg').textContent = cause;
  const detail = err ? `${err.name && err.name !== 'Error' ? err.name + ': ' : ''}${err.message || String(err)}` : '';
  $('errDetail').textContent = detail ? `${t('詳しい情報')}：${detail}` : '';
  $('errDetail').hidden = !detail;
  errAfter = after || null;
  $('errModal').hidden = false;
}
$('errOk').addEventListener('click', () => {
  $('errModal').hidden = true;
  const f = errAfter;
  errAfter = null;
  f?.();
});
function showError(msg) { showErrorBox(t('開けませんでした'), msg, null, () => { if (!remix) newRemix(); }); }

// ファイルの先頭を見て、中身の種類を当てる
function sniffFile(bytes) {
  const b = bytes || new Uint8Array(0);
  const at = (i, s) => [...s].every((c, k) => b[i + k] === c.charCodeAt(0));
  if (!b.length) return 'empty';
  if (b[0] === 0x50 && b[1] === 0x4b) return 'zip';
  if (at(0, 'ID3') || at(0, 'OggS') || at(0, 'fLaC') || (at(0, 'RIFF') && at(8, 'WAVE')) || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'audio';
  if (at(4, 'ftyp')) return 'audio';
  if ((b[0] === 0x89 && at(1, 'PNG')) || (b[0] === 0xff && b[1] === 0xd8) || at(0, 'GIF8') || (at(0, 'RIFF') && at(8, 'WEBP'))) return 'image';
  if (at(0, '%PDF')) return 'pdf';
  for (let i = 0; i < Math.min(b.length, 64); i++) {
    if (b[i] === 0x7b || b[i] === 0x5b) return 'json';
    if (![0x20, 0x09, 0x0a, 0x0d, 0xef, 0xbb, 0xbf].includes(b[i])) break;
  }
  return 'unknown';
}
const isNetworkError = (e) => !navigator.onLine || /Failed to fetch|Load failed|NetworkError|network|を取得できません/i.test(`${e?.name} ${e?.message}`);
// 開けなかった理由を、分かる言葉に
function loadErrorCause(e, bytes) {
  const kind = bytes ? sniffFile(bytes) : null;
  if (kind === 'empty') return t('ファイルが空です（0 バイト）。保存やコピーが途中で止まった可能性があります。');
  if (kind === 'audio') return t('これは音楽（音声）ファイルです。音楽はメニューの「音楽を選ぶ」から読み込んでください。');
  if (kind === 'image') return t('これは画像ファイルです。RHRE fresh か RHRE Web で保存した .rhref ファイルを選んでください。');
  if (kind === 'pdf' || kind === 'json' || kind === 'unknown') return t('このファイルは .rhref（ZIP 形式）ではありません。RHRE fresh か RHRE Web で保存した .rhref ファイルを選んでください。');
  const msg = `${e?.message || ''}`;
  if (/RHRE2/.test(msg)) return t('RHRE2 の古い形式のファイルです。RHRE Web では開けません（RHRE3 / RHRE fresh で保存し直してください）。');
  if (/remix\.json/.test(msg)) return t('.rhref の中にリミックスのデータ（remix.json）がありません。別のアプリの ZIP か、壊れたファイルです。');
  if (e instanceof SyntaxError || /JSON/.test(msg)) return t('リミックスのデータ（remix.json）が壊れていて読めません。');
  if (/圧縮形式/.test(msg)) return t('この .rhref は、RHRE Web が読めない方法で圧縮されています。RHRE fresh で開いて保存し直すと開けるかもしれません。');
  if (isNetworkError(e)) return t('ミニゲームのデータをダウンロードできませんでした。インターネットにつながっているか確かめて、もう一度開いてください。');
  if (kind === 'zip') return t('ファイルが壊れているか、途中で切れています（ZIP を展開できませんでした）。');
  return t('読み込みの途中で問題が起きました。');
}
// iPhone のファイルに同じ名前があると「名前.rhref 2」のように拡張子の後ろに番号が付くので、「名前 2.rhref」に直す
function normalizeRemixName(name) {
  let n = String(name || '').trim() || 'remix.rhref';
  const m = /^(.*)\.rhref\s*\(?(\d+)\)?$/i.exec(n);
  if (m) n = `${m[1]} ${m[2]}.rhref`;
  n = n.replace(/\.rhref\s*\(?(\d+)\)?\.rhref$/i, ' $1.rhref').replace(/\.rhref\.(zip|bin|txt|dat)$/i, '.rhref');
  if (!/\.rhref$/i.test(n)) n = `${n.replace(/\.[^.\s]*$/, '')}.rhref`;
  return n;
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
  // 編集バーとプレゼンテーションの再生ボタンも同じ状態に
  for (const [c, id] of [['play', 'playBtn'], ['pause', 'pauseBtn'], ['stop', 'stopBtn']]) {
    for (const bar of [$('ctxbar'), $('presentCtl')]) {
      const b = bar.querySelector(`[data-c="${c}"]`);
      if (b) b.disabled = $(id).disabled;
    }
  }
  // 0拍目に戻るボタンはプレゼンテーションモードだけ
  $('presentCtl').querySelector('[data-c="rewind"]').disabled = !ready;
}

function updateTimebox(sec, beat) {
  $('timeText').textContent = fmtTime(sec);
  $('beatText').textContent = `Beat ${beat.toFixed(3)}`;
}

function describe(ent) {
  const parts = [];
  if (ent.game) parts.push(ent.o?.type === 'playalongEntity' ? t('プレイアロング') : ent.game.name);
  parts.push(objName(ent.o) || ent.name);
  parts.push(t('拍 {b}', { b: +ent.beat.toFixed(3) }));
  if (ent.width) parts.push(t('長さ {w}', { w: +ent.width.toFixed(3) }));
  if (ent.semitone) parts.push(t('音程 {s}', { s: `${ent.semitone > 0 ? '+' : ''}${ent.semitone}` }));
  if (ent.volume !== 100) parts.push(t('音量 {v}%', { v: ent.volume }));
  if (!ent.o) parts.push('（データベースに無い ID）');
  return parts.join(' ／ ');
}

// 「[#FED900]yellow flower[] - launch」の色指定を反映する
// プレイアロングのキューの日本語名と、使われているゲームの例（RHRE fresh の一覧と同じ。ゲーム名は英語のまま）
const PA_TEXT = {
  press_A: ['A を押す', 'Fruit Basket'],
  press_B: ['B を押す', 'Ringside "pose for the fans"'],
  press_A_or_Dpad: ['A/十字を押す', "Shoot-'em-Up, First Contact"],
  press_Dpad: ['十字を押す', 'Blue Bear, Catchy Tune, Sick Beats'],
  press_Dpad_up: ['十字の上を押す', 'Sick Beats'],
  press_Dpad_down: ['十字の下を押す', 'Space Dance "let\'s sit down"'],
  press_Dpad_left: ['十字の左を押す', 'Marching Orders, Sick Beats'],
  press_Dpad_right: ['十字の右を押す', 'Space Dance "and pose"'],
  hold_A: ['A を押さえて離す', 'Fillbots, Screwbot Factory'],
  hold_B: ['B を押さえて離す', 'Flock Step, Super Samurai Slice'],
  hold_Dpad: ['十字を押さえて離す', null],
  releaseAndHold_A: ['A を離して押す', 'Glee Club'],
  releaseAndHold_Dpad: ['十字を離して押す', null],
  longPress_A: ['A を長押し', 'Glee Club transitions'],
  longPress_B: ['B を長押し', 'Samurai Slice (Fever) demon horde'],
  longPress_A_or_Dpad: ['A/十字を長押し', 'Rhythm Tweezers long pull'],
  longPress_Dpad: ['十字を長押し', null],
  longPress_Dpad_up: ['十字の上を長押し', null],
  longPress_Dpad_down: ['十字の下を長押し', null],
  longPress_Dpad_left: ['十字の左を長押し', 'Sweeper Stars Spin'],
  longPress_Dpad_right: ['十字の右を長押し', null],
  touch_tap: ['タッチ', 'Karate Man'],
  touch_flick: ['はじく', 'Rhythm Rally'],
  touch_slide: ['スライド', 'Love Lizards, Love Lab'],
  touch_quick_tap: ['すばやくタッチ', 'Moai Doo-Wop "pah"'],
  touch_tap_and_hold: ['タッチして離す', 'Fillbots'],
  touch_release_and_tap: ['離してタッチ', 'Glee Club'],
  longTap: ['長くタッチ', 'Glee Club transitions'],
};
const paText = (o) => (o?.type === 'playalongEntity' && o.id ? PA_TEXT[o.id.slice(PLAYALONG_GAME_ID.length + 1)] : null);
// 一覧やブロックに出す名前（日本語版ではプレイアロングを日本語に）
function objName(o) {
  const pt = paText(o);
  if (pt && getLang() !== 'en') return pt[0];
  return o?.name || o?.id || '';
}
// 一覧の名前の下に灰色で出す、使われているゲームの例
function objExample(o) {
  const pt = paText(o);
  if (!pt) return '';
  if (!pt[1]) return t('ゲームには無い操作');
  return `${t('例：')}${pt[1]}`;
}

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
  if (playMode) { toast(t('プレイモード中は編集できません。下の段の「やめる」で戻ってから編集してください。'), 3500, 'info'); return false; }
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
  guideCheck();
}

function undo() {
  if (!remix || !undoStack.length || playMode) return;
  if (mode === 'playing') { toast('再生中は元に戻せません。', 2500, 'info'); return; }
  redoStack.push(remix.snapshot());
  remix.restore(undoStack.pop());
  view.selection.clear();
  afterEdit();
}

function redo() {
  if (!remix || !redoStack.length || playMode) return;
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
      await new Promise((res, rej) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = res;
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error || new Error('aborted'));
      });
      return true;
    } catch (e) {
      storeFailed(key, e);
      return false;
    }
  },
};

// 端末への自動保存に失敗したら、原因を 1 回だけ知らせる（同じ原因で何度も出さない）
let storeWarned = '';
function storeFailed(key, e) {
  console.error('store', key, e);
  const name = e?.name || 'Error';
  if (storeWarned === name) return;
  storeWarned = name;
  const why = name === 'QuotaExceededError'
    ? t('端末の空き容量が足りません。')
    : (name === 'InvalidStateError' || name === 'SecurityError' || name === 'UnknownError')
      ? t('プライベートブラウズなどで、このサイトがデータを保存することを許可されていません。')
      : t('端末にデータを書き込めませんでした。');
  showErrorBox(t('自動保存に失敗しました'), `${why}${t('作業が消えないように、こまめに「保存」で .rhref に保存してください。')}`, e);
}

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
  const ent = remix.createEntity(o, beat, track);
  if (o.game?.id === CUSTOM_GAME_ID) ent.isCustom = true;
  if (remix.collides(ent.beat, ent.track, ent.width, ent.height)) { toast(t('ほかのブロックと重なるので置けません'), 2200); return false; }
  if (!edit(() => { remix.entities.push(ent); })) return false;
  // 一覧から置いたときは編集モードにしない（続けて置ける）。置いた所だけ一瞬光らせる
  view.selection.clear();
  ent.flashAt = performance.now();
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

function armHint() { return t('「{name}」を置く：トラックの空いている所をタップ', { name: cleanName(objName(armed)) }); }

function setArmed(o) {
  armed = o;
  if (o) pasteArmed = false;
  view.armed = o && remix ? { width: remix.model.defaultWidth(o), height: remix.model.height(o, remix.trackCount) } : null;
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
  if (!remix || !$('coachBar').hidden) { show(false); return; }
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
  showGameList({ id: '__playalong', name: t('プレイアロング'), objects: g.objects });
  setStatus(t('好きな段に置けます。左上のメニューの「プレイモード」で遊べます'));
}

async function openGame(gid, jumpBeat, highlightObj) {
  if (gid === CUSTOM_GAME_ID && customRegistry.game) { showGameList(customRegistry.game, highlightObj); return; }
  setStatus('読み込み中…');
  try {
    // Rockers・Guitar Lessons の言語のない版（ギターのコードなど）は、言語の版の一番下に入れてあるので、言語の版を開く
    const bases = sharedBasesOf(gid);
    if (bases && bases.includes(gid)) {
      const langs = variantsOf(gid).filter((v) => !bases.includes(v.id));
      gid = (langs.find((v) => v.language === settings.lang) || langs.find((v) => v.language === 'en') || langs[0])?.id || gid;
    }
    const game = await remix.db.loadGame(gid);
    let extra = null;
    if (bases && !bases.includes(gid)) {
      const all = variantsOf(gid);
      const sets = await Promise.all(bases.map((id) => remix.db.loadGame(id).catch(() => null)));
      extra = sets.filter(Boolean).map((g) => ({ title: variantLabel(all.find((v) => v.id === g.id) || g, all).replace(/^[-–\s]+/, ''), objects: g.objects }));
    }
    showGameList(game, highlightObj, null, extra);
    setStatus(t('{name} ／ 名前を押してから、トラックの空いている所をタップすると置けます', { name: game.name }));
    if (jumpBeat != null) view.centerOn(jumpBeat + view.visibleBeats * 0.3);
  } catch (e) {
    toast(`${gid} を読み込めませんでした`, 3000);
  }
}

const KIND = { musicDistortEntity: '特殊', pattern: 'パターン', keepTheBeat: '繰り返し', equidistant: '等間隔', randomCue: 'ランダム', multiCue: '複合', pitchDependent: '音程別', endEntity: '終わり', subtitleEntity: '字幕', textureEntity: '画像', playalongEntity: 'ボタン' };
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
  // 言語のない版（Rockers の「標準」など）は言語の版に入っているので、切り替えには出さない
  const vs = variantsOf(game.id).filter((v) => !isSharedBase(v.id));
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

// 一覧に出す項目と並び：パターンなど → Music Distortion（DJ School）→ キューなど
const LIST_TYPES = ['endEntity', 'subtitleEntity', 'textureEntity', 'playalongEntity', 'musicDistortEntity'];
const listRank = (o) => (isMulti(o) ? 0 : o.type === 'musicDistortEntity' ? 1 : 2);
function listObjects(objs, filter) {
  let out = objs.filter((o) => !o.hidden && (o.type === 'cue' || isMulti(o) || LIST_TYPES.includes(o.type)));
  if (filter) out = out.filter(filter);
  return out.sort((a, b) => listRank(a) - listRank(b));
}

// 言語ごとの版の一番下に、言語のない版の項目（ギターのコードなど）も並べるゲーム（グループの名前 → 言語のない版。この順に並べる）
const SHARED_BASE = {
  Rockers: ['rockers'],
  'Guitar Lessons': ['guitarLessonDist', 'guitarLessonDoremi', 'guitarLessonEnv'],
};
function sharedBasesOf(gid) {
  const me = gamesIndex.find((g) => g.id === gid);
  return (me && SHARED_BASE[me.group]) || null;
}
const isSharedBase = (gid) => !!sharedBasesOf(gid)?.includes(gid);

// extra：一番下に足す項目のまとまり [{ title, objects }]。2 つ以上あるときは、まとまりごとに見出しを付ける
function showGameList(game, highlightObj, filter, extra) {
  // 別のミニゲームに変えたときは、右のリストを一番上から（同じゲームを描き直すときは、そのままの位置）
  const changed = !shownGame || shownGame.id !== game.id;
  shownGame = game;
  renderListHead(game);
  const ids = new Set([game.id, ...variantsOf(game.id).map((v) => v.id)]);
  for (const b of $('gameGrid').children) b.classList?.toggle('sel', !!b.dataset?.gids && b.dataset.gids.split(' ').some((id) => ids.has(id)));
  const used = new Set(remix.entities.map((e) => e.o));
  const objs = listObjects(game.objects, filter);
  const heads = new Map(); // この項目の前に見出しを出す
  for (const set of extra || []) {
    const add = listObjects(set.objects || [], filter).filter((o) => !objs.includes(o));
    if (add.length && extra.length > 1) heads.set(add[0], set.title);
    objs.push(...add);
  }
  const list = $('list');
  list.textContent = '';
  for (const o of objs) {
    if (heads.has(o)) {
      const h = document.createElement('div');
      h.className = 'list-sec';
      h.textContent = heads.get(o);
      list.appendChild(h);
    }
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
    nm.appendChild(richName(objName(o)));
    txt.appendChild(nm);
    const ex = objExample(o);
    if (ex) { const exEl = document.createElement('span'); exEl.className = 'ex'; exEl.textContent = ex; txt.appendChild(exEl); }
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
  if (changed && !highlightObj) list.scrollTop = 0;
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

let musicError = null;
async function applyLoaded(res, name, { music, extra, note } = {}) {
  remix = res.remix;
  fileName = normalizeRemixName(name);
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
  $('list').innerHTML = `<div class="empty">${esc(t('ミニゲームを選ぶと、パターンが並びます。名前を押してからトラックの空いている所をタップすると置けます。スピーカーのボタンで試聴できます。'))}</div>`;
  const sounds = [...remix.allSoundCues().keys()];
  const failed = await engine.loadSounds(sounds, remix.db, (d, t) => showLoading(name, `効果音を読み込み中 ${d} / ${t}`, 0.25 + 0.75 * (d / t)));
  if (musicFile) {
    showLoading(name, '音楽を読み込み中…', 1);
    try {
      const b = musicFile.bytes;
      musicBuf = await engine.decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
      musicBuf.rhreLeadIn = rhreMusicLeadIn(b, musicBuf);
    } catch (e) {
      failed.push('music');
      musicError = e;
    }
  }
  $('loading').hidden = true;
  if (musicError) {
    const ext = (musicFile?.extension || '').toUpperCase();
    showErrorBox(t('音楽を読み込めませんでした'), t('リミックスは開けましたが、入っている音楽（{ext}）をこの端末では再生できませんでした。形式が対応していないか、音楽のデータが壊れています。メニューの「音楽を選ぶ」で入れ直せます。', { ext: ext || '?' }), musicError);
    musicError = null;
  }
  const notes = [];
  if (res.missing?.length) notes.push(`見つからない ID ${res.missing.length} 件`);
  if (failed.length) notes.push(`読めなかった音 ${failed.length} 件`);
  loadWarn = notes.length ? ' ／ 注意：' + notes.join('・') : '';
  setStatus(summaryText());
  $('version').textContent = `RHRE Web v${VERSION} ／ DB v${remix.raw.databaseVersion ?? '?'}`;
  $('helpDiag').textContent = `データベース: ${remix.db.commit}${res.missing?.length ? ' ／ 見つからない ID: ' + res.missing.slice(0, 6).join(', ') : ''}`;
  updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  updateCtxbar();
  if (note) toast(note, 3500, 'info');
  if (metronome) loadMetronomeSound();
}

async function withLoading(name, job, bytes) {
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
    showErrorBox(t('開けませんでした'), loadErrorCause(e, bytes), e, () => { if (!remix) newRemix(); });
  } finally {
    loading = false;
    updateButtons();
    view.dirty = true;
  }
}

function openBuffer(ab, name) {
  name = normalizeRemixName(name);
  return withLoading(name, async (onStatus) => {
    const res = await loadRemix(ab, { onStatus });
    await applyLoaded(res, name, { music: res.music, extra: res.extraFiles });
  }, new Uint8Array(ab, 0, Math.min(ab.byteLength, 64)));
}

async function openSample() {
  try {
    const res = await fetch('samples/sample.rhref');
    if (!res.ok) throw new Error(`サンプルが見つかりません (${res.status})`);
    await openBuffer(await res.arrayBuffer(), 'sample.rhref');
  } catch (e) {
    showErrorBox(t('開けませんでした'), isNetworkError(e) ? t('サンプルをダウンロードできませんでした。インターネットにつながっているか確かめてください。') : t('サンプルを開けませんでした。'), e);
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
  const name = normalizeRemixName((fileName || 'remix.rhref').replace(/[\\/:*?"<>|]/g, '_'));
  let blob;
  try {
    blob = buildRhref();
  } catch (e) {
    console.error(e);
    const mem = e instanceof RangeError || /memory|allocation|too large/i.test(e?.message || '');
    showErrorBox(t('保存できませんでした'), mem
      ? t('ファイルを作る途中でメモリが足りなくなりました。ほかのアプリやタブを閉じてから、もう一度保存してください。')
      : t('.rhref ファイルを作る途中で問題が起きました。'), e);
    return;
  }
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
    try {
      if (saveUrl) URL.revokeObjectURL(saveUrl);
      saveUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = saveUrl;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast(`${t('保存しました')}：${name}`, 2500, 'info');
    } catch (e) {
      console.error(e);
      showErrorBox(t('保存できませんでした'), t('ダウンロードを始められませんでした。ブラウザの設定でダウンロードが止められていないか確かめてください。'), e);
    }
    return;
  }
  try {
    const file = new File([blob], name, { type: 'application/octet-stream' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }) // 文字（title）は渡さない。渡すと iPhone の「ファイルに保存」で .txt も保存される
        .then(() => toast(`${t('保存しました')}：${name}`, 2500, 'info'))
        .catch((err) => {
          if (err?.name === 'AbortError') return; // 自分で閉じた
          console.error(err);
          showLink();
          const why = err?.name === 'NotAllowedError'
            ? t('共有の画面を開くことをブラウザに止められました。')
            : t('共有の画面でエラーが起きました。');
          $('saveMsg').textContent = `${why}${t('代わりに下のボタンで保存してください。')}（${err?.name || ''}${err?.message ? ': ' + err.message : ''}）`;
        });
      return;
    }
  } catch (e) { console.error(e); /* 共有できなければリンクで */ }
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
  $('musicAuto').hidden = guide.on && guide.step === 'start';
  $('musicInfo').textContent = musicFile
    ? `「${musicFile.filename}」が鳴り始める時刻（秒）です。赤い旗をドラッグしても動かせます。`
    : 'まだ音楽を選んでいません。先にメニューの「音楽を選ぶ」から選んでください。';
  $('musicModal').hidden = false;
}
$('musicAlign').addEventListener('click', () => { $('musicStartInput').value = String(+remix.tempo.b2s(remix.playbackStart).toFixed(3)); });
$('musicAuto').addEventListener('click', () => {
  if (!musicBuf) { toast('先に音楽を選んでください', 2500, 'info'); return; }
  $('musicStartInput').value = String(+(remix.tempo.b2s(0) - detectOnset(musicBuf) - (musicBuf.rhreLeadIn || 0)).toFixed(3));
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
  const ok = await loadMusicBytes(new Uint8Array(await f.arrayBuffer()), f.name, { manualStart: guide.on });
  if (ok) { const p = parseSongName(f.name); askTempo({ bpm: p.bpm }); }
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

// 再生中は画面が消えないようにする（Screen Wake Lock。iPhone は iOS 16.4 以降の Safari、ホーム画面のアプリは iOS 18.4 以降）。
// 一時停止・停止・最後まで行ったら放す。アプリが裏に回ると端末が自動で放すので、戻ってきて再生中ならまた頼む
let playWake = null, playWakeAsking = false;
async function keepScreenOn() {
  if (playWake || playWakeAsking || !navigator.wakeLock || document.hidden) return;
  playWakeAsking = true;
  try {
    const w = await navigator.wakeLock.request('screen');
    w.addEventListener('release', () => { if (playWake === w) playWake = null; });
    if (mode === 'playing') playWake = w; else w.release().catch(() => {});
  } catch (_) { /* できない端末・ブラウザでは何もしない */ }
  playWakeAsking = false;
}
function letScreenSleep() {
  const w = playWake;
  playWake = null;
  w?.release().catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (!document.hidden && mode === 'playing') keepScreenOn(); });

function startPlayback(fromSec) {
  previewer.stop();
  player.metronome = metronome;
  player.onEnd = () => {
    mode = 'stopped';
    letScreenSleep();
    view.playhead = null;
    view.dirty = true;
    engine.stopKeepAlive();
    updateButtons();
    updateCtxbar();
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  };
  player.start(remix, musicBuf, fromSec);
  mode = 'playing';
  keepScreenOn();
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
  if (playMode && (fresh || rewound)) { resetJudge(); judge?.skipBefore(from - 0.05); }
  rewound = false;
}

// 0拍目に戻る：再生中ならそこから続けて再生。止まっているときは 0拍目で一時停止にして、次の ▶ はそこから
function rewind() {
  if (!remix || loading) return;
  const from = remix.tempo.b2s(0);
  view.momentum = null;
  view.lastUser = 0;
  view.scrollBeat = -(view.W * 0.3) / view.ppb;
  view.dirty = true;
  $('subtitle').hidden = true;
  showStageImage($('stageImg'), null);
  if (mode === 'playing') {
    startPlayback(from);
    if (playMode) { resetJudge(); judge?.skipBefore(from - 0.05); }
    return;
  }
  previewer.stop();
  pausedSec = from;
  mode = 'paused';
  rewound = true;
  view.playhead = 0;
  updateTimebox(from, 0);
  updateButtons();
  updateCtxbar();
}

function pause() {
  if (mode !== 'playing') return;
  player.pause();
  pausedSec = player.pausedAt;
  mode = 'paused';
  letScreenSleep();
  engine.stopKeepAlive();
  updateButtons();
  updateCtxbar();
}

function stopPlayback() {
  rewound = false;
  player.stop();
  previewer.stop();
  engine.stopKeepAlive();
  if (mode !== 'stopped' && remix) {
    // 停止したら時間の表示は再生開始位置に戻すが、画面のスクロールはそのまま
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  }
  mode = 'stopped';
  letScreenSleep();
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
    if (playMode && judge) judge.update(paTime(false), paTime(true));
  } else if (remix && mode === 'paused') {
    view.playhead = remix.tempo.s2b(pausedSec);
  }
  if (playMode && judge) syncHolding();
  view.stepMomentum(now);
  if (guide.on) positionCoachRing();
  if (view.dirty && !videoJob) {
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
    case 'video': openVideoExport(); break;
    case 'music': openSongPicker(); break;
    case 'tapTempo': openTapTempo('menu'); break;
    case 'guide': startGuide(); break;
    case 'musicStart': openMusicStart(); break;
    case 'musicRemove':
      if (!musicFile) { toast('音楽は選ばれていません', 2000, 'info'); break; }
      confirmBox('音楽を外す', `「${musicFile.filename}」を外しますか？`, '外す', () => {
        musicFile = null; musicBuf = null; remix.musicPresent = false; view.dirty = true; saveMusicToStore(); scheduleAutosave();
      });
      break;
    case 'help': openHelp(); break;
    case 'news': openNews(newsSince); break;
    case 'tracks': openTracks(); break;
    case 'flipTracks':
      // v1.9.7 までの RHRE Web はトラックを上から数えていたので、そのころ作ったリミックスは上下が逆に見える。ワンタップで直せるように
      confirmBox(t('トラックの上下を反転'), t('すべてのブロックの段を、上下ひっくり返しますか？ RHRE Web v1.9.7 までに作ったリミックスは、上下が逆に見えます（RHRE fresh と向きをそろえたため）。元に戻すボタンで戻せます。'), t('反転する'), () => {
        if (edit(() => { for (const e of remix.entities) e.track = remix.trackCount - e.track - e.height; })) {
          toast(t('トラックの上下を反転しました'), 2500, 'info');
        }
      });
      break;
    case 'present': startPresentation(); break;
    case 'playmode': setPlayMode(!playMode); break;
    case 'tour': startTour(); break;
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
  if (!f) return;
  let ab;
  try {
    ab = await f.arrayBuffer();
  } catch (err) {
    console.error(err);
    showErrorBox(t('開けませんでした'), t('ファイルを読み取れませんでした。iCloud などにあって端末にまだダウンロードされていないか、読み取りが許可されていない可能性があります。ファイル App で一度開いてから、もう一度選んでください。'), err);
    return;
  }
  openBuffer(ab, f.name);
});
$('playBtn').addEventListener('click', play);
$('pauseBtn').addEventListener('click', pause);
$('stopBtn').addEventListener('click', stopPlayback);
// メトロノームの音（RHRE fresh と同じく、データベースの countInEn/cowbell）を読み込んでおく
async function loadMetronomeSound() {
  if (!remix) return;
  try {
    const id = 'countInEn/cowbell';
    await remix.db.ensureAll([id]);
    const o = remix.db.get(id);
    if (!o) return;
    const url = remix.db.soundUrl(o);
    await engine.loadSounds([url], remix.db);
    player.metronomeUrl = url;
  } catch (_) { /* 読めなければ、代わりの音で鳴らす */ }
}
$('metroBtn').addEventListener('click', () => {
  metronome = !metronome;
  player.metronome = metronome;
  view.metronome = metronome; // Play-Yan も（RHRE fresh と同じく、メトロノームを入れているときだけ）
  view.dirty = true;
  if (metronome) loadMetronomeSound();
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
const inStandalone = root.classList.contains('in-twa') || window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || navigator.standalone === true;
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
  setTimeout(maybeStartTour, 300);
  try {
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    const p = req ? req.call(root, { navigationUI: 'hide' }) : null;
    if (!req) gateFsFailed = true;
    if (p && p.catch) p.catch(() => { gateFsFailed = true; });
    if (p && p.then) p.then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
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
// サービスワーカー：使ったものを端末に保存して、ネットがなくても使えるようにする（Android ではインストールにも要る）。
// 手元で試すとき（http://localhost）は、URL に ?sw を付けたときだけ
if ('serviceWorker' in navigator && (location.protocol === 'https:' || /[?&]sw\b/.test(location.search))) {
  navigator.serviceWorker.register('sw.js').then((reg) => reg.update?.()).catch(() => {});
}
// 端末の空きが少なくなっても、保存した効果音などを消さないでほしいとブラウザに頼む（アプリとして使っているときだけ）
if (inStandalone) { try { navigator.storage?.persist?.().catch(() => {}); } catch (_) { /* 未対応 */ } }

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
  // 説明は画面の言語に合わせる（翻訳の仕組みでは訳さず、日本語と英語を別に書いてある）
  const en = settings.uiLang === 'en';
  $('helpJa').hidden = en;
  $('helpEn').hidden = !en;
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
  $('paTouchOffset').value = String(Number(settings.paTouchOffset) || 0);
  $('paTouchOffsetVal').textContent = `${Number(settings.paTouchOffset) || 0}ms`;
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
  $('exportMsg').textContent = `再生開始位置（${fmtTime(from)}）から最後まで、${fmtTime(mixEndSec(remix) - from)} を書き出しています…`;
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
    guideOnExport();
  } catch (e) {
    $('exportMsg').textContent = `書き出しに失敗しました: ${e.message}`;
  }
}
$('exportClose').addEventListener('click', () => { $('exportModal').hidden = true; });

// ---------------------------------------------------------------- 動画で書き出す
// 計算で作れる端末（WebCodecs の映像と音の部品がある）では 1 コマずつ計算で、ない端末では流しながら録画で
let videoJob = null; // 書き出し中 { ctrl }
let videoBlob = null, videoName = '', videoDiag = null;
const VIDEO_LEAD = 2; // 動画は 0 拍目から。最初に 2 秒、止まった画面のまま待ってから再生する
const videoMethod = () => (canRenderFast() ? 'fast' : canRecord() ? 'record' : null);
function openVideoExport() {
  if (!remix) return;
  if (mode === 'playing') pause();
  const m = videoMethod();
  $('videoModal').hidden = false;
  if (videoJob) return; // 書き出し中ならそのまま見せる
  $('videoOpts').hidden = false;
  $('videoSize').value = settings.videoSize === '1080' ? '1080' : '720';
  $('videoFps').value = String(Number(settings.videoFps) === 60 ? 60 : 30);
  $('videoPreview').replaceChildren();
  $('videoBar').style.width = '0%';
  $('videoBarWrap').hidden = false;
  $('videoInfo').textContent = '';
  $('videoSave').hidden = true;
  $('videoStop').hidden = true;
  $('videoStart').hidden = !m;
  const from = remix.tempo.b2s(0);
  $('videoMsg').textContent = t('0 拍目から最後までを、プレゼンテーションモードと同じ見た目の動画にします（最初に 2 秒待ってから再生。全部で {d}）。', { d: fmtTime(VIDEO_LEAD + Math.max(0, mixEndSec(remix) - from) + (remix.hasEndEntity ? 1 : 0)) });
  $('videoNote').textContent = m === 'fast'
    ? t('計算で 1 コマずつ作るので、たいてい再生するより速く終わります。書き出しのあいだは、アプリを開いたままにしてください。')
    : m === 'record'
      ? t('この端末では、実際に流しながら録画します（再生と同じ時間がかかり、音も鳴ります）。新しいブラウザ（iPhone は iOS 26 以上）なら、計算で速く作れます。録画のあいだは、アプリを開いたままにしてください。')
      : t('この端末のブラウザでは、動画を作れません。');
}

$('videoStart').addEventListener('click', async () => {
  if (!remix || videoJob) return;
  const m = videoMethod();
  if (!m) return;
  if (m === 'record') engine.unlock(); // 録画は音を実際に流すので、タップの中で音を有効にする（await より前）
  if (mode !== 'stopped') stopPlayback();
  settings.videoSize = $('videoSize').value;
  settings.videoFps = Number($('videoFps').value);
  saveSettings();
  const ctrl = new AbortController();
  videoJob = { ctrl };
  $('videoOpts').hidden = true;
  $('videoStart').hidden = true;
  $('videoSave').hidden = true;
  $('videoStop').hidden = false;
  $('videoBarWrap').hidden = false;
  $('videoBar').style.width = '1%';
  $('videoMsg').textContent = t('効果音を読み込んでいます…');
  let wake = null;
  try { wake = await navigator.wakeLock?.request('screen'); } catch (_) { /* 画面を点けたままにできない端末 */ }
  // 録画は、アプリが裏に回ると絵が止まってしまうので、やめる
  const onHide = () => { if (document.hidden && m === 'record') ctrl.abort(); };
  document.addEventListener('visibilitychange', onHide);
  const started = performance.now();
  try {
    await engine.loadSounds([...remix.allSoundCues().keys()], remix.db);
    $('videoMsg').textContent = t('音を作っています…');
    const deps = {
      EditorView, FONT,
      renderMix: (fromSec, sr, o) => renderMix(engine, remix, musicBuf, fromSec, sr, o),
      mixEndSec,
      textureImage: (e) => textureImages.get(e.extra?.texHash) || null,
      audioContext: () => engine.context,
      loadIcon,
      version: VERSION,
      // 左上に出すゲームの名前（言語違いはまとめた名前）と、出さないゲーム（特殊・カウントなど）か
      gameInfo: (gid) => {
        const g = gamesIndex.find((x) => x.id === gid);
        return g ? { name: g.group || g.name, noDisplay: !!g.noDisplay } : null;
      },
    };
    const opts = { fromSec: remix.tempo.b2s(0), lead: VIDEO_LEAD, size: settings.videoSize, fps: settings.videoFps, host: $('videoPreview') };
    const onProgress = (f, phase) => {
      const p = Math.floor(f * 100);
      $('videoBar').style.width = `${Math.max(1, p)}%`;
      if (phase === 'audio') $('videoMsg').textContent = t('音を固めています…');
      else if (phase === 'video') $('videoMsg').textContent = t('映像を作っています… {p}%', { p });
      else if (phase === 'record') $('videoMsg').textContent = t('録画しています… {p}%', { p });
    };
    const res = m === 'fast'
      ? await renderVideoFast(deps, view, opts, onProgress, ctrl.signal)
      : await recordVideoRealtime(deps, view, opts, onProgress, ctrl.signal);
    videoBlob = res.blob;
    videoDiag = res.diag || null;
    // 何で作ったかを小さく出す（音が入らないなどのときに、教えてもらう手がかり）
    const d = videoDiag || {};
    $('videoInfo').textContent = d.method === 'fast'
      ? `${t('計算で作成')}・${d.video}・${d.audio} ${d.sampleRate}Hz（${d.audioAdded || 0}/${d.audioChunks || 0}）`
      : `${t('録画で作成')}・${d.mime || ''}`;
    videoName = `${fileName.replace(/\.[^.]+$/, '')}.${res.ext}`;
    $('videoBar').style.width = '100%';
    $('videoMsg').textContent = t('書き出しました（{mb} MB、{s} 秒かかりました）。「動画を保存」で保存できます。', {
      mb: (videoBlob.size / 1048576).toFixed(1), s: ((performance.now() - started) / 1000).toFixed(1),
    });
    // 終わったら、バーの代わりに保存ボタンを出す
    $('videoBarWrap').hidden = true;
    $('videoSave').hidden = false;
  } catch (e) {
    if (e?.name === 'AbortError') {
      $('videoMsg').textContent = document.hidden && m === 'record' ? t('アプリが裏に回ったので、録画をやめました。') : t('書き出しをやめました。');
    } else {
      console.error(e);
      $('videoMsg').textContent = `${t('動画を作れませんでした')}: ${t(e?.message || String(e))}`;
    }
    $('videoOpts').hidden = false;
    $('videoStart').hidden = false;
    $('videoBar').style.width = '0%';
  } finally {
    document.removeEventListener('visibilitychange', onHide);
    try { await wake?.release(); } catch (_) { /* 済み */ }
    videoJob = null;
    $('videoStop').hidden = true;
    view.dirty = true;
  }
});
$('videoStop').addEventListener('click', () => videoJob?.ctrl.abort());
$('videoClose').addEventListener('click', () => {
  videoJob?.ctrl.abort();
  $('videoModal').hidden = true;
  $('videoPreview').replaceChildren();
});
// iPhone は共有の画面から（「ビデオを保存」で写真に入れられる）、ほかはダウンロード
$('videoSave').addEventListener('click', () => {
  if (!videoBlob) return;
  const name = videoName;
  if (isTouch && !isAndroid) {
    try {
      const file = new File([videoBlob], name, { type: videoBlob.type || 'video/mp4' });
      if (navigator.canShare?.({ files: [file] })) {
        navigator.share({ files: [file] }) // 文字（title）は渡さない。渡すと iPhone の「ファイルに保存」で .txt も保存される
          .then(() => toast(`${t('保存しました')}：${name}`, 2500, 'info'))
          .catch((err) => { if (err?.name !== 'AbortError') console.error(err); });
        return;
      }
    } catch (e) { console.error(e); /* 共有できなければダウンロードで */ }
  }
  const url = URL.createObjectURL(videoBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  toast(`${t('保存しました')}：${name}`, 2500, 'info');
});
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

// 保存ボタン → 名前を決める画面 → 「保存」で保存（押した瞬間に保存するので iPhone の共有シートも出せる）
function openSave() {
  if (!remix || loading) return;
  const inp = $('saveNameInput');
  inp.value = normalizeRemixName(fileName).replace(/\.rhref$/i, '');
  $('saveNameModal').hidden = false;
  inp.focus();
  try { inp.select(); } catch (_) { /* 選べない環境 */ }
}
function commitSave() {
  // ファイル名に使えない文字は _ に。空なら remix
  const base = $('saveNameInput').value.trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120).trim() || 'remix';
  const next = normalizeRemixName(`${base.replace(/\.rhref$/i, '')}.rhref`);
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
  // プレゼンテーションはプレイモードと別（ブロックを薄くしない・押す合図の丸を出さない）
  if (playMode) setPlayMode(false);
  presenting = true;
  document.documentElement.classList.add('presenting');
  // 勝手に再生しない。再生位置を 0 拍目に戻して、0 拍目が見える所まで戻すだけ
  if (mode !== 'stopped') stopPlayback();
  view.h.onSetPlaybackStart(0);
  view.momentum = null;
  view.scrollBeat = -(view.W * 0.1) / view.ppb;
  view.dirty = true;
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
$('presentCtl').addEventListener('click', (e) => {
  const c = e.target.closest('[data-c]')?.dataset.c;
  if (c === 'play') play();
  else if (c === 'pause') pause();
  else if (c === 'rewind') rewind();
  else if (c === 'stop') stopPlayback();
});

// ---------------------------------------------------------------- プレイモード（RHRE fresh の Playalong）
// 上の Ⓐ ボタンで切り替え。下のゲーム一覧の代わりにスコアとズレのバーを出し、▶ で再生してボタンのキューに合わせて押す

// 聞こえている音の時刻（スピーカーやイヤホンの遅れと、設定の「タイミング調整」を引く）
// 判定に使う時刻。タッチとボタンで別々にタイミングを調整できる（RHRE fresh のマウスとキーボードと同じ）
function paTime(touch = false) {
  const ctx = engine.ctx;
  const offset = Number(touch ? settings.paTouchOffset : settings.paOffset) || 0;
  const lat = (ctx?.outputLatency || 0) + (ctx?.baseLatency || 0) + offset / 1000;
  return player.time - lat * (player.speed || 1);
}

function setPlayMode(on) {
  playMode = on;
  root.classList.toggle('playmode', on);
  // メニューの項目の文字を、今の状態に合わせる
  $('menuPlayMode').textContent = on ? t('プレイモードをやめる') : t('プレイモード');
  view.playMode = on;
  if (on) {
    loadPerfectSound(); // 失敗の音は先に読み込んでおく
    if (armed) setArmed(null);
    pasteArmed = false;
    multiSelect = false;
    view.armed = null;
    view.selection.clear();
    view.stickBottom = true;
    updateCtxbar();
    resetJudge();
    if (!isTouch && !settings.paKeysSeen) openKeyGuide();
    setStatus(t('プレイモード：▶ で再生して、キューに合わせて押してください'));
  } else {
    setNightMode(false);
    judge = null;
    for (const e of remix?.entities || []) { e.judge = null; e.paHold = false; }
    $('psMarks').textContent = '';
    setStatus(summaryText());
  }
  updateButtons();
  view.dirty = true;
}
$('psClose').addEventListener('click', () => setPlayMode(false));

function resetJudge() {
  $('psMarks').textContent = '';
  perfectReset();
  for (const e of remix?.entities || []) { e.judge = null; e.paHold = false; }
  if (!remix) { judge = null; layoutPlayStage(false); updatePlayStage(); return; }
  judge = new PlayalongJudge(remix, player.speed || Number(settings.speed) || 1);
  judge.onJudge = (a, timing, isEnd, off, forced) => {
    a.ent.judge = a.ent.judge === 'MISS' ? 'MISS' : timing;
    // パーフェクトチャレンジ：1 回でもミスしたら失敗（RHRE fresh の onPerfectFail / onPerfectHit）
    if (perfect.soFar) {
      if (timing === 'MISS') { perfect.soFar = false; onPerfectFail(); } else onPerfectHit();
    }
    // 押したときだけ、ズレのバーに印をつける（左が早い、右が遅い）
    if (!forced) addTimingMark(off / (judge.speed || 1), timing);
    updatePlayStage();
    view.dirty = true;
  };
  // 要るボタンだけ出す
  const keys = judge.neededKeys();
  const dpad = ['UP', 'DOWN', 'LEFT', 'RIGHT'].some((k) => keys.has(k));
  $('psDpad').classList.toggle('off', !dpad);
  $('psAB').querySelector('.akey').classList.toggle('off', !keys.has('A'));
  $('psAB').querySelector('.bkey').classList.toggle('off', !keys.has('B'));
  // タッチの操作があれば、タッチの枠を出す
  layoutPlayStage(judge.needsTouch, dpad, keys.has('A') || keys.has('B'));
  renderKeyGuide(keys);
  updatePlayStage();
}
// キーボードの操作の案内（パソコンだけ）。RHRE fresh と同じ配置：A＝J、B＝K、十字＝WASD か矢印、タッチ＝マウス
const KEY_GUIDE = [
  { need: (k) => k.has('A'), btn: '<span class="kb a">A</span>', name: 'A ボタン', keys: [['J']] },
  { need: (k) => k.has('B'), btn: '<span class="kb b">B</span>', name: 'B ボタン', keys: [['K']] },
  { need: (k) => ['UP', 'DOWN', 'LEFT', 'RIGHT'].some((x) => k.has(x)), btn: '<span class="kb d">+</span>', name: '十字ボタン', keys: [['W', 'A', 'S', 'D'], ['↑', '←', '↓', '→']] },
  { need: (k) => ['TOUCH', 'QTAP', 'FLICK', 'SLIDE'].some((x) => k.has(x)), btn: '<span class="kb t"></span>', name: 'タッチ・はじく', mouse: true },
];
const kc = (k) => `<span class="kc">${esc(k)}</span>`;
function renderKeyGuide(keys) {
  const any = KEY_GUIDE.some((g) => g.need(keys));
  const rows = KEY_GUIDE.filter((g) => !any || g.need(keys));
  // 下の段の短い案内
  $('psKeys').innerHTML = rows.map((g) => `<span class="pk">${g.btn}${g.mouse ? esc(t('マウス')) : g.keys[0].map(kc).join('')}</span>`).join('');
  // 大きな案内
  $('keysRows').innerHTML = rows.map((g) => `${g.btn}<div><div class="name">${esc(t(g.name))}</div><div class="keys">${g.mouse
    ? esc(t('マウス（緑の枠の中でクリック・ドラッグ）'))
    : g.keys.map((set) => set.map(kc).join('')).join(`<span class="or">${esc(t('または'))}</span>`)}</div></div>`).join('');
  $('keysNote').hidden = !rows.some((g) => g.name === 'A ボタン');
}
function openKeyGuide() { $('keysModal').hidden = false; }
$('psKeys').addEventListener('click', openKeyGuide);
$('keysOk').addEventListener('click', () => {
  $('keysModal').hidden = true;
  if (!settings.paKeysSeen) { settings.paKeysSeen = true; saveSettings(); }
});

// 長押しの最中のキュー（トラックの丸を青くする）。止めたら消す
function syncHolding() {
  for (const a of judge.actions) {
    const h = mode === 'playing' && judge.inProgress.has(a);
    if (!!a.ent.paHold !== h) { a.ent.paHold = h; view.dirty = true; }
  }
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

// ボタンを押したときの小さな振動（Android だけ）。
// iPhone の Safari には振動の仕組みがなく、代わりの方法も指を離したときにしか振動しないので、iPhone では振動させない
// 押したときの振動（Android など。短すぎると感じにくいので 20ms）。
// iPhone は Safari に振動の機能がなく、隠したスイッチを押すやり方も実機で振動しなかった（v1.3.2・v1.9.10）ので、何もしない
function haptic() {
  try { navigator.vibrate?.(20); } catch (_) { /* 振動できない端末 */ }
}

// 画面のボタン（A・B・十字）
for (const b of document.querySelectorAll('#playStage .pkey')) {
  const key = b.dataset.key;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど */ }
    b.classList.add('down-now');
    haptic();
    paPress(key);
  });
  const up = () => { if (!b.classList.contains('down-now')) return; b.classList.remove('down-now'); paRelease(key); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}
// iPhone で長押ししたときに出る拡大鏡（文字の選択）を止める。上のタブ（やめる・左右）は普通に押せるように除く
$('playStage').addEventListener('touchstart', (e) => { if (!e.target.closest('#psTabs')) e.preventDefault(); }, { passive: false });
document.addEventListener('selectstart', (e) => { if (playMode && !e.target.closest?.('input, textarea')) e.preventDefault(); });

// ---------------------------------------------------------------- タッチの枠（RHRE fresh の FlickingStage の移植）
// DS のタッチ操作をそのまま再現する。長さの単位は RHRE fresh の画面（横 1280）で、この端末では 1 単位＝画面の幅÷1280 px。
//  ・触れる：タッチ（Tap・Tap and Hold・Long Tap）の押し始め
//  ・はじく：離した瞬間の速さ（1 フレームの動き×25）が秒速 700 単位を超えたら Flick（＝1 フレームで 28 単位。向きは問わない）
//  ・離す：Tap and Hold などの離す判定。0.1 秒以内に、はじかずに離したときだけ Quick Tap も
//  ・スライド：触れたまま 1 フレームで 65 単位より速く動いたら Slide（ゆっくりになると、また出せる）
//  ・見た目：触れた所に目の付いた黒い丸。離すと、その向きへ飛びながら 0.125 秒で小さくなって消える
const touchBox = (() => {
  const box = $('psTouch');
  const cv = box.querySelector('canvas');
  const g = cv.getContext('2d');
  const tex = new Image();
  tex.src = 'assets/playalong/tappoint.png';
  const FRAME = 1000 / 60;
  const MAX_LIFE = 0.125;
  const points = [];
  let cur = null, raf = 0, last = 0, W = 0, H = 0, dpr = 1;
  const unit = () => window.innerWidth / 1280;
  const clampTo = (v, max) => Math.max(0, Math.min(max, v));
  const judgeTouch = (kind, keys) => { if (playMode && judge && mode === 'playing') judge[kind](keys, paTime(true)); };

  function resize() {
    const r = box.getBoundingClientRect();
    dpr = Math.min(3, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    draw();
  }
  try { new ResizeObserver(resize).observe(box); } catch (_) { window.addEventListener('resize', resize); }

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!points.length) return;
    const u = unit();
    const ms = performance.now();
    // RHRE fresh（Toolboks）の getBaseCosineWave(0.1)：0.1 秒で 1 周する 0〜1 の波
    const wave = (Math.cos(((ms % 100) / 100) * Math.PI * 2) + 1) / 2;
    const ready = tex.complete && tex.naturalWidth > 0;
    for (const p of points) {
      const rs = Math.max(0, p.life / MAX_LIFE);
      // 本体：128 単位の黒い丸（不透明度 0.6）
      const main = 128 * u * rs;
      g.globalAlpha = 0.6;
      g.fillStyle = '#000';
      g.beginPath(); g.arc(p.x, p.y, main / 2, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      if (!ready) continue;
      // 目：16 単位。丸のてっぺんの 4 単位上に、左右 12 単位ずつ離して
      const eye = 16 * u;
      for (const sign of [-1, 1]) {
        g.drawImage(tex, 144, 0, 16, 16, p.x + sign * 12 * u - eye / 2, p.y - main / 2 - 4 * u - eye, eye, eye);
      }
      // 中の白い丸：30 単位。0.8〜1 倍で細かくふるえる（不透明度 0.8）
      const inner = 30 * u * rs * (0.8 + 0.2 * wave);
      g.globalAlpha = 0.8;
      g.drawImage(tex, 144, 32, 30, 30, p.x - inner / 2, p.y - inner / 2, inner, inner);
      // 顔：30 単位（小さくなり始めると一緒に縮む）
      const face = 30 * u * Math.min(1, rs / 0.85);
      g.globalAlpha = 1;
      g.drawImage(tex, 176, 32, 30, 30, p.x - face / 2, p.y - face / 2, face, face);
    }
    g.globalAlpha = 1;
  }

  function frame(now) {
    const dt = last ? Math.min(100, now - last) : FRAME;
    last = now;
    if (cur) {
      // 指について行く（枠の外には出ない）。1 フレームの動きが 65 単位を超えたらスライド
      const nx = clampTo(cur.rawX, W), ny = clampTo(cur.rawY, H);
      const per = Math.hypot(nx - cur.x, ny - cur.y) * (FRAME / Math.max(1, dt)) / unit();
      cur.x = nx; cur.y = ny;
      if (per > 65) {
        if (!cur.slid) { cur.slid = true; judgeTouch('press', ['SLIDE']); }
      } else cur.slid = false;
    }
    for (let i = points.length - 1; i >= 0; i--) {
      const p = points[i];
      if (p.held) continue;
      p.x += (p.vx * dt) / 1000;
      p.y += (p.vy * dt) / 1000;
      p.life -= dt / 1000;
      if (p.life <= 0) points.splice(i, 1);
    }
    draw();
    if (cur || points.length) raf = requestAnimationFrame(frame);
    else { raf = 0; last = 0; }
  }
  const kick = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };

  box.addEventListener('pointerdown', (e) => {
    // RHRE fresh と同じく、1 本の指（マウスは左ボタン）だけ
    if (cur || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    try { box.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど */ }
    const r = box.getBoundingClientRect();
    const now = performance.now();
    const x = clampTo(e.clientX - r.left, r.width), y = clampTo(e.clientY - r.top, r.height);
    cur = {
      id: e.pointerId, x, y, rawX: x, rawY: y, vx: 0, vy: 0, life: MAX_LIFE, held: true, slid: false,
      down: now, left: r.left, top: r.top, trail: [{ x: e.clientX, y: e.clientY, t: now }],
    };
    points.push(cur);
    haptic();
    judgeTouch('press', ['TOUCH', 'QTAP']);
    kick();
  });
  box.addEventListener('pointermove', (e) => {
    if (!cur || e.pointerId !== cur.id) return;
    const now = performance.now();
    cur.rawX = e.clientX - cur.left;
    cur.rawY = e.clientY - cur.top;
    cur.trail.push({ x: e.clientX, y: e.clientY, t: now });
    while (cur.trail.length > 2 && now - cur.trail[1].t > 200) cur.trail.shift();
  });
  const end = (e) => {
    if (!cur || e.pointerId !== cur.id) return;
    const p = cur;
    cur = null;
    const now = performance.now();
    // RHRE fresh は「離した位置 − 1 フレーム前の位置」を 25 倍した速さで見る。スマホは離したときの位置が最後に動いた位置と同じなので、
    // 離す直前 2 フレーム分の動きから 1 フレーム分を求める（止めてから離したら 0）
    const win = 2 * FRAME;
    let p0 = p.trail[0];
    for (const s of p.trail) { if (s.t <= now - win) p0 = s; else break; }
    const span = p0.t <= now - win ? win : Math.max(FRAME, now - p0.t);
    const fx = ((e.clientX - p0.x) * FRAME) / span, fy = ((e.clientY - p0.y) * FRAME) / span;
    const flick = e.type === 'pointerup' && Math.hypot(fx * 25, fy * 25) / unit() > 700;
    p.held = false;
    p.vx = fx * 25;
    p.vy = fy * 25;
    if (flick) judgeTouch('press', ['FLICK']);
    const short = !flick && now - p.down <= 100;
    judgeTouch('release', short ? ['TOUCH', 'QTAP'] : ['TOUCH']);
    kick();
  };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  return { resize };
})();

// 下の段の並び：タッチの操作があるときは、タッチの枠を左か右の端に（要らないボタンは出さない）
let lastPlayLayout = [false, true, true];
function layoutPlayStage(touch, showDpad = true, showAB = true) {
  lastPlayLayout = [touch, showDpad, showAB];
  const ps = $('playStage');
  const side = settings.paBoxSide === 'left' ? 'left' : 'right';
  ps.classList.toggle('touch', touch);
  ps.classList.toggle('side-left', touch && side === 'left');
  ps.classList.toggle('side-right', touch && side !== 'left');
  const parts = { dpad: $('psDpad'), center: ps.querySelector('.ps-center'), ab: $('psAB'), box: $('psTouch') };
  const clear = (el) => { el.style.gridArea = ''; el.style.display = ''; el.style.justifySelf = ''; el.style.alignSelf = ''; el.style.zIndex = ''; el.style.position = ''; el.style.transform = ''; };
  for (const el of Object.values(parts)) clear(el);
  if (!touch) {
    ps.style.gridTemplateColumns = '';
    ps.style.gridTemplateAreas = '';
    ps.style.gridTemplateRows = '';
    return;
  }
  // 枠が右なら A・B、左なら十字を、枠の真上に置く（上のトラックにはみ出す）
  const inset = side === 'left' ? 'env(safe-area-inset-left, 0px)' : 'env(safe-area-inset-right, 0px)';
  const boxCol = `calc(35vw - max(10px, ${inset}))`;
  const cols = [], areas = [];
  const add = (a, c) => { areas.push(a); cols.push(c); };
  if (side === 'left') add('box', boxCol);
  if (showDpad && side !== 'left') add('dpad', 'auto');
  add('center', 'minmax(0, 1fr)');
  if (showAB && side === 'left') add('ab', 'auto');
  if (side !== 'left') add('box', boxCol);
  ps.style.gridTemplateColumns = cols.join(' ');
  ps.style.gridTemplateAreas = `"${areas.join(' ')}"`;
  ps.style.gridTemplateRows = 'minmax(0, 1fr)';
  for (const [k, el] of Object.entries(parts)) el.style.gridArea = k;
  const over = side === 'left' ? parts.dpad : parts.ab;
  over.style.gridArea = 'box';
  over.style.justifySelf = side === 'left' ? 'start' : 'end';
  over.style.alignSelf = 'start';
  over.style.position = 'relative';
  over.style.zIndex = '6';
  over.style.transform = 'translateY(calc(-100% - 14px))';
  parts.dpad.style.display = showDpad ? '' : 'none';
  parts.ab.style.display = showAB ? '' : 'none';
  $('psSide').textContent = t(side === 'left' ? 'タッチの枠を右へ' : 'タッチの枠を左へ');
  requestAnimationFrame(() => touchBox.resize());
}
// パーフェクトチャレンジ（RHRE fresh の Perfect Challenge の移植）
//  ・下の段のタブで入／切（はじめは切）。入れると P のマークと「めざせ パーフェクト!」が出る（再生中は 1.35 秒ごとに 35% の間だけ消える点滅）
//  ・ミスせずに判定されるたびに、白い P が重なって 0.125 秒で消える
//  ・1 回でもミスしたら × に変わり、0.5 秒間ガタガタ揺れる。最初の入力より前から再生していたときだけ、失敗の音を鳴らす
const perfect = { on: false, soFar: true, shakeRaf: 0, buf: null, loading: null };
const PF_IMG = { ok: 'assets/playalong/perfect.png', fail: 'assets/playalong/perfect_failed.png' };
function loadPerfectSound() {
  if (perfect.buf || perfect.loading) return perfect.loading;
  perfect.loading = fetch('assets/playalong/perfect_fail.ogg')
    .then((r) => r.arrayBuffer())
    .then((ab) => engine.decode(ab))
    .then((b) => { perfect.buf = b; })
    .catch(() => { perfect.loading = null; });
  return perfect.loading;
}
function setPerfectChallenge(on) {
  perfect.on = on;
  $('psPerfect').hidden = !on;
  $('psPerfectBtn').classList.toggle('on', on);
  $('psPerfectBtn').setAttribute('aria-pressed', String(on));
  if (on) loadPerfectSound();
}
$('psPerfectBtn').addEventListener('click', () => setPerfectChallenge(!perfect.on));
function stopPerfectShake() {
  cancelAnimationFrame(perfect.shakeRaf);
  perfect.shakeRaf = 0;
  $('pfBase').parentElement.style.transform = '';
}
function perfectReset() {
  perfect.soFar = true;
  stopPerfectShake();
  $('pfBase').src = PF_IMG.ok;
  $('pfHit').getAnimations?.().forEach((a) => a.cancel());
  $('pfHit').style.opacity = '0';
}
function onPerfectHit() {
  $('pfBase').src = PF_IMG.ok;
  $('pfHit').getAnimations?.().forEach((a) => a.cancel());
  $('pfHit').animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 125, easing: 'linear' });
}
function onPerfectFail() {
  $('pfHit').getAnimations?.().forEach((a) => a.cancel());
  $('pfHit').style.opacity = '0';
  $('pfBase').src = PF_IMG.fail;
  // 0.5 秒間、毎フレーム 0〜3px ずつ上下左右にずらす
  stopPerfectShake();
  const icon = $('pfBase').parentElement;
  const end = performance.now() + 500;
  const r = () => (Math.random() < 0.5 ? -1 : 1) * Math.floor(Math.random() * 4);
  const step = (now) => {
    if (now >= end) { icon.style.transform = ''; perfect.shakeRaf = 0; return; }
    icon.style.transform = `translate(${r()}px, ${r()}px)`;
    perfect.shakeRaf = requestAnimationFrame(step);
  };
  perfect.shakeRaf = requestAnimationFrame(step);
  // 失敗の音：パーフェクトチャレンジを入れていれば、どこから再生していても鳴らす（本人の希望。RHRE fresh は最初の入力より前から再生したときだけ）
  if (perfect.on) {
    const playIt = () => {
      if (!perfect.buf) return;
      try {
        const ctx = engine.context;
        const src = ctx.createBufferSource();
        src.buffer = perfect.buf;
        src.connect(engine.master);
        src.start();
      } catch (_) { /* 鳴らせない */ }
    };
    if (perfect.buf) playIt(); else loadPerfectSound()?.then(playIt);
  }
}

// トラックの左右の端の 0拍目に戻る・高速移動のボタン。
// 高速移動：タップで 1 画面分（の 8 割）動く。押し続けると、だんだん速く流れ続ける
$('navZero').addEventListener('click', () => {
  if (!remix) return;
  // 再生位置（緑の旗）も 0 拍目に（目盛りをタップしたときと同じ。再生中ならそこから再生し直す）
  view.h.onSetPlaybackStart(0);
  view.momentum = null;
  view.lastUser = performance.now();
  view.scrollBeat = -(view.W * 0.1) / view.ppb;
  view.dirty = true;
});
for (const [id, dir] of [['navLeft', -1], ['navRight', 1]]) {
  const b = $(id);
  let hold = null;
  const stop = () => {
    if (!hold) return;
    cancelAnimationFrame(hold.raf);
    // すぐ離したら（タップ）1 画面分
    if (performance.now() - hold.t0 < 220) {
      view.scrollBeat += dir * (view.W * 0.8) / view.ppb;
      view.dirty = true;
    }
    hold = null;
  };
  b.addEventListener('pointerdown', (e) => {
    if (!remix) return;
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch (_) { /* 合成イベントなど */ }
    view.momentum = null;
    hold = { t0: performance.now(), last: performance.now(), raf: 0 };
    const step = (now) => {
      if (!hold) return;
      const held = now - hold.t0;
      const dt = Math.min(50, now - hold.last);
      hold.last = now;
      if (held >= 220) {
        // 1 秒あたり画面 1.5 枚分から、押しているほど速く（最大 6 枚分）
        const screens = Math.min(6, 1.5 + (held - 220) / 400);
        view.scrollBeat += dir * (screens * view.W / view.ppb) * (dt / 1000);
        view.lastUser = now;
        view.dirty = true;
      }
      hold.raf = requestAnimationFrame(step);
    };
    hold.raf = requestAnimationFrame(step);
  });
  b.addEventListener('pointerup', stop);
  b.addEventListener('pointercancel', () => { if (hold) { cancelAnimationFrame(hold.raf); hold = null; } });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
}

// ---------------------------------------------------------------- オンライン人数
// Cloudflare のサーバー（server/online）に WebSocket でつないで、今 RHRE Web を開いている端末の数を右下に出す。
// 送るのは端末ごとのランダムな番号だけ。30 秒ごとに ping、60 秒ごとに人数を聞き直す。
// 裏に回って 30 秒たったら切り、戻ってきたらつなぎ直す。つながらないときは出さない
const ONLINE_URL = (location.hostname === 'localhost' && new URLSearchParams(location.search).get('online')) // 手元で試すとき
  || 'wss://rhre-web-online.pika1013.workers.dev/ws';
const online = { ws: null, retry: 0, ping: 0, poll: 0, again: 0, hideTimer: 0 };
function onlineDeviceId() {
  try {
    let d = localStorage.getItem('rhre-device');
    if (!d) { d = (crypto.randomUUID?.() || String(Math.random()).slice(2)).replace(/-/g, ''); localStorage.setItem('rhre-device', d); }
    return d;
  } catch (_) { return ''; }
}
// 画面に出すのは、隠しコマンド（右下の版の表示を 2 秒長押し）で表示を入れた端末だけ。数えるのは今までどおり
let lastOnline = null;
function showOnline(n) {
  const el = $('onlineCount');
  lastOnline = typeof n === 'number' ? n : null;
  if (lastOnline == null || !settings.showOnline) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = t('{n} 人がオンライン', { n });
}
function connectOnline() {
  if (online.ws || document.hidden || !ONLINE_URL) return;
  clearTimeout(online.again);
  let ws;
  try { ws = new WebSocket(`${ONLINE_URL}?d=${encodeURIComponent(onlineDeviceId())}`); } catch (_) { return; }
  online.ws = ws;
  ws.onopen = () => {
    online.retry = 0;
    online.ping = setInterval(() => { try { ws.send('ping'); } catch (_) { /* 閉じかけ */ } }, 30000);
    online.poll = setInterval(() => { try { ws.send('count'); } catch (_) { /* 閉じかけ */ } }, 60000);
  };
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    try { const m = JSON.parse(e.data); if (typeof m.online === 'number') showOnline(m.online); } catch (_) { /* 知らない形 */ }
  };
  ws.onclose = () => {
    clearInterval(online.ping);
    clearInterval(online.poll);
    if (online.ws !== ws) return;
    online.ws = null;
    showOnline(null);
    // 自分で切ったのでなければ、少し待ってつなぎ直す（2 秒、4 秒…最大 60 秒）
    if (!document.hidden) {
      const wait = Math.min(60000, 2000 * 2 ** online.retry++);
      online.again = setTimeout(connectOnline, wait);
    }
  };
}
function disconnectOnline() {
  const ws = online.ws;
  online.ws = null;
  clearInterval(online.ping);
  clearInterval(online.poll);
  clearTimeout(online.again);
  try { ws?.close(1000, 'hidden'); } catch (_) { /* もう閉じている */ }
  showOnline(null);
}
document.addEventListener('visibilitychange', () => {
  clearTimeout(online.hideTimer);
  if (document.hidden) online.hideTimer = setTimeout(disconnectOnline, 30000);
  else { online.retry = 0; connectOnline(); }
});
window.addEventListener('online', () => { online.retry = 0; connectOnline(); });
setTimeout(connectOnline, 1200);
{
  let timer = 0;
  const cancel = () => clearTimeout(timer);
  $('version').addEventListener('pointerdown', () => {
    cancel();
    timer = setTimeout(() => {
      settings.showOnline = !settings.showOnline;
      saveSettings();
      showOnline(lastOnline);
      toast(settings.showOnline ? t('オンライン人数を表示します（この端末だけ）') : t('オンライン人数を隠しました'), 2500, 'info');
    }, 2000);
  });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) $('version').addEventListener(ev, cancel);
  $('version').addEventListener('contextmenu', (e) => e.preventDefault());
}

// ナイトモード（目押し対策）：トラックを真っ黒に隠して、上のメニューと下の操作だけにする
let nightMode = false;
function setNightMode(on) {
  nightMode = on && playMode;
  root.classList.toggle('night', nightMode);
  $('psNight').textContent = t(nightMode ? 'ナイトモードをやめる' : 'ナイトモード');
  $('psNight').classList.toggle('on', nightMode);
}
$('psNight').addEventListener('click', () => setNightMode(!nightMode));
$('psSide').addEventListener('click', () => {
  settings.paBoxSide = settings.paBoxSide === 'left' ? 'right' : 'left';
  saveSettings();
  layoutPlayStage(...lastPlayLayout);
});

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

// ---------------------------------------------------------------- チュートリアル（初回起動時。メニューからもう一度見られる）

const tour = { i: 0, on: false };
const visibleRect = (el) => {
  if (!el || el.hidden) return null;
  const r = el.getBoundingClientRect();
  return r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < window.innerHeight ? r : null;
};
// トラックの絵の中の一部（旗の欄・テンポの段）
const viewPart = (part) => {
  const cr = $('view').getBoundingClientRect();
  const L = view.layout();
  const top = part === 'flags' ? L.top : L.tracksBottom;
  const h = part === 'flags' ? L.infoH + L.rulerH : L.tempoH + 4;
  const y0 = Math.max(cr.top, cr.top + top), y1 = Math.min(cr.bottom, cr.top + top + h);
  return y1 - y0 > 8 ? { left: cr.left, top: y0, width: cr.width, height: y1 - y0 } : null;
};
const panelOpen = () => !$('panel').classList.contains('collapsed') && !playMode;
const TOUR_STEPS = [
  { title: 'RHRE Web へようこそ！', text: 'リズム天国のリミックスを、スマホやブラウザで作れるエディタです。基本の使い方を順番に紹介します。左上の ✕ でいつでもやめられます。' },
  { title: 'トラック', text: 'ここにブロック（キュー）を並べてリミックスを作ります。指で左右になぞるとスクロール、2 本指で広げたりつまんだりすると拡大・縮小です。', target: () => visibleRect($('view')) },
  { title: 'ゲームを選ぶ', text: '下のタブ（GBA・DS・Wii など）からミニゲームを選ぶと、右にパターンが並びます。お気に入り・最近使ったもの・検索もここです。',
    target: () => (panelOpen() ? visibleRect($('tabsRow').parentElement) : visibleRect($('panelToggle'))),
    alt: '一覧が閉じているときは、左下の「ゲームを選ぶ」を押すと開きます。' },
  { title: '置き方', text: 'パターンの名前を押して選んでから、トラックの空いている所をタップすると置けます。スピーカーのボタンを押すと音を確かめられます。',
    target: () => (panelOpen() ? visibleRect($('list').parentElement) : visibleRect($('view'))) },
  { title: '編集バー', text: '置いたブロックをタップすると、上に編集バーが出ます。ブロックはドラッグで移動、端をドラッグで長さを変更。削除・複製・音程・音量もここで変えられます。空いている所を長押しすると、範囲でまとめて選べます。', target: () => visibleRect($('topbar')) },
  { title: '再生', text: '▶ で再生、一時停止ボタン（縦 2 本線）で一時停止、■ で停止です。再生中は黄色い線が今の位置を示します。横の数字は時間と拍、虹色のつまみは再生速度です。', target: () => visibleRect($('transport')) || visibleRect($('topbar')) },
  { title: '音楽と再生の旗', text: '赤い旗は音楽が始まる位置、緑の旗は再生を始める位置です。どちらも横にドラッグして動かせます。上の目盛りをタップしても、再生を始める位置を変えられます。', target: () => viewPart('flags') },
  { title: 'テンポ・拍子・音量', text: 'トラックの下の段をタップすると、テンポ・拍子・音楽の音量を変えられます。印は長押ししてからドラッグで動かせます。大きな拍子の数字をタップすると、その場で書きかえられます。', target: () => viewPart('tempo') },
  { title: 'スナップ', text: 'ブロックを置く・動かすときの目盛りの細かさです。1 拍から 1/32 拍まで選べます。', target: () => visibleRect($('snapBtn')) },
  { title: 'メニュー', text: '保存・開く・音楽を選ぶ・音声のみ書き出す・動画で書き出す・トラックの数・プレゼンテーション・プレイモードなどはここです。このチュートリアルも、ここからもう一度見られます。', target: () => visibleRect($('menuBtn')) },
  { title: '設定', text: 'ミニゲームの声の言語、テーマの色、背景の画像、画面の言語などを変えられます。', target: () => visibleRect($('settingsBtn')) },
  { title: '準備完了！', text: '作ったリミックスは自動で端末に保存されます。RHRE fresh で開ける .rhref にも保存できます。次は、実際にリミックスを 1 つ作ってみましょう！' },
];

function startTour() {
  if (presenting) stopPresentation();
  if (playMode) setPlayMode(false);
  if (mode === 'playing') stopPlayback();
  for (const m of document.querySelectorAll('.modal:not([hidden])')) m.hidden = true;
  tour.on = true;
  tour.i = 0;
  $('tour').hidden = false;
  $('tourDots').innerHTML = TOUR_STEPS.map(() => '<span></span>').join('');
  showTourStep();
}
function endTour(completed) {
  if (!tour.on) return;
  tour.on = false;
  $('tour').hidden = true;
  settings.tutorialDone = true;
  saveSettings();
  if (completed === true) startGuideIntro();
}
function showTourStep() {
  const st = TOUR_STEPS[tour.i];
  const n = TOUR_STEPS.length;
  $('tourStep').textContent = `${tour.i + 1} / ${n}`;
  $('tourTitle').textContent = t(st.title);
  const r = st.target?.() || null;
  $('tourText').textContent = t(st.text) + (st.alt && !panelOpen() ? ' ' + t(st.alt) : '');
  [...$('tourDots').children].forEach((d, k) => d.classList.toggle('on', k === tour.i));
  $('tourPrev').style.visibility = tour.i === 0 ? 'hidden' : 'visible';
  $('tourNext').textContent = tour.i === n - 1 ? t('はじめる') : t('次へ');
  // 照らす所（なければ真ん中に説明だけ）
  const hole = $('tourHole');
  const vw = window.innerWidth, vh = window.innerHeight;
  const pad = 6;
  if (r) {
    const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
    const w = Math.min(vw - 8, r.left + r.width + pad) - x, h = Math.min(vh - 8, r.top + r.height + pad) - y;
    Object.assign(hole.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
    hole.classList.remove('center');
  } else {
    Object.assign(hole.style, { left: `${vw / 2}px`, top: `${vh / 2}px`, width: '0px', height: '0px' });
    hole.classList.add('center');
  }
  // 説明は照らした所の下か上（入らなければ、画面の中で一番空いている所）
  const card = $('tourCard');
  const cw = card.offsetWidth, ch = card.offsetHeight;
  let left = (vw - cw) / 2, top = (vh - ch) / 2;
  if (r) {
    left = Math.min(vw - cw - 12, Math.max(12, r.left + r.width / 2 - cw / 2));
    if (r.top + r.height + pad + 12 + ch <= vh - 8) top = r.top + r.height + pad + 12;
    else if (r.top - pad - 12 - ch >= 8) top = r.top - pad - 12 - ch;
    else top = Math.max(8, Math.min(vh - ch - 8, r.top + r.height / 2 - ch / 2));
  }
  Object.assign(card.style, { left: `${Math.round(left)}px`, top: `${Math.round(top)}px` });
}
$('tourNext').addEventListener('click', () => {
  if (tour.i >= TOUR_STEPS.length - 1) { endTour(true); return; }
  tour.i++;
  showTourStep();
});
$('tourPrev').addEventListener('click', () => { if (tour.i > 0) { tour.i--; showTourStep(); } });
$('tourX').addEventListener('click', () => endTour(false));
window.addEventListener('resize', () => { if (tour.on) requestAnimationFrame(showTourStep); });
window.addEventListener('keydown', (e) => {
  if (!tour.on) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); endTour(false); }
  else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); $('tourNext').click(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); $('tourPrev').click(); }
}, true);
// 初めて開いたときだけ自動で始める（スマホのブラウザの案内画面が出ている間は待つ）
function maybeStartTour() {
  if (root.classList.contains('gate-ios') || root.classList.contains('gate-android')) return;
  if (!settings.uiLangChosen) { $('langPick').hidden = false; return; }
  if (settings.tutorialDone || tour.on) return;
  setTimeout(() => { if (!settings.tutorialDone && !tour.on) startTour(); }, 400);
}

// ---------------------------------------------------------------- 言語選択（初めて開いたとき・スマホのブラウザの案内画面）

const GATE_TEXT = {
  ja: {
    ios: `<h1 id="gateTitle">ホーム画面に追加して使ってください</h1>
      <p>iPhone では、ホーム画面に追加すると全画面で開き、音も安定して鳴ります。</p>
      <ol>
        <li><span>画面下の <b>共有ボタン</b>（${'<svg class="g-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1"/></svg>'}）を押す<small>見当たらないときは「…」→「共有」</small></span></li>
        <li><span><b>「ホーム画面に追加」</b>を選ぶ<small>出てこないときは、下にスクロールするか「さらに表示」</small></span></li>
        <li><span>右上の <b>「追加」</b> を押す</span></li>
        <li><span>ホーム画面の <b>RHRE Web</b> から開く</span></li>
      </ol>
      <p class="g-note">LINE などのアプリの中で開いているときは、Safari で開き直してから追加してください。</p>`,
    save: '作業中のリミックスを .rhref で保存',
    aTitle: '全画面で使う', aFs: '全画面で始める', aInstall: 'アプリとして追加',
    aNote: 'Chrome のメニュー（⋮）→「ホーム画面に追加」または「アプリをインストール」でアプリにすると、次からはアイコンから全画面で開けます。',
  },
  en: {
    ios: `<h1 id="gateTitle">Add it to your Home Screen</h1>
      <p>On iPhone, RHRE Web opens full screen and plays sound reliably once it is on your Home Screen.</p>
      <ol>
        <li><span>Tap the <b>Share</b> button (${'<svg class="g-share" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5M6 11H5v10h14V11h-1"/></svg>'}) at the bottom<small>Can't see it? Tap "…" → "Share"</small></span></li>
        <li><span>Choose <b>"Add to Home Screen"</b><small>If it's missing, scroll down or tap "More"</small></span></li>
        <li><span>Tap <b>"Add"</b> at the top right</span></li>
        <li><span>Open <b>RHRE Web</b> from your Home Screen</span></li>
      </ol>
      <p class="g-note">If you opened this inside an app such as LINE, open it in Safari first, then add it.</p>`,
    save: 'Save the current remix as .rhref',
    aTitle: 'Use in full screen', aFs: 'Start in full screen', aInstall: 'Install as an app',
    aNote: 'Install it from the Chrome menu (⋮) → "Add to Home screen" or "Install app" to always open it full screen.',
  },
};
function renderGate() {
  const L = GATE_TEXT[settings.uiLang === 'en' ? 'en' : 'ja'];
  $('gateIosText').innerHTML = L.ios;
  $('gateSave').textContent = L.save;
  if (!$('gateTitleA').dataset.back) $('gateTitleA').textContent = L.aTitle;
  if (!$('gateFs').dataset.back) $('gateFs').textContent = L.aFs;
  $('gateInstall').textContent = L.aInstall;
  if (!$('gateAndroidNote').dataset.done) $('gateAndroidNote').textContent = L.aNote;
  for (const b of document.querySelectorAll('#gate [data-glang]')) b.classList.toggle('on', b.dataset.glang === (settings.uiLang === 'en' ? 'en' : 'ja'));
}
function chooseLang(l) {
  settings.uiLang = l === 'en' ? 'en' : 'ja';
  settings.lang = settings.uiLang; // ミニゲームの声の言語も、まずは同じに（設定で変えられる）
  settings.uiLangChosen = true;
  saveSettings();
  applySettings();
  renderGate();
  if (remix) renderGrid();
}
$('gate').querySelector('.g-lang').addEventListener('click', (e) => { const b = e.target.closest('[data-glang]'); if (b) chooseLang(b.dataset.glang); });
$('langPick').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lang]');
  if (!b) return;
  chooseLang(b.dataset.lang);
  $('langPick').hidden = true;
  maybeStartTour();
});
renderGate();

// ---------------------------------------------------------------- 曲の一覧（端末から追加した曲。サイトには置かない）

const songs = { meta: null, pvId: null, pvSrc: null, decoded: new Map() };
// 「日本語名_English name_BPM.mp3」の形なら、名前と BPM を読む
function parseSongName(fn) {
  const base = fn.replace(/\.[^.]+$/, '');
  const parts = base.split('_');
  if (parts.length >= 3) {
    const bpm = parseFloat(parts[parts.length - 1].trim());
    if (bpm >= 20 && bpm <= 400) return { ja: parts[0].trim(), en: parts.slice(1, -1).join('_').trim(), bpm };
  }
  if (parts.length === 2) return { ja: parts[0].trim(), en: parts[1].trim(), bpm: null };
  return { ja: base, en: '', bpm: null };
}
const songLabel = (m) => (settings.uiLang === 'en' && m.en ? m.en : m.ja) || m.file;
async function songMeta() {
  if (!songs.meta) songs.meta = (await store.get('songsMeta')) || [];
  return songs.meta;
}
function saveSongMeta() { store.set('songsMeta', songs.meta); }
async function openSongPicker() {
  if (!remix) return;
  await songMeta();
  renderSongList();
  $('songModal').hidden = false;
}
function renderSongList() {
  const list = $('songList');
  if (!songs.meta.length) {
    list.innerHTML = `<div class="song-empty">${esc(t('まだ曲がありません。下の「＋ 曲を追加」から、端末の曲（mp3・wav など）を入れてください。'))}</div>`;
    return;
  }
  list.innerHTML = songs.meta.map((m) => `<div class="song-row" data-id="${m.id}">`
    + `<button class="song-main" type="button"><span>${esc(songLabel(m))}</span>${m.bpm ? `<em class="song-bpm">BPM ${m.bpm}</em>` : ''}</button>`
    + `<button class="song-use" type="button">${esc(t('この曲を使う'))}</button>`
    + `<button class="song-pv${songs.pvId === m.id ? ' on' : ''}" type="button" aria-label="${esc(t('試聴'))}">${songs.pvId === m.id ? '■' : '▶'}</button>`
    + `<button class="song-del" type="button" aria-label="${esc(t('一覧から消す'))}">✕</button></div>`).join('');
}
async function addSongFiles(files) {
  await songMeta();
  let added = 0;
  for (const f of files) {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const p = parseSongName(f.name);
      await store.set(`song:${id}`, bytes);
      songs.meta.push({ id, file: f.name, ja: p.ja, en: p.en, bpm: p.bpm });
      added++;
    } catch (_) { /* 読めないファイルは飛ばす */ }
  }
  saveSongMeta();
  renderSongList();
  if (added) setStatus(t('{n} 曲を追加しました', { n: added }));
}
function stopSongPreview() {
  try { songs.pvSrc?.stop(); } catch (_) { /* 済み */ }
  songs.pvSrc = null;
  if (songs.pvId) { songs.pvId = null; if (!$('songModal').hidden) renderSongList(); }
}
async function toggleSongPreview(id) {
  if (songs.pvId === id) { stopSongPreview(); return; }
  stopSongPreview();
  engine.unlock();
  songs.pvId = id;
  renderSongList();
  try {
    let buf = songs.decoded.get(id);
    if (!buf) {
      const bytes = await store.get(`song:${id}`);
      buf = await engine.decode(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      songs.decoded.set(id, buf);
    }
    if (songs.pvId !== id) return;
    const ctx = engine.context;
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const g = ctx.createGain();
    g.gain.value = 0.8;
    s.connect(g);
    g.connect(ctx.destination);
    s.onended = () => { if (songs.pvSrc === s) { songs.pvSrc = null; songs.pvId = null; if (!$('songModal').hidden) renderSongList(); } };
    s.start();
    songs.pvSrc = s;
  } catch (_) {
    songs.pvId = null;
    renderSongList();
    toast(t('この曲は再生できませんでした'), 2500);
  }
}
async function chooseSong(id) {
  const m = songs.meta.find((x) => x.id === id);
  if (!m) return;
  stopSongPreview();
  const bytes = await store.get(`song:${id}`);
  if (!bytes) { toast(t('この曲は読み込めませんでした'), 2500); return; }
  $('songModal').hidden = true;
  const ok = await loadMusicBytes(bytes, m.file, { manualStart: guide.on });
  if (ok) askTempo(m);
}
$('songList').addEventListener('click', (e) => {
  const row = e.target.closest('.song-row');
  if (!row) return;
  const id = row.dataset.id;
  if (e.target.closest('.song-pv')) toggleSongPreview(id);
  else if (e.target.closest('.song-del')) {
    const m = songs.meta.find((x) => x.id === id);
    confirmBox(t('曲を消す'), t('「{n}」を一覧から消しますか？（端末の元のファイルは消えません）', { n: songLabel(m) }), t('消す'), () => {
      if (songs.pvId === id) stopSongPreview();
      songs.meta = songs.meta.filter((x) => x.id !== id);
      saveSongMeta();
      store.set(`song:${id}`, null);
      songs.decoded.delete(id);
      renderSongList();
      $('songModal').hidden = false;
    });
  } else if (e.target.closest('.song-main, .song-use')) chooseSong(id);
});
$('songAdd').addEventListener('click', () => $('songInput').click());
$('songInput').addEventListener('change', async (e) => {
  const files = [...(e.target.files || [])];
  e.target.value = '';
  if (files.length) await addSongFiles(files);
});
$('songCancel').addEventListener('click', () => { stopSongPreview(); $('songModal').hidden = true; if (guide.on) guideRender(); });

// 音楽を読み込む（曲の一覧・ファイルから共通）。manualStart のときは自動で頭を合わせない（チュートリアル）
async function loadMusicBytes(bytes, filename, opts = {}) {
  if (!remix) return false;
  try {
    toast(t('音楽を読み込んでいます…'), 4000, 'info');
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const buf = await engine.decode(ab.slice(0));
    buf.rhreLeadIn = rhreMusicLeadIn(bytes, buf);
    musicFile = { bytes, filename, extension: (filename.split('.').pop() || '').toLowerCase() };
    musicBuf = buf;
    remix.musicPresent = true;
    view.dirty = true;
    saveMusicToStore();
    if (mode !== 'stopped') stopPlayback();
    if (opts.manualStart) {
      edit(() => { remix.musicStartSec = 0; });
      toast(t('音楽を読み込みました：{f}', { f: filename }), 3000, 'info');
    } else {
      const onset = detectOnset(buf);
      // RHRE fresh で鳴る位置（mp3 の先頭の空白の分だけ遅い）で、曲の始まりが 0 拍目に来るように
      const start = Math.round((remix.tempo.b2s(0) - onset - (buf.rhreLeadIn || 0)) * 1000) / 1000;
      edit(() => { remix.musicStartSec = start; });
      toast(t('音楽を読み込みました：{f}。曲の始まりが 0 拍目に来るように、音楽開始を {s} に合わせました。', { f: filename, s: fmtTime(start) }), 5000, 'info');
    }
    return true;
  } catch (_) {
    toast(t('この音楽ファイルは読み込めませんでした（mp3・wav・m4a などを選んでください）'), 4000);
    return false;
  }
}

// ---------------------------------------------------------------- 曲のテンポを聞く ／ タップでテンポを測る

let tempoAskSong = null;
let tempoDetect = null; // 自動検出の結果 { base（見つけた最初のテンポ）, changes: [{ time, bpm, width }], downbeat, firstBeat, onset }
function askTempo(songMetaItem) {
  tempoAskSong = songMetaItem || null;
  tempoDetect = null;
  $('tempoAskScale').hidden = true;
  // チュートリアルでは、自分でテンポを入れてもらうので出さない
  $('tempoAskAuto').hidden = guide.on || !musicBuf;
  const known = songMetaItem?.bpm;
  $('tempoAskInput').value = known ? String(known) : (guide.on ? '' : String(+remix.tempo.tempoAt(0).toFixed(2)));
  $('tempoAskInfo').textContent = guide.on
    ? t('この曲のテンポ（BPM）を教えてください。わからないときは「テンポがわからない」で、曲に合わせてタップして測れます。')
    : t('この曲のテンポ（BPM）を教えてください。決定すると、リミックスの最初のテンポがこの値になります。');
  $('tempoAskModal').hidden = false;
}
$('tempoAskTap').addEventListener('click', () => openTapTempo('ask'));

// 1 小節の拍の数（0 拍目の拍子。4/4 なら 4、6/8 なら 3）
function measureBeatsAt0() {
  const ts = remix.timeSignatures[0];
  const m = ts ? (Number(ts.perMeasure) * 4) / (Number(ts.unit) || 4) : 4;
  return m > 0 ? m : 4;
}
// アウフタクト（小節の頭より前から鳴り始める）なら、2 小節目の頭から本編が始まるように音楽開始を決める。
// 小節の頭がはっきりしないとき・アウフタクトがないときは null（今の音楽開始のまま＝曲の始まりが 0 拍目）
function planPickup(bpm) {
  const d = tempoDetect?.downbeat;
  if (!d || d.margin < 0.5 || !musicBuf) return null;
  // 拍の時刻は、音の始まりより少し早めに出るので、最初の拍と最初の音のずれで直す（最初の拍が最初の音のときだけ）
  const bias = Math.abs(tempoDetect.firstBeat - tempoDetect.onset) < 0.05 ? tempoDetect.firstBeat - tempoDetect.onset : -0.01;
  const down = d.time - bias;
  const pickupSec = down - tempoDetect.onset;
  if (pickupSec < 0.15) return null;
  const M = measureBeatsAt0();
  const measureSec = (M * 60) / bpm;
  const measures = Math.max(1, Math.ceil(pickupSec / measureSec - 0.02));
  const T = new TempoMap([{ beat: 0, bpm, width: 0 }], bpm);
  const start = Math.round((T.b2s(M * measures) - down - (musicBuf.rhreLeadIn || 0)) * 1000) / 1000;
  return { start, beats: Math.round(((pickupSec * bpm) / 60) * 2) / 2, measure: measures + 1 };
}

// 自動検出で見つけたテンポの変化を、リミックスの拍に直す（最初のテンポを bpm にしたとき）。
// 曲の中の時刻 → リミックスの秒（音楽開始と mp3 の頭のずれを足す）→ その時点までのテンポで拍に直して、整数の拍に丸める
function planTempoChanges(bpm) {
  if (!tempoDetect || !musicBuf) return [];
  const f = bpm / tempoDetect.base; // 倍・半分などに直したときは、変化も同じ割合で
  const musicStart = planPickup(bpm)?.start ?? remix.musicStartSec;
  const trackers = [{ beat: 0, bpm, width: 0 }];
  const out = [];
  for (const c of tempoDetect.changes) {
    const T = new TempoMap(trackers, bpm);
    const sec = c.time + musicStart + (musicBuf.rhreLeadIn || 0);
    const beat = Math.round(T.s2b(sec));
    const prev = trackers[trackers.length - 1];
    if (beat <= 0 || beat <= prev.beat + prev.width) continue;
    const ch = { beat, bpm: Math.max(20, Math.min(400, Math.round(c.bpm * f))), width: Math.max(0, Math.round(c.width * f)) };
    trackers.push(ch);
    out.push(ch);
  }
  return out;
}
function tempoDetectInfo() {
  const bpm = parseFloat($('tempoAskInput').value) || tempoDetect.base;
  const plan = planTempoChanges(bpm);
  let s = t('自動検出：♩={b}。', { b: tempoDetect.base });
  const pk = planPickup(bpm);
  if (pk) s += t('アウフタクト（約 {k} 拍）から始まるので、{m} 小節目の頭から本編が始まるように音楽開始を合わせます。', { k: pk.beats, m: pk.measure });
  if (!plan.length) s += t('テンポは最後まで一定です。');
  else {
    const list = plan.slice(0, 3).map((c) => (c.width > 0
      ? t('拍 {beat} から {w} 拍かけて ♩={b}', { beat: c.beat, w: c.width, b: c.bpm })
      : t('拍 {beat} で ♩={b}', { beat: c.beat, b: c.bpm })));
    s += t('途中で {n} 回テンポが変わります（{list}{more}）。決定すると、テンポの変更も置きます（今あるテンポの変更は置き換わります）。', {
      n: plan.length, list: list.join('、'), more: plan.length > 3 ? '…' : '',
    });
  }
  s += t('倍や半分に聞こえるときは ×2・÷2 で直せます。');
  return s;
}
$('tempoAskAuto').addEventListener('click', () => {
  if (!musicBuf) return;
  $('tempoAskInfo').textContent = t('曲を調べています…');
  $('tempoAskAuto').disabled = true;
  // 計算の前に、画面に「調べています」を出す
  setTimeout(() => {
    let r = null;
    try { r = analyzeTempo(musicBuf, measureBeatsAt0()); } catch (e) { console.error(e); }
    $('tempoAskAuto').disabled = false;
    if (!r) {
      tempoDetect = null;
      $('tempoAskInfo').textContent = t('テンポを見つけられませんでした。「テンポがわからない」で、曲に合わせてタップして測ってください。');
      return;
    }
    tempoDetect = { base: r.bpm, changes: r.changes, downbeat: r.downbeat, firstBeat: r.beats[0] ?? 0, onset: detectOnset(musicBuf) };
    $('tempoAskInput').value = String(r.bpm);
    $('tempoAskScale').hidden = false;
    $('tempoAskInfo').textContent = tempoDetectInfo();
  }, 30);
});
$('tempoAskInput').addEventListener('input', () => { if (tempoDetect) $('tempoAskInfo').textContent = tempoDetectInfo(); });
const scaleTempoInput = (f) => {
  const v = parseFloat($('tempoAskInput').value);
  if (!(v > 0)) return;
  $('tempoAskInput').value = String(Math.round(v * f * 100) / 100);
  if (tempoDetect) $('tempoAskInfo').textContent = tempoDetectInfo();
};
$('tempoAskX2').addEventListener('click', () => scaleTempoInput(2));
$('tempoAskHalf').addEventListener('click', () => scaleTempoInput(0.5));
$('tempoAskOk').addEventListener('click', () => {
  const v = parseFloat($('tempoAskInput').value);
  if (!(v >= 20 && v <= 400)) { toast(t('テンポは 20〜400 の数で入れてください'), 2500); return; }
  const bpm = Math.round(v * 100) / 100;
  $('tempoAskModal').hidden = true;
  // 次に同じ曲を選んだときのために覚えておく
  if (tempoAskSong && tempoAskSong.bpm !== bpm) { tempoAskSong.bpm = bpm; saveSongMeta(); }
  if (guide.on && guide.step === 'song') { guide.bpm = bpm; guideGo('tempo'); return; }
  const plan = planTempoChanges(bpm);
  const pickup = planPickup(bpm);
  edit(() => {
    if (pickup) remix.musicStartSec = pickup.start;
    if (plan.length) {
      // 見つけたテンポの変化を置く（今ある 0 拍目より後のテンポの変更は置き換える）
      for (const tk of [...remix.tempoTrackers]) if (tk.beat > 1e-6) remix.removeTempo(tk.beat);
    }
    remix.setTempo(0, bpm);
    for (const c of plan) remix.setTempo(c.beat, c.bpm, { width: c.width });
  });
  tempoDetect = null;
  setStatus((plan.length
    ? t('最初のテンポを {b} にして、途中のテンポの変更を {n} か所に置きました', { b: bpm, n: plan.length })
    : t('最初のテンポを {b} にしました', { b: bpm }))
    + (pickup ? t('（アウフタクトなので、{m} 小節目の頭から本編が始まるように合わせました）', { m: pickup.measure }) : ''));
});
$('tempoAskSkip').addEventListener('click', () => { $('tempoAskModal').hidden = true; if (guide.on) guideRender(); });

const tap = { times: [], src: null, from: 'menu', bpm: null };
function openTapTempo(from) {
  tap.from = from;
  tap.times = [];
  updateTap();
  $('tapPlay').disabled = !musicBuf;
  $('tapPlay').textContent = t('▶ 曲を流す');
  $('tapInfo').textContent = musicBuf
    ? t('曲を流して、拍に合わせて下の大きなボタンをタップしてください。8 回以上タップすると正確になります。')
    : t('曲がまだありません。手で拍を取りながら、下の大きなボタンをタップしてください。');
  $('tapTempoModal').hidden = false;
}
function stopTapMusic() {
  try { tap.src?.stop(); } catch (_) { /* 済み */ }
  tap.src = null;
  $('tapPlay').textContent = t('▶ 曲を流す');
}
function registerTap() {
  const now = performance.now();
  if (tap.times.length && now - tap.times[tap.times.length - 1] > 2500) tap.times = [];
  tap.times.push(now);
  if (tap.times.length > 33) tap.times.shift();
  updateTap();
  const p = $('tapPad');
  p.classList.add('hit');
  setTimeout(() => p.classList.remove('hit'), 90);
}
function updateTap() {
  const ts = tap.times;
  $('tapCount').textContent = String(ts.length);
  tap.bpm = null;
  if (ts.length >= 2) {
    const avg = (ts[ts.length - 1] - ts[0]) / (ts.length - 1);
    tap.bpm = 60000 / avg;
  }
  $('tapBpm').textContent = tap.bpm ? tap.bpm.toFixed(1) : '--';
  $('tapUse').disabled = !(tap.bpm && ts.length >= 4);
}
$('tapPad').addEventListener('pointerdown', (e) => { e.preventDefault(); registerTap(); });
$('tapReset').addEventListener('click', () => { tap.times = []; updateTap(); });
$('tapPlay').addEventListener('click', () => {
  if (tap.src) { stopTapMusic(); return; }
  if (!musicBuf) return;
  engine.unlock();
  const ctx = engine.context;
  const s = ctx.createBufferSource();
  s.buffer = musicBuf;
  s.connect(ctx.destination);
  s.onended = () => { if (tap.src === s) stopTapMusic(); };
  s.start();
  tap.src = s;
  $('tapPlay').textContent = t('■ 止める');
});
$('tapUse').addEventListener('click', () => {
  if (!tap.bpm) return;
  // タップには必ずずれがあるので、整数に丸める（細かい値は自分で入れられる）
  const v = Math.round(tap.bpm);
  stopTapMusic();
  $('tapTempoModal').hidden = true;
  if (tap.from === 'ask') { $('tempoAskInput').value = String(v); return; }
  if (guide.on && guide.step === 'tempo') { toast(t('測ったテンポは {b} です。下の段のテンポに入れてみよう', { b: v }), 4000, 'info'); return; }
  edit(() => remix.setTempo(0, v));
  setStatus(t('最初のテンポを {b} にしました', { b: v }));
});
$('tapClose').addEventListener('click', () => { stopTapMusic(); $('tapTempoModal').hidden = true; });
window.addEventListener('keydown', (e) => {
  if ($('tapTempoModal').hidden) return;
  if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyT') { e.preventDefault(); e.stopImmediatePropagation(); if (!e.repeat) registerTap(); }
}, true);

// ---------------------------------------------------------------- チュートリアルの続き「実際にリミックスを作ってみよう！」
// 画面の上の案内バーで、1 つずつやってもらう（操作はふだんどおりできる）

const guide = { on: false, step: null, bpm: null, collapsed: false };
const GUIDE_NUM = { song: 1, tempo: 2, start: 3, startInfo: 3, cues: 4, end: 5, export: 6, done: 6 };
function coachButtons(list) {
  const box = $('coachBtns');
  box.textContent = '';
  for (const b of list) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `btn ${b.cls || ''}`;
    el.textContent = b.label;
    el.addEventListener('click', b.fn);
    box.appendChild(el);
  }
}
function guideRender() {
  if (!guide.on) return;
  const st = guide.step;
  $('coachBar').hidden = false;
  $('coachStep').textContent = GUIDE_NUM[st] ? `${GUIDE_NUM[st]} / 6` : t('チュートリアル');
  const closed = $('panel').classList.contains('collapsed');
  let title = '', text = '', btns = [];
  if (st === 'intro') {
    title = t('実際にリミックスを作ってみよう！');
    text = t('曲を選んで、テンポと曲の頭を合わせ、効果音を置いて、書き出すところまで一緒にやってみましょう。');
    btns = [{ label: t('やってみる'), cls: 'primary', fn: guideBegin }, { label: t('あとで'), fn: () => endGuide(false) }];
  } else if (st === 'song') {
    title = t('曲を選ぼう');
    text = musicBuf
      ? t('曲を読み込みました。テンポ（BPM）を教えてください。')
      : t('一覧から使う曲を選んでね。曲がないときは「＋ 曲を追加」で端末の曲を入れよう。');
    btns = [{ label: t('曲を選ぶ'), cls: musicBuf ? '' : 'primary', fn: openSongPicker }];
    if (musicBuf) btns.unshift({ label: t('テンポを入れる'), cls: 'primary', fn: () => askTempo(null) });
  } else if (st === 'tempo') {
    title = t('テンポを {b} にしよう', { b: guide.bpm });
    text = t('トラックの下の段（♩= の所）をタップして、テンポに {b} を入れて「決定」。このテンポにならないと次へ進めません。', { b: guide.bpm });
  } else if (st === 'start') {
    title = t('曲の頭を合わせよう');
    text = t('まず上の「Snap」を押して 1/32 にしよう（細かく動かせます）。▶ で聞きながら、上の赤い旗（音楽開始）を左右にドラッグして、曲の拍が目盛りの縦線と合うようにしよう。メトロノーム（振り子のボタン）をオンにすると合わせやすいよ。合ったら「拍と合った」を押してね。');
    btns = [{ label: t('拍と合った'), cls: 'primary', fn: () => { if (mode === 'playing') stopPlayback(); guideGo('startInfo'); } }];
  } else if (st === 'startInfo') {
    title = t('ばっちり！');
    text = t('じつは、メニューの「音楽の開始位置」→「曲の始まりを 0 拍目に合わせる」で、自動で合わせることもできます。ただ、弱起（アウフタクト）で始まる曲はずれるので、そのときは今みたいに手で合わせよう。');
    btns = [{ label: t('次へ'), cls: 'primary', fn: () => guideGo('cues') }];
  } else if (st === 'cues') {
    title = t('効果音を置いてみよう');
    text = guide.placed
      ? t('いいね！▶ で聞きながら、好きなだけ置こう。できたら「リミックス完成！」を押してね。')
      : t('下の一覧でミニゲームを選び、パターンの名前を押してから、トラックの空いている所をタップ。') + (closed ? t('一覧が閉じているときは、左下の「ゲームを選ぶ」で開けます。') : '');
    btns = [{ label: t('リミックス完成！'), cls: 'finish', fn: () => guideGo('end') }];
  } else if (st === 'end') {
    title = t('終わりの印を置こう');
    text = t('「特殊」タブ →「終わり・字幕・画像」→「End Remix」を選んで、曲を終わらせたい所に置こう。そこで再生が止まります。');
    btns = [{ label: t('戻る'), fn: () => guideGo('cues') }];
  } else if (st === 'export') {
    title = t('書き出してみよう');
    text = t('左上のメニュー（☰）→「音声のみ書き出す」で、曲として保存できます。');
  } else if (st === 'done') {
    title = t('リミックス完成！おつかれさま！');
    text = t('保存ボタンで .rhref に保存すれば、続きを編集したり RHRE fresh で開いたりできます。これで基本操作はおしまいです。');
    btns = [{ label: t('おわる'), cls: 'primary', fn: () => endGuide(true) }];
  }
  $('coachTitle').textContent = title;
  $('coachText').textContent = text;
  // 説明は閉じられる（閉じたら「説明を表示」）
  $('coachText').hidden = guide.collapsed;
  $('coachToggle').textContent = guide.collapsed ? t('説明を表示') : t('説明を閉じる');
  coachButtons(btns);
  positionCoachRing();
  updateCtxbar(); // チュートリアル中は編集バーを出さない
}
function guideGo(step) {
  guide.step = step;
  if (step === 'cues' && view.snap !== 0.5) { setSnap(0.5); toast(t('置きやすいように、Snap を 1/2 にしました'), 2500, 'info'); }
  if (step === 'cues') guide.placed = remix?.entities.some((e) => e.o && !e.game?.id?.startsWith('special') && e.type !== 'playalongEntity');
  guideRender();
  if (step === 'start') setStatus(t('赤い旗を動かして、曲の頭を合わせよう'));
  if (step === 'tempo') setTimeout(guideCheck, 0); // もともと同じテンポなら、そのまま次へ
}
// 照らす所（案内バーの説明と同じ所）
function guideTarget() {
  const st = guide.step;
  if (st === 'tempo') return viewPart('tempo');
  if (st === 'start') return viewPart('flags');
  if (st === 'cues' && !guide.placed) return panelOpen() ? visibleRect($('panel')) : visibleRect($('panelToggle'));
  if (st === 'end') return panelOpen() ? visibleRect($('tabsRow')) : visibleRect($('panelToggle'));
  if (st === 'export') return $('menuModal').hidden ? visibleRect($('menuBtn')) : visibleRect(document.querySelector('#menuModal [data-act="export"]'));
  return null;
}
let ringKey = '';
function positionCoachRing() {
  const ring = $('coachRing');
  const r = guide.on && !presenting ? guideTarget() : null;
  if (!r) { if (!ring.hidden) ring.hidden = true; ringKey = ''; return; }
  const key = `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
  if (key === ringKey && !ring.hidden) return;
  ringKey = key;
  ring.hidden = false;
  Object.assign(ring.style, { left: `${Math.round(r.left - 3)}px`, top: `${Math.round(r.top - 3)}px`, width: `${Math.round(r.width + 6)}px`, height: `${Math.round(r.height + 6)}px` });
}
// 編集のたびに、その段のことができたか確かめる
function guideCheck() {
  if (!guide.on || !remix) return;
  if (guide.step === 'tempo' && guide.bpm && Math.abs(remix.tempo.tempoAt(0) - guide.bpm) < 0.005) { guideGo('start'); toast(t('テンポが合いました！'), 2000, 'info'); return; }
  if (guide.step === 'cues' && !guide.placed && remix.entities.some((e) => e.o && !e.game?.id?.startsWith('special') && e.type !== 'playalongEntity')) { guide.placed = true; guideRender(); return; }
  if (guide.step === 'end' && remix.hasEndEntity) { guideGo('export'); return; }
}
function guideOnExport() { if (guide.on && guide.step === 'export') guideGo('done'); }
function startGuideIntro() {
  guide.on = true;
  guideGo('intro');
}
function startGuide() {
  if (tour.on) endTour(false);
  guide.on = true;
  guideBegin();
}
async function guideBegin() {
  const go = async () => {
    if (presenting) stopPresentation();
    if (playMode) setPlayMode(false);
    await newRemix();
    guide.on = true;
    guide.bpm = null;
    guideGo('song');
    openSongPicker();
  };
  const hasWork = remix && remix.entities.some((e) => e.type !== 'endEntity');
  if (hasWork) confirmBox(t('リミックスを作ってみる'), t('新しいリミックスで始めます。今のリミックスは閉じます。残したいときは、先に保存ボタンで保存してください。'), t('始める'), go);
  else go();
}
function endGuide(finished) {
  guide.on = false;
  guide.step = null;
  $('coachBar').hidden = true;
  $('coachRing').hidden = true;
  updateCtxbar();
  if (!finished) setStatus(t('メニューの「リミックスを作ってみる」から、いつでもまた始められます'));
}
$('coachX').addEventListener('click', () => endGuide(false));
$('coachToggle').addEventListener('click', () => { guide.collapsed = !guide.collapsed; guideRender(); });
window.addEventListener('resize', () => { if (guide.on) requestAnimationFrame(positionCoachRing); });

// ---------------------------------------------------------------- 隠しスイッチ：自分のアクセスを数えない
// 右下のバージョン表示を続けて 7 回タップすると、この端末（このアプリ）からのアクセスを GoatCounter で数えなくする。
// GoatCounter は保存された印 skipgc が 't' のときに数えない（#toggle-goatcounter と同じ印）
{
  let taps = 0, last = 0;
  $('version').addEventListener('click', () => {
    const now = performance.now();
    taps = now - last < 700 ? taps + 1 : 1;
    last = now;
    if (taps < 7) return;
    taps = 0;
    try {
      const off = localStorage.getItem('skipgc') === 't';
      if (off) localStorage.removeItem('skipgc'); else localStorage.setItem('skipgc', 't');
      toast(off ? t('この端末のアクセスを、また数えるようにしました') : t('この端末のアクセスを数えないようにしました'), 3000, 'info');
    } catch (_) {
      toast(t('この端末では切り替えられませんでした'), 2500);
    }
  });
}

// ---------------------------------------------------------------- ウィンドウの閉じるボタン
// 「閉じる」「やめる」のボタンは、ウィンドウの左上の × にまとめる（押すと、もとのボタンと同じ動き）
{
  const X_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  const CLOSERS = {
    menuModal: '[data-act="close"]', markerModal: '#markerCancel', textModal: '#textCancel', saveNameModal: '#saveNameCancel',
    tracksModal: '#tracksCancel', musicModal: '#musicCancel', confirmModal: '#confirmCancel', exportModal: '#exportClose',
    saveModal: '#saveClose', settingsModal: '#settingsClose', helpModal: '#helpClose', videoModal: '#videoClose', newsModal: '#newsClose',
    songModal: '#songCancel', tempoAskModal: '#tempoAskSkip', tapTempoModal: '#tapClose', errModal: '#errOk', keysModal: '#keysOk',
  };
  for (const [mid, sel] of Object.entries(CLOSERS)) {
    const card = $(mid)?.querySelector('.card');
    const closer = card?.querySelector(sel);
    if (!card || !closer) continue;
    const x = document.createElement('button');
    x.className = 'card-x';
    x.type = 'button';
    x.title = '閉じる';
    x.setAttribute('aria-label', '閉じる');
    x.innerHTML = X_SVG;
    x.addEventListener('click', () => closer.click());
    card.prepend(x);
    card.classList.add('has-x');
    if (!card.querySelector('h2')) card.classList.add('no-title');
    closer.hidden = true;
    // 閉じるボタンしかない段は、段ごと隠す（あとで出てくるボタン＝WAVを保存 などがある段は残す）
    const row = closer.parentElement;
    if (row?.classList.contains('row') && ![...row.children].some((c) => c !== closer)) row.hidden = true;
  }
}

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
$('paTouchOffset').addEventListener('input', () => { settings.paTouchOffset = Number($('paTouchOffset').value); $('paTouchOffsetVal').textContent = `${settings.paTouchOffset}ms`; });
$('paTouchOffset').addEventListener('change', () => saveSettings());
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
  LABELS.tempoHint = t('ここをタップでテンポ、拍子、音量を変更できます→');
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
    $('list').innerHTML = `<div class="empty">${esc(t('ミニゲームを選ぶと、パターンが並びます。名前を押してからトラックの空いている所をタップすると置けます。スピーカーのボタンで試聴できます。'))}</div>`;
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
// 新しい版の確認：起動時・画面に戻ったとき・開いている間は 1 分ごとに version.json を見て、
// 新しい版があれば「更新する」ボタンを出す（押すと URL を変えて読み直すので、古いページが残らない）。
// 「あとで」を押した版は、もっと新しい版が出るまで出さない
let updateShownFor = '';
let updateDismissed = '';
async function checkUpdate() {
  // 再生中は邪魔しない（止めたあとの確認で出す）
  if (location.protocol === 'file:' || document.hidden || mode === 'playing') return;
  try {
    const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    const { version } = await res.json();
    if (!version || version === VERSION || version === updateShownFor || version === updateDismissed) return;
    updateShownFor = version;
    $('updateText').textContent = t('新しい版（v{v}）があります', { v: version });
    $('updateBar').hidden = false;
    $('updateBtn').onclick = () => {
      if (mode === 'playing') stopPlayback();
      location.replace(`${location.pathname}?u=${encodeURIComponent(version)}`);
    };
  } catch (_) { /* オフラインなど */ }
}
$('updateLater').addEventListener('click', () => { $('updateBar').hidden = true; updateDismissed = updateShownFor; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkUpdate(); });
setTimeout(checkUpdate, 1500);
setInterval(checkUpdate, 60000);

// ---------------------------------------------------------------- 更新内容
// アップデートのあとに開いたら「アップデートしました！」を 1 回だけ出す。初めて使う人には出さない
const cmpVer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
};
// 前に見た版より新しい項目は色を変える（見出しの版を水色に）
function openNews(sinceVer) {
  const en = getLang() === 'en';
  const list = $('newsList');
  list.replaceChildren();
  for (const item of CHANGELOG) {
    const h = document.createElement('h3');
    h.textContent = `v${item.v}`;
    if (sinceVer && cmpVer(item.v, sinceVer) > 0) h.className = 'news-new';
    const sm = document.createElement('small');
    sm.textContent = item.date;
    h.appendChild(sm);
    const ul = document.createElement('ul');
    for (const line of (en ? item.en : item.ja)) {
      const li = document.createElement('li');
      li.textContent = line;
      ul.appendChild(li);
    }
    list.append(h, ul);
  }
  $('newsBar').hidden = true;
  $('newsModal').hidden = false;
  list.scrollTop = 0;
}
let newsSince = null;
{
  const NEWS_BASE = '1.7.7'; // 更新内容を始める前の版。それまで使っていた人は、これより新しい分を見る
  const seen = settings.seenVersion || (settings.uiLangChosen ? NEWS_BASE : VERSION);
  if (cmpVer(VERSION, seen) > 0 && CHANGELOG.some((c) => cmpVer(c.v, seen) > 0 && cmpVer(c.v, VERSION) <= 0)) newsSince = seen;
  if (settings.seenVersion !== VERSION) { settings.seenVersion = VERSION; saveSettings(); }
  if (newsSince) {
    setTimeout(() => {
      $('newsText').textContent = t('アップデートしました！（v{v}）', { v: VERSION });
      $('newsBar').hidden = false;
    }, 1200);
  }
}
$('newsBar').addEventListener('click', () => openNews(newsSince));
$('newsDismiss').addEventListener('click', (e) => { e.stopPropagation(); $('newsBar').hidden = true; });
$('newsClose').addEventListener('click', () => { $('newsModal').hidden = true; });

// ---------------------------------------------------------------- 起動

buildTabs();
updateButtons();
document.fonts?.ready.then(() => { view.dirty = true; });
fetch(`data/games-${DEFAULT_DB_COMMIT}.json`).then((r) => r.json()).then((d) => { gamesIndex = d.games || []; renderGrid(); }).catch(() => {});
// 動作確認用（URL に ?debug を付けたときだけ）
if (/[?&]debug\b/.test(location.search)) window.__rhre = { view, engine, player, get remix() { return remix; }, get judge() { return judge; }, get musicBuf() { return musicBuf; }, get videoBlob() { return videoBlob; }, get videoDiag() { return videoDiag; }, loadMusic: (bytes, name) => loadMusicBytes(bytes, name), askTempo: () => askTempo(null) };

applySettings();
(async () => {
  await restoreCustomSounds().catch(() => {});
  const restored = await openAutosave().catch(() => false);
  if (!restored) await openSample();
  maybeStartTour();
})();
