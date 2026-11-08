# RHRE Web（試作）

[RHRE fresh](https://github.com/RHREfresh/RhythmHeavenRemixEditorRefresh) のリミックス（`.rhref`）を、スマホやPCのブラウザで再生・編集する試作です。

## できること

- `.rhref` を開いて再生・一時停止・停止（メトロノーム、字幕の表示つき）
- RHRE fresh と同じ規則での再生（テンポの徐々の変化、スウィング、ピッチ、ループ、パターン展開、earliness など）
- ピンチで拡大・縮小、ドラッグでスクロール、上の目盛りをタップで再生開始位置を移動
- 使っているミニゲームの一覧とパターンの試聴
- 再生開始位置から最後までを WAV に書き出し
- 編集：全ミニゲームから置く、選ぶ・動かす・長さを変える、削除・複製・音程・音量、テンポ変更、音楽の追加、元に戻す・やり直す
- RHRE fresh で開ける `.rhref` として保存。作業中は自動保存
- 拍子・テンポの徐々の変化・スウィング・音楽の音量、コピー＆ペースト、範囲選択、パターンの分解、トラック数（5〜10）
- 字幕・画像ブロック、お気に入り・最近使ったゲーム、カスタム効果音
- 再生速度、プレゼンテーションモード、テーマ（ダーク・ブラック・ライト）、画面の言語（日本語・English）

## 効果音について

効果音はこのリポジトリには入っていません。リミックスに記録されたバージョンの [RHRE-database](https://github.com/RHREfresh/RHRE-database) から、使う分だけ jsDelivr 経由で読み込みます。

## ローカルで動かす

```bash
python3 serve.py 8124 .
```

そのあと http://127.0.0.1:8124/ を開きます。

## ライセンス

GPL-3.0（[RHRE fresh](https://github.com/RHREfresh/RhythmHeavenRemixEditorRefresh) と同じ）。詳しくは [LICENSE](LICENSE) を見てください。
