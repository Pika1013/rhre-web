// .rhref（remix.json）の解釈。テンポ・パターン展開・音の鳴らし方は RHRE fresh 本体と同じ規則に合わせてある。

import { readZip } from './zip.js?v=4';
import { SFXDatabase } from './db.js?v=5';

// ---------------------------------------------------------------- テンポ（徐々の変化とスウィング込み）

function swingOf(t) {
  const ratio = Number(t.swingRatio ?? 0);
  const division = Number(t.swingDivision ?? 0);
  if (!(ratio >= 1 && ratio <= 99) || !(division > 0)) return { ratio: 0.5, division: 1 };
  return { ratio: ratio / 100, division };
}
function swingToLinear(x, sw) {
  if (sw.ratio === 0.5) return x;
  const base = Math.floor(x / sw.division);
  const a = x - base * sw.division;
  const r = sw.ratio;
  return base * sw.division + (a <= 0.5 ? 2 * r * a : 2 * (a - 0.5) * (1 - r) + r);
}
function linearToSwing(x, sw) {
  if (sw.ratio === 0.5) return x;
  const base = Math.floor(x / sw.division);
  const a = x - base * sw.division;
  const r = sw.ratio;
  return base * sw.division + (a <= r ? (0.5 / r) * a : 0.5 + (0.5 / (1 - r)) * (a - r));
}
const lerp = (a, b, t) => a + (b - a) * t;

export class TempoMap {
  constructor(trackers, defaultTempo) {
    this.def = Number(defaultTempo) || 120;
    const byBeat = new Map();
    for (const t of trackers || []) byBeat.set(Number(t.beat), t);
    const list = [...byBeat.values()]
      .map((t) => ({ beat: Number(t.beat), bpm: Number(t.bpm) || this.def, width: Math.max(0, Number(t.width) || 0), swing: swingOf(t) }))
      .sort((a, b) => a.beat - b.beat);
    let prev = null;
    for (const t of list) {
      t.prevBpm = prev ? prev.bpm : this.def;
      t.seconds = prev ? ((t.beat - prev.endBeat) * 60) / prev.bpm + prev.endSeconds : (t.beat * 60) / this.def;
      t.endBeat = t.beat + t.width;
      t.widthSeconds = t.width > 0 ? ((2 * t.width) / (t.prevBpm + t.bpm)) * 60 : 0;
      t.endSeconds = t.seconds + t.widthSeconds;
      prev = t;
    }
    this.list = list;
  }

  floor(key, v) {
    const l = this.list;
    let lo = 0, hi = l.length - 1, ans = -1;
    while (lo <= hi) {
      const m = (lo + hi) >> 1;
      if (l[m][key] <= v) { ans = m; lo = m + 1; } else hi = m - 1;
    }
    return ans >= 0 ? l[ans] : null;
  }

  static tcTempoAt(tc, beat) {
    return tc.width > 0 && beat >= tc.beat && beat <= tc.endBeat ? lerp(tc.prevBpm, tc.bpm, (beat - tc.beat) / tc.width) : tc.bpm;
  }

  tempoAt(beat) {
    const tc = this.floor('beat', beat);
    return tc ? TempoMap.tcTempoAt(tc, beat) : this.def;
  }

  b2s(beat) {
    const tc = this.floor('beat', beat);
    if (!tc) return (beat * 60) / this.def;
    if (beat >= tc.endBeat) return tc.endSeconds + (swingToLinear(beat - tc.endBeat, tc.swing) * 60) / tc.bpm;
    const secDur = ((2 * (beat - tc.beat)) / (tc.prevBpm + TempoMap.tcTempoAt(tc, beat))) * 60;
    return tc.seconds + swingToLinear(secDur, tc.swing);
  }

  s2b(sec) {
    const tc = this.floor('seconds', sec);
    if (!tc) return (sec * this.def) / 60;
    if (sec >= tc.endSeconds) return tc.endBeat + linearToSwing(((sec - tc.endSeconds) * tc.bpm) / 60, tc.swing);
    const tAt = lerp(tc.prevBpm, tc.bpm, (sec - tc.seconds) / tc.widthSeconds);
    return tc.beat + linearToSwing((((sec - tc.seconds) / 60) * (tc.prevBpm + tAt)) / 2, tc.swing);
  }
}

// ---------------------------------------------------------------- データモデル

