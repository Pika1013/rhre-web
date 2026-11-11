// 画面の言葉の切り替え（日本語 ⇄ English）。
// 日本語の文をそのままキーにして、英語があれば置き換える。{n} などは差し込み。

const EN = {
  // 動画で書き出す・更新内容
  '再生開始位置（緑の旗）から最後まで（{d}）を、プレゼンテーションモードと同じ見た目の動画にします。': 'Makes a video of the remix from the playback start (green flag) to the end ({d}), looking like presentation mode.',
  '計算で 1 コマずつ作るので、たいてい再生するより速く終わります。書き出しのあいだは、アプリを開いたままにしてください。': 'Frames are calculated one by one, so it usually finishes faster than playing. Keep the app open while exporting.',
  'この端末では、実際に流しながら録画します（再生と同じ時間がかかり、音も鳴ります）。新しいブラウザ（iPhone は iOS 26 以上）なら、計算で速く作れます。録画のあいだは、アプリを開いたままにしてください。': 'On this device the video is recorded while it plays (it takes as long as the remix, and you will hear it). Newer browsers (iOS 26 or later on iPhone) can make it faster by calculation. Keep the app open while recording.',
  'この端末のブラウザでは、動画を作れません。': "This browser can't make videos.",
  '効果音を読み込んでいます…': 'Loading sound effects…', '音を作っています…': 'Making the audio…', '音を固めています…': 'Encoding the audio…',
  '映像を作っています… {p}%': 'Making the video… {p}%', '録画しています… {p}%': 'Recording… {p}%',
  '書き出しました（{mb} MB、{s} 秒かかりました）。「動画を保存」で保存できます。': 'Done ({mb} MB, took {s} s). Press "Save video" to save it.',
  'アプリが裏に回ったので、録画をやめました。': 'Recording stopped because the app went to the background.',
  '書き出しをやめました。': 'Export cancelled.', '動画を作れませんでした': "Couldn't make the video",
  'この端末では、この大きさの動画（H.264）を作れません': "This device can't make H.264 video at this size", 'この端末では、動画の音（AAC）を作れません': "This device can't encode the video's audio (AAC)",
  'アップデートしました！（v{v}）': 'Updated! (v{v})',
  'オンライン人数を表示します（この端末だけ）': 'Showing the online count (on this device only)', 'オンライン人数を隠しました': 'Online count hidden',
  '0拍目に戻る（再生位置も 0 拍目に）': 'Back to beat 0 (also moves the playback start there)',
  '{n} 人がオンライン': '{n} online',
  '左へ高速移動（押し続けると流れ続ける）': 'Fast scroll left (hold to keep scrolling)', '右へ高速移動（押し続けると流れ続ける）': 'Fast scroll right (hold to keep scrolling)', '左へ高速移動': 'Fast scroll left', '右へ高速移動': 'Fast scroll right',
  'パーフェクト挑戦': 'Perfect Challenge', 'めざせ パーフェクト!': 'Go for a Perfect!', 'パーフェクト挑戦の切り替え': 'Toggle Perfect Challenge',
  'キーボードで遊ぶとき': 'Playing with a keyboard', 'A ボタン': 'A button', 'B ボタン': 'B button', '十字ボタン': '+ Control Pad',
  'タッチ・はじく': 'Touch / flick', 'マウス': 'Mouse', 'マウス（緑の枠の中でクリック・ドラッグ）': 'Mouse (click and drag in the green area)', 'または': 'or',
  'RHRE fresh と同じ配置です。A ボタンは J キーです。A キーは十字の左になるので気をつけてください。': 'Same layout as RHRE fresh. The A button is the J key. Careful: the A key is Left on the + Control Pad.',
  'この案内は、プレイモードの下の段にあるキーの説明を押すと、いつでも見られます。': 'You can open this guide any time by clicking the key list at the bottom of play mode.',
  'キーボードの操作を見る': 'Show keyboard controls',
  '好きな段に置けます。左上のメニューの「プレイモード」で遊べます': 'Place them on any track. Start Play mode from the menu at the top left.',
  '詳しい情報': 'Details', '開けませんでした': "Couldn't open the file", '保存できませんでした': "Couldn't save", '保存しました': 'Saved',
  'ファイルが空です（0 バイト）。保存やコピーが途中で止まった可能性があります。': 'The file is empty (0 bytes). Saving or copying may have stopped halfway.',
  'これは音楽（音声）ファイルです。音楽はメニューの「音楽を選ぶ」から読み込んでください。': 'This is a music (audio) file. Load music from "Choose music" in the menu.',
  'これは画像ファイルです。RHRE fresh か RHRE Web で保存した .rhref ファイルを選んでください。': 'This is an image file. Choose a .rhref file saved with RHRE fresh or RHRE Web.',
  'このファイルは .rhref（ZIP 形式）ではありません。RHRE fresh か RHRE Web で保存した .rhref ファイルを選んでください。': 'This file is not a .rhref (ZIP) file. Choose a .rhref file saved with RHRE fresh or RHRE Web.',
  'RHRE2 の古い形式のファイルです。RHRE Web では開けません（RHRE3 / RHRE fresh で保存し直してください）。': 'This is an old RHRE2 file. RHRE Web can\'t open it (save it again with RHRE3 / RHRE fresh).',
  '.rhref の中にリミックスのデータ（remix.json）がありません。別のアプリの ZIP か、壊れたファイルです。': 'The remix data (remix.json) is missing. This is a ZIP from another app, or a broken file.',
  'リミックスのデータ（remix.json）が壊れていて読めません。': 'The remix data (remix.json) is broken and can\'t be read.',
  'この .rhref は、RHRE Web が読めない方法で圧縮されています。RHRE fresh で開いて保存し直すと開けるかもしれません。': 'This .rhref uses a compression RHRE Web can\'t read. Opening and saving it again in RHRE fresh may fix it.',
  'ミニゲームのデータをダウンロードできませんでした。インターネットにつながっているか確かめて、もう一度開いてください。': 'Couldn\'t download the minigame data. Check your internet connection and open it again.',
  'ファイルが壊れているか、途中で切れています（ZIP を展開できませんでした）。': 'The file is broken or cut off (the ZIP could not be extracted).',
  '読み込みの途中で問題が起きました。': 'Something went wrong while loading.',
  'サンプルをダウンロードできませんでした。インターネットにつながっているか確かめてください。': 'Couldn\'t download the sample. Check your internet connection.',
  'サンプルを開けませんでした。': 'Couldn\'t open the sample.',
  '音楽を読み込めませんでした': 'Couldn\'t load the music',
  'リミックスは開けましたが、入っている音楽（{ext}）をこの端末では再生できませんでした。形式が対応していないか、音楽のデータが壊れています。メニューの「音楽を選ぶ」で入れ直せます。': 'The remix opened, but its music ({ext}) can\'t be played on this device. The format may be unsupported or the music data is broken. You can add it again from "Choose music" in the menu.',
  'ファイルを読み取れませんでした。iCloud などにあって端末にまだダウンロードされていないか、読み取りが許可されていない可能性があります。ファイル App で一度開いてから、もう一度選んでください。': 'Couldn\'t read the file. It may be in iCloud and not downloaded yet, or reading may not be allowed. Open it once in the Files app, then choose it again.',
  'ファイルを作る途中でメモリが足りなくなりました。ほかのアプリやタブを閉じてから、もう一度保存してください。': 'The device ran out of memory while making the file. Close other apps or tabs and save again.',
  '.rhref ファイルを作る途中で問題が起きました。': 'Something went wrong while making the .rhref file.',
  'ダウンロードを始められませんでした。ブラウザの設定でダウンロードが止められていないか確かめてください。': 'Couldn\'t start the download. Check that downloads are not blocked in your browser settings.',
  '共有の画面を開くことをブラウザに止められました。': 'The browser blocked the share sheet. ',
  '共有の画面でエラーが起きました。': 'The share sheet had an error. ',
  '代わりに下のボタンで保存してください。': 'Use the button below to save instead.',
  '端末の空き容量が足りません。': 'The device is out of storage space. ',
  'プライベートブラウズなどで、このサイトがデータを保存することを許可されていません。': 'This site is not allowed to store data (for example, in private browsing). ',
  '端末にデータを書き込めませんでした。': 'Couldn\'t write data to the device. ',
  '自動保存に失敗しました': 'Autosave failed',
  '作業が消えないように、こまめに「保存」で .rhref に保存してください。': 'To avoid losing your work, save to a .rhref often with "Save".',
  'ナイトモード': 'Night Mode', 'ナイトモードをやめる': 'Exit Night Mode', 'ナイトモード挑戦中！': "You're playing in Night Mode!",
  'プレイモード中は編集できません。下の段の「やめる」で戻ってから編集してください。': 'You can\'t edit in play mode. Tap "Exit" at the bottom to go back and edit.',
  'タッチの枠を左へ': 'Touch area to the left', 'タッチの枠を右へ': 'Touch area to the right',
  'ボタンのタイミング調整': 'Button timing offset', 'タッチのタイミング調整': 'Touch timing offset',
  'タッチの枠（タッチ・はじく・スライド）': 'Touch area (tap, flick, slide)',
  'ゲームには無い操作': 'not present in-game', '例：': 'ex: ',
  '0拍目に戻る': 'Back to beat 0', '一時停止': 'Pause', '再生': 'Play', '停止': 'Stop',
  'この端末のアクセスを、また数えるようにしました': 'Visits from this device are counted again.', 'この端末のアクセスを数えないようにしました': 'Visits from this device will no longer be counted.',
  'この端末では切り替えられませんでした': "Couldn't change this on this device.",
  // チュートリアル（リミックスを作ってみよう）・曲の一覧・テンポ
  '説明を閉じる': 'Hide explanation', '説明を表示': 'Show explanation', 'この曲を使う': 'Use this song', '置きやすいように、Snap を 1/2 にしました': 'Snap set to 1/2 to make placing easier.',
  'まず上の「Snap」を押して 1/32 にしよう（細かく動かせます）。▶ で聞きながら、上の赤い旗（音楽開始）を左右にドラッグして、曲の拍が目盛りの縦線と合うようにしよう。メトロノーム（振り子のボタン）をオンにすると合わせやすいよ。合ったら「拍と合った」を押してね。': 'First tap "Snap" at the top and choose 1/32 so you can move in fine steps. Then play with ▶ and drag the red flag (music start) left or right until the song\'s beats line up with the beat lines. Turning on the metronome (pendulum button) helps. When it matches, tap "On the beat".',
  'まだ曲がありません。下の「＋ 曲を追加」から、端末の曲（mp3・wav など）を入れてください。': 'No songs yet. Use "+ Add songs" below to add songs (mp3, wav…) from this device.',
  '試聴': 'Preview', '一覧から消す': 'Remove from list', '{n} 曲を追加しました': 'Added {n} song(s).', 'この曲は再生できませんでした': "This song couldn't be played.",
  'この曲は読み込めませんでした': "This song couldn't be loaded.", '曲を消す': 'Remove song',
  '「{n}」を一覧から消しますか？（端末の元のファイルは消えません）': 'Remove "{n}" from the list? (The original file on your device is not deleted.)', '消す': 'Remove',
  '音楽を読み込んでいます…': 'Loading music…', '音楽を読み込みました：{f}': 'Loaded music: {f}',
  '音楽を読み込みました：{f}。曲の始まりが 0 拍目に来るように、音楽開始を {s} に合わせました。': 'Loaded music: {f}. The music start was set to {s} so the song begins on beat 0.',
  'この音楽ファイルは読み込めませんでした（mp3・wav・m4a などを選んでください）': "This music file couldn't be loaded (try mp3, wav, m4a…).",
  'この曲のテンポ（BPM）を教えてください。わからないときは「テンポがわからない」で、曲に合わせてタップして測れます。': 'What is the tempo (BPM) of this song? If you are not sure, tap "I don\'t know the tempo" and tap along to measure it.',
  'この曲のテンポ（BPM）を教えてください。決定すると、リミックスの最初のテンポがこの値になります。': 'What is the tempo (BPM) of this song? The remix will start at this tempo.',
  'テンポは 20〜400 の数で入れてください': 'Enter a tempo between 20 and 400.', '最初のテンポを {b} にしました': 'Starting tempo set to {b}.',
  '▶ 曲を流す': '▶ Play song', '■ 止める': '■ Stop',
  '曲を流して、拍に合わせて下の大きなボタンをタップしてください。8 回以上タップすると正確になります。': 'Play the song and tap the big button on the beat. Tap 8 times or more for a precise result.',
  '曲がまだありません。手で拍を取りながら、下の大きなボタンをタップしてください。': 'No song loaded yet. Keep the beat yourself and tap the big button.',
  '測ったテンポは {b} です。下の段のテンポに入れてみよう': 'The measured tempo is {b}. Enter it in the tempo row below.',
  'チュートリアル': 'Tutorial', '実際にリミックスを作ってみよう！': "Let's make a remix!",
  '曲を選んで、テンポと曲の頭を合わせ、効果音を置いて、書き出すところまで一緒にやってみましょう。': "We'll pick a song, match the tempo and the start, place sounds, and export it together.",
  'やってみる': "Let's go", 'あとで': 'Later', '曲を選ぼう': 'Pick a song', '曲を読み込みました。テンポ（BPM）を教えてください。': 'Song loaded. Tell us its tempo (BPM).',
  '一覧から使う曲を選んでね。曲がないときは「＋ 曲を追加」で端末の曲を入れよう。': 'Pick a song from the list. If there are none, add one from this device with "+ Add songs".',
  '曲を選ぶ': 'Choose song', 'テンポを入れる': 'Enter tempo', 'テンポを {b} にしよう': 'Set the tempo to {b}',
  'トラックの下の段（♩= の所）をタップして、テンポに {b} を入れて「決定」。このテンポにならないと次へ進めません。': 'Tap the row under the tracks (where ♩= is), enter {b} as the tempo and tap OK. You can continue once the tempo is {b}.',
  '曲の頭を合わせよう': 'Line up the start of the song',
  '▶ で聞きながら、上の赤い旗（音楽開始）を左右にドラッグして、曲の拍が目盛りの縦線と合うようにしよう。メトロノーム（振り子のボタン）をオンにすると合わせやすいよ。合ったら「拍と合った」を押してね。': 'Play with ▶ and drag the red flag (music start) left or right until the song\'s beats line up with the beat lines. Turning on the metronome (pendulum button) helps. When it matches, tap "On the beat".',
  '拍と合った': 'On the beat', 'ばっちり！': 'Nice!',
  'じつは、メニューの「音楽の開始位置」→「曲の始まりを 0 拍目に合わせる」で、自動で合わせることもできます。ただ、弱起（アウフタクト）で始まる曲はずれるので、そのときは今みたいに手で合わせよう。': 'Tip: Menu → "Music start" → "Align the song start to beat 0" can do this automatically. Songs that start with a pickup (anacrusis) come out wrong, though, so line those up by hand like you just did.',
  '効果音を置いてみよう': 'Place some sounds',
  'いいね！▶ で聞きながら、好きなだけ置こう。できたら「リミックス完成！」を押してね。': 'Great! Keep placing as many as you like while listening with ▶. When you are done, tap "Remix complete!".',
  '下の一覧でミニゲームを選び、パターンの名前を押してから、トラックの空いている所をタップ。': 'Choose a minigame in the list below, tap a pattern name, then tap an empty spot on the tracks.',
  '一覧が閉じているときは、左下の「ゲームを選ぶ」で開けます。': ' If the list is closed, open it with "Choose a game" at the bottom left.',
  'リミックス完成！': 'Remix complete!', '終わりの印を置こう': 'Place the end marker',
  '「特殊」タブ →「終わり・字幕・画像」→「End Remix」を選んで、曲を終わらせたい所に置こう。そこで再生が止まります。': 'Open the "Special" tab → "End, subtitles, images" → "End Remix", and place it where the song should end. Playback stops there.',
  '書き出してみよう': 'Export it', '左上のメニュー（☰）→「WAVに書き出す」で、曲として保存できます。': 'Open the menu (☰) at the top left → "Export WAV" to save it as audio.',
  'リミックス完成！おつかれさま！': 'Your remix is done. Great job!',
  '保存ボタンで .rhref に保存すれば、続きを編集したり RHRE fresh で開いたりできます。これで基本操作はおしまいです。': 'Save a .rhref with the save button to keep editing later or open it in RHRE fresh. That covers the basics!',
  'おわる': 'Finish', 'テンポが合いました！': 'Tempo matched!', '赤い旗を動かして、曲の頭を合わせよう': 'Move the red flag to line up the start of the song',
  'リミックスを作ってみる': 'Make a remix', '始める': 'Start',
  '新しいリミックスで始めます。今のリミックスは閉じます。残したいときは、先に保存ボタンで保存してください。': 'This starts a new remix and closes the current one. Save it first with the save button if you want to keep it.',
  'メニューの「リミックスを作ってみる」から、いつでもまた始められます': 'You can start again anytime from Menu → "Make a remix".',
  '作ったリミックスは自動で端末に保存されます。RHRE fresh で開ける .rhref にも保存できます。次は、実際にリミックスを 1 つ作ってみましょう！': 'Your remix is saved on this device automatically, and you can also save a .rhref that opens in RHRE fresh. Next, let\'s actually make a remix!',
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
  'パターンの名前を押して選んでから、トラックの空いている所をタップすると置けます。スピーカーのボタンを押すと音を確かめられます。': 'Tap a pattern name, then tap an empty spot on the tracks to place it. Tap the speaker button to preview the sound.',
  '編集バー': 'Edit bar',
  '置いたブロックをタップすると、上に編集バーが出ます。ブロックはドラッグで移動、端をドラッグで長さを変更。削除・複製・音程・音量もここで変えられます。空いている所を長押しすると、範囲でまとめて選べます。': 'Tap a block to show the edit bar at the top. Drag a block to move it, or drag its edge to resize. Delete, duplicate, pitch and volume are here. Long-press an empty spot to select an area.',
  '再生': 'Playback',
  '▶ で再生、一時停止ボタン（縦 2 本線）で一時停止、■ で停止です。再生中は黄色い線が今の位置を示します。横の数字は時間と拍、虹色のつまみは再生速度です。': '▶ plays, the pause button (two bars) pauses and ■ stops. A yellow line shows the current position. Next to it are the time, the beat, and the rainbow playback-speed knob.',
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
  'ミニゲームを選ぶと、パターンが並びます。名前を押してからトラックの空いている所をタップすると置けます。スピーカーのボタンで試聴できます。':
    'Pick a minigame to list its patterns. Tap a name, then tap an empty spot on a track to place it. the speaker button previews it.',
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
  '新しい版（v{v}）があります': 'A new version (v{v}) is available', '更新する': 'Update', 'あとで': 'Later',
  // キャンバス
  '音楽開始': 'Music start', '再生開始': 'Playback start',
  '▶ 再生': '▶ Play', 'カスタム効果音': 'Custom sounds', '＋ 音声ファイルを追加': '+ Add audio files',
  '名前を「{n}」にしました': 'Renamed to "{n}".', 'プレイアロング': 'Playalong', 'プレイアロング（プレゼンテーションモードで遊べる）': 'Playalong (play it in presentation mode)',
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
  '動画で書き出す': 'Export video', '更新内容': "What's new", 'アップデートしました！': 'Updated!', '内容を確認': "See what's new",
  '再生開始位置（緑の旗）から最後までを、プレゼンテーションモードと同じ見た目の動画にします。': 'Makes a video from the playback start (green flag) to the end, looking like presentation mode.',
  '大きさ': 'Size', 'なめらかさ': 'Smoothness', '30 コマ／秒': '30 fps', '60 コマ／秒': '60 fps', '書き出す': 'Export', '動画を保存': 'Save video',
  '0拍目に戻る（再生位置も 0 拍目に）': 'Back to beat 0 (also moves the playback start there)',
  '左へ高速移動（押し続けると流れ続ける）': 'Fast scroll left (hold to keep scrolling)', '右へ高速移動（押し続けると流れ続ける）': 'Fast scroll right (hold to keep scrolling)', '左へ高速移動': 'Fast scroll left', '右へ高速移動': 'Fast scroll right',
  'パーフェクト挑戦': 'Perfect Challenge', 'めざせ パーフェクト!': 'Go for a Perfect!', 'パーフェクト挑戦の切り替え': 'Toggle Perfect Challenge',
  'ホーム画面に追加したアプリや Android アプリでは、一度使ったミニゲームは、ネットにつながっていなくても使えます（最初の 1 回はネットが必要です）': 'In the home screen app or the Android app, minigames you have used once work without an internet connection (the first time needs the internet).',
  'キーボードで遊ぶとき': 'Playing with a keyboard', 'A ボタン': 'A button', 'B ボタン': 'B button', '十字ボタン': '+ Control Pad',
  'タッチ・はじく': 'Touch / flick', 'マウス': 'Mouse', 'マウス（緑の枠の中でクリック・ドラッグ）': 'Mouse (click and drag in the green area)', 'または': 'or',
  'RHRE fresh と同じ配置です。A ボタンは J キーです。A キーは十字の左になるので気をつけてください。': 'Same layout as RHRE fresh. The A button is the J key. Careful: the A key is Left on the + Control Pad.',
  'この案内は、プレイモードの下の段にあるキーの説明を押すと、いつでも見られます。': 'You can open this guide any time by clicking the key list at the bottom of play mode.',
  'キーボードの操作を見る': 'Show keyboard controls',
  'ナイトモード': 'Night Mode', 'ナイトモードをやめる': 'Exit Night Mode', 'ナイトモード挑戦中！': "You're playing in Night Mode!",
  'プレイモード中は編集できません。下の段の「やめる」で戻ってから編集してください。': 'You can\'t edit in play mode. Tap "Exit" at the bottom to go back and edit.',
  'タッチの枠を左へ': 'Touch area to the left', 'タッチの枠を右へ': 'Touch area to the right',
  'ボタンのタイミング調整': 'Button timing offset', 'タッチのタイミング調整': 'Touch timing offset',
  'タッチの枠（タッチ・はじく・スライド）': 'Touch area (tap, flick, slide)',
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
  '■ 終わる': '■ Exit', '▶ 再生': '▶ Play',
  '背景の画像': 'Background image', '画像を選ぶ': 'Choose image', '外す': 'Remove', '表示': 'Fit', '濃さ': 'Strength',
  '画面いっぱい': 'Fill the screen', '全体が見えるように': 'Show the whole image', '背景': 'Background', '線': 'Lines', 'アクセント': 'Accent',
  '終わる': 'Exit', 'このサイトは GoatCounter でアクセス数を数えています。Cookie は使わず、個人を特定する情報は集めません。': 'This site counts visits with GoatCounter. It uses no cookies and collects nothing that identifies you.', '曲を選ぶ': 'Choose a song', 'リミックスに使う曲を選んでください。「＋ 曲を追加」で端末の曲を入れられます。': 'Choose a song for your remix. Add songs from this device with "+ Add songs".',
  '＋ 曲を追加': '+ Add songs', '曲のテンポ': 'Song tempo', 'この曲のテンポ（BPM）を教えてください。': 'What is the tempo (BPM) of this song?', 'テンポがわからない': "I don't know the tempo",
  'テンポを測る': 'Measure the tempo', 'タップ': 'Tap', 'やり直す': 'Reset', 'この BPM にする': 'Use this BPM', '横向きにしてください': 'Please turn your phone sideways',
  'RHRE Web は横向きで使うアプリです。': 'RHRE Web is used in landscape.', 'テンポを測る': 'Measure tempo', 'リミックスを作ってみる': 'Make a remix',
  'ボタンの音': 'Button sound', '鳴らす': 'On', '鳴らさない': 'Off', 'チュートリアル': 'Tutorial', 'チュートリアル': 'Tutorial', 'チュートリアルをやめる': 'Close the tutorial', '戻る': 'Back', '次へ': 'Next', 'はじめる': 'Start',
'プレイモード': 'Play mode', 'プレイモード（ボタンのキューに合わせて押して遊ぶ）': 'Play mode (press along with the input cues)',
  'プレイモード：▶ で再生して、キューに合わせて押してください': 'Play mode: press ▶ and hit the inputs in time.',
  '置くとトラックの一番下に入ります。左上のメニューの「プレイモード」で遊べます': 'Inputs go on the bottom track. Start Play mode from the menu at the top left.',
  'プレイモード': 'Play mode', 'プレイモードをやめる': 'Exit play mode', '✕ やめる': '✕ Exit', 'プレイモードをやめる': 'Exit play mode',
'プレイアロング': 'Playalong', 'タイミング調整': 'Timing offset', 'もう一度': 'Retry',
  '音が遅れて聞こえる（Bluetooth イヤホンなど）ときはプラスにします。パソコンのキーボードでは A＝J かスペース、B＝K、十字＝矢印キーです。': 'Use a plus value if the sound reaches you late (Bluetooth earphones etc.). On a keyboard: A = J or Space, B = K, D-pad = arrow keys.',
'ゲーム一覧の高さ': 'Game list height', 'ドラッグで高さを変える（ダブルタップで元に戻す）': 'Drag to resize (double-tap to reset)', '保存': 'Save', 'ホーム画面に追加して使ってください': 'Add to your Home Screen to use it', '全画面で使う': 'Use in full screen',
  '全画面で始める': 'Start in full screen', 'アプリとして追加': 'Install as an app', '作業中のリミックスを .rhref で保存': 'Save the current remix as .rhref',
'名前を決めて保存します。RHRE fresh でそのまま開けます。': 'Name it and save. It opens as-is in RHRE fresh.', '名前を変える': 'Rename', '保存するときの .rhref の名前です。': 'The name used when saving the .rhref.',
  '新規作成': 'New', '開く（.rhref）': 'Open (.rhref)', 'サンプルを開く': 'Open sample', '保存（.rhref）': 'Save (.rhref)',
  'WAVに書き出す': 'Export WAV', '音楽を選ぶ': 'Choose music', '音楽の開始位置': 'Music start position', '音楽を外す': 'Remove music',
  'トラックの数': '☰ Number of tracks', 'プレゼンテーションモード': 'Presentation mode', '使い方': 'Help',
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
  'スナップ（置く・動かす間隔）': 'Snap (placing and moving grid)', '一時停止': 'Pause', '再生（スペース）': 'Play (Space)', '再生': 'Play', '停止': 'Stop', '0拍目に戻る': 'Back to beat 0',
  '全画面': 'Fullscreen', '使い方': 'Help', '設定': 'Settings', 'ゲーム一覧を隠す／出す': 'Show/hide the game list',
  'ミニゲームを検索': 'Search minigames', '検索': 'Search', 'トラック': 'Tracks',
  '再生速度（ダブルタップで 1.0 に戻す）': 'Playback speed (double-tap to reset to 1.0)', '再生速度': 'Playback speed',
};
