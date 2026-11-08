import { loadRemix, cleanName, isMulti } from './remix.js';
import { AudioEngine, Player, Previewer, renderWav } from './audio.js';
import { EditorView, Minimap, fmtTime } from './view.js';

const $ = (id) => document.getElementById(id);
const engine = new AudioEngine();
const player = new Player(engine);
const previewer = new Previewer(engine);

let remix = null;
let musicBuf = null;
let fileName = '';
let mode = 'stopped'; // stopped | playing | paused
let pausedSec = 0;
let loading = false;
let metronome = false;
let selectedGame = null;
let selectedItem = null;
let loadInfo = '';

const SNAPS = [[0.25, '1/4'], [0.125, '1/8'], [0.5, '1/2'], [1, '1'], [0, '自由']];
let snapIdx = 0;

const view = new EditorView($('view'), {
  onSelect: (ent) => {
    if (!ent) { setStatus(loadInfo); return; }
    if (ent.game) selectGame(ent.game, false, ent.o);
    setStatus(describe(ent));
  },
  onSetPlaybackStart: (beat) => {
    if (!remix) return;
    remix.playbackStart = beat;
    if (mode === 'playing') startPlayback(remix.tempo.b2s(beat));
    else { mode = 'stopped'; updateButtons(); updateTimebox(remix.tempo.b2s(beat), beat); }
    view.dirty = true;
  },
});
const mini = new Minimap($('minimap'), view);

// ---------------------------------------------------------------- 表示まわり

function setStatus(text) { $('statusText').textContent = text; }

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
  $('playBtn').disabled = !remix || loading || mode === 'playing';
  $('pauseBtn').disabled = mode !== 'playing';
  $('stopBtn').disabled = mode === 'stopped';
  $('exportBtn').disabled = !remix || loading;
}

function updateTimebox(sec, beat) {
  $('timeText').textContent = fmtTime(sec);
  $('beatText').textContent = `Beat ${beat.toFixed(3)}`;
}

