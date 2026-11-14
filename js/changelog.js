// 更新内容（新しい版を先頭に）。版を上げるたびに、ここの先頭に日本語（ja）と英語（en）で足す。
// アップデートのあとに開くと「アップデートしました！」のお知らせが出て、前に見た版より新しい分を見せる。
// 使う人に向けた短い言葉で書く。隠し機能は書かない
export const CHANGELOG = [
  {
    v: '1.10.0', date: '2026-11-14',
    ja: [
      'ゲーム名を日本語で出せるようになりました（例：Karate Man (GBA) → カラテ家 (GBA)）。設定の「ゲーム名」で、いつでも日本語と英語を切り替えられます',
      'ゲームの検索は、日本語の名前でもできます（ひらがなでもカタカナでも大丈夫です）',
    ],
    en: [
      'Minigame names can now be shown in Japanese (e.g. Karate Man (GBA) → カラテ家 (GBA)). Switch between Japanese and English any time under "Game names" in Settings.',
      'You can now search minigames by their Japanese names too.',
    ],
  },
  {
    v: '1.9.21', date: '2026-11-13',
    ja: ['プレゼンテーションモードの左上の「終わる」を、文字のない丸い ✕ ボタンにしました'],
    en: ['The Exit button at the top left of presentation mode is now a round ✕ button without text.'],
  },
  {
    v: '1.9.20', date: '2026-11-13',
    ja: [
      'プレゼンテーションモードで再生しているあいだ、左上に今のゲーム（アイコンと名前）を出すようにしました（RHRE fresh と同じ）',
      '英語の画面で、プレイアロングの項目の「ボタン」の札が日本語のままだったのを直しました。言語を切り替えたときに、一覧の見出しが前の言語のまま残ることがあったのも直しました',
    ],
    en: [
      'While playing in presentation mode, the current game (icon and name) now shows at the top left, like in RHRE fresh.',
      'Fixed the "Button" tag on Playalong items staying in Japanese on the English screen, and the list heading sometimes staying in the previous language after switching languages.',
    ],
  },
  {
    v: '1.9.19', date: '2026-11-13',
    ja: ['ブロックを選んでいるときに光る小節で、明るい縦線が 1 拍ごとに来るようにしました（今までは半拍の所の線が明るく、拍とずれて見えました）'],
    en: ['In the highlighted measure while a block is selected, the brighter vertical lines now fall on each beat (before, the half-beat lines were brighter and looked off the beat).'],
  },
  {
    v: '1.9.18', date: '2026-11-13',
    ja: ['リンクを貼ったときに出る画像を、日本語のページは日本語の画面、英語のページは英語の画面にしました'],
    en: ['The picture shown when you share a link now matches the page language (Japanese screen for the Japanese page, English screen for the English page).'],
  },
  {
    v: '1.9.17', date: '2026-11-13',
    ja: ['リンクを貼ったときに出る画像を変えました'],
    en: ['Changed the picture shown when you share a link to RHRE Web.'],
  },
  {
    v: '1.9.16', date: '2026-11-13',
    ja: [
      'X などに RHRE Web のリンクを貼ったときに、アプリの画面の大きな画像が出るようにしました',
      '英語で探す人向けの紹介ページを作りました（https://pika1013.github.io/rhre-web/en/）',
    ],
    en: [
      'Sharing a link to RHRE Web (on X and other sites) now shows a large picture of the app.',
      'Added an English introduction page (https://pika1013.github.io/rhre-web/en/).',
    ],
  },
  {
    v: '1.9.15', date: '2026-11-13',
    ja: ['Google などの検索に出る、RHRE Web の説明の文を変えました（アプリの使い方は変わりません）'],
    en: ['Changed the description of RHRE Web shown in Google and other search results (nothing changes in the app).'],
  },
  {
    v: '1.9.14', date: '2026-11-13',
    ja: ['Extra Sound Effects の一番下に「拡張音源」を足して、新しい効果音「Cleared! (Switch)」を入れました。RHRE Web だけの音なので、使ったリミックスを PC 版の RHRE fresh で開くと、その音は鳴りません（初めて置くときに注意が出ます）'],
    en: ['Added "Expansion sounds" at the bottom of Extra Sound Effects, with a new sound, "Cleared! (Switch)". It exists only in RHRE Web, so it will not play if you open the remix in RHRE fresh on PC (a notice appears the first time you place it).'],
  },
  {
    v: '1.9.13', date: '2026-11-12',
    ja: ['Google などで検索したときに見つけてもらいやすいように、ページに説明を足しました（アプリの使い方は変わりません）'],
    en: ['Added a description to the page so it is easier to find on Google and other search engines (nothing changes in the app).'],
  },
  {
    v: '1.9.12', date: '2026-11-12',
    ja: ['テンポの自動検出で置いたテンポの変更は、音楽開始（赤い旗）を動かすと、曲と一緒に動くようにしました。自分で置いた・直したテンポは動きません'],
    en: ['Tempo changes placed by tempo auto-detect now move with the song when you move the music start (red flag). Tempo changes you placed or edited yourself stay put.'],
  },
  {
    v: '1.9.11', date: '2026-11-12',
    ja: [
      'パーフェクトチャレンジの失敗の音を、途中から再生したときも鳴らすようにしました。プレイモードに入ったときに音を先に読み込んでおくので、すぐ鳴ります',
      'iPhone ではボタンを押したときの振動ができなかったので、外しました（Android はそのまま振動します）',
    ],
    en: [
      'The Perfect Challenge fail sound now plays even when you start playback partway through. It is loaded when you enter play mode, so it plays right away.',
      'Removed button vibration on iPhone, since it could not vibrate there (Android still vibrates).',
    ],
  },
  {
    v: '1.9.10', date: '2026-11-12',
    ja: [
      '「パーフェクト挑戦」を「パーフェクトチャレンジ」に名前を変えました',
      'パーフェクトチャレンジの失敗の音が、鳴らないことがあったのを直しました（0 拍目に戻ったときや、最初のボタンと同じ所から再生したときなど）',
      'プレイモードでボタンを押したときの振動を、iPhone でももう一度試せるようにしました（iOS 17.4 以降）。Android は振動を少し長くして、感じやすくしました',
    ],
    en: [
      'Renamed it to "Perfect Challenge" in Japanese.',
      'Fixed the Perfect Challenge fail sound sometimes not playing (for example after going back to beat 0, or when playback starts right at the first button).',
      'Button-press vibration in play mode is back for iPhone as a try (iOS 17.4 or later). On Android the vibration is a little longer so it is easier to feel.',
    ],
  },
  {
    v: '1.9.9', date: '2026-11-12',
    ja: ['テンポの段の「ここをタップで…」の案内を、横に縮めないようにしました（入りきらない分は画面の左にはみ出します）'],
    en: ['The "Tap here to…" hint on the tempo row is no longer squeezed (the part that doesn\'t fit runs off the left edge).'],
  },
  {
    v: '1.9.8', date: '2026-11-12',
    ja: [
      'トラックの数え方を RHRE fresh と同じ「下から」にしました。RHRE Web で作った .rhref をパソコンの RHRE fresh で開くと、ブロックの段が上下逆になっていたのを直しました',
      'v1.9.7 までに RHRE Web で作ったリミックスは、上下が逆に見えます。メニューの「トラックの上下を反転」で直せます（そのあと保存してください）',
    ],
    en: [
      'Tracks are now counted from the bottom, like RHRE fresh. Fixed blocks appearing upside down when a .rhref made in RHRE Web was opened in RHRE fresh on PC.',
      'Remixes made with RHRE Web v1.9.7 or earlier now look upside down. Fix them with "Flip tracks upside down" in the menu (then save).',
    ],
  },
  {
    v: '1.9.7', date: '2026-11-12',
    ja: [
      '書き出した動画は、右下に「RHRE Web」と版、左下にサイトの URL を入れるようにしました',
      'メニューの「WAVに書き出す」を「音声のみ書き出す」に名前を変えました（中身は今までどおり WAV です）',
    ],
    en: [
      'Exported videos now show "RHRE Web" and the version in the bottom right, and the site URL in the bottom left.',
      'Renamed "Export WAV" in the menu to "Export audio only" (it still makes a WAV file).',
    ],
  },
  {
    v: '1.9.6', date: '2026-11-12',
    ja: ['書き出した動画の版と URL を左下に移し、URL は https:// から入れるようにしました'],
    en: ['Exported videos now show the version and URL in the bottom left, with the URL starting with https://.'],
  },
  {
    v: '1.9.5', date: '2026-11-12',
    ja: ['書き出した動画の右下の版の右に、サイトの URL（pika1013.github.io/rhre-web）を入れるようにしました'],
    en: ['Exported videos now show the site URL (pika1013.github.io/rhre-web) next to the version in the bottom right.'],
  },
  {
    v: '1.9.4', date: '2026-11-12',
    ja: ['再生中は、画面が自動で消えない（スリープしない）ようにしました。一時停止・停止すると元に戻ります（iPhone のホーム画面のアプリは iOS 18.4 以降）'],
    en: ['The screen no longer turns off (sleeps) during playback. It goes back to normal when you pause or stop (Home Screen app on iPhone: iOS 18.4 or later).'],
  },
  {
    v: '1.9.3', date: '2026-11-11',
    ja: ['動画の書き出しで、End Remix の所で再生のバーが止まり、1 秒待ってから動画が終わるようにしました（音楽もそこで止まり、鳴っている効果音の余韻は残ります）'],
    en: ['In video export, the playback bar now stops at End Remix and the video ends 1 second later (the music stops there too; sound effects already playing ring out).'],
  },
  {
    v: '1.9.2', date: '2026-11-11',
    ja: [
      '小節の途中の拍の縦線を、少し濃くしました',
      '小節の途中で拍子を変えたとき、編集中の小節のハイライトがずれていたのを直しました',
      '動画（と WAV）の書き出しは、End Remix があればそこでぴったり終わるようにしました（1 秒ほど通り過ぎていました）',
    ],
    en: [
      'Beat lines in the middle of a measure are a little darker.',
      'Fixed the measure highlight while editing being off when the time signature changes mid-measure.',
      'Video (and WAV) export now ends exactly at End Remix (it used to run about 1 second past it).',
    ],
  },
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
