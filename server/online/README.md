# RHRE Web のオンライン人数のサーバー

Cloudflare Workers と Durable Objects（無料プラン）で動く、「今 RHRE Web を開いている端末の数」を数えるサーバーです。

- 受け取るのは端末ごとのランダムな番号だけで、名前などは受け取らず、保存もしません
- 同じ端末でタブを複数開いても 1 つと数えます
- `https://pika1013.github.io`（と、手元で試すときの `http://localhost:8123`）からのつなぎ込みだけ受け付けます

## 公開

```bash
cd server/online
wrangler login   # 初回だけ
wrangler deploy
```

## 手元で試す

```bash
cd server/online
wrangler dev
```