const MULTI_TYPES = new Set(['pattern', 'keepTheBeat', 'equidistant', 'randomCue', 'multiCue', 'pitchDependent']);
export const isMulti = (o) => MULTI_TYPES.has(o.type);
export const cleanName = (s) => String(s ?? '').replace(/\[[^\]]*\]/g, '').trim();

class Model {
  constructor(db) {
    this.db = db;
    this.durCache = new Map();
    this.repitchCache = new Map();
  }

  options(o) {
    // randomCue / pitchDependent の候補
    if (o.type === 'pitchDependent') return (o.intervals || []).map((iv) => ({ id: iv.id, beat: 0, range: iv.range }));
    return o.cues || [];
  }

  duration(o) {
    if (this.durCache.has(o.id)) return this.durCache.get(o.id);
    this.durCache.set(o.id, 0.5); // 循環参照よけ
    let d;
    switch (o.type) {
      case 'cue': d = o.duration > 0 ? Number(o.duration) : 0.5; break;
      case 'pattern':
      case 'multiCue': d = Math.max(0, ...(o.cues || []).map((c) => Number(c.beat || 0) + this.ptrDur(c))); break;
      case 'keepTheBeat': d = Number(o.defaultDuration) > 0 ? Number(o.defaultDuration) : this.seqLen(o); break;
      case 'equidistant': d = Number(o.distance) > 0 ? Number(o.distance) : 1; break;
      case 'randomCue':
      case 'pitchDependent': d = Math.max(0, ...this.options(o).map((c) => this.ptrDur(c))); break;
      default: d = 0.125;
    }
    this.durCache.set(o.id, d);
    return d;
  }

  ptrDur(c) {
    if (Number(c.duration) > 0) return Number(c.duration);
    const o = this.db.get(c.id);
    return o ? this.duration(o) : 0.5;
  }

  seqLen(o) {
    return Math.max(0, ...(o.cues || []).map((c) => Number(c.beat || 0) + this.ptrDur(c)));
  }

  canRepitch(o) {
    if (!o) return false;
    if (this.repitchCache.has(o.id)) return this.repitchCache.get(o.id);
    this.repitchCache.set(o.id, false);
    let r = false;
    if (o.type === 'cue') r = !!o.repitchable;
    else if (isMulti(o)) r = this.options(o).some((c) => this.canRepitch(this.db.get(c.id)));
    this.repitchCache.set(o.id, r);
    return r;
  }

  clearCaches() {
    this.durCache.clear();
    this.repitchCache.clear();
  }

  hasSound(o) {
    return !!o && (o.type === 'cue' || isMulti(o));
  }

  // 端をドラッグして長さを変えられるか（RHRE の IStretchable）
  stretchable(o) {
    if (!o) return false;
    switch (o.type) {
      case 'cue': return !!o.stretchable;
      case 'keepTheBeat': return true;
      case 'pattern': case 'equidistant': case 'randomCue': case 'multiCue': return !!o.stretchable;
      case 'pitchDependent': return this.options(o).some((c) => { const x = this.db.get(c.id); return x?.type === 'cue' && !!x.stretchable; });
      case 'subtitleEntity': return true;
      default: return false;
    }
  }

  // 新しく置くときの高さ（トラック数）
  height(o, trackCount) {
    if (o.type === 'endEntity') return trackCount;
    if (o.type === 'cue' || o.type === 'multiCue' || !isMulti(o)) return 1;
    return 1 + Math.max(0, ...this.options(o).map((c) => Number(c.track || 0)));
  }

  defaultWidth(o) {
    if (o.type === 'multiCue' && Number(o.width) > 0) return Number(o.width);
    if (o.type === 'subtitleEntity') return 1;
    return this.duration(o);
  }

