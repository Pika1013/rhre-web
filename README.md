# RHRE Web v1.19.0

リズム天国のリミックスを、スマホやPCのブラウザで作って再生できる、ファンメイドのエディタです。[RHRE fresh](https://github.com/RHREfresh/RhythmHeavenRemixEditorRefresh) のリミックス（`.rhref`）も開けます。

RHRE fresh を作った人たちとは関係ありません。RHRE Web のことは、RHRE fresh の人たちに聞かないでください。

**使う：** https://pika1013.github.io/rhre-web/

**English:** https://pika1013.github.io/rhre-web/en/ （英語の紹介ページ）

- iPhone は Safari で開いて「ホーム画面に追加」、Android は Chrome の「アプリをインストール」で、全画面のアプリとして使えます。
- 横向き専用です。
- 初めて開くと、言語（日本語・English・繁體中文・한국어・Español・Français・Deutsch）を選んでからチュートリアルが始まります。後半では、実際にリミックスを 1 つ作りながら基本操作を覚えられます。

## できること

- `.rhref` を開く・保存する（RHRE fresh でそのまま開けます）。作業中は自動で端末に保存
- RHRE fresh と同じ規則での再生（テンポの徐々の変化、スウィング、ピッチ、ループ、パターン展開、earliness、mp3 の頭のずれの合わせ込みなど）
- 全ミニゲームから置く・選ぶ・動かす・長さを変える・削除・複製・音程・音量、コピー＆ペースト、範囲選択、パターンの分解、元に戻す・やり直す
- テンポ・拍子・音楽の音量の変更（長押しでドラッグ移動、拍子の数字はタップで直接入力）、トラック数（5〜10）
- 音楽：端末の曲を一覧に追加して試聴・選択、曲のテンポを入力・タップで測定・自動検出（途中で変わるテンポも見つけて置く）、音楽開始位置の調整
- 特殊のブロック（RHRE fresh と同じ作り）：End Remix、字幕、曲名・アーティスト名（再生中に左右から帯で出る）、画像（トラックの上にブロックの幅で描く）、画面揺れ（音程で強さが変わる）、DJ School の Music Distortion（その範囲だけ音楽を細い音に）、Extra Sound Effects の一番下の「拡張音源」（RHRE Web だけの効果音。今は「Cleared! (Switch)」。RHRE fresh では MISSING ENTITY になる）、どの効果音でも音程を変えられる、お気に入り・最近使ったゲーム、カスタム効果音（音声ファイルを 1 つずつ、または RHRE fresh の customSounds の中のフォルダをフォルダごと（パソコン・iPhone）・zip で。data.json・icon.png にも対応）
- みんなで編集：友だちなどと同じリミックスを一緒に編集（10 人まで。友だちだけの部屋と公開の部屋、部屋の曲は端末どうしで直接届く、みんなで再生）
- 音声のみの書き出し（WAV）、動画（mp4）への書き出し（はじめは 0 拍目から、最初に 2 秒待って再生。プレゼンテーションモードと同じ見た目。対応する端末では 1 コマずつ計算で作り、ほかの端末では流しながら録画。「オプション」で、見本を見ながら、再生開始の旗から始める・画面の拡大・縮小・最初に待つ時間・画面に出すもの〈今のゲーム・テンポなど・字幕・ブロックの名前〉を変えられる）
- アップデートのあとに「アップデートしました！」が出て、更新内容を見られる（メニューの「更新内容」からも）
- ホーム画面に追加したアプリでは、一度使ったミニゲームはオフラインでも使える（効果音などを端末に保存）
- プレイモード（ボタンのキューに合わせて押して遊ぶ。RHRE fresh の Playalong と同じ形式。タッチ・はじく・スライドは RHRE fresh と同じ緑のタッチの枠で、左右を切り替えられる。押すと端末が少し振動（Android のみ）。トラックを隠して遊ぶナイトモード、RHRE fresh と同じパーフェクトチャレンジつき）、プレゼンテーションモード（再生中は RHRE fresh と同じく左上に今のゲームを表示）
- 再生速度、テーマ（15 色＋カスタム）、フォント（標準の M PLUS Rounded 1c と、BIZ UDPGothic・Noto Sans JP・M PLUS 1p・Zen Kaku Gothic New・IBM Plex Sans JP・M PLUS 2。見本を見て選べる）、背景画像、画面の言語（日本語・English・繁體中文・한국어・Español・Français・Deutsch。日本語・英語以外では、ゲーム名とパターン名は英語のまま）
- ゲーム名の日本語表示（設定の「ゲーム名」で切り替え。画面の言語とは別。検索は日本語名・英語名のどちらでも）
- RHRE fresh と同じメトロノーム（カウベル）と Play-Yan（設定で消せる）、トラックの左右の端の高速移動・0 拍目に戻るボタン
- パソコンでは RHRE fresh と同じキーでも操作できる（A・D か ←・→ で左右に動く、W・S か ↑・↓ で音程、スペースで再生・停止、Shift+スペースで一時停止、Home・End・M で 0 拍目・最後・音楽の開始位置へ、Ctrl+C・X・V・D・Z・Y・A・F・R・T・N・O・S・E。一覧はメニューの「キーボードの操作」）

## Android アプリ

[GitHub Releases](https://github.com/Pika1013/rhre-web/releases/latest) から **RHRE-Web-Android-….apk** をダウンロードして入れると、Android のアプリとして全画面で使えます（Android 7.0 以上）。

- 中身はこのサイトと同じ（サイトを包む TWA）なので、サイトを更新すればアプリも自動で新しくなります。入れ直しは要りません
- 一度使ったミニゲームは、ネットにつながっていなくても使えます
- 入れるときに「提供元不明のアプリ」の許可が必要です
- アドレスバーを出さないための確認ファイルは [pika1013.github.io](https://github.com/Pika1013/pika1013.github.io) の `.well-known/assetlinks.json` にあります

RHRE Web は、RHRE fresh を元にした非公式のファンメイドです。RHRE fresh を作った人たちとも、任天堂とも関係ありません。

## 効果音と曲について

効果音はこのリポジトリには入っていません。リミックスに記録されたバージョンの [RHRE-database](https://github.com/RHREfresh/RHRE-database) から、使う分だけ jsDelivr 経由で読み込みます。

曲もこのサイトには入っていません。使う曲は、各自の端末から追加してください（端末の中にだけ保存されます）。

## みんなで編集について

メニューの「みんなで編集」で、友だちなどと同じリミックスを一緒に編集できます（10 人まで）。

- 友だちだけの部屋（6 文字の合言葉を知っている人だけ）と、公開の部屋（一覧から「入りたい」を送り、部屋を作った人が許可した人だけ）があります。部屋を作った人は部屋の名前を付けられます（公開の部屋の一覧にも出ます。20 文字まで）
- ブロック・テンポなどの変更は、部屋のサーバー（Cloudflare Workers + Durable Objects、コードは [`server/room/`](server/room/)）を通して全員に届きます。サーバーが受け取るのは、リミックスの中身・好きに付けた名前・端末ごとのランダムな番号だけです
- 部屋の曲はサーバーを通さず、部屋の人の端末どうしで直接（WebRTC）送ります。届いた曲は部屋を抜けると消え、保存する .rhref にも入りません。直接つながるので、相手にだいたいの地域や回線の会社が分かることがあります
- 開く・サンプル・新規作成（部屋のリミックスが全員の分入れ替わる）、部屋の曲を決める、トラックの数・上下反転は、部屋を作った人だけができます。ほかの人は、部屋を作った人に許可をお願いできます（許可されたら 2 分間できる）
- 全員が抜けて 2 分たった部屋と、だれも何もしない時間が 2 時間続いた部屋は、中身ごと消えます
- 画像のブロックの絵と、カスタム効果音は送りません

## オンライン人数について

今 RHRE Web を開いている端末の数を数えています（ふだんは画面に出しません）。数えるサーバーは Cloudflare Workers で動いていて、コードは [`server/online/`](server/online/) にあります。送るのは端末ごとのランダムな番号だけで、名前などは送りません。同じ端末のタブは 1 つと数え、裏に回して 30 秒たったら数えなくなります。

## アクセス数について

このサイトは [GoatCounter](https://www.goatcounter.com/) で訪問数を数えています。Cookie は使わず、個人を特定する情報は集めません。

## ローカルで動かす

```bash
python3 serve.py 8124 .
```

そのあと http://127.0.0.1:8124/ を開きます。

## 使わせてもらっているもの

- 動画を mp4 にまとめる部品：[mp4-muxer](https://github.com/Vanilagy/mp4-muxer)（MIT License、`js/vendor/mp4-muxer.mjs`）

## ライセンス

GPL-3.0（[RHRE fresh](https://github.com/RHREfresh/RhythmHeavenRemixEditorRefresh) と同じ）。詳しくは [LICENSE](LICENSE) を見てください。

RHRE Web は、RHRE fresh（TheAlternateDoctor さんほか。元は chrislo27 さんの [RHRE3](https://github.com/chrislo27/RhythmHeavenRemixEditor)）の作りを元に、2026 年 11 月から JavaScript で書き直したものです。RHRE fresh を作った人たちが作ったり、確かめたりしたものではありません。

プレイモードの絵と音（`assets/playalong/` の tappoint・tap_flick・perfect・perfect_hit・perfect_failed・perfect_fail）、プレイアロングのブロックのアイコン（`assets/playalong/playable_entities.png`）、曲名・アーティスト名の帯（`assets/ui/song_title.png`）と、Play-Yan の絵（`assets/playyan/`）は RHRE fresh のものをそのまま使っています（GPL-3.0）。
