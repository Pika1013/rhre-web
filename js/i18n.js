// 画面の言葉の切り替え（日本語 ⇄ English）。
// 日本語の文をそのままキーにして、英語があれば置き換える。{n} などは差し込み。

const EN = {
  // チュートリアル
  '戻る': 'Back', '次へ': 'Next', 'はじめる': 'Start',
  'RHRE Web へようこそ！': 'Welcome to RHRE Web!',
  'リズム天国のリミックスを、スマホやブラウザで作れるエディタです。基本の使い方を順番に紹介します。左上の ✕ でいつでもやめられます。': 'An editor for making Rhythm Heaven remixes on your phone or in a browser. Here is a quick tour of the basics. Tap ✕ at the top left to stop at any time.',
  'トラック': 'Tracks',
  'ここにブロック（キュー）を並べてリミックスを作ります。指で左右になぞるとスクロール、2 本指で広げたりつまんだりすると拡大・縮小です。': 'Place blocks (cues) here to build your remix. Swipe sideways to scroll; pinch with two fingers to zoom.',
  'ゲームを選ぶ': 'Choose a game',
  '下のタブ（GBA・DS・Wii など）からミニゲームを選ぶと、右にパターンが並びます。お気に入り・最近使ったもの・検索もここです。': 'Pick a minigame from the tabs (GBA, DS, Wii…) and its patterns appear on the right. Favorites, recent and search are here too.',
  '一覧が閉じているときは、左下の「ゲームを選ぶ」を押すと開きます。': 'If the list is closed, tap "Choose a game" at the bottom left to open it.',
  '置き方': 'Placing',
  'パターンの名前を押して選んでから、トラックの空いている所をタップすると置けます。🔊 を押すと音を確かめられます。': 'Tap a pattern name, then tap an empty spot on the tracks to place it. Tap 🔊 to preview the sound.',
  '編集バー': 'Edit bar',
  '置いたブロックをタップすると、上に編集バーが出ます。ブロックはドラッグで移動、端をドラッグで長さを変更。削除・複製・音程・音量もここで変えられます。空いている所を長押しすると、範囲でまとめて選べます。': 'Tap a block to show the edit bar at the top. Drag a block to move it, or drag its edge to resize. Delete, duplicate, pitch and volume are here. Long-press an empty spot to select an area.',
  '再生': 'Playback',
  '▶ で再生、⏸ で一時停止、■ で停止です。再生中は黄色い線が今の位置を示します。横の数字は時間と拍、虹色のつまみは再生速度です。': '▶ plays, ⏸ pauses and ■ stops. A yellow line shows the current position. Next to it are the time, the beat, and the rainbow playback-speed knob.',
  '音楽と再生の旗': 'Music and playback flags',
  '赤い旗は音楽が始まる位置、緑の旗は再生を始める位置です。どちらも横にドラッグして動かせます。上の目盛りをタップしても、再生を始める位置を変えられます。': 'The red flag is where the music starts; the green flag is where playback starts. Drag either sideways. Tapping the ruler also moves the playback start.',
  'テンポ・拍子・音量': 'Tempo, time signature, volume',
  'トラックの下の段をタップすると、テンポ・拍子・音楽の音量を変えられます。印は長押ししてからドラッグで動かせます。大きな拍子の数字をタップすると、その場で書きかえられます。': 'Tap the row under the tracks to change tempo, time signature or music volume. Long-press a marker, then drag to move it. Tap the big time-signature numbers to edit them in place.',
  'スナップ': 'Snap',
  'ブロックを置く・動かすときの目盛りの細かさです。1 拍から 1/32 拍まで選べます。': 'How finely blocks snap when placing or moving: from 1 beat down to 1/32.',
  'メニュー': 'Menu',
  '保存・開く・音楽を選ぶ・WAV に書き出す・トラックの数・プレゼンテーション・プレイモードなどはここです。このチュートリアルも、ここからもう一度見られます。': 'Save, open, choose music, export WAV, track count, presentation and play mode live here. You can replay this tutorial from here too.',
  '設定': 'Settings',
  'ミニゲームの声の言語、テーマの色、背景の画像、画面の言語などを変えられます。': 'Change the minigame voice language, theme colors, background image, interface language and more.',
  '準備完了！': "You're all set!",
  '作ったリミックスは自動で端末に保存されます。RHRE fresh で開ける .rhref にも保存できます。さっそく作ってみましょう！': 'Your remix is saved on this device automatically, and you can also save a .rhref that opens in RHRE fresh. Have fun!',
  // タブ・ピッカー
  'GBA': 'GBA', 'DS': 'DS', 'Wii': 'Wii', '3DS': '3DS', 'Groove': 'Groove', 'サイド': 'Side', 'その他': 'Other', '特殊': 'Special',
  '使用中': 'In use', 'お気に入り': 'Favorites', '最近': 'Recent', 'カスタム': 'Custom', '検索': 'Search', 'パターン': 'Patterns',
  '終わり・字幕・画像': 'End, subtitles, images',
  'パターン一覧の上の ☆ を押すと、ここに並びます。': 'Tap ☆ above the pattern list to add a game here.',
  '置いたミニゲームが、ここに新しい順で並びます。': 'Games you place show up here, newest first.',
  'お気に入りから外す': 'Remove from favorites', 'お気に入りに入れる': 'Add to favorites',
  'まだ何も置いていません。上のタブからミニゲームを選んでください。': 'Nothing placed yet. Pick a minigame from the tabs above.',
  '見つかりませんでした。': 'No matches.', '表示できる項目がありません。': 'Nothing to show.',
  'ミニゲームを選ぶと、パターンが並びます。名前を押してからトラックの空いている所をタップすると置けます。🔊で試聴できます。':
    'Pick a minigame to list its patterns. Tap a name, then tap an empty spot on a track to place it. 🔊 previews it.',
  'パターン': 'Pattern', '繰り返し': 'Repeat', '等間隔': 'Equidistant', 'ランダム': 'Random', '複合': 'Multi', '音程別': 'By pitch',
  '終わり': 'End', '字幕': 'Subtitle', '画像': 'Image',
  // 編集バー
  '個': 'selected', '音程': 'Pitch', '音量': 'Volume', '複数選択': 'Multi-select', '文字を編集': 'Edit text', '画像を選ぶ': 'Choose image',
  'コピー': 'Copy', '貼り付け': 'Paste', '分解': 'Split', '削除': 'Delete', '複製': 'Duplicate',
  '選択をやめる': 'Deselect', '元に戻す': 'Undo', 'やり直す': 'Redo', 'その他の操作': 'More actions',
  // ステータス・お知らせ
  '置きました': 'Placed', '{n} 個を選択中': '{n} selected', '{n} 個を削除しました（元に戻すボタンで戻せます）': 'Deleted {n} (undo to restore)',
  '{n} 個を複製しました': 'Duplicated {n}', '{n} 個をコピーしました。貼り付ける場所をタップしてください': 'Copied {n}. Tap where to paste.',
  '貼り付ける場所をタップしてください（続けて貼れます）': 'Tap where to paste (you can paste repeatedly)',
  '{n} 個を貼り付けました': 'Pasted {n}', '{n} 個に分けました': 'Split into {n} blocks',
  'ほかのブロックと重なるので置けません': "Can't place: it overlaps another block",
  'ほかのブロックと重なるので動かせません': "Can't move: it would overlap another block",
  'ほかのブロックと重なるので貼り付けられません': "Can't paste: it would overlap another block",
  '分けると、ほかのブロックと重なります': 'Splitting would overlap another block',
  'このブロックは分けられません': "This block can't be split",
  '再生中は編集できません。■ で止めてから編集してください。': "You can't edit while playing. Press ■ to stop first.",
  '選んだブロックは音程を変えられません': "The selected block's pitch can't be changed",
  '選んだブロックは音量を変えられません': "The selected block's volume can't be changed",
  '複製を置ける空きが見つかりませんでした': 'No free space found for the duplicate',
  'トラックの空いている所をタップ': 'tap an empty spot on a track',
  '「{name}」を置く：トラックの空いている所をタップ': 'Place "{name}": tap an empty spot on a track',
  '{name} ／ 名前を押してから、トラックの空いている所をタップすると置けます': '{name} / tap a name, then tap an empty spot on a track',
  '範囲を指でなぞって選んでください': 'Drag over an area to select blocks',
  'ミニゲーム {g} 種・ブロック {n} 個': '{g} games · {n} blocks', '拍 {b}': 'Beat {b}', '長さ {w}': 'Length {w}', '音程 {s}': 'Pitch {s}', '音量 {v}%': 'Volume {v}%',
  '音楽開始を {t} にしました（元に戻すボタンで戻せます）': 'Music start set to {t} (undo to restore)',
  '赤い旗（音楽開始）は、横にドラッグすると動かせます': 'Drag the red flag (music start) sideways to move it',
  '前回の続きを開きました（自動保存）': 'Reopened your last work (autosave)',
  '新しい版（試作 {v}）があります': 'A new version ({v}) is available', '更新する': 'Update', 'あとで': 'Later',
  // キャンバス
  '音楽開始': 'Music start', '再生開始': 'Playback start',
  '⏸ 一時停止': '⏸ Pause', '▶ 再生': '▶ Play', 'カスタム効果音': 'Custom sounds', '＋ 音声ファイルを追加': '+ Add audio files',
  '名前を「{n}」にしました': 'Renamed to "{n}".', '🎮 プレイアロング': '🎮 Playalong', 'プレイアロング（プレゼンテーションモードで遊べる）': 'Playalong (play it in presentation mode)',
  '置いたら、メニューの「プレゼンテーションモード」で遊べます': 'After placing them, play from Menu → Presentation mode.', '画面をタップ': 'Tap the screen',
  'すばらしい！': 'Superb!', 'もう少し…': 'Try again…', 'スコア': 'Score',
'ダーク': 'Dark', 'ブラック': 'Black', 'ライト': 'Light', 'ネイビー': 'Navy', 'オーシャン': 'Ocean',
  'フォレスト': 'Forest', 'パープル': 'Purple', 'ワイン': 'Wine', 'サンセット': 'Sunset', 'レトロ': 'Retro', 'さくら': 'Sakura', 'ミント': 'Mint',
  'レモン': 'Lemon', 'ラベンダー': 'Lavender', 'そら': 'Sky', '背景の画像を設定しました': 'Background image set.', '背景の画像を外しました': 'Background image removed.',
  'この画像は読み込めませんでした': "This image couldn't be loaded.",
'全画面に戻る': 'Back to full screen',
  '追加しました。ホーム画面（アプリ一覧）の RHRE Web から開くと、いつも全画面です。': 'Installed. Open RHRE Web from your home screen or app list for full screen.',
'押すと .rhref の名前を変えられます': 'Tap to rename the .rhref',
  // 拍子・テンポ・音量の画面
  'テンポの印をつかみました。左右に動かしてください': 'Tempo marker grabbed. Drag it left or right.',
  '音量の印をつかみました。左右に動かしてください': 'Volume marker grabbed. Drag it left or right.',
  'その位置にはもう印があります': 'There is already a marker there.',
  'テンポを拍 {b} に動かしました': 'Moved the tempo change to beat {b}.',
  '音量の変化を拍 {b} に動かしました': 'Moved the volume change to beat {b}.',
  '1小節の拍数を入れてください': 'Type the beats per measure.',
  '音符（2・4・8・16）を入れてください': 'Type the note value (2, 4, 8 or 16).',
  '拍数は 1〜64 の数で入れてください': 'Beats per measure must be 1 to 64.',
  '音符は 2・4・8・16 のどれかで入れてください': 'The note value must be 2, 4, 8 or 16.',
  '拍子を {n}/{u} にしました': 'Time signature set to {n}/{u}.',
  '印を長押しすると、左右に動かせます。': ' Long-press the marker to drag it.',
  '大きな数字をタップしても変えられます。': ' You can also tap the big numbers to change it.',
  'テンポ': 'Tempo', '拍子': 'Time signature', '音楽の音量': 'Music volume',
  '拍 {b} のテンポです。': 'Tempo at beat {b}.', '拍 {b} から、このテンポに変わります。': 'The tempo changes to this from beat {b}.',
  '最初のテンポなので削除はできません。': "It's the first tempo, so it can't be deleted.",
  '拍 {b} の拍子です。': 'Time signature at beat {b}.', '拍 {b} から、この拍子になります。': 'This time signature starts at beat {b}.',
  '最初の拍子なので削除はできません。': "It's the first time signature, so it can't be deleted.",
  '拍 {b} の音楽の音量です。': 'Music volume at beat {b}.', '拍 {b} から、音楽の音量が変わります。': 'The music volume changes from beat {b}.',
  'テンポは 5〜600 の数で入れてください': 'Enter a tempo from 5 to 600', '音量は 0〜200 の数で入れてください': 'Enter a volume from 0 to 200',
  // 特殊
  'トラックの数は 5〜10 です': 'Tracks: 5 to 10', 'はみ出すブロックがあるので、トラックを減らせません': "Can't remove tracks: some blocks would be cut off",
};