  // RHRE の MultipartEntity と同じ規則で、実際に鳴る cue（葉）まで展開する
  expand(o, x, y, w, semi, vol, rng, out, extra = {}) {
    if (!o) return;
    const t = o.type;
    if (t === 'cue') {
      out.push({ cue: o, beat: x, width: w, track: y, semi, vol, stopAtEnd: !!extra.stopAtEnd });
      return;
    }
    if (!isMulti(o)) return; // 特殊エンティティは音を出さない
    const child = (c, cx, cy, cw) => {
      const co = this.db.get(c.id);
      if (!co) return;
      const cs = Number(c.semitone || 0) + (this.canRepitch(co) ? semi : 0);
      const cv = vol * (c.volume != null ? Number(c.volume) : 100) / 100;
      this.expand(co, cx, cy, cw, cs, cv, rng, out);
    };
    const cues = o.cues || [];
    switch (t) {
      case 'pattern': {
        const base = this.duration(o);
        const scale = o.stretchable && base > 0 ? w / base : 1;
        for (const c of cues) child(c, x + Number(c.beat || 0) * scale, y + Number(c.track || 0), this.ptrDur(c) * scale);
        break;
      }
      case 'multiCue': {
        for (const c of cues) child(c, x + Number(c.beat || 0), y + Number(c.track || 0), w);
        break;
      }
      case 'keepTheBeat': {
        if (!cues.length) break;
        const seq = Math.max(this.duration(o), this.seqLen(o));
        if (!(seq > 0)) break;
        for (let i = 0; i < 100000; i++) {
          const c = cues[i % cues.length];
          const b = Number(c.beat || 0) + Math.floor(i / cues.length) * seq;
          if (b >= w) break;
          child(c, x + b, y + Number(c.track || 0), this.ptrDur(c));
        }
        break;
      }
      case 'equidistant': {
        let rel = 0;
        cues.forEach((c, i) => {
          const track = Number(c.track || 0);
          if (track === 0 && i > 0) rel += w;
          child(c, x + rel, y + track, w);
        });
        break;
      }
      case 'randomCue': {
        if (!cues.length) break;
        const c = cues[Math.min(cues.length - 1, Math.floor(rng() * cues.length))];
        child(c, x, y, w);
        break;
      }
      case 'pitchDependent': {
        const opts = this.options(o);
        if (!opts.length) break;
        const inRange = (r) => !(r.lo === -Infinity && r.hi === Infinity) && r.hi >= r.lo && semi >= r.lo && semi <= r.hi;
        const c = opts.find((op) => inRange(op.range)) || opts[0];
        child(c, x, y, w);
        break;
      }
    }
  }
}

// ---------------------------------------------------------------- 1つの cue を実際の発音イベントに（CueEntity.play と同じ計算）

const FILLBOTS = /^fillbots(.+)?\/water$/;

function leafToEvents(lf, T, db, rng, ent, out) {
  const cue = lf.cue;
  const rules = cue.baseBpmRules || 'always';
  const rulesAllow = Number(cue.baseBpm) > 0 && (rules === 'always' || rules === 'noTimeStretch');
  const tempoRate = (c) => (Number(c.baseBpm) > 0 ? T.tempoAt(lf.beat) / Number(c.baseBpm) : 1);
  const baseRate = rulesAllow ? tempoRate(cue) : 1;
  const lo = Number(cue.randomPitchLowCents || 0), hi = Number(cue.randomPitchHighCents || 0);
  const cents = hi > lo ? lo + Math.floor(rng() * (hi - lo + 1)) : lo;
  const pitch = Math.pow(2, lf.semi / 12);
  const startSec = T.b2s(lf.beat);
  const endSec = T.b2s(lf.beat + lf.width);
  const isFill = FILLBOTS.test(cue.id);
  const stops = !!(cue.loops || isFill || lf.stopAtEnd || cue.stopAtEnd);
  const ev = {
    url: db.soundUrl(cue),
    start: startSec - Number(cue.earliness || 0),
    end: endSec,
    stops,
    rate: Math.pow(2, (lf.semi + cents / 100) / 12) * baseRate,
    rateEnd: null,
    vol: lf.vol,
    loop: cue.loops ? { start: Number(cue.loopStart || 0), end: Number(cue.loopEnd) > 0 ? Number(cue.loopEnd) : 0 } : null,
    ent,
  };
  if (isFill && lf.width > 0) {
    const w = lf.width;
    const f = (b) => (0.6 / w) * b + (w <= 3 ? -0.2 * w + 1.2 : -0.025 * w + 0.675);
    ev.rate = f(0) * baseRate;
    ev.rateEnd = f(w) * baseRate;
  }
  out.push(ev);
  const intro = cue.introSound && db.get(cue.introSound);
  if (intro?.type === 'cue') {
    out.push({ url: db.soundUrl(intro), start: startSec - Number(intro.earliness || 0), end: endSec, stops, rate: pitch * tempoRate(intro), rateEnd: null, vol: lf.vol, loop: null, ent: null });
  }
  const ending = cue.endingSound && db.get(cue.endingSound);
  if (ending?.type === 'cue') {
    const at = endSec - Number(ending.earliness || 0);
    out.push({ url: db.soundUrl(ending), start: at, end: at + 60, stops: false, rate: pitch * (rulesAllow ? tempoRate(ending) : 1), rateEnd: null, vol: lf.vol, loop: null, ent: null });
  }
}

