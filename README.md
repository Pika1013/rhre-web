# RHRE Web v1.3.4

[RHRE fresh](https://github.com/RHREfresh/RhythmHeavenRemixEditorRefresh) のリミックス（`.rhref`）を、スマホやPCのブラウザで作って再生できるエディタです。

**使う：** https://pika1013.github.io/rhre-web/

- iPhone は Safari で開いて「ホーム画面に追加」、Android は Chrome の「アプリをインストール」で、全画面のアプリとして使えます。
- 横向き専用です。
- 初めて開くと、言語（日本語・English）を選んでからチュートリアルが始まります。後半では、実際にリミックスを 1 つ作りながら基本操作を覚えられます。

## できること

- `.rhref` を開く・保存する（RHRE fresh でそのまま開けます）。作業中は自動で端末に保存
- RHRE fresh と同じ規則での再生（テンポの徐々の変化、スウィング、ピッチ、ループ、パターン展開、earliness、mp3 の頭のずれの合わせ込みなど）
- 全ミニゲームから置く・選ぶ・動かす・長さを変える・削除・複製・音程・音量、コピー＆ペースト、範囲選択、パターンの分解、元に戻す・やり直す
- テンポ・拍子・音楽の音量の変更（長押しでドラッグ移動、拍子の数字はタップで直接入力）、トラック数（5〜10）
- 音楽：端末の曲を一覧に追加して試聴・選択、曲のテンポを入力またはタップで測定、音楽開始位置の調整
- 字幕・画像ブロック、お気に入り・最近使ったゲーム、カスタム効果音
- WAV への書き出し
- プレイモード（ボタンのキューに合わせて押して遊ぶ。RHRE fresh の Playalong と同じ形式。タッチ・はじく・スライドは RHRE fresh と同じ緑のタッチの枠で、左右を切り替えられる。押すと端末が少し振動（Android のみ）。トラックを隠して遊ぶナイトモードつき）、プレゼンテーションモード
- 再生速度、テーマ（15 色＋カスタム）、背景画像、画面の言語（日本語・English）

## 効果音と曲について

効果音はこのリポジトリには入っていません。リミックスに記録されたバージョンの [RHRE-database](https://github.com/RHREfresh/RHRE-database) から、使う分だけ jsDelivr 経由で読み込みます。

曲もこのサイトには入っていません。使う曲は、各自の端末から追加してください（端末の中にだけ保存されます）。

## アクセス数について

このサイトは [GoatCounter](https://www.goatcounter.com/) で訪問数を数えています。Cookie は使わず、個人を特定する情報は集めません。

## ローカルで動かす

```bash
python3 serve.py 8124 .
```

そのあと http://127.0.0.1:8124/ を開きます。

## ライセンス

GPL-3.0（[RHRE fresh](https://github.com/RHREfresh/RhythmHeavenRemixEditorRefresh) と同じ）。詳しくは [LICENSE](LICENSE) を見てください。

プレイモードのタッチの絵（`assets/playalong/tappoint.png`・`tap_flick.png`）は RHRE fresh のものをそのまま使っています（GPL-3.0）。
