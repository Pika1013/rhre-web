// プレイアロング：トラックに「ボタンを押すキュー」を置いて、プレゼンテーションモードで実際に遊ぶ。
// .rhref に入る ID・入力の種類・押し方は RHRE fresh と同じにしてある（デスクトップ版でもそのまま開ける）。

export const PLAYALONG_GAME_ID = 'specialPlayalong';

// 押し方：press＝押す瞬間 / hold＝押して終わりで離す / long＝終わりまで押し続ける / releaseHold＝離して終わりで押し直す / release＝離す瞬間
export const METHOD = {
  PRESS: { instant: true, release: false },
  PRESS_AND_HOLD: { instant: false, release: false },
  LONG_PRESS: { instant: false, release: false },
  RELEASE_AND_HOLD: { instant: false, release: true },
  RELEASE: { instant: true, release: true },
};

// 入力の種類 → 押せるキー（A・B・十字の各方向・タッチ・フリック・スライド）と、トラックに描く記号
const DIRS = ['UP', 'DOWN', 'LEFT', 'RIGHT'];
export const INPUT = {
  BUTTON_A: { keys: ['A'], glyph: 'A' },
  BUTTON_B: { keys: ['B'], glyph: 'B' },
  BUTTON_DPAD: { keys: DIRS, glyph: '+' },
  BUTTON_A_OR_DPAD: { keys: ['A', ...DIRS], glyph: 'A/+' },
  BUTTON_DPAD_UP: { keys: ['UP'], glyph: '+↑' },
  BUTTON_DPAD_DOWN: { keys: ['DOWN'], glyph: '+↓' },
  BUTTON_DPAD_LEFT: { keys: ['LEFT'], glyph: '+←' },
  BUTTON_DPAD_RIGHT: { keys: ['RIGHT'], glyph: '+→' },
  TOUCH_TAP: { keys: ['TOUCH'], glyph: 'タップ', touch: true },
  TOUCH_FLICK: { keys: ['FLICK'], glyph: 'フリック', touch: true },
  TOUCH_RELEASE: { keys: ['TOUCH'], glyph: '離す', touch: true },
  TOUCH_QUICK_TAP: { keys: ['TOUCH'], glyph: 'クイック', touch: true },
  TOUCH_SLIDE: { keys: ['SLIDE'], glyph: 'スライド', touch: true },
};