// ---------------------------------------------------------------- リミックス全体

export const DEFAULT_DB_COMMIT = '03cb1c7';
export const DEFAULT_DB_VERSION = 149;

export function emptyRemixJSON() {
  return {
    version: 'v4.0.1',
    databaseVersion: DEFAULT_DB_VERSION,
    databaseVersionCommit: DEFAULT_DB_COMMIT,
    wasDevBranch: false,
    playbackStart: 0,
    musicStartSec: 0,
    defaultTempo: 120,
    trackCount: 5,
    isAutosave: false,
    midiInstruments: 0,
    musicData: { present: false },
    textures: [],
    entities: [],
    trackers: {
      tempos: { trackers: [{ beat: 0, seconds: 0, bpm: 120, width: 0, swingRatio: 50, swingDivision: 1, isImmutable: true }] },
      musicVolumes: { trackers: [] },
    },
    timeSignatures: [{ beat: 0, divisions: 4, beatUnit: 4, measure: 1 }],
  };
}

export async function openRemixFile(arrayBuffer) {
  const zip = await readZip(arrayBuffer);
  let json = await zip.readText('remix.json');
  if (json == null) {
    if (zip.has('data.json')) throw new Error('RHRE2 の古い形式には未対応です');
    throw new Error('remix.json が見つかりません（RHRE fresh / RHRE3 の .rhref を選んでください）');
  }
  const remix = JSON.parse(json);
  let music = null;
  if (remix.musicData?.present && zip.has('music.bin')) {
    const filename = remix.musicData.filename || 'music';
    music = { bytes: await zip.read('music.bin'), filename, extension: remix.musicData.extension || filename.split('.').pop() || '' };
  }
  // テクスチャ（png）など、編集しないファイルは保存時にそのまま書き戻す
  const extraFiles = [];
  for (const name of zip.names) {
    if (name === 'remix.json' || name === 'music.bin' || name.endsWith('/')) continue;
    extraFiles.push({ name, data: await zip.read(name) });
  }
  return { remix, music, extraFiles };
}

const KNOWN_KEYS = new Set(['type', 'beat', 'track', 'width', 'height', 'datamodel', 'semitone', 'volume', 'stopAtEnd', 'isCustom', 'subtitle']);
const SOUNDLESS_SPECIAL = new Set(['endEntity', 'subtitleEntity', 'shakeEntity', 'textureEntity', 'tapeMeasure', 'playalongEntity', 'musicDistortEntity', 'pitchBenderEntity']);

export class Remix {
  constructor(raw, db) {
    this.db = db;
    this.model = new Model(db);
    this.load(raw);
  }

  load(raw) {
    this.raw = raw;
    this.trackCount = Math.max(1, Number(raw.trackCount) || 5);
    this.playbackStart = Number(raw.playbackStart || 0);
    this.musicStartSec = Number(raw.musicStartSec || 0);
    this.defaultTempo = Number(raw.defaultTempo) || 120;
    this.tempoTrackers = (raw.trackers?.tempos?.trackers || []).map((t) => ({
      beat: Number(t.beat), bpm: Number(t.bpm) || this.defaultTempo, width: Math.max(0, Number(t.width) || 0),
      swingRatio: t.swingRatio ?? 50, swingDivision: t.swingDivision ?? 1, isImmutable: !!t.isImmutable,
    }));
    this.musicVolumes = (raw.trackers?.musicVolumes?.trackers || [])
      .map((t) => ({ beat: Number(t.beat), width: Math.max(0, Number(t.width) || 0), volume: Number(t.volume ?? 100) }))
      .sort((a, b) => a.beat - b.beat);
    this.timeSignatures = (raw.timeSignatures || [])
      .map((t) => ({ beat: Number(t.beat), perMeasure: Math.max(1, Number(t.divisions) || 4), unit: Number(t.beatUnit) || 4 }))
      .sort((a, b) => a.beat - b.beat);
    if (!this.timeSignatures.length || this.timeSignatures[0].beat > 0) this.timeSignatures.unshift({ beat: 0, perMeasure: 4, unit: 4 });
    this.otherEntities = (raw.entities || []).filter((e) => !e.datamodel);
    this.entities = (raw.entities || []).filter((e) => e.datamodel).map((e) => this.entFromJSON(e));
    this.rebuild();
  }

