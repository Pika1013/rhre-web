// 更新内容（新しい版を先頭に）。版を上げるたびに、ここの先頭に日本語（ja）と英語（en）で足す。
// アップデートのあとに開くと「アップデートしました！」のお知らせが出て、前に見た版より新しい分を見せる。
// 使う人に向けた短い言葉で書く。隠し機能は書かない
export const CHANGELOG = [
  {
    v: '1.9.1', date: '2026-11-11',
    ja: [
      'テンポの自動検出で、アウフタクト（小節の頭より前から鳴り始める）の曲は、2 小節目の頭から本編が始まるように音楽開始を合わせるようにしました（頭が切れないように）',
      'テンポの段の案内を「ここをタップでテンポ、拍子、音量を変更できます→」にして、文の終わりが -1 拍目に来るようにしました',
    ],
    en: [
      'Tempo auto-detect now handles songs that start with a pickup: the music start is set so the song proper begins at measure 2, so the pickup isn\'t cut off.',
      'The tempo row hint now reads "Tap here to change tempo, time signature and volume →" and ends at beat -1.',
    ],
  },
  {
    v: '1.9.0', date: '2026-11-11',
    ja: [
      '曲のテンポの「自動検出」を付けました（曲を選んだときのテンポの画面）。テンポは整数で見つけ、曲の途中で急に変わる所・だんだん変わる所には、テンポの変更も自動で置きます。倍や半分に聞こえるときは ×2・÷2 で直せます',
      'テンポの段の 0 拍目の手前に「ここをタップで音量、テンポ、拍子を変更できます」と小さく出すようにしました',
    ],
    en: [
      'Added tempo "Auto-detect" (on the song tempo screen). It finds the tempo as a whole number and also places tempo changes where the song suddenly or gradually changes tempo. Use ×2 / ÷2 if it sounds double or half.',
      'The tempo row now shows a small "Tap here to change volume, tempo and time signature" just before beat 0.',
    ],
  },
  {
    v: '1.8.5', date: '2026-11-11',
    ja: ['Guitar Lessons も、ギターの音（Assorted・Built to Scale・Glee Club）を各言語の一覧の一番下に並べました'],
    en: ['Guitar Lessons now also lists its guitar sounds (Assorted, Built to Scale, Glee Club) at the bottom of each language\'s list.'],
  },
  {
    v: '1.8.4', date: '2026-11-11',
    ja: [
      'DJ School の「Music Distortion」を置けるようにしました（パターンの下にあります）。その範囲だけ、音楽が細い音になります（RHRE fresh と同じ）',
      'Rockers のギターのコードなど、言語に関係ない音を、各言語の一覧の一番下に並べました',
      'どの効果音でも音程を変えられるようにしました（RHRE fresh の「Ignore pitch restrictions」と同じ）',
    ],
    en: [
      'You can now place DJ School\'s "Music Distortion" (below the patterns). The music sounds thin within its range, like in RHRE fresh.',
      'Rockers\' guitar chords and other language-independent sounds are now listed at the bottom of each language\'s list.',
      'You can now change the pitch of any sound effect (same as RHRE fresh\'s "Ignore pitch restrictions").',
    ],
  },
  {
    v: '1.8.3', date: '2026-11-11',
    ja: [
      '動画の書き出しが終わったら、進み具合のバーの場所に「動画を保存」ボタンが出るようにしました（小さい画面でボタンが隠れていたため）',
      '書き出した動画の右下に、小さく「RHRE Web」と版を入れるようにしました',
    ],
    en: [
      'When a video export finishes, the "Save video" button now appears where the progress bar was (it used to be hidden on small screens).',
      'Exported videos now show a small "RHRE Web" and version in the bottom right.',
    ],
  },
  {
    v: '1.8.2', date: '2026-11-11',
    ja: [
      '動画の左上に、今のゲームのアイコンと名前を出すようにしました（RHRE fresh と同じ）',
      '動画の再生位置の線の上に、テンポ・拍・時間を出すようにしました',
      '動画の最初のほうで、ブロックにゲームのアイコンが出ていなかったのを直しました',
    ],
    en: [
      'Videos now show the current game\'s icon and name in the top left, like RHRE fresh.',
      'Videos now show the tempo, beat and time above the playback line.',
      'Fixed game icons missing from blocks at the start of a video.',
    ],
  },
  {
    v: '1.8.1', date: '2026-11-11',
    ja: [
      'iPhone で書き出した動画に音が入っていなかったのを直しました',
      '動画の書き出しは、いつも 0 拍目から始まるようにしました。最初に 2 秒、止まった画面のまま待ってから再生します。動画には赤と緑の旗は出ません',
      'iPhone で「ファイルに保存」をすると、名前の書かれた .txt も一緒に保存されていたのを直しました',
    ],
    en: [
      'Fixed videos exported on iPhone having no sound.',
      'Video export now always starts from beat 0. It shows a still screen for 2 seconds before playback starts. The red and green flags are not shown in the video.',
      'Fixed an extra .txt file with the name being saved along with your file when using "Save to Files" on iPhone.',
    ],
  },
  {
    v: '1.8.0', date: '2026-11-11',
    ja: [
      '動画で書き出せるようになりました（メニューの「動画で書き出す」）。再生開始位置から最後までを、プレゼンテーションモードと同じ見た目の mp4 にします',
      'アップデートのあとに、何が変わったかをこの画面で見られるようになりました。メニューの「更新内容」からも、いつでも見られます',
    ],
    en: [
      'You can now export a video (menu → "Export video"). It turns your remix, from the playback start to the end, into an mp4 that looks like presentation mode.',
      'After an update, this screen now shows what changed. You can also open it any time from "What\'s new" in the menu.',
    ],
  },
  {
    v: '1.7.7', date: '2026-11-11',
    ja: ['「使い方」の説明を今の機能に合わせて書き直しました。英語の画面では英語の説明が出ます'],
    en: ['The Help screen now matches the current features, and it is in English when the screen language is English.'],
  },
  {
    v: '1.7.6', date: '2026-11-11',
    ja: ['ブロックの外まで音が続くもの（等間隔など）は、ブロックの外の部分を半透明にして、ブロック本体と見分けやすくしました'],
    en: ['For blocks whose sounds continue outside the block (equidistant patterns and so on), the part outside the block is now see-through, so the block itself is easier to tell apart.'],
  },
  {
    v: '1.7.5', date: '2026-11-11',
    ja: ['開いたままでも、新しい版が出たらお知らせが出るようになりました（再生中は止めてから）'],
    en: ['Even while the app stays open, you now get a notice when a new version is out (after you stop playback).'],
  },
  {
    v: '1.7.3', date: '2026-11-11',
    ja: [
      'ナイトモードの文字を小さくしました',
      '「前回の続きを開きました」などのお知らせは、タップするとすぐ消えます',
      'プレゼンテーションモードを始めても勝手に再生せず、再生位置を 0 拍目に戻すだけにしました。ブロックも薄くなりません',
    ],
    en: [
      'The Night Mode text is smaller.',
      'Notices such as "Opened where you left off" now disappear when you tap them.',
      'Starting presentation mode no longer starts playback. It just moves the playback position to beat 0, and blocks are no longer dimmed.',
    ],
  },
  {
    v: '1.7.2', date: '2026-11-11',
    ja: ['左右の端の移動ボタンを、画面の端ぎりぎりに寄せました。0 拍目に戻るボタンで、再生位置も 0 拍目になります'],
    en: ['The move buttons now sit right at the screen edges. The back-to-beat-0 button also moves the playback position to beat 0.'],
  },
  {
    v: '1.7.1', date: '2026-11-11',
    ja: ['プレイモードのボタンの丸は、いつもはトラックの真ん中に並べ、同じ拍に違うボタンがあるときだけ縦に並べるようにしました'],
    en: ['In play mode, button circles now line up in the middle of the tracks, and stack vertically only when different buttons share the same beat.'],
  },
  {
    v: '1.6.0', date: '2026-11-11',
    ja: [
      'プレイアロングで、違うボタンを同時に押すキュー（A と十字の左など）が両方とも判定されるようになりました',
      'メトロノームの音を RHRE fresh と同じカウベルにしました。メトロノームを入れている間は Play-Yan が跳ねます',
      'トラックの左右の端に、速く移動するボタンと 0 拍目に戻るボタンを付けました',
    ],
    en: [
      'In Playalong, cues for different buttons at the same time (such as A and D-pad left) are now both judged.',
      'The metronome now uses the same cowbell as RHRE fresh, and Play-Yan jumps while it is on.',
      'Added buttons at the left and right edges of the tracks to move quickly and to go back to beat 0.',
    ],
  },
];