// [ID の後ろ, 名前, 入力, 押し方, 伸ばせるか]
const DEFS = [
  ['press_A', 'A を押す', 'BUTTON_A', 'PRESS', false],
  ['press_B', 'B を押す', 'BUTTON_B', 'PRESS', false],
  ['press_A_or_Dpad', 'A か十字を押す', 'BUTTON_A_OR_DPAD', 'PRESS', false],
  ['press_Dpad', '十字を押す', 'BUTTON_DPAD', 'PRESS', false],
  ['press_Dpad_up', '十字↑を押す', 'BUTTON_DPAD_UP', 'PRESS', false],
  ['press_Dpad_down', '十字↓を押す', 'BUTTON_DPAD_DOWN', 'PRESS', false],
  ['press_Dpad_left', '十字←を押す', 'BUTTON_DPAD_LEFT', 'PRESS', false],
  ['press_Dpad_right', '十字→を押す', 'BUTTON_DPAD_RIGHT', 'PRESS', false],
  ['hold_A', 'A を押して、終わりで離す', 'BUTTON_A', 'PRESS_AND_HOLD', true],
  ['hold_B', 'B を押して、終わりで離す', 'BUTTON_B', 'PRESS_AND_HOLD', true],
  ['hold_Dpad', '十字を押して、終わりで離す', 'BUTTON_DPAD', 'PRESS_AND_HOLD', true],
  ['releaseAndHold_A', 'A を離して、終わりで押す', 'BUTTON_A', 'RELEASE_AND_HOLD', true],
  ['releaseAndHold_Dpad', '十字を離して、終わりで押す', 'BUTTON_DPAD', 'RELEASE_AND_HOLD', true],
  ['longPress_A', 'A を長押し', 'BUTTON_A', 'LONG_PRESS', true],
  ['longPress_B', 'B を長押し', 'BUTTON_B', 'LONG_PRESS', true],
  ['longPress_A_or_Dpad', 'A か十字を長押し', 'BUTTON_A_OR_DPAD', 'LONG_PRESS', true],
  ['longPress_Dpad', '十字を長押し', 'BUTTON_DPAD', 'LONG_PRESS', true],
  ['longPress_Dpad_up', '十字↑を長押し', 'BUTTON_DPAD_UP', 'LONG_PRESS', true],
  ['longPress_Dpad_down', '十字↓を長押し', 'BUTTON_DPAD_DOWN', 'LONG_PRESS', true],
  ['longPress_Dpad_left', '十字←を長押し', 'BUTTON_DPAD_LEFT', 'LONG_PRESS', true],
  ['longPress_Dpad_right', '十字→を長押し', 'BUTTON_DPAD_RIGHT', 'LONG_PRESS', true],
  ['touch_tap', 'タップ', 'TOUCH_TAP', 'PRESS', false],
  ['touch_flick', 'フリック', 'TOUCH_FLICK', 'PRESS', false],
  ['touch_slide', 'スライド', 'TOUCH_SLIDE', 'PRESS', false],
  ['touch_quick_tap', 'クイックタップ（離す瞬間）', 'TOUCH_QUICK_TAP', 'RELEASE', false],
  ['touch_tap_and_hold', 'タップして、終わりで離す', 'TOUCH_TAP', 'PRESS_AND_HOLD', true],
  ['touch_release_and_tap', '離して、終わりでタップ', 'TOUCH_RELEASE', 'RELEASE_AND_HOLD', true],
  ['longTap', 'タップを長押し', 'TOUCH_TAP', 'LONG_PRESS', true],
];

// データベースに足す「プレイアロング」のゲーム（どのコミットのデータベースにも入っていない、エディタ側のもの）
export function makePlayalongGame() {
  const game = { id: PLAYALONG_GAME_ID, name: 'プレイアロング', series: 'other', icon: null, objects: [], builtin: true };
  for (const [suffix, name, input, method, stretchable] of DEFS) {
    game.objects.push({
      id: `${PLAYALONG_GAME_ID}_${suffix}`,
      name,
      type: 'playalongEntity',
      input,
      method,
      stretchable,
      duration: METHOD[method].instant ? 0.5 : 1,
      game,
    });
  }
  return game;
}

// 判定の幅（秒）。RHRE fresh と同じ：ばっちり 1/60、よい 5/60、ぎりぎり 7.5/60、それより外はミス（受け付けは 9/60 まで）
export const WINDOW = { ACE: 1 / 60, GOOD: 5 / 60, BARELY: 7.5 / 60, MAX: 9 / 60 };
export const WEIGHT = { ACE: 1, GOOD: 0.85, BARELY: 0.6, MISS: 0 };
const timingOf = (off) => {
  const a = Math.abs(off);
  if (a > WINDOW.MAX) return 'MISS';
  if (a <= WINDOW.ACE) return 'ACE';
  if (a <= WINDOW.GOOD) return 'GOOD';
  if (a <= WINDOW.BARELY) return 'BARELY';
  return 'MISS';
};

export const hasPlayalong = (remix) => remix.entities.some((e) => e.o?.type === 'playalongEntity');

// 判定する係。時間はリミックスの秒（再生速度を変えているときは、判定の幅もその分だけ広げる）
export class PlayalongJudge {
  constructor(remix, speed = 1) {
    this.speed = speed;
    this.actions = remix.entities
      .filter((e) => e.o?.type === 'playalongEntity')
      .map((e) => ({
        ent: e,
        input: INPUT[e.o.input] || INPUT.BUTTON_A,
        method: e.o.method,
        instant: METHOD[e.o.method]?.instant ?? true,
        start: remix.tempo.b2s(e.beat),
        end: remix.tempo.b2s(e.beat + e.width),
        results: [],
        done: false,
      }))
      .sort((a, b) => a.start - b.start);
    this.inProgress = new Map(); // action → 押しているキー
    this.counts = { ACE: 0, GOOD: 0, BARELY: 0, MISS: 0 };
    this.expected = this.actions.reduce((n, a) => n + (a.instant ? 1 : 2), 0);
    this.perfect = true;
    this.onJudge = null; // (action, timing, isEnd) => void
    this.lastEnd = this.actions.length ? Math.max(...this.actions.map((a) => (a.instant ? a.start : a.end))) : 0;
  }