function describe(ent) {
  const parts = [];
  if (ent.game) parts.push(ent.game.name);
  parts.push(ent.name);
  parts.push(`拍 ${ent.beat.toFixed(3)}`);
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

const KIND = { pattern: 'パターン', keepTheBeat: '繰り返し', equidistant: '等間隔', randomCue: 'ランダム', multiCue: '複合', pitchDependent: '音程別' };

function buildGameGrid() {
  const grid = $('gameGrid');
  grid.textContent = '';
  const seen = new Map();
  for (const e of remix.entities) {
    if (!e.game || e.game.id.startsWith('special')) continue;
    if (!seen.has(e.game.id)) seen.set(e.game.id, { game: e.game, first: e.beat });
  }
  $('gamesHead').textContent = `ミニゲーム（${seen.size}）`;
  for (const { game, first } of seen.values()) {
    const b = document.createElement('button');
    b.className = 'game';
    b.title = game.name;
    b.setAttribute('aria-label', game.name);
    b.dataset.gid = game.id;
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = game.icon;
    b.appendChild(img);
    b.addEventListener('click', () => {
      selectGame(game, true);
      view.centerOn(first + view.visibleBeats * 0.3);
      setStatus(game.name);
    });
    grid.appendChild(b);
  }
}

function selectGame(game, scrollGrid, highlightObj) {
  selectedGame = game;
  $('listHead').textContent = game.name;
  for (const b of $('gameGrid').children) {
    const on = b.dataset.gid === game.id;
    b.classList.toggle('sel', on);
    if (on && !scrollGrid) b.scrollIntoView({ block: 'nearest' });
  }
  const used = new Set(remix.entities.map((e) => e.o));
  const objs = game.objects.filter((o) => !o.hidden && !o.noDisplay && (o.type === 'cue' || isMulti(o)));
  objs.sort((a, b) => (isMulti(b) ? 1 : 0) - (isMulti(a) ? 1 : 0));
  const list = $('list');
  list.textContent = '';
  selectedItem = highlightObj || null;
  for (const o of objs) {
    const row = document.createElement('button');
    row.className = 'item' + (o === selectedItem ? ' sel' : '');
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
    row.append(arrow, txt);
    row.insertAdjacentHTML('beforeend', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>');
    row.addEventListener('click', () => {
      for (const r of list.children) r.classList.remove('sel');
      row.classList.add('sel');
      selectedItem = o;
      preview(o);
    });
    list.appendChild(row);
    if (o === highlightObj) requestAnimationFrame(() => row.scrollIntoView({ block: 'nearest' }));
  }
  if (!objs.length) list.innerHTML = '<div class="empty">表示できる項目がありません。</div>';
}

async function preview(o) {
  engine.unlock();
  setStatus(`${o.game.name} ／ ${cleanName(o.name)}`);
  const urls = remix.soundUrlsOf(o);
  await engine.loadSounds(urls, remix.db);
  const beat = view.playhead ?? remix.playbackStart;
  previewer.play(remix.previewEvents(o, remix.tempo.tempoAt(beat)));
}

// ---------------------------------------------------------------- 読み込み

async function openBuffer(ab, name) {
  stopPlayback();
  loading = true;
  updateButtons();
  showLoading(name, 'ファイルを開いています…', 0);
  try {
    const res = await loadRemix(ab, { onStatus: (msg, f) => showLoading(name, msg, f * 0.25) });
    remix = res.remix;
    musicBuf = null;
    fileName = name;
    remix.musicPresent = false;
    view.setRemix(remix);
    buildGameGrid();
    $('list').innerHTML = '<div class="empty">左のアイコンを押すと、そのミニゲームのパターンが並びます。名前を押すと試聴できます。</div>';
    const sounds = [...remix.allSoundCues().keys()];
    const failed = await engine.loadSounds(sounds, remix.db, (d, t) => showLoading(name, `効果音を読み込み中 ${d} / ${t}`, 0.25 + 0.75 * (d / t)));
    if (res.music) {
      showLoading(name, '音楽を読み込み中…', 1);
      try {
        const b = res.music.bytes;
        musicBuf = await engine.decode(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        remix.musicPresent = true;
      } catch (_) {
        failed.push('music');
      }
    }
    $('loading').hidden = true;
    const games = new Set(remix.entities.filter((e) => e.game && !e.game.id.startsWith('special')).map((e) => e.game.id));
    const notes = [];
    if (res.missing.length) notes.push(`見つからない ID ${res.missing.length} 件`);
    if (failed.length) notes.push(`読めなかった音 ${failed.length} 件`);
    loadInfo = `${name} ／ ${fmtTime(remix.durationSec)} ／ ミニゲーム ${games.size} 種・ブロック ${remix.entities.length} 個${notes.length ? ' ／ ⚠ ' + notes.join('・') : ''}`;
    setStatus(loadInfo);
    $('version').textContent = `RHRE Web 試作 0.1 ／ DB v${remix.raw.databaseVersion ?? '?'}`;
    $('helpDiag').textContent = `データベース: ${remix.db.commit} ／ ogg の読み込み: ${engine.usedWasm ? 'WASM（予備）' : 'ブラウザ内蔵'}${res.missing.length ? ' ／ 見つからない ID: ' + res.missing.slice(0, 6).join(', ') : ''}`;
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  } catch (e) {
    console.error(e);
    remix = remix || null;
    showError(e.message || String(e));
  } finally {
    loading = false;
    updateButtons();
    view.dirty = true;
  }
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

// ---------------------------------------------------------------- 再生

function startPlayback(fromSec) {
  previewer.stop();
  player.metronome = metronome;
  player.onEnd = () => {
    mode = 'stopped';
    view.playhead = null;
    view.dirty = true;
    updateButtons();
    updateTimebox(remix.tempo.b2s(remix.playbackStart), remix.playbackStart);
  };
  player.start(remix, musicBuf, fromSec);
  mode = 'playing';
  updateButtons();
}

function play() {
  if (!remix || loading || mode === 'playing') return;
  engine.unlock(); // iPhone ではタップの中で音を有効にする必要がある
  const from = mode === 'paused' ? pausedSec : remix.tempo.b2s(remix.playbackStart);
  startPlayback(from);
}

function pause() {
  if (mode !== 'playing') return;
  player.pause();
  pausedSec = player.pausedAt;
  mode = 'paused';
  updateButtons();
}

function stopPlayback() {
  player.stop();
  previewer.stop();
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

$('openBtn').addEventListener('click', () => { engine.unlock(); $('fileInput').click(); });
$('fileInput').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  e.target.value = '';
  if (f) openBuffer(await f.arrayBuffer(), f.name);
});
$('sampleBtn').addEventListener('click', () => { engine.unlock(); openSample(); });
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

$('helpBtn').addEventListener('click', () => { $('helpModal').hidden = false; });
$('helpClose').addEventListener('click', () => { $('helpModal').hidden = true; });

let exportUrl = null;
$('exportBtn').addEventListener('click', async () => {
  if (!remix) return;
  if (mode === 'playing') pause();
  const modal = $('exportModal');
  modal.hidden = false;
  $('exportSave').hidden = true;
  $('exportBar').style.width = '10%';
  const from = remix.tempo.b2s(remix.playbackStart);
  $('exportMsg').textContent = `再生開始位置（${fmtTime(from)}）から最後まで、${fmtTime(remix.durationSec - from)} を書き出しています…`;
  try {
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
});
$('exportClose').addEventListener('click', () => { $('exportModal').hidden = true; });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') { e.preventDefault(); mode === 'playing' ? stopPlayback() : play(); }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer?.files?.[0];
  if (f) openBuffer(await f.arrayBuffer(), f.name);
});
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'playing') pause(); });

updateButtons();
document.fonts?.ready.then(() => { view.dirty = true; });
openSample();