  entFromJSON(e) {
    const extra = {};
    for (const k of Object.keys(e)) if (!KNOWN_KEYS.has(k)) extra[k] = e[k];
    return {
      id: e.datamodel,
      beat: Number(e.beat || 0),
      track: Number(e.track || 0) | 0,
      width: Number(e.width || 0),
      height: Math.max(1, Number(e.height || 1) | 0),
      semitone: Number(e.semitone || 0) | 0,
      volume: e.volume != null ? Number(e.volume) : 100,
      stopAtEnd: !!e.stopAtEnd,
      isCustom: !!e.isCustom,
      subtitle: e.subtitle,
      extra,
      flashAt: 0,
    };
  }

  entToJSON(ent) {
    const out = { type: 'model', ...ent.extra, beat: ent.beat, track: ent.track, width: ent.width, height: ent.height, datamodel: ent.id };
    if (!ent.o || !SOUNDLESS_SPECIAL.has(ent.o.type)) { out.semitone = ent.semitone; out.volume = ent.volume; }
    if (ent.stopAtEnd) out.stopAtEnd = true;
    if (ent.isCustom) out.isCustom = true;
    if (ent.subtitle != null) out.subtitle = ent.subtitle;
    return out;
  }

  // 表示・再生用の値を、編集できる値（id, beat, track, width…）から作り直す
  refreshEnt(ent) {
    const o = this.db.get(ent.id);
    ent.o = o || null;
    ent.type = o ? o.type : 'missing';
    ent.name = o ? cleanName(o.name) : ent.id;
    ent.game = o?.game || null;
    ent.leaves = [];
    if (o) this.model.expand(o, ent.beat, ent.track, ent.width, ent.semitone, ent.volume / 100, () => 0, ent.leaves, { stopAtEnd: ent.stopAtEnd });
    ent.minBeat = Math.min(ent.beat, ...ent.leaves.map((l) => l.beat));
    ent.maxBeat = Math.max(ent.beat + ent.width, ...ent.leaves.map((l) => l.beat + l.width));
  }

  rebuild() {
    this.model.clearCaches();
    this.tempo = new TempoMap(this.tempoTrackers, this.defaultTempo);
    this.missing = new Set();
    this.subtitles = [];
    let endBeat = null;
    let lastBeat = 0;
    for (const ent of this.entities) {
      this.refreshEnt(ent);
      if (!ent.o) this.missing.add(ent.id);
      if (ent.type === 'endEntity') endBeat = endBeat == null ? ent.beat : Math.min(endBeat, ent.beat);
      if (ent.type === 'subtitleEntity') this.subtitles.push(ent);
      lastBeat = Math.max(lastBeat, ent.maxBeat);
    }
    this.entities.sort((a, b) => a.beat - b.beat || a.track - b.track);
    this.endBeat = endBeat ?? lastBeat;
    this.hasEndEntity = endBeat != null;
    this.durationSec = this.tempo.b2s(this.endBeat);
  }

  // ---------------------------------------------------------------- 編集

  createEntity(o, beat, track) {
    const height = this.model.height(o, this.trackCount);
    const ent = this.entFromJSON({ datamodel: o.id, beat, track: Math.max(0, Math.min(track, this.trackCount - height)), width: this.model.defaultWidth(o), height });
    if (o.type === 'endEntity') ent.track = 0;
    this.refreshEnt(ent);
    return ent;
  }

  isStretchable(ent) { return this.model.stretchable(ent.o); }
  canRepitch(ent) { return ent.o?.type === 'cue' ? true : this.model.canRepitch(ent.o); }
  hasVolume(ent) { return this.model.hasSound(ent.o); }

  // 別のエンティティと重なるか（RHRE では重ねて置けない）
  collides(beat, track, width, height, ignore) {
    const EPS = 1e-6;
    const w = Math.max(width, 1e-4);
    if (track < 0 || track + height > this.trackCount) return true;
    for (const e of this.entities) {
      if (ignore && ignore.has(e)) continue;
      const ew = Math.max(e.width, 1e-4);
      if (beat < e.beat + ew - EPS && e.beat < beat + w - EPS && track < e.track + e.height && e.track < track + height) return true;
    }
    return false;
  }