let lang = 'ja';

export function setLang(l) { lang = l === 'en' ? 'en' : 'ja'; }
export function getLang() { return lang; }

export function t(ja, vars) {
  let s = lang === 'en' && EN[ja] != null ? EN[ja] : ja;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

// 固定の文（HTML）を、元の日本語を覚えておいて切り替える
const STATIC_EN = {
  'メニュー': 'Menu', '新規作成': 'New', '開く（.rhref）': 'Open (.rhref)', 'サンプルを開く': 'Open sample', '保存（.rhref）': 'Save (.rhref)',
  'WAVに書き出す': 'Export WAV', '音楽を選ぶ': 'Choose music', '音楽の開始位置': 'Music start position', '音楽を外す': 'Remove music',
  'トラックの数': 'Number of tracks', 'プレゼンテーションモード': 'Presentation mode', '使い方': 'Help', '閉じる': 'Close',
  '決定': 'OK', '削除': 'Delete', 'やめる': 'Cancel', 'OK': 'OK', '設定': 'Settings',
  'ミニゲームの言語': 'Minigame language', '画面の言語': 'Interface language', '再生速度': 'Playback speed', 'テーマ': 'Theme',
  'ダーク': 'Dark', 'ブラック': 'Black', 'ライト': 'Light',
  '同じミニゲームで言語ごとに声が違うものは、1つのアイコンにまとめて、ここで選んだ言語を出します。その言語が無いゲームは標準の版を出します。パターン一覧の上のボタンで、ほかの言語にも切り替えられます。':
    'Minigames with per-language voices are grouped into one icon showing the language chosen here (or the default version). Switch languages with the buttons above the pattern list.',
  '再生速度は、テンポと音程の両方が変わります（デスクトップ版と同じ）。WAV の書き出しは常に 1.0 倍です。':
    'Playback speed changes both tempo and pitch (as in the desktop version). WAV export always uses 1.0×.',
  'ゲームを選ぶ': 'Choose game', '音楽の開始位置': 'Music start position',
  '曲の始まりを 0 拍目に合わせる': 'Align song start to beat 0', '緑の旗（再生開始位置）に合わせる': 'Align to the green flag',
  '音楽が鳴り始める時刻（秒）です。赤い旗をドラッグしても動かせます。': 'When the music starts (seconds). You can also drag the red flag.',
  '秒': 'sec', '♩=': '♩=', '変化にかける拍数': 'Ramp length (beats)', 'スウィング': 'Swing', '1小節の拍数': 'Beats per measure', '音符': 'Note value',
  'なし': 'None', '軽め': 'Light', '強め': 'Hard', '8分': '8th', '16分': '16th', '%': '%',
  '字幕の文字': 'Subtitle text', 'トラックの数（5〜10）': 'Tracks (5–10)', '保存': 'Save', '.rhref を保存': 'Save .rhref', 'WAVを保存': 'Save WAV',
  '準備中…': 'Loading…', 'リミックスを読み込んでいます。': 'Loading the remix.', '開けませんでした': "Couldn't open",
  'カスタム効果音': 'Custom sounds', '＋ 音声ファイルを追加': '+ Add audio files',
  '■ 終わる': '■ Exit', '⏸ 一時停止': '⏸ Pause', '▶ 再生': '▶ Play',
  '背景の画像': 'Background image', '画像を選ぶ': 'Choose image', '外す': 'Remove', '表示': 'Fit', '濃さ': 'Strength',
  '画面いっぱい': 'Fill the screen', '全体が見えるように': 'Show the whole image', '背景': 'Background', '線': 'Lines', 'アクセント': 'Accent',
  '終わる': 'Exit', '📖 チュートリアル': '📖 Tutorial', 'チュートリアルをやめる': 'Close the tutorial', '戻る': 'Back', '次へ': 'Next', 'はじめる': 'Start',
'プレイモード': 'Play mode', 'プレイモード（ボタンのキューに合わせて押して遊ぶ）': 'Play mode (press along with the input cues)',
  'プレイモード：▶ で再生して、キューに合わせて押してください': 'Play mode: press ▶ and hit the inputs in time.',
  '置くとトラックの一番下に入ります。左上のメニューの「プレイモード」で遊べます': 'Inputs go on the bottom track. Start Play mode from the menu at the top left.',
  '🎮 プレイモード': '🎮 Play mode', '🎮 プレイモードをやめる': '🎮 Exit play mode', '✕ やめる': '✕ Exit', 'プレイモードをやめる': 'Exit play mode',
'プレイアロング': 'Playalong', 'タイミング調整': 'Timing offset', 'もう一度': 'Retry',
  '音が遅れて聞こえる（Bluetooth イヤホンなど）ときはプラスにします。パソコンのキーボードでは A＝J かスペース、B＝K、十字＝矢印キーです。': 'Use a plus value if the sound reaches you late (Bluetooth earphones etc.). On a keyboard: A = J or Space, B = K, D-pad = arrow keys.',
'ゲーム一覧の高さ': 'Game list height', 'ドラッグで高さを変える（ダブルタップで元に戻す）': 'Drag to resize (double-tap to reset)', '💾 保存': '💾 Save', 'ホーム画面に追加して使ってください': 'Add to your Home Screen to use it', '全画面で使う': 'Use in full screen',
  '全画面で始める': 'Start in full screen', '📲 アプリとして追加': '📲 Install as an app', '作業中のリミックスを .rhref で保存': 'Save the current remix as .rhref',
'名前を決めて保存します。RHRE fresh でそのまま開けます。': 'Name it and save. It opens as-is in RHRE fresh.', '名前を変える': 'Rename', '保存するときの .rhref の名前です。': 'The name used when saving the .rhref.',
  '📄 新規作成': '📄 New', '📂 開く（.rhref）': '📂 Open (.rhref)', '🎵 サンプルを開く': '🎵 Open sample', '💾 保存（.rhref）': '💾 Save (.rhref)',
  '⬇️ WAVに書き出す': '⬇️ Export WAV', '🎼 音楽を選ぶ': '🎼 Choose music', '⏱ 音楽の開始位置': '⏱ Music start position', '✖️ 音楽を外す': '✖️ Remove music',
  '☰ トラックの数': '☰ Number of tracks', '🖥 プレゼンテーションモード': '🖥 Presentation mode', '❔ 使い方': '❔ Help',
  'テンポ': 'Tempo', '拍子': 'Time signature', '音楽の音量': 'Music volume', 'スウィング': 'Swing', '新規作成': 'New', 'サンプルを開く': 'Open sample', '開く': 'Open', '外す': 'Remove',
};

export function applyStatic(root = document.body) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    if (n.parentElement?.closest('script, style, #list, #gameGrid, #statusText, #toast, #loadMsg, #loadTitle, #helpModal ul, #helpModal p')) continue;
    const raw = n.nodeValue;
    const key = raw.trim();
    if (!key) continue;
    if (n.__ja == null) {
      if (STATIC_EN[key] == null && !Object.values(STATIC_EN).includes(key)) continue;
      n.__ja = STATIC_EN[key] != null ? key : Object.keys(STATIC_EN).find((k) => STATIC_EN[k] === key);
    }
    const target = lang === 'en' ? STATIC_EN[n.__ja] : n.__ja;
    n.nodeValue = raw.replace(key, target);
  }
  for (const el of root.querySelectorAll('[title], [aria-label], [placeholder]')) {
    for (const attr of ['title', 'aria-label', 'placeholder']) {
      const v = el.getAttribute(attr);
      if (!v) continue;
      const jaKey = `data-ja-${attr}`;
      if (!el.hasAttribute(jaKey)) el.setAttribute(jaKey, v);
      const ja = el.getAttribute(jaKey);
      const en = STATIC_EN[ja] || EN[ja] || ATTR_EN[ja];
      el.setAttribute(attr, lang === 'en' && en ? en : ja);
    }
  }
}

const ATTR_EN = {
  'メニュー（新規・開く・保存・音楽など）': 'Menu (new, open, save, music…)', '新規': 'New', '開く（.rhref）': 'Open (.rhref)', '保存（.rhref）': 'Save (.rhref)',
  '元に戻す（Ctrl+Z）': 'Undo (Ctrl+Z)', 'やり直す（Ctrl+Shift+Z）': 'Redo (Ctrl+Shift+Z)', 'メトロノーム': 'Metronome',
  'スナップ（置く・動かす間隔）': 'Snap (placing and moving grid)', '一時停止': 'Pause', '再生（スペース）': 'Play (Space)', '再生': 'Play', '停止': 'Stop',
  '全画面': 'Fullscreen', '使い方': 'Help', '設定': 'Settings', 'ゲーム一覧を隠す／出す': 'Show/hide the game list',
  'ミニゲームを検索': 'Search minigames', '検索': 'Search', 'トラック': 'Tracks',
  '再生速度（ダブルタップで 1.0 に戻す）': 'Playback speed (double-tap to reset to 1.0)', '再生速度': 'Playback speed',
};
