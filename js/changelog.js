// 更新内容（新しい版を先頭に）。版を上げるたびに、ここの先頭に日本語（ja）と英語（en）で足す。
// アップデートのあとに開くと「アップデートしました！」のお知らせが出て、前に見た版より新しい分を見せる。
// 使う人に向けた短い言葉で書く。隠し機能は書かない
export const CHANGELOG = [
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