  tempoMarkerNear(beat, tolBeats) {
    let best = null;
    for (const t of this.tempoTrackers) {
      const d = Math.abs(t.beat - beat);
      if (d <= tolBeats && (!best || d < Math.abs(best.beat - beat))) best = t;
    }
    return best;
  }

  setTempo(beat, bpm) {
    const t = this.tempoTrackers.find((x) => Math.abs(x.beat - beat) < 1e-6);
    if (t) t.bpm = bpm;
    else this.tempoTrackers.push({ beat, bpm, width: 0, swingRatio: 50, swingDivision: 1, isImmutable: false });
    this.tempoTrackers.sort((a, b) => a.beat - b.beat);
    if (t?.isImmutable || Math.abs(beat) < 1e-6) this.defaultTempo = bpm;
  }

  removeTempo(beat) {
    this.tempoTrackers = this.tempoTrackers.filter((x) => !(Math.abs(x.beat - beat) < 1e-6 && !x.isImmutable));
  }

  // 元に戻す用の写し
  snapshot() {
    return JSON.stringify({
      entities: this.entities.map((e) => this.entToJSON(e)),
      tempoTrackers: this.tempoTrackers,
      musicVolumes: this.musicVolumes,
      playbackStart: this.playbackStart,
      musicStartSec: this.musicStartSec,
      defaultTempo: this.defaultTempo,
      trackCount: this.trackCount,
    });
  }

  restore(str) {
    const s = JSON.parse(str);
    this.entities = s.entities.map((e) => this.entFromJSON(e));
    this.tempoTrackers = s.tempoTrackers;
    this.musicVolumes = s.musicVolumes;
    this.playbackStart = s.playbackStart;
    this.musicStartSec = s.musicStartSec;
    this.defaultTempo = s.defaultTempo;
    this.trackCount = s.trackCount;
    this.rebuild();
  }

  // ---------------------------------------------------------------- 保存（RHRE fresh の Remix.toJson と同じ形）

  toJSON(music) {
    const T = this.tempo;
    const out = { ...this.raw };
    out.version = this.raw.version || 'v4.0.1';
    out.databaseVersion = this.raw.databaseVersion ?? DEFAULT_DB_VERSION;
    out.databaseVersionCommit = this.raw.databaseVersionCommit || this.db.commit;
    out.wasDevBranch = !!this.raw.wasDevBranch;
    out.playbackStart = this.playbackStart;
    out.musicStartSec = this.musicStartSec;
    out.defaultTempo = this.defaultTempo;
    out.trackCount = this.trackCount;
    out.isAutosave = false;
    out.midiInstruments = this.raw.midiInstruments ?? 0;
    out.musicData = music ? { present: true, filename: music.filename, extension: music.extension } : { present: false };
    out.textures = this.raw.textures || [];
    out.entities = [...this.entities.map((e) => this.entToJSON(e)), ...this.otherEntities];
    out.trackers = {
      ...(this.raw.trackers || {}),
      tempos: {
        trackers: [...this.tempoTrackers].sort((a, b) => a.beat - b.beat).map((t) => ({
          beat: t.beat, seconds: T.b2s(t.beat), bpm: t.bpm, width: t.width,
          swingRatio: t.swingRatio, swingDivision: t.swingDivision, isImmutable: !!t.isImmutable,
        })),
      },
      musicVolumes: { trackers: this.musicVolumes.map((m) => ({ beat: m.beat, width: m.width, volume: m.volume })) },
    };
    out.timeSignatures = this.timeSignatures.map((t) => ({ beat: t.beat, divisions: t.perMeasure, beatUnit: t.unit, measure: this.measureAt(t.beat).measure }));
    return out;
  }

  // ---------------------------------------------------------------- 再生用

  // 使う可能性のあるすべての音（ランダム候補・イントロ・エンディングも含む）
  allSoundCues() {
    const out = new Map();
    for (const e of this.entities) for (const u of this.soundUrlsOf(e.o)) out.set(u, true);
    return out;
  }

  // 再生（または書き出し）ごとに作り直す。randomCue は毎回選び直す（RHRE と同じ）
  buildSoundEvents(rng = Math.random) {
    const events = [];
    for (const ent of this.entities) {
      if (!ent.o) continue;
      const leaves = [];
      this.model.expand(ent.o, ent.beat, ent.track, ent.width, ent.semitone, ent.volume / 100, rng, leaves, { stopAtEnd: ent.stopAtEnd });
      for (const lf of leaves) leafToEvents(lf, this.tempo, this.db, rng, ent, events);
    }
    events.sort((a, b) => a.start - b.start);
    return events;
  }