  get maxWin() { return WINDOW.MAX * this.speed; }

  get score() {
    if (!this.expected) return 0;
    let s = 0;
    for (const a of this.actions) for (const r of a.results) s += WEIGHT[r.timing];
    return Math.min(100, (s / this.expected) * 100);
  }

  get allDone() { return this.actions.every((a) => a.done); }

  record(a, off, isEnd, forced) {
    const timing = forced || timingOf(off / this.speed);
    a.results.push({ timing, off, isEnd });
    this.counts[timing]++;
    if (timing === 'MISS') this.perfect = false;
    this.onJudge?.(a, timing, isEnd);
  }

  find(t, key, wantRelease) {
    for (const a of this.actions) {
      if (a.done || a.results.length || this.inProgress.has(a)) continue;
      if (a.start - t > this.maxWin) break;
      if (Math.abs(t - a.start) > this.maxWin) continue;
      if (!a.input.keys.includes(key)) continue;
      if (!!METHOD[a.method]?.release !== wantRelease) continue;
      return a;
    }
    return null;
  }

  press(key, t) {
    // 「離して、終わりで押す」の終わり
    for (const [a, k] of this.inProgress) {
      if (k === key && a.method === 'RELEASE_AND_HOLD') {
        this.inProgress.delete(a);
        a.done = true;
        this.record(a, t - a.end, true);
        return;
      }
    }
    const a = this.find(t, key, false);
    if (!a) return;
    this.record(a, t - a.start, false);
    if (a.method === 'PRESS') a.done = true;
    else this.inProgress.set(a, key);
  }

  release(key, t) {
    // 押しっぱなしの終わり
    for (const [a, k] of this.inProgress) {
      if (k !== key || (a.method !== 'PRESS_AND_HOLD' && a.method !== 'LONG_PRESS')) continue;
      this.inProgress.delete(a);
      a.done = true;
      let off = t - a.end;
      if (a.method === 'LONG_PRESS' && off > 0) off = 0;
      this.record(a, off, true);
    }
    const a = this.find(t, key, true);
    if (!a) return;
    this.record(a, t - a.start, false);
    if (a.method === 'RELEASE') a.done = true;
    else this.inProgress.set(a, key);
  }

  // 毎フレーム：時間切れのものをミス（長押しは終わりまで押し続けたらばっちり）
  update(t) {
    for (const [a] of this.inProgress) {
      if (a.method === 'LONG_PRESS' && t > a.end) { this.inProgress.delete(a); a.done = true; this.record(a, 0, true, 'ACE'); }
      else if (t > a.end + this.maxWin) { this.inProgress.delete(a); a.done = true; this.record(a, t - a.end, true, 'MISS'); }
    }
    for (const a of this.actions) {
      if (a.start - t > this.maxWin) break;
      if (a.done || a.results.length || this.inProgress.has(a)) continue;
      if (t > a.start + this.maxWin) {
        a.done = true;
        this.record(a, t - a.start, false, 'MISS');
        if (!a.instant) this.record(a, 0, true, 'MISS');
      }
    }
  }

  // 再生を途中から始めたときは、それより前のものは数えない
  skipBefore(t) {
    for (const a of this.actions) {
      if (a.start < t - 1e-6) { a.done = true; a.skipped = true; this.expected -= a.instant ? 1 : 2; }
    }
  }

  // どの操作が要るか（画面に出すボタンを決める）
  neededKeys() {
    const s = new Set();
    for (const a of this.actions) for (const k of a.input.keys) s.add(k);
    return s;
  }
}