  // ピッカーの試聴用：1つのデータモデルを一定テンポで鳴らすイベント
  previewEvents(o, bpm) {
    const tempo = new TempoMap([{ beat: 0, bpm }], bpm);
    const w = this.model.defaultWidth(o);
    const leaves = [];
    this.model.expand(o, 0, 0, w, 0, 1, Math.random, leaves);
    const events = [];
    for (const lf of leaves) leafToEvents(lf, tempo, this.db, Math.random, null, events);
    const shift = Math.min(0, ...events.map((e) => e.start));
    for (const e of events) { e.start -= shift; e.end -= shift; }
    return events.sort((a, b) => a.start - b.start);
  }

  soundUrlsOf(o) {
    const urls = new Set();
    const visit = (x, seen = new Set()) => {
      if (!x || seen.has(x.id)) return;
      seen.add(x.id);
      if (x.type === 'cue') {
        urls.add(this.db.soundUrl(x));
        for (const s of [x.introSound, x.endingSound]) { const so = s && this.db.get(s); if (so?.type === 'cue') urls.add(this.db.soundUrl(so)); }
      } else if (isMulti(x)) for (const c of this.model.options(x)) visit(this.db.get(c.id), seen);
    };
    visit(o);
    return [...urls];
  }

  musicVolumeAutomation() {
    // RHRE の MusicVolumes.volumeAt と同じ形の折れ線（秒, 音量0〜）
    const pts = [];
    let prev = 100;
    for (const mv of this.musicVolumes) {
      const t0 = this.tempo.b2s(mv.beat);
      pts.push({ t: t0, v: prev / 100, ramp: false });
      if (mv.width > 0) pts.push({ t: this.tempo.b2s(mv.beat + mv.width), v: mv.volume / 100, ramp: true });
      else pts.push({ t: t0, v: mv.volume / 100, ramp: false });
      prev = mv.volume;
    }
    return pts;
  }

  musicVolumeAt(beat) {
    // RHRE: 直前（厳密に前）の音量変更点で決まる。幅があれば直線で変わる
    let cur = null, prevVol = 100;
    for (const mv of this.musicVolumes) {
      if (mv.beat < beat) { if (cur) prevVol = cur.volume; cur = mv; } else break;
    }
    if (!cur) return 1;
    if (cur.width > 0 && beat <= cur.beat + cur.width) return lerp(prevVol / 100, cur.volume / 100, (beat - cur.beat) / cur.width);
    return cur.volume / 100;
  }

  measureAt(beat) {
    // 拍 → 小節番号（1始まり）と小節内の拍
    let measure = 1;
    const ts = this.timeSignatures;
    for (let i = 0; i < ts.length; i++) {
      const cur = ts[i];
      const next = ts[i + 1];
      if (next && beat >= next.beat) {
        measure += Math.ceil((next.beat - cur.beat) / cur.perMeasure - 1e-9);
        continue;
      }
      const rel = beat - cur.beat;
      const m = Math.floor(rel / cur.perMeasure);
      return { measure: measure + m, beatInMeasure: rel - m * cur.perMeasure, perMeasure: cur.perMeasure };
    }
    return { measure: 1, beatInMeasure: beat, perMeasure: 4 };
  }
}

// 開く: .rhref のバイト列から。ensureAll でデータベースの必要な分も読み込む
export async function loadRemix(arrayBuffer, { onStatus } = {}) {
  const { remix, music, extraFiles } = await openRemixFile(arrayBuffer);
  const r = await loadRemixJSON(remix, { onStatus });
  return { ...r, music, extraFiles };
}

export async function loadRemixJSON(json, { onStatus } = {}) {
  const db = new SFXDatabase(json.databaseVersionCommit || DEFAULT_DB_COMMIT);
  const ids = (json.entities || []).map((e) => e.datamodel).filter(Boolean);
  onStatus?.('データベースを読み込み中…', 0);
  const missing = await db.ensureAll(ids, (done, total, g) => onStatus?.(`ミニゲームの定義を読み込み中 ${done}/${total}（${g}）`, total ? done / total : 1));
  return { remix: new Remix(json, db), missing };
}
